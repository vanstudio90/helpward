import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/*
  REFUNDS IS THE SCREEN WHERE BEING WRONG COSTS THE MOST: every mistake
  here is either money that went back twice or a customer told
  something untrue about their own money. These guard the distinctions
  the workflow is built on — source assertions, because the reader
  needs a database and a test that needs a service key is one that gets
  skipped in CI and then quietly rots.
*/

const page = readFileSync("app/(admin)/admin/refunds/page.tsx", "utf8");
const panel = readFileSync("components/admin/RefundReviewPanel.tsx", "utf8");
const data = readFileSync("lib/data/admin-refunds.ts", "utf8");
const states = readFileSync("lib/admin-refund-states.ts", "utf8");
const sql = readFileSync("supabase/migrations/0118_refund_decisions.sql", "utf8");
const actions = readFileSync("app/(admin)/admin/refunds/actions.ts", "utf8");

test("the reason decides who carries the refund, not whoever clicks", () => {
  /*
    refundBooking() reverses the helper's transfer by default. That is
    right when the work was not delivered and wrong when the work was
    done and this is goodwill — taking it out of the helper's balance
    makes them pay for our apology.
  */
  assert.match(sql, /THE REASON DECIDES WHO PAYS/);
  assert.match(sql, /create or replace function public\.refund_absorbs_helper_share/);
  assert.match(sql, /when 'goodwill'            then true/);
  assert.match(sql, /when 'no_show'             then false/);
  // An unmapped reason raises rather than falling through to a default.
  assert.match(sql, /else null/);
  assert.match(sql, /errcode = 'HW137'/);
  assert.match(sql, /an unmapped reason was given a settlement rule by default/);
  // And the reasons are the ones the screen actually offers.
  for (const r of ["service_issue", "no_show", "duplicate_charge", "overcharge",
    "cancelled_late", "goodwill", "chargeback_pre_empt"]) {
    assert.match(states, new RegExp(`value: "${r}"`));
    assert.match(sql, new RegExp(`when '${r}'`));
  }
});

test("asking is not sending", () => {
  // A row that only exists once the money is gone cannot be declined.
  assert.match(sql, /ASKING IS NOT SENDING/);
  assert.match(sql, /'awaiting_review'/);
  // The log says "submitted", not "succeeded", for a request AND an approval.
  assert.match(sql, /asking for a refund was recorded as if it had succeeded/);
  assert.match(sql, /approval was recorded as if the money had moved/);
  // Approval marks the row processing first, so a second cannot double-send.
  assert.match(sql, /then 'processing' else 'cancelled'/);
  assert.match(sql, /an approved refund was approved a second time/);
  assert.match(actions, /THE ONLY PLACE MONEY ACTUALLY MOVES/);
});

test("a refund that failed is never shown as sent", () => {
  assert.match(actions, /the refund was NOT sent/);
  assert.match(actions, /p_succeeded: false/);
  assert.match(actions, /The approval is not\s*\n\s*silently undone/);
  assert.match(panel, /so a refund that failed is never shown as sent/);
  // A failure must carry what the processor said.
  assert.match(sql, /a refund failed with no reason recorded/);
});

test("succeeded does not mean the customer has the money", () => {
  assert.match(states, /Stripe accepted it\. The customer's bank may take days to show it\./);
  assert.match(page, /has shown it yet/);
});

test("the two outcomes are tracked apart", () => {
  /*
    The money going back and the helper's transfer being adjusted are
    separate operations at Stripe, and either can fail on its own.
  */
  assert.match(data, /A refund has TWO outcomes and either can fail on its own/);
  assert.match(data, /key: "helper_transfer"/);
  // Unknown is null and is never drawn as zero — except where zero is
  // the decided answer.
  assert.match(data, /amount_cents: absorb \? 0 : share/);
  assert.match(data, /the amount cannot be worked out here/);
  // Stripe performs the reversal; this figure says it is not the authority.
  assert.match(data, /Stripe performs the reversal and its figure is the authority/);
});

test("available to refund subtracts what is already in flight", () => {
  /*
    Leaving in-flight requests out of that sum is how two people each
    approve half and the second one fails at the processor.
  */
  assert.match(sql, /YOU CANNOT REFUND MORE THAN IS THERE/);
  assert.match(sql, /'succeeded', 'processing', 'awaiting_review'/);
  assert.match(sql, /a request in flight was not counted against what is left/);
  assert.match(sql, /errcode = 'HW134'/);
  assert.match(data, /processing_cents: processing/);
  assert.match(data, /available_cents: Math\.max\(0, captured - refunded - processing\)/);
});

test("a tip is a different charge and says so", () => {
  // Its own intent and its own remaining balance. A request for more
  // than the service charge holds is not quietly taken from the tip.
  assert.match(sql, /A TIP IS A DIFFERENT CHARGE/);
  assert.match(sql, /refunds_leg_check check \(leg in \('service', 'tip'\)\)/);
  assert.match(sql, /case when p_leg = 'tip' then coalesce\(b\.tip_cents, 0\) else b\.total_cents end/);
  assert.match(actions, /includeTip: decision\.leg === "tip"/);
});

test("a failed synchronisation is never drawn as zero refunds", () => {
  assert.match(page, /\{view\.sync_error \?/);
  assert.match(page, /Refund records could not be synchronised/);
  assert.match(page, /not because they are zero/);
  assert.match(data, /NEVER rendered as zero/);
});

test("the empty state only appears when the list is genuinely empty", () => {
  assert.match(page, /const empty = view\.rows\.length === 0 && !view\.sync_error;/);
  assert.match(page, /No refunds to show/);
  assert.match(page, /Clear filters/);
  assert.match(page, /View payments/);
});

test("releasing a hold is not a refund, and a refund starts from a payment", () => {
  assert.match(page, /Releasing an uncaptured hold is not a refund/);
  // "Start refund" goes to the captured payments rather than opening a
  // blank form that could be pointed at a hold.
  assert.match(page, /\/admin\/payments\?tab=captured/);
});

test("retrying is guarded and outside refunds are expected", () => {
  assert.match(page, /check whether the first attempt went through/i);
  assert.match(page, /appear after a\s*\n?\s*synchronisation/);
  assert.match(page, /via Stripe/);
});
