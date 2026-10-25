// Forward-geocode acceptance rules, shared by the address backfill and
// asserted against the application resolver.
//
// These rules were allowed to diverge once: lib/geocode.ts was tightened to
// require an address-type feature with a matched street number, while the
// backfill still accepted a result with no match_code. A street result in a
// supported municipality was therefore written back with
// geocode_verified = true by the trusted service writer — and the database
// gate cannot tell a false attestation from a real one.
//
// Kept as plain ESM with no dependencies so the backfill can run against a
// database with no build step. tests/backfill-classifier.test.ts asserts
// these agree with isAmbiguous() in lib/geocode.ts, case for case.

export const STATUS_WORDS = new Set([
  "city", "district", "township", "municipality", "town", "village",
  "borough", "of", "the", "corporation",
]);

export function normalizeMunicipality(input) {
  return String(input ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !STATUS_WORDS.has(w))
    .join(" ");
}

export const SERVICE_AREAS = [
  {
    id: "lower-mainland-bc", country: "CA", regions: ["British Columbia", "BC"],
    municipalities: [
      "Vancouver", "Burnaby", "Richmond", "New Westminster", "Surrey", "Delta",
      "White Rock", "Coquitlam", "Port Coquitlam", "Port Moody", "Pitt Meadows",
      "Maple Ridge", "North Vancouver", "West Vancouver", "Langley",
    ],
  },
  { id: "los-angeles-ca", country: "US", regions: ["California", "CA"], municipalities: ["Los Angeles"] },
  { id: "san-diego-ca",   country: "US", regions: ["California", "CA"], municipalities: ["San Diego"] },
];

const AREA_INDEX = new Map();
for (const a of SERVICE_AREAS) {
  for (const m of a.municipalities) {
    AREA_INDEX.set(`${a.country}|${normalizeMunicipality(m)}`, a);
  }
}

export function resolveArea({ country, region, place }) {
  if (!place || !country) return null;
  const area = AREA_INDEX.get(`${String(country).toUpperCase()}|${normalizeMunicipality(place)}`);
  if (!area) return null;
  if (region) {
    const r = normalizeMunicipality(region);
    if (!area.regions.some((x) => normalizeMunicipality(x) === r)) return null;
  }
  return area;
}

/** Only an address feature is precise enough to send a helper to. */
export const DISPATCHABLE_FEATURE_TYPES = new Set(["address"]);
export const ACCEPTABLE_CONFIDENCE = new Set(["exact", "high"]);

/**
 * Mirrors isAmbiguous() in lib/geocode.ts for forward lookups.
 * Returns the list of reasons the result is too weak to attest, empty when
 * it is acceptable.
 */
export function weaknesses(g) {
  const weak = [];
  if (!g.featureType || !DISPATCHABLE_FEATURE_TYPES.has(g.featureType)) {
    weak.push(`feature_type=${g.featureType ?? "none"} (only an address feature is precise enough)`);
  }
  if ((g.candidateCount ?? 1) > 1) weak.push("multiple candidates");
  if (!g.confidence || !ACCEPTABLE_CONFIDENCE.has(g.confidence)) {
    weak.push(`confidence=${g.confidence ?? "absent"}`);
  }
  if (g.addressNumberMatch !== "matched") {
    weak.push(`address_number=${g.addressNumberMatch ?? "absent"}`);
  }
  return weak;
}

/**
 * Classify a legacy row's re-geocode.
 *   verified        real address, confidently matched, inside a launch area
 *   out_of_area     geocoded fine, we do not operate there
 *   needs_reconfirm ambiguous or missing metadata — the customer must confirm
 *   failed          lookup error; safe to retry later
 *
 * Missing metadata is never verification.
 */
export function classify(g) {
  if (g.error) return { outcome: "failed", note: g.error };
  if (!g.place) return { outcome: "needs_reconfirm", note: "no municipality returned" };

  const area = resolveArea({ country: g.country, region: g.region, place: g.place });
  if (!area) {
    return {
      outcome: "out_of_area",
      note: `${g.place}, ${g.region ?? "?"}, ${g.country || "?"} is outside every launch area`,
    };
  }

  const weak = weaknesses(g);
  if (weak.length > 0) return { outcome: "needs_reconfirm", note: `ambiguous: ${weak.join("; ")}` };
  return { outcome: "verified", note: `matched ${area.id}` };
}
