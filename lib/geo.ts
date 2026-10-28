import { headers } from "next/headers";
import { CITIES, type City } from "@/lib/marketing";
import { SERVICE_AREAS, normalizeMunicipality } from "@/lib/service-areas";

// Vercel attaches edge geolocation headers to every request — no API call,
// no third-party dep, free at any scale. Headers exist only on deployed
// Vercel infra; locally they return null and callers fall back to generic copy.
//
// Documented headers:
//   x-vercel-ip-city            URL-encoded city name (e.g. "San%20Francisco")
//   x-vercel-ip-country         2-letter ISO ("US", "CA")
//   x-vercel-ip-country-region  ISO 3166-2 subdivision ("CA", "BC", "ON")
//   x-vercel-ip-latitude        decimal string
//   x-vercel-ip-longitude       decimal string

export type Visitor = {
  rawCity: string | null;
  region: string | null;
  country: string | null;
  // The CITIES entry we matched the visitor to — null if they're outside our
  // 10 Helpward markets, in which case the UI shows generic copy.
  matchedCity: City | null;
};

export async function getVisitor(): Promise<Visitor> {
  const h = await headers();
  const rawCity = decodeHeader(h.get("x-vercel-ip-city"));
  const region = h.get("x-vercel-ip-country-region");
  const country = h.get("x-vercel-ip-country");
  const matchedCity = matchToHelpwardCity(rawCity, region, country);
  return { rawCity, region, country, matchedCity };
}

function decodeHeader(v: string | null): string | null {
  if (!v) return null;
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}

// Best-effort match: prefer slug equality on city name, then loose
// substring/prefix match (handles "New York City" vs "New York"). Returns
// null if the visitor is clearly outside our coverage, so the UI falls back
// to "247 helpers available across 10 cities" instead of pretending.
function matchToHelpwardCity(
  city: string | null, region: string | null, country: string | null,
): City | null {
  if (!city) return null;
  const target = city.toLowerCase().trim();
  // 1. Exact name match
  for (const c of CITIES) {
    if (c.name.toLowerCase() === target) return c;
  }
  // 2. Slug match — accepts "san-francisco" if the header somehow ships pre-slugified
  const slugged = target.replace(/\s+/g, "-");
  for (const c of CITIES) {
    if (c.slug === slugged) return c;
  }
  // 3. Substring match — handles "New York City" / "NYC" / "Greater Vancouver"
  for (const c of CITIES) {
    const n = c.name.toLowerCase();
    if (target.includes(n) || n.includes(target)) {
      // Reject false positives like "York" matching "New York" without context
      if (n.length >= 4 || country === c.country) return c;
    }
  }
  // 4. Municipality match against the ACTUAL service areas.
  //
  // This replaced a country+region table that mapped CA-BC -> Vancouver and
  // US-CA -> San Francisco, plus seven other entries pointing at cities
  // retired on 2026-10-26. Eight of the nine resolved to null, so the code
  // described markets that no longer existed.
  //
  // The surviving entry was the worse problem: province-wide snapping told
  // a visitor in Victoria or Prince George "Get real human help in
  // Vancouver", several hundred kilometres outside anywhere a helper can be
  // dispatched. lib/service-areas.ts already lists the exact municipalities
  // each area covers — the same list the dispatch guard enforces — so a
  // visitor is personalised only where a booking could actually be filled.
  if (region && country) {
    const area = SERVICE_AREAS.find((a) =>
      a.country === country &&
      a.regions.some((r) => r.toLowerCase() === region.toLowerCase()) &&
      a.municipalities.some((m) => normalizeMunicipality(m) === normalizeMunicipality(target)),
    );
    if (area) {
      // Area ids and marketing slugs differ: "lower-mainland-bc" is the
      // dispatch area, "vancouver" is the page a visitor reads.
      const slug = AREA_TO_CITY_SLUG[area.id];
      if (slug) return CITIES.find((c) => c.slug === slug) ?? null;
    }
  }
  return null;
}

/** Dispatch area id -> the marketing city page that represents it. */
const AREA_TO_CITY_SLUG: Record<string, string> = {
  "lower-mainland-bc": "vancouver",
  "san-diego-ca": "san-diego",
};

