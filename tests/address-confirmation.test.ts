// Medium-confidence addresses, behind explicit customer confirmation.
//
// The cases named in the launch decision: East vs West C Street, Third vs
// 3rd Avenue, multiple medium rivals, edited confirmations, and out-of-area
// addresses. Each is asserted against the real modules, not copies.

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  reviewResolution, differOnlyByDirection, relevantAlternatives,
} from "../lib/address-confirmation.ts";
import { classifyAcceptance, isAmbiguous } from "../lib/geocode.ts";
import {
  issueConfirmationToken, verifyConfirmationToken,
} from "../lib/address-token.ts";

// A real Mapbox-shaped forward result.
function g(over: Record<string, unknown> = {}) {
  return {
    formatted: "202 East C Street, San Diego, California 92101, United States",
    lng: -117.1600, lat: 32.7160, country: "US",
    region: "California", city: "San Diego", postalCode: "92101",
    featureType: "address", confidence: "medium" as const,
    addressNumberMatch: "matched", candidateCount: 2,
    hasRivalCandidate: false, origin: "forward" as const,
    alternatives: [
      { formatted: "202 East C Street, San Diego, California 92101, United States",
        lng: -117.16, lat: 32.716, country: "US", region: "California",
        city: "San Diego", postalCode: "92101", confidence: "medium" as const },
    ],
    ...over,
  };
}

// ---------------------------------------------------------------------------
// Rule 2 — which changes the customer must actually look at
// ---------------------------------------------------------------------------
describe("meaningful changes are separated from formatting", () => {
  test("adding a direction is significant: 202 C St -> 202 East C Street", () => {
    const r = reviewResolution(
      "202 C St, San Diego, CA",
      "202 East C Street, San Diego, California 92101, United States",
    );
    assert.equal(r.needsConfirmation, true);
    assert.equal(r.directionAdded, "East");
    assert.ok(r.changes.some((c) => c.kind === "directional" && c.significant));
  });

  test("Third -> 3rd is formatting, NOT significant", () => {
    const r = reviewResolution(
      "1200 Third Ave, San Diego, CA",
      "1200 3rd Avenue, San Diego, California 92101, United States",
    );
    assert.equal(r.needsConfirmation, false, "an ordinal spelling is not a real change");
    assert.ok(r.changes.some((c) => c.kind === "formatting" && c.from === "third" && c.to === "3rd"));
    assert.ok(!r.changes.some((c) => c.significant));
  });

  test("swapping East for West is significant", () => {
    const r = reviewResolution(
      "202 East C St, San Diego",
      "202 West C Street, San Diego, California, United States",
    );
    assert.equal(r.needsConfirmation, true);
    const d = r.changes.find((c) => c.kind === "directional");
    assert.equal(d?.from, "East");
    assert.equal(d?.to, "West");
  });

  test("a changed house number is significant", () => {
    const r = reviewResolution("100 Main St, Vancouver", "200 Main Street, Vancouver, BC, Canada");
    assert.ok(r.changes.some((c) => c.kind === "number" && c.significant));
  });

  test("state abbreviations are not treated as unmatched words", () => {
    // "CA" vs "California" and "BC" vs "British Columbia" previously made
    // every single address look changed.
    for (const [typed, resolved] of [
      ["750 B Street, San Diego, CA", "750 B Street, San Diego, California 92101, United States"],
      ["1055 Canada Pl, Vancouver, BC", "1055 Canada Place, Vancouver, British Columbia V6C 0C3, Canada"],
    ]) {
      assert.equal(reviewResolution(typed, resolved).needsConfirmation, false, typed);
    }
  });

  test("candidates differing only by direction are detected", () => {
    assert.equal(differOnlyByDirection([
      "202 East C Street, San Diego", "202 West C Street, San Diego",
    ]), true);
    assert.equal(differOnlyByDirection([
      "202 C Street, San Diego", "500 Elm Street, San Diego",
    ]), false);
  });
});

// ---------------------------------------------------------------------------
// Rule 1 and 3 — what medium means, and when the customer must choose
// ---------------------------------------------------------------------------
describe("acceptance classification", () => {
  test("exact and high with a matched number are accepted automatically", () => {
    for (const c of ["exact", "high"] as const) {
      assert.equal(classifyAcceptance(g({ confidence: c })).kind, "auto", c);
    }
  });

  test("medium requires confirmation — never silent acceptance, never refusal", () => {
    assert.equal(classifyAcceptance(g()).kind, "confirm");
  });

  test("several plausible candidates require SELECTION, not ranking", () => {
    const two = g({
      alternatives: [
        { formatted: "202 East C Street, San Diego", lng: -117.16, lat: 32.716,
          country: "US", region: "California", city: "San Diego", postalCode: null, confidence: "medium" as const },
        { formatted: "202 West C Street, San Diego", lng: -117.17, lat: 32.716,
          country: "US", region: "California", city: "San Diego", postalCode: null, confidence: "medium" as const },
      ],
    });
    assert.equal(classifyAcceptance(two).kind, "select");
  });

  test("two HIGH candidates also require selection", () => {
    const two = g({
      confidence: "high",
      alternatives: [
        { formatted: "A", lng: 1, lat: 1, country: "US", region: null, city: "San Diego", postalCode: null, confidence: "high" as const },
        { formatted: "B", lng: 2, lat: 2, country: "US", region: null, city: "San Diego", postalCode: null, confidence: "high" as const },
      ],
    });
    assert.equal(classifyAcceptance(two).kind, "select");
  });

  test("a low-confidence alternative is not a rival", () => {
    const one = g({
      confidence: "high",
      alternatives: [
        { formatted: "A", lng: 1, lat: 1, country: "US", region: null, city: "San Diego", postalCode: null, confidence: "high" as const },
        { formatted: "B", lng: 2, lat: 2, country: "US", region: null, city: "San Diego", postalCode: null, confidence: "low" as const },
      ],
    });
    assert.equal(classifyAcceptance(one).kind, "auto");
  });

  test("the previously refused cases are STILL refused", () => {
    assert.equal(classifyAcceptance(g({ confidence: "low" })).kind, "refuse");
    assert.equal(classifyAcceptance(g({ addressNumberMatch: "unmatched" })).kind, "refuse");
    assert.equal(classifyAcceptance(g({ addressNumberMatch: "not_applicable" })).kind, "refuse");
    assert.equal(classifyAcceptance(g({ featureType: "street" })).kind, "refuse");
    assert.equal(classifyAcceptance(g({ featureType: "place" })).kind, "refuse");
    assert.equal(classifyAcceptance(g({ confidence: null })).kind, "refuse");
  });

  test("a reverse lookup is still automatic", () => {
    assert.equal(classifyAcceptance(g({ origin: "reverse" })).kind, "auto");
  });

  test("isAmbiguous stays true for anything needing the customer", () => {
    assert.equal(isAmbiguous(g()), true, "medium is not automatically usable");
    assert.equal(isAmbiguous(g({ confidence: "high" })), false);
  });
});

// ---------------------------------------------------------------------------
// Rule 4 — the browser cannot grant itself a verified address
// ---------------------------------------------------------------------------
describe("confirmation tokens", () => {
  process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key-for-hmac-derivation";

  const candidate = {
    formatted: "202 East C Street, San Diego, California 92101, United States",
    lng: -117.1600, lat: 32.7160, country: "US", region: "California",
    city: "San Diego", postalCode: "92101", confidence: "medium" as const,
  };
  const USER = "11111111-1111-1111-1111-111111111111";
  const OTHER = "22222222-2222-2222-2222-222222222222";

  test("a token issued for a candidate verifies against that candidate", () => {
    const t = issueConfirmationToken(candidate, USER);
    assert.equal(verifyConfirmationToken(t, candidate, USER).ok, true);
  });

  test("another customer cannot replay it", () => {
    const t = issueConfirmationToken(candidate, USER);
    const r = verifyConfirmationToken(t, candidate, OTHER);
    assert.equal(r.ok, false);
    assert.equal(r.ok === false && r.reason, "wrong_user");
  });

  test("editing the address invalidates the confirmation", () => {
    const t = issueConfirmationToken(candidate, USER);
    // The customer changed East to West after confirming.
    const edited = { ...candidate, formatted: "202 West C Street, San Diego, California 92101, United States" };
    const r = verifyConfirmationToken(t, edited, USER);
    assert.equal(r.ok, false);
    assert.equal(r.ok === false && r.reason, "address_changed");
  });

  test("moving the pin invalidates the confirmation", () => {
    const t = issueConfirmationToken(candidate, USER);
    const moved = { ...candidate, lng: candidate.lng + 0.002 };
    assert.equal(verifyConfirmationToken(t, moved, USER).ok, false);
  });

  test("a forged or tampered token is rejected", () => {
    const t = issueConfirmationToken(candidate, USER);
    const parts = t.split(".");
    const tampered = [...parts.slice(0, 4), "AAAA" + parts[4].slice(4)].join(".");
    assert.equal(verifyConfirmationToken(tampered, candidate, USER).ok, false);
    assert.equal(verifyConfirmationToken("", candidate, USER).ok, false);
    assert.equal(verifyConfirmationToken("v1.a.b.c.d", candidate, USER).ok, false);
  });

  test("a client cannot mint one without the server secret", () => {
    // Exactly the shape the server produces, but signed with nothing.
    const forged = ["v1", "deadbeef", USER, String(Date.now() + 60000), "not-a-signature"].join(".");
    const r = verifyConfirmationToken(forged, candidate, USER);
    assert.equal(r.ok, false);
    assert.equal(r.ok === false && r.reason, "bad_signature");
  });

  test("an expired confirmation is rejected", () => {
    const realNow = Date.now;
    try {
      const t = issueConfirmationToken(candidate, USER);
      Date.now = () => realNow() + 31 * 60 * 1000;
      const r = verifyConfirmationToken(t, candidate, USER);
      assert.equal(r.ok, false);
      assert.equal(r.ok === false && r.reason, "expired");
    } finally {
      Date.now = realNow;
    }
  });
});

// ---------------------------------------------------------------------------
// Relevance, not confidence, decides which alternatives are shown.
//
// Filtering by confidence tier happened to exclude Susanville but would
// also have hidden a lower-ranked address on the other side of the same
// street — the case that matters most.
// ---------------------------------------------------------------------------
describe("relevant alternatives", () => {
  const laPrimary = {
    formatted: "200 North Spring Street, Los Angeles, California 90012, United States",
    lng: -118.242922, lat: 34.053611, city: "Los Angeles",
    region: "California", postalCode: "90012", confidence: "high" as const,
  };
  const susanville = {
    formatted: "200 North Spring Street, Susanville, California 96130, United States",
    lng: -120.642612, lat: 40.416016, city: "Susanville",
    region: "California", postalCode: "96130", confidence: "medium" as const,
  };

  test("a candidate in a city the customer did not name is excluded", () => {
    const out = relevantAlternatives(
      "200 N Spring St, Los Angeles, CA", laPrimary, [susanville],
    );
    assert.deepEqual(out, [], "Susanville is not an alternative to Los Angeles");
  });

  test("a LOWER-confidence alternative on the other side of the street is KEPT", () => {
    const east = {
      formatted: "202 East C Street, San Diego, California 92101, United States",
      lng: -117.1600, lat: 32.7160, city: "San Diego",
      region: "California", postalCode: "92101", confidence: "medium" as const,
    };
    const west = {
      formatted: "202 West C Street, San Diego, California 92101, United States",
      lng: -117.1680, lat: 32.7158, city: "San Diego",
      region: "California", postalCode: "92101", confidence: "low" as const,
    };
    const out = relevantAlternatives("202 C St, San Diego, CA", east, [west]);
    assert.equal(out.length, 1, "a different direction must survive a lower rank");
    assert.equal(out[0].formatted, west.formatted);
  });

  test("a far-away street of the same name is excluded", () => {
    const far = {
      formatted: "202 East C Street, Sacramento, California 95814, United States",
      lng: -121.4944, lat: 38.5816, city: "Sacramento",
      region: "California", postalCode: "95814", confidence: "high" as const,
    };
    const east = { ...laPrimary, formatted: "202 East C Street, San Diego, California 92101, United States",
      lng: -117.16, lat: 32.716, city: "San Diego", postalCode: "92101" };
    assert.deepEqual(relevantAlternatives("202 C St, San Diego", east, [far]), []);
  });

  test("a nearby alternative with a different house number is kept", () => {
    const a = { ...laPrimary };
    const b = { ...laPrimary, formatted: "300 North Spring Street, Los Angeles, California 90012, United States", lat: 34.0545 };
    const out = relevantAlternatives("200 N Spring St, Los Angeles, CA", a, [b]);
    assert.equal(out.length, 1);
  });

  test("the primary never appears among its own alternatives", () => {
    assert.deepEqual(relevantAlternatives("anything", laPrimary, [laPrimary]), []);
  });

  test("a postcode the customer typed excludes a different one", () => {
    const other = { ...susanville, city: "Los Angeles", postalCode: "90210" };
    const out = relevantAlternatives("200 N Spring St, Los Angeles 90012", laPrimary, [other]);
    assert.deepEqual(out, []);
  });
});
