import { headers } from "next/headers";
import { CITIES, type City } from "@/lib/marketing";

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
  // 4. Country+region heuristic: if user is in BC/Canada → Vancouver, ON/Canada → Toronto
  if (country && region) {
    const fallback = COUNTRY_REGION_FALLBACK[`${country}-${region}`];
    if (fallback) return CITIES.find((c) => c.slug === fallback) ?? null;
  }
  return null;
}

// When we know the country/region but the city name didn't match, snap to the
// nearest Helpward market in that region. Better than no personalisation at all.
const COUNTRY_REGION_FALLBACK: Record<string, string> = {
  "CA-BC": "vancouver",
  "CA-ON": "toronto",
  "CA-QC": "montreal",
  "US-WA": "seattle",
  "US-CA": "san-francisco", // closest of LA/SF — could refine with lat/lng
  "US-TX": "austin",
  "US-IL": "chicago",
  "US-NY": "new-york",
  "US-FL": "miami",
};
