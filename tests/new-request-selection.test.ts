// The matcher-to-view handoff.
//
// The previous version of these tests reproduced the matcher inside the
// test file and asserted on the copy. They passed while the real path did
// the opposite: the page returned null for an unmatched search and the
// view's initialiser replaced it with `services[0]`, so "plumber" still
// preselected Designated Driver. Testing a copy proved only that the copy
// worked.
//
// These import the real module that both the page and the view call.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  matchServiceToQuery, resolveInitialSelection, pickInitialSelected,
} from "../lib/new-request-selection.ts";

// Designated Driver is deliberately first: it is what the old fallback
// selected, so every "nothing selected" case must prove it is NOT chosen.
const SERVICES = [
  { id: "designated-driver", title: "Designated Driver", blurb: "a sober driver for your car" },
  { id: "tech-setup", title: "Tech Setup", blurb: "install and configure devices" },
  { id: "dog-walking", title: "Dog Walking", blurb: "walks and feeding" },
  { id: "house-check-in", title: "House Check-In", blurb: "check on an empty home" },
  { id: "maid-service", title: "Maid Service", blurb: "house cleaning" },
  // Two titles ending in "Service" give a genuinely ambiguous needle.
  { id: "listening-service", title: "Listening Service", blurb: "someone to talk to" },
];

describe("matchServiceToQuery", () => {
  test("exact title, slug and unambiguous partial all resolve", () => {
    assert.equal(matchServiceToQuery(SERVICES, "Tech Setup"), "tech-setup");
    assert.equal(matchServiceToQuery(SERVICES, "tech setup"), "tech-setup");
    assert.equal(matchServiceToQuery(SERVICES, "dog"), "dog-walking");
  });

  test("unmatched, too-short and empty queries resolve to nothing", () => {
    for (const q of ["plumber", "xyz", "", "  ", null, "ab"]) {
      assert.equal(matchServiceToQuery(SERVICES, q), null, `${JSON.stringify(q)} must not match`);
    }
  });

  test("an ambiguous query resolves to nothing", () => {
    // "service" is in both Maid Service and Listening Service.
    assert.equal(matchServiceToQuery(SERVICES, "service"), null);
  });

  test("matching is on titles, so an unambiguous partial still resolves", () => {
    // "house" appears in one TITLE (House Check-In) and in Maid Service's
    // blurb. Blurbs are not matched, so this is unambiguous and resolving
    // it is correct — recorded here because an earlier version of this
    // suite wrongly expected it to be ambiguous.
    assert.equal(matchServiceToQuery(SERVICES, "house"), "house-check-in");
  });
});

describe("resolveInitialSelection", () => {
  test("?service= wins and is never treated as unresolved", () => {
    const r = resolveInitialSelection(SERVICES, "dog-walking", "tech setup");
    assert.deepEqual(r, { serviceId: "dog-walking", unresolvedQuery: false });
  });

  test("an unknown ?service= does not silently select something else", () => {
    const r = resolveInitialSelection(SERVICES, "not-a-service", null);
    assert.equal(r.serviceId, null);
    assert.equal(r.unresolvedQuery, false, "no query was given, so this is a blank arrival");
  });

  test("a resolvable search selects that service", () => {
    assert.deepEqual(
      resolveInitialSelection(SERVICES, null, "Tech Setup"),
      { serviceId: "tech-setup", unresolvedQuery: false },
    );
  });

  test("an unresolved search is flagged, not answered", () => {
    assert.deepEqual(
      resolveInitialSelection(SERVICES, null, "plumber"),
      { serviceId: null, unresolvedQuery: true },
    );
    assert.deepEqual(
      resolveInitialSelection(SERVICES, null, "service"),
      { serviceId: null, unresolvedQuery: true },
    );
  });

  test("a blank arrival is distinct from an unresolved search", () => {
    assert.deepEqual(
      resolveInitialSelection(SERVICES, null, null),
      { serviceId: null, unresolvedQuery: false },
    );
  });
});

// ---------------------------------------------------------------------------
// The handoff itself — the step the old tests skipped.
// ---------------------------------------------------------------------------
describe("pickInitialSelected (what the view actually starts with)", () => {
  function startFor(explicit: string | null, query: string | null) {
    const r = resolveInitialSelection(SERVICES, explicit, query);
    return pickInitialSelected(SERVICES, r.serviceId, r.unresolvedQuery);
  }

  test("an unresolved search starts with NOTHING selected", () => {
    for (const q of ["plumber", "service", "roof repair"]) {
      const start = startFor(null, q);
      assert.equal(start, null, `"${q}" must leave the chooser empty`);
    }
  });

  test("an unresolved search does not fall back to the first catalog row", () => {
    // The precise regression: Designated Driver is services[0].
    const start = startFor(null, "plumber");
    assert.notEqual(
      start?.id, "designated-driver",
      "an unmatched search must never preselect the first service",
    );
  });

  test("a resolvable search starts on the matched service", () => {
    assert.equal(startFor(null, "Tech Setup")?.id, "tech-setup");
  });

  test("?service= starts on that service", () => {
    assert.equal(startFor("dog-walking", null)?.id, "dog-walking");
  });

  test("a blank arrival selects NOTHING", () => {
    // It used to answer with services[0], so every visitor arrived with
    // Designated Driver chosen, a price quoted and the form asking about
    // their car. Someone who wanted a dog walk had to notice they were
    // booking a driver and undo it; anyone who did not notice submitted
    // the wrong service.
    assert.equal(startFor(null, null), null);
  });

  test("an unresolved search also selects nothing", () => {
    assert.equal(pickInitialSelected(SERVICES, null, true), null);
  });

  test("an empty catalog yields null rather than throwing", () => {
    assert.equal(pickInitialSelected([], null, false), null);
    assert.equal(pickInitialSelected([], null, true), null);
  });
});

// ---------------------------------------------------------------------------
// Static: the view must use the shared helper, not reintroduce the fallback.
// ---------------------------------------------------------------------------
describe("the view does not reintroduce the fallback", () => {
  const view = readFileSync(
    new URL("../app/(app)/new-request/view.tsx", import.meta.url), "utf8",
  );

  test("the initialiser calls pickInitialSelected", () => {
    assert.match(view, /pickInitialSelected\(services, initialServiceId, queryUnresolved\)/);
  });

  test("the unconditional services[0] fallback is gone", () => {
    assert.doesNotMatch(
      view, /services\.find\(\(s\) => s\.id === initialServiceId\)\s*\?\?\s*services\[0\]/,
      "this is the expression that overrode an unmatched search",
    );
  });

  test("submission is blocked while nothing is selected", () => {
    assert.match(view, /submitBlockedReason/);
    assert.match(view, /!selected\s*\n?\s*\?\s*["']Choose a service/);
  });
});
