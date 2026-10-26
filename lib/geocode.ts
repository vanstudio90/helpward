// Server-side address → coordinates via Mapbox Geocoding API v6.
//
// Why this exists: every address insert in the codebase has been storing
// "POINT(-123.1207 49.2827)" (downtown Vancouver) as a placeholder, which
// poisons find_nearby_providers — every request looks like it's in BC
// regardless of where the customer actually is. Real coords unlock the
// matching engine.
//
// Posture when MAPBOX_TOKEN is unset:
//   * isGeocodingEnabled() → false
//   * geocodeAddress() returns null without making a request
//   * Callers fall back to the existing placeholder so the system keeps
//     functioning while the user signs up for a Mapbox account.
// This makes the geocoder safe to ship now — no failing deploys, no
// blocking new-request flows — and the moment MAPBOX_TOKEN lands in the
// Vercel env, every subsequent address gets real coordinates.

import "server-only";

export type GeocodeResult = {
  formatted: string;
  lng: number;
  lat: number;
  country: string;       // ISO alpha-2 ("US" / "CA")
  region: string | null; // state / province
  city: string | null;
  postalCode: string | null;
  // Mapbox match_code: how much of the query actually matched.
  //
  // IMPORTANT: match_code is only present on ADDRESS-type features. A
  // forward lookup that resolves to a street, locality or POI carries no
  // match_code either, so a null confidence does NOT imply "this came from
  // a reverse lookup". `origin` records that explicitly instead of being
  // inferred — inferring it meant a forward street result with two
  // candidates and no match_code was accepted as verified.
  confidence: "exact" | "high" | "medium" | "low" | null;
  addressNumberMatch: string | null;
  /** Number of candidates Mapbox returned for a forward lookup. */
  candidateCount: number;
  /**
   * True when a SECOND candidate is a genuine rival — another address-type
   * feature Mapbox also matched confidently.
   *
   * Candidate COUNT is not an ambiguity signal: Mapbox always appends
   * broader fallbacks, so a perfectly unambiguous street address comes back
   * with the containing city as a second "candidate". Treating that as
   * ambiguity rejected every real address we tried.
   */
  hasRivalCandidate: boolean;
  /**
   * Every plausible address candidate, best first. One entry means an
   * unambiguous match; more than one means the customer must choose.
   */
  alternatives: Array<{
    formatted: string; lng: number; lat: number;
    country: string; region: string | null; city: string | null;
    postalCode: string | null;
    confidence: "exact" | "high" | "medium" | "low" | null;
  }>;
  /** Which API produced this result. Never inferred. */
  origin: "forward" | "reverse";
  /** Mapbox feature_type: "address", "street", "place", "postcode", … */
  featureType: string | null;
};

export function isGeocodingEnabled(): boolean {
  return typeof process.env.MAPBOX_TOKEN === "string" && process.env.MAPBOX_TOKEN.length > 0;
}

// Mapbox result storage.
//
// Temporary geocoding is the default and its terms do NOT permit retaining
// the result. We persist both the formatted address and the coordinates on
// `addresses` / `saved_addresses`, and the backfill writes them to its
// ledger too — so every lookup here must be a permanent (storage-permitted)
// one, which requires an eligible Mapbox account configuration.
//
// MAPBOX_PERMANENT=false exists only for a non-persisting environment (an
// offline probe, a throwaway sandbox). It must be unset or true wherever a
// result reaches the database. isStoragePermitted() is surfaced so callers
// and the backfill can refuse to persist when it is off.
export function isStoragePermitted(): boolean {
  return (process.env.MAPBOX_PERMANENT ?? "true").toLowerCase() !== "false";
}

// Mapbox geometry coordinates come back as [lng, lat]. PostGIS geography
// columns expect WKT "POINT(lng lat)" in the same order, so this is a
// straight pass-through.
export function toPointWKT(lng: number, lat: number): string {
  return `POINT(${lng} ${lat})`;
}

// Default placeholder — kept here so the call sites don't all hard-code
// the magic numbers. Downtown Vancouver lat/lng. The day we delete this
// helper we know geocoding is mandatory.
export const PLACEHOLDER_POINT = toPointWKT(-123.1207, 49.2827);

// Retained only so the address backfill can recognise legacy rows that
// were written with the old placeholder country.
export const PLACEHOLDER_COUNTRY = "US";

const ENDPOINT = "https://api.mapbox.com/search/geocode/v6/forward";
const REVERSE_ENDPOINT = "https://api.mapbox.com/search/geocode/v6/reverse";

// Forward-geocode an address string. Restricted to US + CA since that's
// our launch geo. Returns null on any failure (no token, bad input,
// upstream error, no matches) — callers must handle null gracefully.
export async function geocodeAddress(
  text: string,
  opts: { countries?: string; limit?: number } = {},
): Promise<GeocodeResult | null> {
  const token = process.env.MAPBOX_TOKEN;
  if (!token) return null;
  const cleaned = text.trim();
  if (cleaned.length < 3 || cleaned.length > 300) return null;

  const url = new URL(ENDPOINT);
  url.searchParams.set("q", cleaned);
  url.searchParams.set("country", opts.countries ?? "us,ca");
  // 5, not 1: medium-confidence results are now eligible subject to
  // customer confirmation, so several plausible addresses must be offered
  // as a choice rather than silently ranked.
  url.searchParams.set("limit", String(opts.limit ?? 5));
  url.searchParams.set("access_token", token);
  // Storage-permitted lookup: the result is written to `addresses`. See
  // isStoragePermitted().
  url.searchParams.set("permanent", String(isStoragePermitted()));

  let res: Response;
  try {
    res = await fetch(url.toString(), {
      // Don't let a hung Mapbox call wedge the createRequest action — they
      // publish a 10s SLA so 12s is generous without being absurd.
      signal: AbortSignal.timeout(12_000),
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return null;
  }

  const features = (body as { features?: Array<unknown> } | null)?.features;
  if (!Array.isArray(features) || features.length === 0) return null;

  // ---------------------------------------------------------------------
  // Choose the primary candidate.
  //
  // Mapbox does NOT order candidates by confidence. For "1200 Third Ave,
  // San Diego" the exact-string match comes back THIRD at high confidence,
  // below a medium one 400m away. Taking features[0] as the answer
  // downgraded a perfectly good address into a confirmation prompt and
  // offered the worse match first.
  // ---------------------------------------------------------------------
  type RawFeature = {
    properties?: {
      full_address?: string;
      name?: string;
      feature_type?: string;
      match_code?: { confidence?: string; address_number?: string };
      context?: {
        country?: { country_code?: string; country_code_alpha_2?: string };
        region?: { name?: string };
        place?: { name?: string };
        postcode?: { name?: string };
      };
    };
    geometry?: { coordinates?: [number, number] };
  };

  const isPlausible = (x: RawFeature): boolean => {
    if (x.properties?.feature_type !== "address") return false;
    const c = (x.properties?.match_code?.confidence ?? "").toLowerCase();
    return c === "exact" || c === "high" || c === "medium";
  };

  const RANK: Record<string, number> = { exact: 3, high: 2, medium: 1 };
  const rankOf = (c: string | null | undefined) => RANK[(c ?? "").toLowerCase()] ?? 0;

  const raw = (features as RawFeature[]).filter(isPlausible);

  // Pair each candidate with the feature it came from, so the primary's
  // match_code travels with it after sorting and deduping.
  const paired = raw
    .map((x) => ({ feature: x, cand: toCandidate(x) }))
    .sort((a, b) =>
      rankOf(b.feature.properties?.match_code?.confidence) -
      rankOf(a.feature.properties?.match_code?.confidence));

  const dedupedPairs: typeof paired = [];
  for (const item of paired) {
    const near = dedupedPairs.findIndex((k) => metresApart(k.cand, item.cand) <= SAME_PLACE_METRES);
    if (near === -1) dedupedPairs.push(item);
  }

  const primary = dedupedPairs[0];
  if (!primary) {
    // Nothing precise enough came back. Return the top feature so the
    // caller can refuse it with a specific reason rather than "not found".
    const f0 = features[0] as RawFeature;
    const c0 = f0.geometry?.coordinates;
    if (!c0 || c0.length !== 2) return null;
    const ctx0 = f0.properties?.context ?? {};
    return {
      formatted: f0.properties?.full_address ?? f0.properties?.name ?? cleaned,
      lng: c0[0], lat: c0[1],
      country: (ctx0.country?.country_code_alpha_2 ?? ctx0.country?.country_code ?? "").toUpperCase(),
      region: ctx0.region?.name ?? null,
      city: ctx0.place?.name ?? null,
      postalCode: ctx0.postcode?.name ?? null,
      confidence: null,
      addressNumberMatch: null,
      candidateCount: features.length,
      hasRivalCandidate: false,
      alternatives: [],
      origin: "forward",
      featureType: typeof f0.properties?.feature_type === "string" ? f0.properties.feature_type : null,
    };
  }

  // Only EQUALLY confident candidates are rivals. A medium match 734km
  // away in another city is not a real alternative to a high match in the
  // city the customer named; forcing a choice there is friction that buys
  // nothing, and the service-area check would reject it anyway.
  const topRank = rankOf(primary.feature.properties?.match_code?.confidence);
  const peers = dedupedPairs
    .filter((x) => rankOf(x.feature.properties?.match_code?.confidence) === topRank)
    .map((x) => x.cand);

  const pmc = primary.feature.properties?.match_code ?? {};
  const pconf = typeof pmc.confidence === "string" ? pmc.confidence.toLowerCase() : null;

  return {
    formatted: primary.cand.formatted || cleaned,
    lng: primary.cand.lng,
    lat: primary.cand.lat,
    country: primary.cand.country,
    region: primary.cand.region,
    city: primary.cand.city,
    postalCode: primary.cand.postalCode,
    confidence: (pconf === "exact" || pconf === "high" || pconf === "medium" || pconf === "low")
      ? pconf : null,
    addressNumberMatch: typeof pmc.address_number === "string" ? pmc.address_number : null,
    candidateCount: features.length,
    hasRivalCandidate: peers.length > 1,
    alternatives: peers,
    origin: "forward",
    featureType: typeof primary.feature.properties?.feature_type === "string"
      ? primary.feature.properties.feature_type : null,
  };
}

// Reverse-geocode lat/lng → formatted address. Used by the "use my current
// location" button on /new-request so the customer's actual GPS coords get
// translated to a human-readable address before the form submits.
//
// Same fail-soft posture as forward: returns null on any error (no token,
// out-of-range coords, network fail) so the caller can decide whether to
// fall back to a different flow or show a hint to type the address.
export async function reverseGeocode(
  lat: number, lng: number,
): Promise<GeocodeResult | null> {
  const token = process.env.MAPBOX_TOKEN;
  if (!token) return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;

  const url = new URL(REVERSE_ENDPOINT);
  url.searchParams.set("longitude", String(lng));
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("limit", "1");
  url.searchParams.set("access_token", token);
  // Same storage requirement as the forward path — the formatted address
  // this returns is persisted on the address row.
  url.searchParams.set("permanent", String(isStoragePermitted()));

  let res: Response;
  try {
    res = await fetch(url.toString(), { signal: AbortSignal.timeout(12_000) });
  } catch {
    return null;
  }
  if (!res.ok) return null;

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return null;
  }

  const features = (body as { features?: Array<unknown> } | null)?.features;
  if (!Array.isArray(features) || features.length === 0) return null;

  const f = features[0] as {
    properties?: {
      full_address?: string;
      name?: string;
      feature_type?: string;
      context?: {
        country?: { country_code?: string; country_code_alpha_2?: string };
        region?: { name?: string };
        place?: { name?: string };
        postcode?: { name?: string };
      };
    };
  };

  const ctx = f.properties?.context ?? {};
  const countryCode = (ctx.country?.country_code_alpha_2 ?? ctx.country?.country_code ?? "").toUpperCase();
  // Report the real country. It used to be coerced to "US" for anything
  // outside US/CA, which mislabelled e.g. a Tijuana address as American.
  // The service-area check rejects anything we do not operate in anyway.
  const country = countryCode || "";

  return {
    formatted: f.properties?.full_address ?? f.properties?.name ?? `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
    lng,
    lat,
    country,
    region: ctx.region?.name ?? null,
    city: ctx.place?.name ?? null,
    postalCode: ctx.postcode?.name ?? null,
    // A reverse lookup starts FROM a coordinate the caller already holds
    // (a GPS fix or a previously verified saved address), so there is no
    // query to match against and no ambiguity to score. This is recorded
    // via `origin`, not inferred from the absent match_code.
    confidence: null,
    addressNumberMatch: null,
    candidateCount: 1,
    hasRivalCandidate: false,
    alternatives: [],
    origin: "reverse",
    featureType: typeof f.properties?.feature_type === "string" ? f.properties.feature_type : null,
  };
}

// ---------------------------------------------------------------------------
// Strict address resolution
// ---------------------------------------------------------------------------
//
// Previously resolveAddressForInsert() fell back to PLACEHOLDER_POINT
// (downtown Vancouver) whenever MAPBOX_TOKEN was unset or Mapbox failed.
// MAPBOX_TOKEN was never set in production, so 93% of stored addresses are
// literally downtown Vancouver — including addresses in Montreal, Brooklyn
// and Chicago. That silently poisoned find_nearby_providers and would have
// made any service-area check approve everything as Vancouver.
//
// There is no fallback any more. An address either geocodes to real,
// verified coordinates with a municipality we can check against the launch
// service areas, or the request is refused.

export type ResolvedAddress = {
  formatted: string;
  location: string;        // WKT POINT, always real
  country: string;         // ISO alpha-2
  region: string | null;   // province / state
  city: string | null;     // municipality — checked against SERVICE_AREAS
  postalCode: string | null;
  lng: number;
  lat: number;
  verified: true;          // only verified addresses can be constructed
};

export type ResolveFailure =
  | { ok: false; reason: "geocoding_unavailable" }
  | { ok: false; reason: "storage_not_permitted" }
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "incomplete" }
  | { ok: false; reason: "ambiguous" };

/** Every reason a resolve can come back unusable, including the interactive ones. */
export type ResolveReason =
  | ResolveFailure["reason"]
  | "needs_confirmation"
  | "needs_selection";


export type AddressCandidate = {
  formatted: string; lng: number; lat: number;
  country: string; region: string | null; city: string | null;
  postalCode: string | null;
  confidence: "exact" | "high" | "medium" | "low" | null;
};

export type ResolveResult =
  | { ok: true; address: ResolvedAddress }
  /** One plausible match that the customer must look at and agree to. */
  | { ok: false; reason: "needs_confirmation"; candidates: AddressCandidate[] }
  /** Several plausible matches; the customer picks. */
  | { ok: false; reason: "needs_selection"; candidates: AddressCandidate[] }
  | ResolveFailure;

export const RESOLVE_FAILURE_MESSAGE: Record<ResolveReason, string> = {
  geocoding_unavailable:
    "We can't verify addresses right now. Please try again in a few minutes.",
  storage_not_permitted:
    "We can't verify addresses right now. Please try again in a few minutes.",
  not_found:
    "We couldn't find that address. Please check it and try again, or use \u201cUse my current location\u201d.",
  incomplete:
    "That address is missing a city. Please enter a full street address.",
  ambiguous:
    "We couldn't pin that to a specific building. Please include a street number and city \u2014 or use \u201cUse my current location\u201d.",
  needs_confirmation:
    "Please check the address we matched and confirm it.",
  needs_selection:
    "Several addresses match. Please choose the right one.",
};

// Acceptance rules for a coordinate that will be dispatched to.
//
// A typed address (origin "forward") must be an ADDRESS-type feature that
// Mapbox matched confidently, with a matched street number and exactly one
// candidate. Streets, localities, postcodes and POIs are refused: they
// identify an area, not a doorstep, and they carry no match_code at all, so
// there is nothing to judge their precision by.
//
// A reverse lookup (origin "reverse") starts from coordinates the caller
// already holds — a GPS fix, or a saved address verified earlier — so there
// is no query to have matched ambiguously. Those coordinates are the
// authority and the reverse lookup only supplies a label.
//
// Previously this keyed off `confidence === null`, treating any result
// without match_code as a reverse lookup. Forward street results also lack
// match_code, so one with two candidates was accepted as verified.

/** Feature types precise enough to send a helper to. */
const DISPATCHABLE_FEATURE_TYPES = new Set(["address"]);

/** Accepted without asking the customer anything. */
const AUTO_CONFIDENCE = new Set(["exact", "high"]);

/** Accepted only after the customer confirms the resolved address. */
const CONFIRMABLE_CONFIDENCE = new Set(["exact", "high", "medium"]);

export type AcceptanceVerdict =
  | { kind: "auto" }                 // unambiguous; proceed
  | { kind: "confirm" }              // one plausible match, customer must agree
  | { kind: "select" }               // several plausible matches, customer must pick
  | { kind: "refuse" };              // not precise enough at any confidence

/**
 * How a forward-geocoded result may be used.
 *
 * Medium confidence is eligible, but never silently: Mapbox documents that
 * medium can involve CORRECTED components, so a matched house number alone
 * does not establish the intended street. "202 C St" resolving to "202 East
 * C Street" is the canonical case.
 *
 * Everything that was refused before is still refused: low confidence,
 * missing or unmatched street numbers, and non-address features.
 */

/**
 * Metres between two points. Flat-earth approximation, which is exact
 * enough at the scale that distinguishes "same building" from "different
 * building".
 */
function metresApart(a: { lng: number; lat: number }, b: { lng: number; lat: number }): number {
  const latRad = ((a.lat + b.lat) / 2) * (Math.PI / 180);
  const dx = (a.lng - b.lng) * 111_320 * Math.cos(latRad);
  const dy = (a.lat - b.lat) * 110_540;
  return Math.hypot(dx, dy);
}

/** Two candidates this close are the same place under different spellings. */
const SAME_PLACE_METRES = 30;

/**
 * Collapse candidates that describe the SAME location.
 *
 * Mapbox routinely returns one building under alternate street-name
 * spellings — "1200 3rd Avenue" and "1200 Third Ave", or the identical
 * string twice. Asking a customer to choose between those is a false
 * choice: it adds a click, teaches them the prompt is noise, and protects
 * nothing. Only genuinely different LOCATIONS are a real selection, which
 * is what "202 East C Street" versus "202 West C Street" is.
 *
 * Best confidence wins within a cluster; ties keep the higher-ranked one,
 * since Mapbox returns candidates best-first.
 */
function toCandidate(x: unknown) {
  const p = (x as { properties?: Record<string, unknown> }).properties ?? {};
  const ctx = (p.context ?? {}) as Record<string, { name?: string; country_code_alpha_2?: string; country_code?: string }>;
  const geom = (x as { geometry?: { coordinates?: [number, number] } }).geometry;
  const mc = (p.match_code ?? {}) as { confidence?: string };
  const cc = (ctx.country?.country_code_alpha_2 ?? ctx.country?.country_code ?? "").toUpperCase();
  return {
    formatted: String(p.full_address ?? p.name ?? ""),
    lng: geom?.coordinates?.[0] ?? 0,
    lat: geom?.coordinates?.[1] ?? 0,
    country: cc,
    region: ctx.region?.name ?? null,
    city: ctx.place?.name ?? null,
    postalCode: ctx.postcode?.name ?? null,
    confidence: ((mc.confidence ?? "").toLowerCase() || null) as "exact" | "high" | "medium" | "low" | null,
  };
}

function dedupeByLocation<T extends { lng: number; lat: number; confidence: string | null }>(
  candidates: T[],
): T[] {
  const rank = (c: string | null) =>
    c === "exact" ? 3 : c === "high" ? 2 : c === "medium" ? 1 : 0;
  const kept: T[] = [];
  for (const c of candidates) {
    const near = kept.findIndex((k) => metresApart(k, c) <= SAME_PLACE_METRES);
    if (near === -1) { kept.push(c); continue; }
    if (rank(c.confidence) > rank(kept[near].confidence)) kept[near] = c;
  }
  return kept;
}

export function classifyAcceptance(g: GeocodeResult): AcceptanceVerdict {
  if (g.origin === "reverse") return { kind: "auto" };

  if (!g.featureType || !DISPATCHABLE_FEATURE_TYPES.has(g.featureType)) return { kind: "refuse" };
  if (g.confidence === null || !CONFIRMABLE_CONFIDENCE.has(g.confidence)) return { kind: "refuse" };
  // A street number that was not matched means we do not know which
  // building, at any confidence. "not_applicable" counts as not matched.
  if (g.addressNumberMatch !== "matched") return { kind: "refuse" };

  // Two signals for the same thing, and either is enough. `alternatives`
  // carries the actual candidate list so a selection can be offered;
  // `hasRivalCandidate` is the boolean the backfill classifier shares, and
  // reverse-geocoded or synthetic results may carry only one of them.
  const plausible = (g.alternatives ?? []).filter(
    (a) => a.confidence && CONFIRMABLE_CONFIDENCE.has(a.confidence),
  );
  if (plausible.length > 1 || g.hasRivalCandidate) return { kind: "select" };

  return AUTO_CONFIDENCE.has(g.confidence) ? { kind: "auto" } : { kind: "confirm" };
}

/**
 * Kept for the tests and the backfill parity check: true when the result
 * cannot be used without customer involvement.
 */
export function isAmbiguous(g: GeocodeResult): boolean {
  return classifyAcceptance(g).kind !== "auto";
}

function toResolved(g: GeocodeResult): ResolveResult {
  // A municipality is mandatory: the service-area check is by municipality,
  // so an address we can't attribute to one can't be approved for dispatch.
  if (!g.city) return { ok: false, reason: "incomplete" };

  const verdict = classifyAcceptance(g);
  if (verdict.kind === "refuse") return { ok: false, reason: "ambiguous" };
  if (verdict.kind === "select") {
    return {
      ok: false, reason: "needs_selection",
      candidates: (g.alternatives ?? []).filter((a) => a.confidence && a.confidence !== "low"),
    };
  }
  if (verdict.kind === "confirm") {
    return {
      ok: false, reason: "needs_confirmation",
      candidates: (g.alternatives ?? []).slice(0, 1),
    };
  }
  return {
    ok: true,
    address: {
      formatted: g.formatted,
      location: toPointWKT(g.lng, g.lat),
      country: g.country,
      region: g.region,
      city: g.city,
      postalCode: g.postalCode,
      lng: g.lng,
      lat: g.lat,
      verified: true,
    },
  };
}

/** Forward-geocode typed address text. Never falls back to a placeholder. */
export async function resolveAddressStrict(rawText: string): Promise<ResolveResult> {
  if (!isGeocodingEnabled()) return { ok: false, reason: "geocoding_unavailable" };
  // A ResolvedAddress is an attestation that gets written to the database.
  // Temporary geocoding results may not be retained, so under
  // MAPBOX_PERMANENT=false we refuse rather than mint one. The raw
  // geocodeAddress/reverseGeocode helpers stay available for probes that
  // do not persist anything.
  if (!isStoragePermitted()) return { ok: false, reason: "storage_not_permitted" };
  const g = await geocodeAddress(rawText);
  if (!g) return { ok: false, reason: "not_found" };
  return toResolved(g);
}

/**
 * Resolve coordinates the client supplied (a saved-address chip, or the
 * browser GPS behind "Use my current location").
 *
 * The coordinates are trusted, but they are NOT sufficient on their own:
 * we still reverse-geocode to learn which municipality they fall in, because
 * that is what the service-area check tests. If the reverse lookup fails we
 * refuse rather than dispatch to an unknown jurisdiction.
 */
export async function resolveCoordsStrict(lat: number, lng: number): Promise<ResolveResult> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { ok: false, reason: "not_found" };
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return { ok: false, reason: "not_found" };
  if (!isGeocodingEnabled()) return { ok: false, reason: "geocoding_unavailable" };
  if (!isStoragePermitted()) return { ok: false, reason: "storage_not_permitted" };
  const r = await reverseGeocode(lat, lng);
  if (!r) return { ok: false, reason: "not_found" };
  // Keep the caller's exact coordinates; take only the descriptive fields
  // from the reverse lookup (it snaps to the nearest address otherwise).
  return toResolved({ ...r, lat, lng });
}

// ---------------------------------------------------------------------------
// Legacy placeholder detection — used by the address backfill and by the
// dispatch guard, so an unrepaired legacy row can never qualify for a task.
// ---------------------------------------------------------------------------

export const PLACEHOLDER_LNG = -123.1207;
export const PLACEHOLDER_LAT = 49.2827;

/** True if these coordinates are the old downtown-Vancouver placeholder. */
export function isPlaceholderPoint(lng: number | null, lat: number | null): boolean {
  if (lng == null || lat == null) return false;
  return Math.abs(lng - PLACEHOLDER_LNG) < 1e-6 && Math.abs(lat - PLACEHOLDER_LAT) < 1e-6;
}
