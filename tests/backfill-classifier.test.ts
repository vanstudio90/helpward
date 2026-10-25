// The backfill writes geocode_verified as the trusted service role, so its
// acceptance rules must not be weaker than the application resolver's.
// They diverged once (review finding D03): the resolver was tightened to
// require an address feature with a matched street number while the
// backfill still accepted a missing match_code, so a street result in a
// supported municipality was written back as verified.
//
// These tests assert the two agree, case for case.

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { isAmbiguous } from "../lib/geocode.ts";
import { classify, weaknesses } from "../scripts/lib/geocode-classify.mjs";

const VANCOUVER = { country: "CA", region: "British Columbia", place: "Vancouver" };

/** Shape the backfill's geocode() returns. */
function g(over: Record<string, unknown> = {}) {
  return {
    ...VANCOUVER,
    featureType: "address", confidence: "exact",
    addressNumberMatch: "matched", candidateCount: 1,
    ...over,
  };
}

/** Same case in the shape lib/geocode.ts uses. */
function r(over: Record<string, unknown> = {}) {
  return {
    formatted: "1 Main St", lng: -123.1, lat: 49.2,
    country: "CA", region: "British Columbia", city: "Vancouver", postalCode: null,
    featureType: "address", confidence: "exact" as const,
    addressNumberMatch: "matched", candidateCount: 1, origin: "forward" as const,
    ...over,
  };
}

const CASES: Array<[string, Record<string, unknown>, boolean]> = [
  ["exact address, one candidate",        {},                                               true],
  ["street feature, no match_code",       { featureType: "street", confidence: null, addressNumberMatch: null }, false],
  ["place feature",                       { featureType: "place" },                         false],
  ["no feature type",                     { featureType: null },                            false],
  ["two candidates",                      { candidateCount: 2 },                            false],
  ["medium confidence",                   { confidence: "medium" },                         false],
  ["low confidence",                      { confidence: "low" },                            false],
  ["absent confidence",                   { confidence: null },                             false],
  ["unmatched street number",             { addressNumberMatch: "unmatched" },              false],
  ["not_applicable street number",        { addressNumberMatch: "not_applicable" },         false],
  ["absent street number",                { addressNumberMatch: null },                     false],
];

describe("backfill classifier matches the application resolver", () => {
  for (const [label, over, shouldAccept] of CASES) {
    test(label, () => {
      const backfillVerified = classify(g(over)).outcome === "verified";
      const resolverAccepts = !isAmbiguous(r(over) as never);
      assert.equal(
        backfillVerified, shouldAccept,
        `backfill should ${shouldAccept ? "verify" : "refuse"}: ${label}`,
      );
      assert.equal(
        backfillVerified, resolverAccepts,
        `backfill and resolver disagree on: ${label}`,
      );
    });
  }

  test("missing metadata is reconfirmation, never verification", () => {
    const c = classify(g({ featureType: "street", confidence: null, addressNumberMatch: null }));
    assert.equal(c.outcome, "needs_reconfirm");
    assert.match(c.note, /feature_type/);
  });

  test("out of area is reported before weakness", () => {
    const c = classify(g({ place: "Abbotsford" }));
    assert.equal(c.outcome, "out_of_area");
  });

  test("a lookup error is retryable, not a refusal", () => {
    assert.equal(classify({ error: "mapbox 503" }).outcome, "failed");
  });

  test("weaknesses() names every reason it refuses for", () => {
    const w = weaknesses(g({ featureType: "street", confidence: "low", addressNumberMatch: "unmatched", candidateCount: 3 }));
    assert.equal(w.length, 4, "each independent failure must be reported");
  });
});
