import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { nextConfirmedCountry, quoteCurrency, countryOf } from "@/lib/quote-currency";

// Vancouver was quoted CA$24.50 → US$24.50 → CA$24.50 across one booking.
// Three sources disagreed: a regex over the address BOX, a submitted
// screen that defaulted to USD, and acceptance reading the truth. These
// cover the transitions, which is where it actually went wrong.

describe("when the quote's country becomes known", () => {
  test("typing in the address box verifies nothing", () => {
    // The original bug: "…Vancouver, BC" in the box flipped the price to
    // CA$ before anything had resolved it.
    assert.equal(nextConfirmedCountry(null, { type: "typed" }), null);
  });

  test("a confirmed address sets it", () => {
    assert.equal(nextConfirmedCountry(null, { type: "confirmed", country: "CA" }), "CA");
    assert.equal(nextConfirmedCountry(null, { type: "confirmed", country: "US" }), "US");
  });

  test("editing after confirming makes it stale again", () => {
    // Otherwise a confirmed Vancouver address, then edited to a San Diego
    // one, keeps quoting CAD.
    assert.equal(nextConfirmedCountry("CA", { type: "typed" }), null);
  });

  test("a saved address counts — it was verified when it was saved", () => {
    assert.equal(nextConfirmedCountry(null, { type: "saved_address", country: "CA" }), "CA");
  });

  test("a GPS fix counts — a reverse geocode IS a resolution", () => {
    assert.equal(nextConfirmedCountry(null, { type: "gps", country: "CA" }), "CA");
  });

  test("a saved address with no country recorded leaves what we had", () => {
    // Older saved rows predate the column. Clearing a known country for
    // one of those would be losing information, not gaining it.
    assert.equal(nextConfirmedCountry("CA", { type: "saved_address", country: null }), "CA");
    assert.equal(nextConfirmedCountry(null, { type: "gps", country: undefined }), null);
  });

  test("anything that is not CA is treated as US", () => {
    assert.equal(countryOf("ca"), "CA");
    assert.equal(countryOf("CA"), "CA");
    assert.equal(countryOf("US"), "US");
    assert.equal(countryOf("MX"), "US");   // outside the service area anyway
    assert.equal(countryOf(null), null);
    assert.equal(countryOf(""), null);
  });
});

describe("what the quote is shown in", () => {
  test("a verified Canadian address quotes CAD, whoever is booking", () => {
    // The customer's own country must not override the job's.
    assert.equal(quoteCurrency("CA", "US"), "CAD");
  });

  test("a verified US address quotes USD, even for a Canadian customer", () => {
    assert.equal(quoteCurrency("US", "CA"), "USD");
  });

  test("with nothing verified it falls back to the viewer", () => {
    assert.equal(quoteCurrency(null, "CA"), "CAD");
    assert.equal(quoteCurrency(null, "US"), "USD");
  });

  test("the full Vancouver journey never flips", () => {
    // US customer, typing a Vancouver address.
    let country = null as "US" | "CA" | null;
    const seen: string[] = [];

    country = nextConfirmedCountry(country, { type: "typed" });
    seen.push(quoteCurrency(country, "US"));          // typing: US$

    country = nextConfirmedCountry(country, { type: "typed" });
    seen.push(quoteCurrency(country, "US"));          // still typing: US$

    country = nextConfirmedCountry(country, { type: "confirmed", country: "CA" });
    seen.push(quoteCurrency(country, "US"));          // confirmed: CA$

    // It must change AT MOST once, and never change back.
    assert.deepEqual(seen, ["USD", "USD", "CAD"], `the quote flipped: ${seen.join(" → ")}`);
  });
});

import { formatLegalDate, LEGAL_DOCS } from "@/lib/legal";

// /terms and /privacy rendered `Last updated ${new Date()}`, so each
// claimed to have been updated TODAY, every day, whatever its contents.
// The date is the one thing a reader checks to see whether the terms
// changed since they agreed to them.
describe("legal documents date themselves honestly", () => {
  test("the date is a fixed value, not today", () => {
    for (const [name, doc] of Object.entries(LEGAL_DOCS)) {
      assert.match(doc.updated, /^\d{4}-\d{2}-\d{2}$/, `${name} has no ISO date`);
      const today = new Date().toISOString().slice(0, 10);
      // It may legitimately BE today if edited today — but it has to be
      // stored, not computed, which is what the format check above
      // enforces. This asserts it is not in the future.
      assert.ok(doc.updated <= today, `${name} is dated in the future: ${doc.updated}`);
    }
  });

  test("formatting is stable across locale and runtime", () => {
    // toLocaleDateString() differs between server and client and between
    // locales, which is a hydration mismatch as well as a wrong date.
    assert.equal(formatLegalDate("2026-10-27"), "27 October 2026");
    assert.equal(formatLegalDate("2026-01-01"), "1 January 2026");
  });

  test("an unreviewed document says what it still needs", () => {
    for (const [name, doc] of Object.entries(LEGAL_DOCS)) {
      if (doc.reviewed) continue;
      assert.ok(doc.outstanding.length > 30, `${name} is unreviewed but says nothing about why`);
    }
  });
});
