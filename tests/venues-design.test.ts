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

/* ------------------------------------------------------------------ */
/* WRITING: CREATING A VENUE, AND RECORDING WHAT IT SAID               */
/* ------------------------------------------------------------------ */

const writesSql = readFileSync("supabase/migrations/0115_venue_writes.sql", "utf8");
const venueActions = readFileSync("app/(admin)/admin/venues/actions.ts", "utf8");
const addDialog = readFileSync("components/admin/AddVenueDialog.tsx", "utf8");

test("a new venue knows nothing", () => {
  /*
    checkVenue() lets a booking through on "allowed" and tells the
    customer the venue is fine. A creation form that can set that is
    the one thing this register exists to prevent.
  */
  assert.match(writesSql, /A NEW VENUE KNOWS NOTHING/);
  assert.match(writesSql, /'unknown', 'unknown', 'unknown', 'unknown'/);
  assert.match(writesSql, /a new venue was created with an answer nobody gave/);
  // The form says so before the button is pressed.
  assert.match(addDialog, /It is recorded with every answer unknown/);
});

test("a duplicate is refused, and names the row that already exists", () => {
  /*
    lookup_venue() matches the normalised name and takes the most
    recently confirmed row, so a second one silently shadows the first.
  */
  assert.match(writesSql, /A DUPLICATE IS WORSE THAN A MISSING ROW/);
  assert.match(writesSql, /normalize_municipality\(p_name\)/);
  assert.match(writesSql, /errcode = 'HW102'/);
  assert.match(writesSql, /the duplicate refusal did not name the existing venue/);
});

test("an answer needs a source and a person", () => {
  assert.match(writesSql, /An answer with no evidence is somebody''s memory of a phone call/);
  assert.match(writesSql, /errcode = 'HW105'/);
  // And the missing source is reported before the session problem,
  // because the operator can fix the first.
  assert.match(writesSql, /checked first because it is the\s*\n\s*operator's own omission/);
  assert.match(writesSql, /errcode = 'HW107'/);
  assert.match(writesSql, /an answer was recorded with no source|an unattributable answer was recorded/);
  // The form will not submit without one either.
  assert.match(panel, /recordsAnAnswer && source\.trim\(\) === ""/);
});

test("recording a refusal does not cancel anybody's booking", () => {
  assert.match(writesSql, /REFUSING A VENUE DOES NOT CANCEL ANYBODY'S BOOKING/);
  assert.match(writesSql, /open_requests_at_venue/);
  assert.match(writesSql, /Nothing has been cancelled and no money has moved/);
  // The operator is warned before they press it, not after.
  assert.match(panel, /It does not cancel any\s*\n\s*booking that already exists/);
});

test("two people editing one venue is a conflict, not a race", () => {
  assert.match(writesSql, /date_trunc\('milliseconds', v_v\.updated_at\)/);
  assert.match(writesSql, /errcode = 'HW080'/);
  assert.match(writesSql, /a stale write was applied/);
  assert.match(venueActions, /conflict: true/);
  assert.match(panel, /Reload this venue and start from what is recorded now/);
});

test("the four questions stay four questions", () => {
  // The form's keys are the database's own.
  assert.match(panel, /FOUR QUESTIONS, ASKED SEPARATELY/);
  assert.match(panel, /key: "substitutes_allowed"/);
  assert.match(panel, /key: "customer_may_replace"/);
  assert.match(panel, /key: "full_party_required"/);
  assert.match(panel, /key: "numbers_transferable"/);
  // Only the ones that moved are recorded, with what they moved from.
  assert.match(writesSql, /'before', v_v\.substitutes_allowed::text/);
});

test("the self-test borrows nobody and leaves nothing", () => {
  assert.match(writesSql, /THE SUCCESSFUL WRITE, WITHOUT BORROWING A PERSON/);
  assert.match(writesSql, /errcode = 'HW999'/);
  assert.doesNotMatch(writesSql, /"sub":/);
  assert.doesNotMatch(writesSql, /delete from public\.audit_log/);
});

test("each venue control is enabled on its own", () => {
  assert.match(reader, /can: \{ create_venue: true, record_answers: true \}/);
  assert.match(reader, /writable: false/);
});
