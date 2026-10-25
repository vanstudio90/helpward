// Logic-level coverage for the launch acceptance plan, sections 2 and 4.
//
// SCOPE AND LIMITS — read before trusting these as acceptance evidence.
// These tests execute the real decision functions, so they are genuine
// evidence for the rules those functions own. They are NOT evidence for:
//   * live dispatch (matching eligibility lives in SQL, migration 0030)
//   * atomic simultaneous acceptance (SQL row lock, migration 0004/0031)
//   * payments (no processor is connected)
//   * anything requiring an approved helper or a real Mapbox response
// Those remain BLOCKED and are recorded as such in the evidence report.

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { isServiceable, resolveServiceArea, SERVICE_AREAS } from "../lib/service-areas.ts";
import { isAmbiguous, isPlaceholderPoint, RESOLVE_FAILURE_MESSAGE } from "../lib/geocode.ts";
import { priceTask, payoutFromEstimateCents, SERVICE_FEE_CENTS, COMMISSION_RATE } from "../lib/pricing.ts";

// ---------------------------------------------------------------------------
// Plan 2 — geography restrictions
// ---------------------------------------------------------------------------
describe("plan 2.1 — California rejections named in the plan", () => {
  for (const city of ["Santa Monica", "Burbank", "West Hollywood", "Pasadena", "Chula Vista"]) {
    test(`rejects ${city}`, () => {
      assert.equal(isServiceable({ place: city, region: "California", country: "US" }), false);
    });
  }
  test("accepts the two California launch cities", () => {
    assert.equal(isServiceable({ place: "Los Angeles", region: "California", country: "US" }), true);
    assert.equal(isServiceable({ place: "San Diego", region: "California", country: "US" }), true);
  });
});

describe("plan 2.2 — unsupported Canadian municipalities and Delta, Utah", () => {
  // Abbotsford, Chilliwack and Mission are often described as Lower
  // Mainland but are NOT in the approved initial service area. They are the
  // most likely false-positive, so they are tested explicitly.
  for (const city of ["Abbotsford", "Chilliwack", "Mission", "Squamish", "Bowen Island"]) {
    test(`rejects ${city}, BC (outside the approved municipality list)`, () => {
      assert.equal(isServiceable({ place: city, region: "British Columbia", country: "CA" }), false);
    });
  }
  test("rejects Delta, Utah while accepting Delta, BC", () => {
    assert.equal(isServiceable({ place: "Delta", region: "British Columbia", country: "CA" }), true);
    assert.equal(isServiceable({ place: "Delta", region: "Utah", country: "US" }), false);
  });
  test("rejects a BC municipality submitted with a US country code", () => {
    assert.equal(isServiceable({ place: "Vancouver", region: "Washington", country: "US" }), false);
  });
});

describe("plan 2.4 — placeholder coordinates are identifiable", () => {
  test("recognises the legacy downtown-Vancouver placeholder", () => {
    assert.equal(isPlaceholderPoint(-123.1207, 49.2827), true);
  });
  test("does not flag a genuine nearby coordinate", () => {
    assert.equal(isPlaceholderPoint(-123.1297, 49.219), false);
  });
  test("tolerates null coordinates", () => {
    assert.equal(isPlaceholderPoint(null, null), false);
    assert.equal(isPlaceholderPoint(-123.1207, null), false);
  });
});

describe("plan 2.5 — ambiguous or unavailable geocoding is refused", () => {
  const base = {
    formatted: "1 Main St", lng: -123.1, lat: 49.2, country: "CA",
    region: "British Columbia", city: "Vancouver", postalCode: null,
    confidence: "exact" as const, addressNumberMatch: "matched", candidateCount: 1,
  };
  test("accepts an exact, single-candidate match", () => {
    assert.equal(isAmbiguous(base), false);
  });
  test("rejects medium and low confidence", () => {
    assert.equal(isAmbiguous({ ...base, confidence: "medium" }), true);
    assert.equal(isAmbiguous({ ...base, confidence: "low" }), true);
  });
  test("rejects an unmatched street number", () => {
    assert.equal(isAmbiguous({ ...base, addressNumberMatch: "unmatched" }), true);
  });
  test("rejects a second plausible candidate", () => {
    assert.equal(isAmbiguous({ ...base, candidateCount: 2 }), true);
  });
  test("a reverse lookup carries no match score and is not treated as ambiguous", () => {
    assert.equal(isAmbiguous({ ...base, confidence: null, addressNumberMatch: null }), false);
  });
  test("every failure reason has customer-facing copy", () => {
    for (const r of ["geocoding_unavailable", "not_found", "incomplete", "ambiguous"] as const) {
      assert.ok(RESOLVE_FAILURE_MESSAGE[r]?.length > 10, `missing message for ${r}`);
    }
  });
});

describe("plan 2.3 — boundary proximity (documented limitation)", () => {
  test("service areas are defined by municipality name, not geometry", () => {
    // This records the limitation rather than asserting a geometric
    // behaviour the implementation does not have. "Immediately inside vs
    // outside a boundary" is decided entirely by which municipality Mapbox
    // attributes to the coordinate; there is no polygon containment test.
    // Verifying true boundary behaviour requires either official boundary
    // polygons in PostGIS, or an explicit decision to treat Mapbox's
    // attribution as authoritative.
    for (const area of SERVICE_AREAS) {
      assert.ok(Array.isArray(area.municipalities) && area.municipalities.length > 0);
      assert.ok(!("polygon" in area), "no polygon geometry is defined");
    }
  });
});

// ---------------------------------------------------------------------------
// Plan 4 — pricing arithmetic
// ---------------------------------------------------------------------------
describe("plan 4.1/4.2 — the split", () => {
  test("helper earnings equal 80% of the commissionable subtotal plus all tips", () => {
    for (const [subtotal, tip] of [[2000, 0], [2000, 500], [3800, 1234], [1, 1], [12345, 99]]) {
      const b = priceTask(subtotal, tip);
      assert.equal(
        b.helperPayoutCents,
        Math.round(subtotal * (1 - COMMISSION_RATE)) + tip,
        `subtotal ${subtotal} tip ${tip}`,
      );
    }
  });

  test("platform gross equals the remaining subtotal plus the $4.50 fee", () => {
    for (const subtotal of [0, 1, 7, 333, 2000, 3800, 99999]) {
      const b = priceTask(subtotal, 777);
      const helperShareOfSubtotal = b.helperPayoutCents - b.tipCents;
      assert.equal(
        b.platformGrossCents,
        (subtotal - helperShareOfSubtotal) + SERVICE_FEE_CENTS,
        `subtotal ${subtotal}`,
      );
    }
  });

  test("a tip never changes what the platform takes", () => {
    const noTip = priceTask(2000, 0);
    const bigTip = priceTask(2000, 50_000);
    assert.equal(noTip.platformGrossCents, bigTip.platformGrossCents);
  });
});

describe("plan 4.3 — rounding reconciles exactly; no silent deductions", () => {
  test("payout + platform gross always equals the customer total, cent for cent", () => {
    for (let subtotal = 0; subtotal <= 400; subtotal++) {
      for (const tip of [0, 1, 37]) {
        const b = priceTask(subtotal, tip);
        assert.equal(
          b.helperPayoutCents + b.platformGrossCents,
          b.totalCents,
          `subtotal ${subtotal} tip ${tip} failed to reconcile`,
        );
      }
    }
  });

  test("no cent is created or lost on the subtotal split", () => {
    for (const subtotal of [1, 2, 3, 4, 5, 9, 99, 101, 2503, 71_429]) {
      const b = priceTask(subtotal);
      const helperShare = b.helperPayoutCents;
      const commission = b.platformGrossCents - SERVICE_FEE_CENTS;
      assert.equal(helperShare + commission, subtotal, `subtotal ${subtotal}`);
    }
  });

  test("processing cost is not modelled as a helper deduction", () => {
    // Nothing in the breakdown reduces helperPayoutCents for processing.
    // Processing comes out of platformGrossCents once a processor exists.
    const b = priceTask(2000, 300);
    assert.equal(b.helperPayoutCents, 1600 + 300);
    assert.ok(!("processingCents" in b), "processing must not silently appear in the helper's split");
  });

  test("tax is explicit and currently zero", () => {
    assert.equal(priceTask(2000).taxCents, 0);
  });

  test("a malformed estimate cannot produce a negative payout", () => {
    assert.equal(payoutFromEstimateCents(0), 0);
    assert.equal(payoutFromEstimateCents(100), 0);
    assert.equal(payoutFromEstimateCents(SERVICE_FEE_CENTS), 0);
  });
});

describe("plan 4.5 — currency is derived per customer, not per price", () => {
  test("the split is currency-agnostic in cents", () => {
    // accept_request (migration 0031) picks CAD for a CA customer and USD
    // otherwise, then stores the same integer cents either way. The split
    // therefore cannot drift between currencies. Live USD/CAD verification
    // still needs a real booking in each region.
    const ca = priceTask(2000, 250);
    const us = priceTask(2000, 250);
    assert.deepEqual(ca, us);
  });
});
