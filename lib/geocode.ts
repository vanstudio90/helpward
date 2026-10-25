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
  // 2, not 1: a second plausible candidate is itself an ambiguity signal.
  url.searchParams.set("limit", String(opts.limit ?? 2));
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

  const f = features[0] as {
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

  const coords = f.geometry?.coordinates;
  if (!coords || coords.length !== 2) return null;
  const [lng, lat] = coords;
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;

  const ctx = f.properties?.context ?? {};
  const countryCode = (ctx.country?.country_code_alpha_2 ?? ctx.country?.country_code ?? "").toUpperCase();
  // Report the real country. It used to be coerced to "US" for anything
  // outside US/CA, which mislabelled e.g. a Tijuana address as American.
  // The service-area check rejects anything we do not operate in anyway.
  const country = countryCode || "";

  const mc = f.properties?.match_code ?? {};
  const conf = typeof mc.confidence === "string" ? mc.confidence.toLowerCase() : null;

  return {
    formatted: f.properties?.full_address ?? f.properties?.name ?? cleaned,
    lng,
    lat,
    country,
    region: ctx.region?.name ?? null,
    city: ctx.place?.name ?? null,
    postalCode: ctx.postcode?.name ?? null,
    confidence: (conf === "exact" || conf === "high" || conf === "medium" || conf === "low")
      ? conf : null,
    addressNumberMatch: typeof mc.address_number === "string" ? mc.address_number : null,
    candidateCount: features.length,
    origin: "forward",
    featureType: typeof f.properties?.feature_type === "string" ? f.properties.feature_type : null,
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
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "incomplete" }
  | { ok: false; reason: "ambiguous" };

export type ResolveResult = { ok: true; address: ResolvedAddress } | ResolveFailure;

export const RESOLVE_FAILURE_MESSAGE: Record<ResolveFailure["reason"], string> = {
  geocoding_unavailable:
    "We can't verify addresses right now. Please try again in a few minutes.",
  not_found:
    "We couldn't find that address. Please check it and try again, or use \u201cUse my current location\u201d.",
  incomplete:
    "That address is missing a city. Please enter a full street address.",
  ambiguous:
    "We found more than one place matching that address. Please add a street number, city, or postal code \u2014 or use \u201cUse my current location\u201d.",
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

/** Match-code confidences we accept for a typed address. */
const ACCEPTABLE_CONFIDENCE = new Set(["exact", "high"]);

export function isAmbiguous(g: GeocodeResult): boolean {
  if (g.origin === "reverse") return false;

  // Forward lookups must land on an address-type feature.
  if (!g.featureType || !DISPATCHABLE_FEATURE_TYPES.has(g.featureType)) return true;

  // Checked independently of confidence: a second plausible candidate is an
  // ambiguity signal in its own right.
  if (g.candidateCount > 1) return true;

  // An address feature without a match_code is unexpected; refuse rather
  // than assume it was good.
  if (g.confidence === null || !ACCEPTABLE_CONFIDENCE.has(g.confidence)) return true;

  // "not_applicable" is refused as well as "unmatched": for a typed street
  // address, no street number having been matched means we do not know
  // which building. This matches what the backfill flags.
  if (g.addressNumberMatch !== "matched") return true;

  return false;
}

function toResolved(g: GeocodeResult): ResolveResult {
  // A municipality is mandatory: the service-area check is by municipality,
  // so an address we can't attribute to one can't be approved for dispatch.
  if (!g.city) return { ok: false, reason: "incomplete" };
  if (isAmbiguous(g)) return { ok: false, reason: "ambiguous" };
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
