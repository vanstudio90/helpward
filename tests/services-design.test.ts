import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
/* The reader talks to the catalogue now, so its rules are asserted from
   its source — the suite stays runnable without a database. */

/*
  SERVICES & PRICING IS A DESIGN FOR NOW.

  The brief for it ends with an instruction worth a test of its own:
  the green publication ticks in the mockup must not appear until a
  real check passes. Everything else here guards the distinctions that
  make a catalogue editor safe to use on a live marketplace.
*/

const page = readFileSync("app/(admin)/admin/services/page.tsx", "utf8");
const panel = readFileSync("components/admin/ServiceEditorPanel.tsx", "utf8");
const reader = readFileSync("lib/data/admin-services.ts", "utf8");

test("the publication checks are not green until something checks", () => {
  // All three are hardcoded not_checked, because comparing this
  // catalogue against the shipped app and the website is work nothing
  // here does.
  const checks = reader.slice(reader.indexOf("checks: ["), reader.indexOf("selected,"));
  assert.equal((checks.match(/state: "not_checked"/g) ?? []).length, 3);
  assert.doesNotMatch(checks, /state: "passed"/);
  assert.match(page, /nothing has inspected anything yet/);
  // And "validation issues" is a real count of services missing a
  // market price — not a reassuring zero, and not invented.
  assert.match(reader, /A REAL VALIDATION, not a reassuring zero/);
  assert.match(reader, /validation_issues: validationIssues/);
  assert.match(page, /Not validated yet/);
});

test("inherited, overridden and zero stay three different things", () => {
  // priceField keeps the override and the inherited value apart, and
  // coalesces only for the effective figure — so an override of zero
  // survives as zero rather than collapsing into "inherited".
  assert.match(reader, /const overrideCents = override \?\? null;/);
  assert.match(reader, /override_cents: overrideCents,/);
  assert.match(reader, /effective_cents: overrideCents \?\? inherited \?\? 0,/);
  // The editor renders all three states distinctly.
  assert.match(panel, /Inherited.*Set to zero.*Overridden/s);
  assert.match(reader, /INHERITED IS NOT ZERO/);
});

test("the arrival estimate is copy, never a pricing input", () => {
  // It comes from the catalogue's eta_label — a content column — and
  // nothing in the pricing path reads it.
  assert.match(reader, /arrival_estimate: s\.eta_label/);
  const pricing = reader.slice(reader.indexOf("const priceFields"), reader.indexOf("const intake"));
  assert.doesNotMatch(pricing, /eta_label/);
  // It lives in Content; the billable figure lives in Pricing.
  assert.match(panel, /Copy only\. This is what a customer reads about waiting/);
  assert.match(panel, /Billable time lives in Pricing/);
  assert.match(reader, /key: "included_minutes"[\s\S]{0,200}BILLABLE/);
});

test("the quote preview is the real engine, not a copy of it", () => {
  /*
    priceService() is the same function that quotes a customer, so a
    number wrong here is wrong at booking too — which is the point of
    previewing before publishing.
  */
  assert.match(reader, /import \{ ruleFromRow, priceService \} from "@\/lib\/service-pricing"/);
  assert.match(reader, /const priced = priceService\(baseCents, localRule, previewValues\)/);
  assert.match(reader, /const withFee = priceTask\(priced\.subtotalCents\)/);
  // The lines shown are the engine's own, plus the fee it adds.
  assert.match(reader, /\.\.\.priced\.lines\.map/);
  assert.match(reader, /label: "Service fee", amount_cents: SERVICE_FEE_CENTS/);
  assert.match(reader, /total_cents: withFee\.totalCents/);
});

test("the whole rule is localised, not just the base price", () => {
  /*
    THE BUG THIS CATCHES. The preview took Canada's base price and
    then charged the extra time from the shared rule, so Errand Runner
    previewed at CA$40.00 + 2 x CA$8.75 while Canada charges CA$10.00
    a block. The customer-facing quote was right — new-request/view
    goes through localizeRule — so only this screen lied, which is the
    screen somebody prices a service from.
  */
  assert.match(reader, /localizeRule/);
  assert.match(reader, /THE WHOLE RULE IS LOCALISED, NOT JUST THE BASE/);
  assert.match(reader, /const localRule = localizeRule\(/);
  // The block price shown beside the quote is the localised one too.
  assert.match(reader, /extra_block_cents: localRule\?\.extraBlockCents/);
  assert.match(reader, /per_extra_unit_cents: localRule\?\.perExtraUnitCents/);
});

test("the rule is printed beside the quote, so the figure can be checked", () => {
  /*
    120 included minutes and 30-minute blocks are the real cleaning
    rule; the design was drawn with a different example. Without the
    rule beside it, a 90-minute preview reading as the base alone
    looks like a missing line rather than included time.
  */
  assert.match(panel, /THE RULE, BESIDE THE FIGURE/);
  assert.match(panel, /the first \$\{draft\.quote\.rule\.included_minutes\} minutes are included in the base/);
  assert.match(panel, /for each further \$\{draft\.quote\.rule\.extra_block_minutes\} minutes/);
  assert.match(panel, /Blocks are started, not prorated/);
});

test("a market is a separate price, not a conversion", () => {
  assert.match(panel, /Switching does not convert anything/);
  assert.match(page, /separate prices, not a conversion/);
});

test("published prices never touch a quote that already exists", () => {
  assert.match(panel, /existing requests and bookings keep the quote they\s*\n?\s*were given/);
  assert.match(page, /A price change never touches a quote that already exists/);
  assert.match(reader, /SAVED QUOTES ARE NOT RECALCULATED/);
});

test("only the models the engine supports are offered", () => {
  // modelOf can return exactly three values, and they are derived from
  // the saved rule rather than from anything editable as copy.
  const fn = reader.slice(reader.indexOf("function modelOf"), reader.indexOf("A MARKET PRICE IS AN OVERRIDE"));
  assert.match(fn, /return "base_plus_units"/);
  assert.match(fn, /return "time_based"/);
  assert.match(fn, /return "flat"/);
  assert.doesNotMatch(fn, /title|blurb|tagline/);
  assert.match(panel, /Editing the name or the description cannot change that/);
});

test("the working editor is still reachable", () => {
  // Replacing a tool that writes to the catalogue with a drawing would
  // be a worse outcome than an unfinished redesign.
  assert.match(page, /\/admin\/services\/classic/);
  const classic = readFileSync("app/(admin)/admin/services/classic/page.tsx", "utf8");
  assert.match(classic, /toggleServiceActiveAction/);
  assert.match(classic, /This page writes to the live\s*\n?\s*catalogue/);
});

test("the global fee says how far a change reaches", () => {
  // The scope is counted from the live catalogue, not asserted.
  assert.match(reader, /service_fee_cents: SERVICE_FEE_CENTS/);
  assert.match(reader, /services: all\.filter\(\(x\) => x\.active\)\.length/);
  assert.match(panel, /affects \{draft\.service_fee_scope\.services\} services/);
});

/* ------------------------------------------------------------------ */
/* WRITING: DRAFTS AND PUBLICATION                                     */
/* ------------------------------------------------------------------ */

const draftsSql = readFileSync("supabase/migrations/0113_service_drafts.sql", "utf8");
const actions = readFileSync("app/(admin)/admin/services/actions.ts", "utf8");

test("a change is drafted, not written straight through", () => {
  assert.match(draftsSql, /create table if not exists public\.service_drafts/);
  // One open draft per service and market, or one of them is lost.
  assert.match(draftsSql, /create unique index if not exists service_drafts_one_open_idx[\s\S]{0,120}where status = 'open'/);
  // Drafts never quote a customer.
  assert.match(draftsSql, /Never read when quoting a customer/);
  // Publishing publishes a draft id, not "whatever is open".
  assert.match(panel, /publishServiceDraftAction\(draft\.draft_id!\)/);
  assert.match(panel, /Save a draft first — publishing publishes a draft, not the form/);
});

test("a stale draft is refused, and the refusal names the field", () => {
  /*
    Last-write-wins silently discards a colleague's work; a timestamp
    check only says "something changed". This says which field moved,
    and only for fields the draft is about to overwrite.
  */
  assert.match(draftsSql, /RULE 1\. Only the fields this draft TOUCHES are checked for staleness/);
  assert.match(draftsSql, /is now %s, not %s as when this draft was started/);
  assert.match(draftsSql, /errcode = 'HW094'/);
  // The self-test proves both halves: the clash, and the non-clash.
  assert.match(draftsSql, /a stale draft was published/);
  assert.match(draftsSql, /A field the draft does NOT touch moving is not a conflict/);
  // And the screen tells the operator to reload rather than retype.
  assert.match(actions, /conflict: true/);
  assert.match(panel, /Reload this service and start from what is live now/);
});

test("the database validates, not the form", () => {
  assert.match(draftsSql, /create or replace function public\.service_draft_problems/);
  assert.match(draftsSql, /has no base price of its own, so bookings would fall back to the shared price/);
  assert.match(draftsSql, /Included time is set but the block size is not/);
  assert.match(draftsSql, /cannot be negative/);
  assert.match(draftsSql, /errcode = 'HW095'/);
  // Proven, not asserted.
  assert.match(draftsSql, /a market with no base price was published/);
});

test("publishing is one transaction and one story in the log", () => {
  assert.match(draftsSql, /RULE 4\. Everything moves together, inside this one transaction/);
  assert.match(draftsSql, /'service\.published'/);
  assert.match(draftsSql, /v_corr := 'draft:' \|\| v_draft\.id::text/);
  // Every moved field is recorded, with the value it moved from.
  assert.match(draftsSql, /'before', v_draft\.based_on ->> k/);
  assert.match(draftsSql, /the publication event recorded % fields/);
});

test("discarding keeps the record and needs a reason", () => {
  assert.match(draftsSql, /Discarding keeps the row/);
  assert.match(draftsSql, /A reason is required to discard a draft/);
  assert.match(draftsSql, /a draft was discarded without a reason/);
  assert.match(actions, /The reason is kept with the draft/);
});

test("the self-test leaves nothing behind, and deletes nothing", () => {
  /*
    An earlier self-test in this project borrowed a real customer's id
    and left three audit events naming somebody who did nothing. This
    one runs inside a subtransaction that is always rolled back, and
    signs its work as nobody.
  */
  assert.match(draftsSql, /THE TEST LEAVES NOTHING BEHIND, AND NOT BY DELETING ANYTHING/);
  assert.match(draftsSql, /errcode = 'HW999'/);
  assert.match(draftsSql, /'\{"app_metadata":\{"role":"admin"\}\}'/);
  // No subject in the claim, so nothing is attributed to a person.
  assert.doesNotMatch(draftsSql, /"sub":/);
  // And it never deletes from the append-only table.
  assert.doesNotMatch(draftsSql, /delete from public\.audit_log/);
});

test("each control is enabled on its own, not on one writable flag", () => {
  assert.match(reader, /WRITING IS ENABLED ONE CONTROL AT A TIME/);
  assert.match(reader, /can: \{ save_draft: true, publish: true, discard: true \}/);
  // Everything else on this screen is still off.
  assert.match(reader, /writable: false/);
  // And a control with nothing behind it says why it is off.
  assert.match(panel, /A customer preview of an unpublished draft has not been built/);
});

test("an emptied price box means inherit, not free", () => {
  assert.match(panel, /an emptied box means "inherit the\s*\n?\s*shared value", which is null and not zero/);
  assert.match(panel, /text === "" \? null : Math\.round\(Number\(text\) \* 100\)/);
});
