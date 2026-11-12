import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
/* The register reads the venues table now, so its rules are asserted
   from the reader's source and the suite stays hermetic. */

/*
  COVERAGE & VENUES IS A DESIGN — but the rule underneath it is not.
  lib/venue-gate.ts already blocks a refused venue on both request
  paths, so these guards cover the register that feeds it, and the
  distinctions the brief asks the console to keep straight.
*/

const page = readFileSync("app/(admin)/admin/venues/page.tsx", "utf8");
const panel = readFileSync("components/admin/VenuePanel.tsx", "utf8");
const states = readFileSync("lib/admin-venue-states.ts", "utf8");
const reader = readFileSync("lib/data/admin-venues.ts", "utf8");
const gate = readFileSync("lib/venue-gate.ts", "utf8");

test("a refused venue is actually blocked, on both request paths", () => {
  // The design describes a rule that exists. If this ever stops being
  // true, the page is making a promise the server does not keep.
  assert.match(gate, /export function checkVenue/);
  for (const path of ["app/(app)/new-request/actions.ts", "app/api/v1/requests/route.ts"]) {
    const source = readFileSync(path, "utf8");
    assert.match(source, /checkVenue/, `${path} does not consult the venue gate`);
  }
  assert.match(page, /already happen on the server, for the website and the app alike/);
});

test("unchecked is never labelled verified", () => {
  // permissionOf returns the venue's own answer or "unknown" — it never
  // promotes an absent answer to allowed.
  const fn = reader.slice(reader.indexOf("function permissionOf"), reader.indexOf("AN UNCHECKED VENUE"));
  assert.match(fn, /if \(answer === "refused"\) return "refused"/);
  assert.match(fn, /if \(answer === "allowed"\) return "allowed"/);
  assert.match(fn, /return "unknown"/);
  // No confirmation means no date and no reviewer, rather than a blank
  // that reads like one.
  assert.match(reader, /last_checked: shortDate\(v\.confirmed_at\)/);
  assert.match(reader, /reviewer: v\.confirmed_by \?\? null/);
  assert.match(reader, /if \(!v\.confirmed_at\) return \{ state: "never_checked", next: null \}/);
  assert.match(page, /NEVER A DATE WHERE THERE WAS NO CHECK/);
  assert.match(page, /an\s*\n?\s*unchecked venue is never labelled verified/);
  assert.match(states, /is not "this venue says no"/);
});

test("conditional is not treated as permission the gate cannot enforce", () => {
  // The reader never produces "conditional", because the gate cannot
  // evaluate one — the state exists in the vocabulary with that said
  // plainly, not in the data.
  const fn = reader.slice(reader.indexOf("function permissionOf"), reader.indexOf("AN UNCHECKED VENUE"));
  assert.doesNotMatch(fn, /conditional/);
  assert.match(states, /CONDITIONAL IS IN THIS DESIGN AND NOT YET IN THAT GATE/);
  // The panel says so where the state appears, rather than letting
  // somebody record a condition nothing evaluates.
  assert.match(panel, /The booking gate cannot evaluate this yet/);
  assert.match(panel, /route its requests for review rather\s*\n?\s*than pass them as permission/);
});

test("an overdue check sits beside the decision, not instead of it", () => {
  // Staleness is computed separately from the answer: reviewOf never
  // touches the permission, so an overdue venue keeps its decision.
  const fn = reader.slice(reader.indexOf("function reviewOf"), reader.indexOf("const shortDate"));
  assert.match(fn, /state: days < 0 \? "overdue"/);
  assert.doesNotMatch(fn, /permission/);
  assert.match(reader, /const REVIEW_AFTER_DAYS = 90/);
  assert.match(page, /The last answer still stands/);
  assert.match(panel, /THE STALE CHECK SITS BESIDE THE DECISION/);
});

test("no records, no matches and a failed read are three different answers", () => {
  assert.match(page, /const noRecords = view\.rows\.length === 0 && !filtered && !view\.load_error;/);
  assert.match(page, /const noMatches = view\.rows\.length === 0 && filtered && !view\.load_error;/);
  assert.match(page, /The venue register could not be read/);
  assert.match(page, /This is not an empty register/);
  assert.match(page, /No venue records yet/);
});

test("coverage is not permission", () => {
  // Coverage is built from the service-area boundaries; permission is
  // built from the venues table. Two sources, never one.
  assert.match(reader, /COVERAGE IS NOT PERMISSION/);
  assert.match(reader, /const coverage: CoverageRow\[\] = Array\.from\(munis\.keys\(\)\)/);
  assert.match(reader, /venues_unchecked: inArea\.filter\(\(v\) => v\.permission === "unknown"\)\.length/);
  assert.match(page, /Operating in a city is not permission at a venue/);
  assert.match(page, /TWO TABS, AND THEY ARE NOT THE SAME QUESTION/);
});

test("a changed permission flags work rather than cancelling it", () => {
  assert.match(panel, /Nothing is silently cancelled and no money moves on its own/);
  assert.match(page, /released, and if money was already captured a refund is confirmed separately/);
});

test("the working directory survives the redesign", () => {
  assert.match(page, /\/admin\/venues\/classic/);
  const classic = readFileSync("app/(admin)/admin/venues/classic/page.tsx", "utf8");
  assert.match(classic, /saveVenueAction|VenueForm/);
  assert.match(classic, /read by checkVenue\(\) on every Wait in Line/);
});
