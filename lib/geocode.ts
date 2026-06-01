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
};

export function isGeocodingEnabled(): boolean {
  return typeof process.env.MAPBOX_TOKEN === "string" && process.env.MAPBOX_TOKEN.length > 0;
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

// Country code that should be passed to addresses.country when geocoding
// is off. Bookings happen in US + CA so we default to US; the customer's
// profile.country can override if needed in the call site.
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
  url.searchParams.set("limit", String(opts.limit ?? 1));
  url.searchParams.set("access_token", token);
  // Mapbox documents `permanent=false` (the default) for ephemeral lookups,
  // which is what a one-shot booking is. Permanent=true requires a
  // higher-tier plan and a different usage agreement.

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
  const country = countryCode === "US" || countryCode === "CA" ? countryCode : PLACEHOLDER_COUNTRY;

  return {
    formatted: f.properties?.full_address ?? f.properties?.name ?? cleaned,
    lng,
    lat,
    country,
    region: ctx.region?.name ?? null,
    city: ctx.place?.name ?? null,
    postalCode: ctx.postcode?.name ?? null,
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
  const country = countryCode === "US" || countryCode === "CA" ? countryCode : PLACEHOLDER_COUNTRY;

  return {
    formatted: f.properties?.full_address ?? f.properties?.name ?? `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
    lng,
    lat,
    country,
    region: ctx.region?.name ?? null,
    city: ctx.place?.name ?? null,
    postalCode: ctx.postcode?.name ?? null,
  };
}

// Convenience: geocode and return everything needed to insert an addresses
// row, or fall through to the placeholder if geocoding is unavailable.
// Keeps every call site to a single line.
export type ResolvedAddress = {
  formatted: string;
  location: string;       // WKT POINT
  country: string;        // ISO alpha-2
  lng: number | null;     // null when fell-back
  lat: number | null;
  verified: boolean;      // true when Mapbox confirmed it
};

// Build a ResolvedAddress directly from coords the client already supplied
// (saved-address chip or use-my-current-location flow). We trust the coords
// at face value — if the customer's lying about their location to game the
// matching engine, they're scammed someone into doing a task at the wrong
// address, not us. Reverse-geocode for a canonical formatted string when
// possible; fall back to the user-typed text if Mapbox is unavailable.
export async function resolveAddressFromCoords(
  rawText: string, lat: number, lng: number,
): Promise<ResolvedAddress> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return resolveAddressForInsert(rawText);
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return resolveAddressForInsert(rawText);
  }

  let formatted = rawText.trim();
  let country = PLACEHOLDER_COUNTRY;
  if (isGeocodingEnabled()) {
    const r = await reverseGeocode(lat, lng);
    if (r) {
      formatted = r.formatted;
      country = r.country;
    }
  }
  return {
    formatted,
    location: toPointWKT(lng, lat),
    country,
    lng,
    lat,
    verified: true,
  };
}

export async function resolveAddressForInsert(rawText: string): Promise<ResolvedAddress> {
  if (isGeocodingEnabled()) {
    const g = await geocodeAddress(rawText);
    if (g) {
      return {
        formatted: g.formatted,
        location: toPointWKT(g.lng, g.lat),
        country: g.country,
        lng: g.lng,
        lat: g.lat,
        verified: true,
      };
    }
    // Token present but Mapbox failed (timeout, no match, etc.) — fall
    // through to the placeholder rather than hard-failing the booking.
  }
  return {
    formatted: rawText.trim(),
    location: PLACEHOLDER_POINT,
    country: PLACEHOLDER_COUNTRY,
    lng: null,
    lat: null,
    verified: false,
  };
}
