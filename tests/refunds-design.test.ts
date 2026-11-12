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
  assert.match(actions, /ONE SENDING ROUTINE, used by approval and by Send now/);
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
  assert.match(actions, /leg: ready\.leg === "tip" \? "tip" : "service"/);
  assert.match(actions, /amountCents: ready\.amount_cents/);
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

/* ------------------------------------------------------------------ */
/* EVENTS OUT OF ORDER, AND EVENTS ABOUT SOMEBODY ELSE                 */
/* ------------------------------------------------------------------ */

const identity = readFileSync("supabase/migrations/0121_refund_event_identity.sql", "utf8");

test("an older event cannot undo a finished one", () => {
  /*
    pending → succeeded left a booking partial_refund. Delivering the
    OLDER pending snapshot afterwards — which Stripe does, because
    delivery is at-least-once and unordered — set the refund back to
    processing and the booking back to captured.
  */
  assert.match(identity, /AN OLDER EVENT UNDID A FINISHED ONE/);
  assert.match(identity, /p_event_at < v_r\.last_event_at/);
  assert.match(identity, /'stale_event'/);
  // A non-final status cannot unwind a final one even without clocks.
  assert.match(identity, /A NON-FINAL STATUS NEVER OVERWRITES A FINAL ONE/);
  assert.match(identity, /'would_regress_final_state'/);
  // Proven both ways in the migration.
  assert.match(identity, /a stale event unwound a completed refund/);
  assert.match(identity, /pending overwrote a final state without a timestamp to stop it/);
  // And the handler supplies what ordering needs.
  assert.match(webhook, /p_event_id: event\.id/);
  assert.match(webhook, /p_event_at: new Date\(event\.created \* 1000\)/);
});

test("the same delivery twice writes nothing at all", () => {
  assert.match(identity, /'already_applied'/);
  assert.match(identity, /a repeat delivery appended another audit event/);
  // The handler short-circuits a delivery it has already finished.
  assert.match(webhook, /A DELIVERY WE HAVE ALREADY FINISHED IS NOT DONE AGAIN/);
  assert.match(webhook, /already_processed/);
});

test("an operation id has to agree with itself", () => {
  /*
    An event for booking A, service leg, CA$1.00 carrying booking B's
    tip-refund operation id marked B's CA$5.00 request succeeded,
    cleared its reconciliation flag, and recomputed A.
  */
  assert.match(identity, /AN IDENTITY CLAIM MUST AGREE WITH ITSELF/);
  assert.match(identity, /v_candidate\.booking_id = p_booking\s*\n\s*and v_candidate\.leg = p_leg\s*\n\s*and v_candidate\.amount_cents = p_amount_cents/);
  assert.match(identity, /'quarantined'/);
  assert.match(identity, /a mismatched operation id was accepted/);
  assert.match(identity, /a mismatched event cleared somebody else''s reconciliation flag/);
  // Amount-only matching is gone, not merely discouraged.
  assert.match(identity, /MATCHING BY AMOUNT ALONE IS GONE/);
  assert.doesNotMatch(identity, /and status = 'processing'\s*\n\s*order by updated_at desc limit 1/);
});

test("requires_action is a state, not an error", () => {
  assert.match(identity, /'requires_action'/);
  assert.match(identity, /requires_action was not held open as processing/);
  // The settlement vocabulary agrees with ingestion's.
  assert.match(identity, /p_status not in \('succeeded', 'pending', 'requires_action', 'failed', 'canceled', 'unknown'\)/);
});

test("sending enforces the same block approval does", () => {
  assert.match(identity, /THE BOOKING-WIDE BLOCK, the same one approval enforces/);
  assert.match(identity, /a send was allowed while another refund on the booking was uncertain/);
  // It locks the booking first, in the same order as approval.
  assert.match(identity, /the same order as approval, so two\s*\n\s*sends cannot deadlock/);
  // And it re-checks the balance, not just the flags.
  assert.match(identity, /less than when this was approved/);
});

test("a fast webhook agrees with settlement instead of failing it", () => {
  /*
    The webhook often arrives first. Settlement demanded `processing`
    and refused, so the action told the operator the refund was sent
    but not recorded — alarming, wrong, and an invitation to go
    looking for a problem that does not exist.
  */
  assert.match(identity, /A FAST WEBHOOK MADE THE SENDER REPORT A FAILURE/);
  assert.match(identity, /'already_recorded', true/);
  assert.match(identity, /settlement after a matching webhook reported a failure instead of agreeing/);
  // A contradiction is still refused rather than smoothed over.
  assert.match(identity, /a contradictory settlement was accepted/);
  assert.match(identity, /has to be looked at rather than overwritten/);
});

test("every webhook write is checked, not only the refund ones", () => {
  /*
    payment_intent.succeeded ignored its error and the event was still
    marked processed, so a database outage during a capture
    confirmation lost it silently.
  */
  assert.match(webhook, /EVERY WRITE IS CHECKED, not only the refund ones/);
  /*
    Scoped to the switch itself. The catch block's own logging write is
    deliberately unchecked — it runs because something already failed,
    and failing to record why must not replace the original error.
  */
  const body = webhook.slice(
    webhook.indexOf("switch (event.type)"),
    webhook.indexOf("} catch (err)"),
  );
  const unchecked: string[] = [];
  for (let i = body.indexOf("await admin"); i !== -1; i = body.indexOf("await admin", i + 1)) {
    /* The result is destructured BEFORE the call and thrown on after
       it, so both sides of the statement have to be looked at. */
    const before = body.slice(Math.max(0, i - 120), i);
    /* Generous, because a dispute insert's object literal is long. */
    const after = body.slice(i, i + 1400);
    const captured = /\berror\b/.test(before);
    const thrown = /if \(\w*[Ee]rror\) throw/.test(after);
    if (!captured || !thrown) unchecked.push(body.slice(i, i + 120));
  }
  assert.equal(unchecked.length, 0,
    `a write in the switch ignores its error: ${unchecked[0]}`);
});

test("the events the handler implements are the events it asks for", () => {
  // Code that handles an event it is never sent is not handling it.
  const check = readFileSync("scripts/check-stripe-webhooks.mjs", "utf8");
  for (const ev of ["refund.created", "refund.updated", "refund.failed"]) {
    assert.ok(webhook.includes(`case "${ev}"`), `${ev} must be handled`);
    assert.ok(check.includes(`"${ev}"`), `${ev} must be required`);
  }
  assert.match(webhook, /THE REFUND EVENTS ARE NOT OPTIONAL/);
  // Each endpoint is judged against its own handler.
  assert.match(check, /WHAT EACH HANDLER ACTUALLY IMPLEMENTS, by the route it lives at/);
});

/* ------------------------------------------------------------------ */
/* A QUARANTINE THAT STAYS, AND A CLAIM THAT CLAIMS                    */
/* ------------------------------------------------------------------ */

const sticky = readFileSync("supabase/migrations/0122_quarantine_and_claims.sql", "utf8");

test("a quarantine is not cleared by the next event", () => {
  /*
    The first mismatched event quarantined the row; the very next
    event matched by processor id and cleared needs_reconciliation,
    quarantine_note still sitting there unread — and the booking-wide
    block, which only looked at that flag, let another refund through.
  */
  assert.match(sticky, /THE QUARANTINE CLEARED ITSELF/);
  assert.match(sticky, /A QUARANTINE IS NOT CLEARED BY THE NEXT EVENT/);
  assert.match(sticky, /when quarantine_note is not null and quarantine_cleared_at is null then true/);
  assert.match(sticky, /the next event cleared a quarantine nobody resolved/);
  // Only a person clears it, and only with a reason.
  assert.match(sticky, /create or replace function public\.admin_refund_clear_quarantine/);
  assert.match(sticky, /a quarantine was cleared with no explanation/);
});

test("one predicate decides what blocks a booking", () => {
  // Request, approve and send cannot disagree about what is blocking.
  assert.match(sticky, /create or replace function public\.booking_refunds_blocked/);
  assert.match(sticky, /quarantine_cleared_at is null/);
  assert.match(sticky, /a refund was requested against a quarantined booking/);
  assert.match(sticky, /the booking was not blocked by an unresolved quarantine/);
  // And the screen says so rather than offering a button that fails.
  const panel2 = readFileSync("components/admin/RefundReviewPanel.tsx", "utf8");
  assert.match(panel2, /A QUARANTINE BLOCKS EVERYTHING ON THE BOOKING/);
  assert.match(panel2, /clearRefundQuarantineAction/);
});

test("identity is checked on the processor-id path too", () => {
  /*
    An event naming a different booking, leg and amount but carrying a
    processor id we already knew updated the stored refund and
    recomputed the booking the EVENT named. The check existed — in the
    other branch.
  */
  assert.match(sticky, /THE SAME CHECK ON BOTH PATHS/);
  assert.match(sticky, /NOTHING IS CHANGED AND NOTHING IS RECOMPUTED/);
  assert.match(sticky, /a processor-id event with the wrong leg\/amount was accepted/);
  assert.match(sticky, /a mismatched event rewrote the stored refund/);
});

test("a send claim refuses the second caller", () => {
  assert.match(sticky, /THE CLAIM\. Bumping updated_at claimed nothing/);
  assert.match(sticky, /send_claim_token/);
  assert.match(sticky, /errcode = 'HW143'/);
  assert.match(sticky, /a second caller was also told to send the same refund/);
  // It expires, so a crashed sender does not block for ever...
  assert.match(sticky, /IT EXPIRES, because a sender that crashed/);
  assert.match(sticky, /a re-claim reused the old token/);
  // ...and idempotency is named as the backstop it is, not the design.
  assert.match(sticky, /That is a backstop behind this check, not instead of it/);
  // The lease is handed back once the work is done.
  assert.match(actions, /admin_refund_release_claim/);
});

/* ------------------------------------------------------------------ */
/* WHO MAY RELEASE A CLAIM, AND WHAT A REASON PROVES                   */
/* ------------------------------------------------------------------ */

const claims = readFileSync("supabase/migrations/0123_claim_release_and_outcomes.sql", "utf8");

test("releasing a claim needs an admin and the current token", () => {
  /*
    The release function was security definer, granted to
    `authenticated`, and had no admin check — written as a tidy-up
    helper for an action that had already checked. An exposed RPC is
    not protected by the screen that usually calls it.
  */
  assert.match(claims, /ANY SIGNED-IN USER COULD RELEASE A SEND CLAIM/);
  assert.match(claims, /The screen is not the check/);
  assert.match(claims, /a caller with no admin claim released a send claim/);
  // Fenced on the token, so an expired sender cannot clear a newer lease.
  assert.match(claims, /where id = p_refund and send_claim_token = p_token/);
  assert.match(claims, /an expired sender released a newer sender''s lease/);
  // No single-argument release survives.
  assert.match(claims, /drop function if exists public\.admin_refund_release_claim\(uuid\)/);
});

test("the lease is handed back only when the outcome is settled", () => {
  /*
    Releasing unconditionally — including after a recording failure or
    an unknown processor response — made an uncertain operation
    immediately sendable again.
  */
  assert.match(actions, /THE LEASE IS GIVEN BACK ONLY WHEN THE OUTCOME IS SETTLED/);
  assert.match(actions, /if \(outcome\.ok\) \{\s*\n\s*await supabase\.rpc\("admin_refund_release_claim"/);
  assert.match(actions, /p_token: ready\.claim_token/);
});

test("approving and Send now take the same claim", () => {
  // The approve path used to reach the processor with no claim at all.
  assert.match(actions, /APPROVING AND SENDING TAKES THE SAME CLAIM AS "SEND NOW"/);
  assert.match(actions, /async function sendClaimedRefund/);
  const sends = actions.match(/refundCharge\(\{/g) ?? [];
  assert.equal(sends.length, 1, "there is one place that sends, used by both paths");
});

test("identity and payment outcome resolve separately", () => {
  /*
    0122 made clearing a quarantine also clear needs_reconciliation.
    A row can have a wrong-identity event AND an unknown outcome, and
    a note saying "the outcome is still unknown" unblocked the booking
    anyway.
  */
  assert.match(claims, /THIS CLEARS A QUARANTINE AND NOTHING ELSE/);
  assert.match(claims, /resolving an identity problem erased an unresolved payment outcome/);
  // Resolving an outcome means recording what was found, not a sentence.
  assert.match(claims, /create or replace function public\.admin_refund_resolve_unknown/);
  assert.match(claims, /A refund that was taken has a processor id/);
  assert.match(claims, /an outcome was resolved as refunded with no processor id/);
  assert.match(claims, /the processor id found during reconciliation was not recorded/);
});

test("approval blocks on the same predicate as request and send", () => {
  assert.match(claims, /APPROVAL WAS LEFT BEHIND/);
  assert.match(claims, /v_blocked := public\.booking_refunds_blocked\(v_r\.booking_id\)/);
  assert.match(claims, /a refund was approved on a booking with an unresolved quarantine/);
  // A block stops money leaving; it does not trap the queue.
  assert.match(claims, /DECLINING IS ALWAYS ALLOWED/);
  assert.match(claims, /a decline was refused on a blocked booking/);
});

/* ------------------------------------------------------------------ */
/* NULL IS NOT AN ANSWER, AND RECOVERY IS REACHABLE                    */
/* ------------------------------------------------------------------ */

const nulls = readFileSync("supabase/migrations/0124_null_is_not_an_answer.sql", "utf8");
const refundPanel = readFileSync("components/admin/RefundReviewPanel.tsx", "utf8");

test("no guard lets a NULL past", () => {
  /*
    `null not in ('a','b')` is NULL, not TRUE, so the `if` never fires.
    p_found = NULL passed validation and cleared an unknown payment
    outcome — row untouched at the processor, block simply erased.
  */
  assert.match(nulls, /A NULL SLIPS PAST `not in`, AND EVERY GUARD I WROTE USED IT/);
  // Every surviving NOT IN guard rejects NULL first.
  const guards = nulls.match(/p_\w+ not in \(/g) ?? [];
  const nullChecked = nulls.match(/p_\w+ is null or p_\w+ not in \(/g) ?? [];
  assert.equal(nullChecked.length, guards.length,
    `${guards.length} NOT IN guards but only ${nullChecked.length} reject NULL`);
  // Proven, both reported cases.
  assert.match(nulls, /a NULL finding resolved an unknown outcome/);
  assert.match(nulls, /a NULL processor status resolved an unknown outcome/);
  // And a refusal must leave everything exactly as it was.
  assert.match(nulls, /a refused input changed the row anyway/);
  assert.match(nulls, /a refused input unblocked the booking/);
  assert.match(nulls, /a refused input wrote an audit entry/);
});

test("a missing decision is not a decline", () => {
  // `if p_approve then` treats NULL as false — a refusal nobody chose.
  assert.match(nulls, /A NULL BOOLEAN WAS READING AS "NO"/);
  assert.match(nulls, /if p_approve is null then/);
  assert.match(nulls, /a NULL answer was accepted as a decision/);
});

test("the bodies were read back, not retyped", () => {
  /* Six live functions rewritten by hand is a worse risk than the bug. */
  assert.match(nulls, /read back from the database\s*\n\s*with pg_get_functiondef/);
  assert.match(nulls, /CREATE OR REPLACE FUNCTION public\.ingest_refund_event/);
  assert.match(nulls, /CREATE OR REPLACE FUNCTION public\.admin_venue_set_permissions/);
});

test("an unknown outcome can be resolved from the console", () => {
  /*
    The function existed and no screen called it, so an operator could
    clear the identity problem and then be told — correctly and
    uselessly — that the booking was still blocked.
  */
  assert.match(actions, /RECORDING WHAT THE PROCESSOR ACTUALLY DID/);
  assert.match(actions, /admin_refund_resolve_unknown/);
  assert.match(refundPanel, /THE OTHER HALF OF RECOVERY/);
  assert.match(refundPanel, /resolveRefundOutcomeAction/);
  // Both findings are offered, and "refunded" asks for the id and status.
  assert.match(refundPanel, /The processor DID refund it/);
  assert.match(refundPanel, /It never left — no refund exists/);
  assert.match(refundPanel, /The processor's refund id for this operation/);
});

test("the quarantine prompt no longer overpromises", () => {
  // It said clearing identity "unblocks every refund on this booking".
  assert.doesNotMatch(refundPanel, /it unblocks every refund on this booking/);
  assert.match(refundPanel, /This resolves the IDENTITY problem only/);
});

test("a block stops money leaving, it does not trap the queue", () => {
  /*
    The database allows declining on a blocked booking; the screen
    disabled the button anyway, so the one safe action was the one an
    operator could not take.
  */
  assert.match(refundPanel, /A BLOCK STOPS MONEY LEAVING\. IT DOES NOT TRAP THE QUEUE/);
  assert.match(refundPanel, /const canDecline = review\.state === "awaiting_review"/);
  assert.match(refundPanel, /disabled=\{sample \|\| !can\.decide \|\| !canDecline \|\| busy !== null\}/);
  // Approve stays protected by the block.
  assert.match(refundPanel, /disabled=\{sample \|\| !can\.decide \|\| blocked \|\| overAvailable \|\| busy !== null\}/);
});
