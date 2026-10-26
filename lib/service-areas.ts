// Launch service areas — the authoritative definition of where Helpward
// will accept a task.
//
// Two separate concepts, deliberately not conflated:
//
//   1. SERVICE AREA (this file) — is the task's address somewhere we have
//      decided to operate? Checked server-side at request creation.
//   2. MATCHING DISTANCE (find_nearby_providers) — is any individual helper
//      close enough, within THEIR OWN configured service_radius_km?
//
// A city being launched does not imply a helper is available everywhere in
// it. An address can be perfectly serviceable and still find no helper.
//
// Matching is by municipality name as returned by Mapbox's `context.place`,
// not by radius. Radius circles spill across municipal lines (a 25km circle
// on downtown Vancouver covers most of the Lower Mainland plus water), and
// the launch decision was made in terms of municipalities.
//
// KNOWN LIMITATION: `context.place` approximates municipal boundaries; it is
// not an authoritative polygon lookup. Unincorporated land can sometimes
// carry a neighbouring municipality's place name. Treat this as a close
// approximation of city limits, and move to polygon containment (PostGIS +
// official boundary files) if edge cases show up in real bookings.

export type ServiceArea = {
  id: string;
  label: string;
  /** ISO 3166-1 alpha-2 */
  country: "CA" | "US";
  /** Region names Mapbox may return for this area. */
  regions: string[];
  /** Canonical municipality names included in the launch area. */
  municipalities: string[];
};

// Normalise for comparison: casefold, strip accents, collapse whitespace,
// drop punctuation, and remove the municipal-status words Mapbox and
// customers use inconsistently ("City of Langley", "District of North
// Vancouver", "Langley Township").
const STATUS_WORDS = new Set([
  "city", "district", "township", "municipality", "town", "village",
  "borough", "of", "the", "corporation",
]);

export function normalizeMunicipality(input: string): string {
  const stripped = input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !STATUS_WORDS.has(w));
  return stripped.join(" ");
}

export const SERVICE_AREAS: ServiceArea[] = [
  {
    id: "lower-mainland-bc",
    label: "Metro Vancouver / Lower Mainland, BC",
    country: "CA",
    regions: ["British Columbia", "BC"],
    // Proposed INITIAL service area — explicitly not a definition of the
    // whole Lower Mainland. Extend deliberately as helper supply grows.
    // "North Vancouver" covers both the City and the District; "Langley"
    // covers both the City and the Township. Mapbox collapses each pair to
    // one place name, and normalizeMunicipality() strips the status word in
    // case it doesn't.
    municipalities: [
      "Vancouver",
      "Burnaby",
      "Richmond",
      "New Westminster",
      "Surrey",
      "Delta",
      "White Rock",
      "Coquitlam",
      "Port Coquitlam",
      "Port Moody",
      "Pitt Meadows",
      "Maple Ridge",
      "North Vancouver",
      "West Vancouver",
      "Langley",
    ],
  },
  {
    id: "san-diego-ca",
    label: "San Diego, CA",
    country: "US",
    regions: ["California", "CA"],
    // CITY LIMITS ONLY — we do not advertise or accept county-wide or
    // metro-wide coverage. Neighbouring incorporated cities (Chula Vista,
    // National City, La Mesa, Coronado, El Cajon…) are deliberately
    // excluded, as is unincorporated San Diego County.
    //
    // Los Angeles was in this list until 2026-10-26 and was dropped from
    // the launch by owner decision. Adding a city back is a deliberate act:
    // it needs helper supply in that city first, or the dispatcher will
    // accept bookings it cannot fill.
    municipalities: ["San Diego"],
  },
];

// Precomputed lookup: normalised "country|municipality" -> area.
const INDEX: Map<string, ServiceArea> = (() => {
  const m = new Map<string, ServiceArea>();
  for (const area of SERVICE_AREAS) {
    for (const muni of area.municipalities) {
      m.set(`${area.country}|${normalizeMunicipality(muni)}`, area);
    }
  }
  return m;
})();

export type PlaceInput = {
  country: string | null;
  region: string | null;
  /** Municipality / locality name, e.g. Mapbox context.place.name */
  place: string | null;
};

/**
 * Resolve a geocoded place to a launch service area, or null if we don't
 * operate there. Region is checked when supplied (guards against a
 * same-named municipality in another province/state, e.g. Delta, Utah),
 * but a missing region does not by itself disqualify an otherwise matching
 * municipality — Mapbox occasionally omits it.
 */
export function resolveServiceArea(input: PlaceInput): ServiceArea | null {
  if (!input.place || !input.country) return null;
  const country = input.country.toUpperCase();
  const area = INDEX.get(`${country}|${normalizeMunicipality(input.place)}`);
  if (!area) return null;
  if (input.region) {
    const r = normalizeMunicipality(input.region);
    const ok = area.regions.some((x) => normalizeMunicipality(x) === r);
    if (!ok) return null;
  }
  return area;
}

export function isServiceable(input: PlaceInput): boolean {
  return resolveServiceArea(input) !== null;
}

/** Human-readable coverage list for customer-facing copy and error states. */
export function describeCoverage(): string[] {
  return SERVICE_AREAS.map((a) => a.label);
}

/** The message shown when an address falls outside every launch area. */
export const OUT_OF_AREA_MESSAGE =
  "Helpward isn't serving that address yet. We're currently live in " +
  "Vancouver and the surrounding Lower Mainland, plus the city of " +
  "San Diego.";
