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
const approval = readFileSync("lib/refund-approval.ts", "utf8");
const execution = readFileSync("tests/refund-execution.test.ts", "utf8");

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

test("the outcomes are handled where they can be run", () => {
  /*
    THE ASSERTIONS THAT GAVE FALSE COMFORT WERE HERE.

    This suite used to check that the action's source CONTAINED the
    right phrases. It did, and the code underneath still sent the whole
    service charge for an approved CA$5 tip refund, ignored a failed
    settlement write, and called an unknown outcome "no money has
    moved". Source text cannot catch arithmetic.

    The behaviour now lives in lib/refund-approval.ts and lib/payments.ts
    behind injectable ports, and tests/refund-execution.test.ts runs it.
    What is left here is the structural claim: the action does not
    carry that logic inline any more.
  */
  assert.match(actions, /recordRefundOutcome\(/);
  assert.match(actions, /refundCharge\(/);
  // Checked on the code, not the comment that names the old call.
  assert.doesNotMatch(actions.replace(/\/\*[\s\S]*?\*\//g, ""), /refundBooking\(/);
  // Every settlement response is read, not fired and forgotten.
  assert.match(approval, /if \(settled\.error\)/);
  assert.match(approval, /Do not send it again/);
  // And an unknown outcome never claims nothing happened.
  assert.match(approval, /NOT known whether this refund was taken/);
  assert.doesNotMatch(approval, /no money has moved/);
});

test("succeeded does not mean the customer has the money", () => {
  assert.match(states, /Stripe accepted it\. The customer's bank may take days to show it\./);
  assert.match(page, /has shown it yet/);
});

test("the two outcomes are tracked apart", () => {
  /*
    The money going back and the helper's transfer being adjusted are
    separate operations at Stripe, and either can fail on its own.
    The arithmetic is checked by running it, in
    tests/refund-effects.test.ts — a source assertion is what let the
    tip reversal use the service ratio for a release.
  */
  assert.match(data, /A refund has TWO outcomes and either can fail on its own/);
  assert.match(data, /key: "helper_transfer"/);
  assert.match(data, /THE TWO CHARGES SPLIT DIFFERENTLY/);
  assert.ok(readFileSync("tests/refund-effects.test.ts", "utf8").includes("refundEffects("),
    "the arithmetic must be exercised, not described");
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
  // The executor takes ONE leg and cannot be asked for both.
  assert.match(actions, /leg: decision\.leg === "tip" \? "tip" : "service"/);
  assert.match(actions, /amountCents: decision\.amount_cents/);
  assert.doesNotMatch(actions.replace(/\/\*[\s\S]*?\*\//g, ""), /includeTip/);
  // Proven by running it, in tests/refund-execution.test.ts.
  assert.match(execution, /a partial tip refund touches the tip, for exactly the approved amount/);
});

test("sending is off until the end-to-end run has been done", () => {
  /*
    The decision workflow is correct and recorded; the journey against
    Stripe test mode — partial tips, a pending outcome, an interrupted
    response, two approvals at once — has not been run. Approving
    records the decision and deliberately does not send.
  */
  assert.match(approval, /SENDING IS OFF UNTIL THE JOURNEY HAS BEEN RUN/);
  assert.match(approval, /HELPWARD_REFUND_SEND === "on"/);
  assert.match(actions, /refundSendingEnabled\(\)/);
  assert.match(actions, /Approved — and NOT sent\./);
  // The guard sits before the executor, not after it.
  assert.ok(actions.indexOf("refundSendingEnabled()") < actions.indexOf("refundCharge({"),
    "the send switch must be checked before anything reaches the processor");
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

/* ------------------------------------------------------------------ */
/* EVENTS FROM THE PROCESSOR                                            */
/* ------------------------------------------------------------------ */

const webhook = readFileSync("app/api/webhooks/stripe/route.ts", "utf8");
const ingest = readFileSync("supabase/migrations/0120_refund_event_ingest.sql", "utf8");
const reconcile = readFileSync("scripts/reconcile-refunds.mjs", "utf8");

test("a partial refund is never written down as a full one", () => {
  /*
    `charge.refunded` fires for a partial refund as readily as a full
    one. The handler set payment_status = 'refunded' unconditionally,
    so CA$5.00 back on a CA$224.50 charge marked the booking refunded
    — and could overwrite the correct partial_refund 0119 had written.
  */
  assert.doesNotMatch(webhook, /update\(\{ payment_status: "refunded" \}\)/);
  assert.match(webhook, /A CHARGE EVENT CARRIES EVERY REFUND ON THAT CHARGE/);
  assert.match(ingest, /THE BOOKING IS NEVER DECIDED BY ONE EVENT/);
  // Both charges decide it, from the ledger.
  assert.match(ingest, /v_captured := coalesce\(v_b\.total_cents, 0\) \+ coalesce\(v_b\.tip_cents, 0\)/);
  assert.match(ingest, /and status = 'succeeded'/);
  // Proven in the migration, including the reversal when one later fails.
  assert.match(ingest, /CA\$5\.00 of CA\$234\.50 was recorded as/);
  assert.match(ingest, /a reversed failure left the booking fully refunded/);
});

test("a pending refund has somewhere to finish", () => {
  assert.match(webhook, /case "refund\.updated":/);
  assert.match(webhook, /case "refund\.failed":/);
  assert.match(webhook, /THE LIFECYCLE THAT WAS MISSING ENTIRELY/);
  // And it finds the request it belongs to rather than inserting a stranger.
  assert.match(ingest, /the operation id we put in the refund's metadata/);
  assert.match(ingest, /the event did not find its request by operation id/);
  assert.match(ingest, /the flag was not cleared once the refund was identified/);
});

test("reconciliation advances what it already knows", () => {
  /*
    It skipped every id it had seen — which is exactly the id of the
    pending row waiting to be advanced.
  */
  assert.match(reconcile, /KNOWING THE ID IS NOT THE SAME AS BEING UP TO DATE/);
  assert.doesNotMatch(reconcile, /if \(known\.has\(r\.id\)\) continue;/);
  assert.match(reconcile, /ingest_refund_event/);
  // And it no longer decides a booking from one charge or from unsettled rows.
  assert.match(reconcile, /recompute_booking_payment_status/);
  assert.doesNotMatch(reconcile, /refundedHere >= booking\.total_cents/);
});

test("a failed write is not acknowledged", () => {
  assert.match(webhook, /THE EVENT IS RECORDED BEFORE IT IS ACTED ON/);
  assert.match(webhook, /A FAILURE IS NOT AN ACKNOWLEDGEMENT/);
  assert.match(webhook, /status: 500/);
  assert.doesNotMatch(webhook, /warning: "handler_error_logged"/);
  // Retry is safe because the event is keyed by Stripe's own id.
  assert.match(webhook, /onConflict: "id"/);
  assert.match(ingest, /create table if not exists public\.stripe_webhook_events/);
  assert.match(ingest, /processed_at is null for anything that failed/);
});

test("the panel says what the switch does", () => {
  const p = readFileSync("components/admin/RefundReviewPanel.tsx", "utf8");
  assert.match(p, /can\.send \? "Approve and send" : "Approve \(will not send\)"/);
  assert.match(p, /THE COPY FOLLOWS THE SWITCH/);
  assert.match(p, /Sending is switched off\./);
  // An approved-but-unsent row can be sent deliberately, not by flag alone.
  assert.match(p, /sendApprovedRefundAction/);
  assert.match(ingest, /admin_refund_ready_to_send/);
  assert.match(ingest, /Sending it again would refund the money twice/);
});

test("the concurrency script says what it actually does", () => {
  const c = readFileSync("scripts/verify-refund-concurrency.mjs", "utf8");
  // It claimed everything was rolled back; the fixture is committed.
  assert.doesNotMatch(c, /Everything is rolled back/);
  assert.match(c, /WHAT IT ACTUALLY WRITES/);
  assert.match(c, /REHEARSAL ONLY, AND IT REFUSES ANYTHING ELSE/);
  // And it does not try to delete from the append-only log.
  assert.doesNotMatch(c, /delete from audit_log/);
});
