import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describeCancellationFee } from "../lib/cancellation.ts";

/*
  WHAT CANCELLING COSTS.

  THE POLICY MOVED. It used to be decided here, in TypeScript, from
  the booking alone — which is how a helper abandoning a job came to
  charge the customer 10%: this layer could see the booking and not
  who was asking. It now lives in cancellation_fee_for() and
  cancel_booking_with_fee(), inside the row lock that also decides the
  race with completion, and 0126's self-test proves the rules.

  What is tested here is the half that is still TypeScript: turning
  the database's decision into a sentence a customer can agree to.
*/

const policy = readFileSync("supabase/migrations/0126_cancellation_policy.sql", "utf8");
const shared = readFileSync("lib/cancel-booking.ts", "utf8");
const route = readFileSync("app/api/v1/bookings/[id]/cancellation/route.ts", "utf8");

test("the customer is told the amount, the total and what happens to the rest", () => {
  const fee = describeCancellationFee(
    { cents: 2245, rate: 0.10, reason: "helper_accepted", total_cents: 22450 },
  );
  assert.match(fee.explanation, /CA\$22\.45/);
  assert.match(fee.explanation, /CA\$224\.50/);
  assert.match(fee.explanation, /rest of the hold is released/);
  assert.match(fee.because, /set the time aside/);
});

test("every free case says WHY it is free", () => {
  /* "No fee applies" is not something anybody can check. */
  const cases: Record<string, RegExp> = {
    within_grace: /still within the few minutes/,
    predates_policy: /before cancellation fees existed/,
    not_the_customer: /apply to the customer who booked, not to you/,
    nothing_charged: /no charge against it/,
  };
  for (const [reason, expected] of Object.entries(cases)) {
    const fee = describeCancellationFee({ cents: 0, rate: 0, reason, total_cents: 22450 });
    assert.equal(fee.cents, 0, `${reason} must cost nothing`);
    assert.match(fee.because, expected, `${reason} must explain itself`);
  }
});

test("the currency shown is the booking's", () => {
  const usd = describeCancellationFee(
    { cents: 2245, rate: 0.1, reason: "helper_accepted", total_cents: 22450 }, "USD",
  );
  assert.match(usd.explanation, /\$22\.45/);
  assert.doesNotMatch(usd.explanation, /CA\$/);
});

/* ------------------------------------------------------------------ */
/* THE RULES, WHERE THEY NOW LIVE                                      */
/* ------------------------------------------------------------------ */

test("a helper abandoning a job does not charge the customer", () => {
  /*
    cancel_booking has always permitted customer, provider or admin and
    returned void, so the caller never learned which. The fee was
    computed from the booking alone and a helper cancelling triggered
    the customer's 10%, recorded with the helper as actor.
  */
  assert.match(policy, /A HELPER ABANDONING A JOB CHARGED THE CUSTOMER/);
  assert.match(policy, /if p_actor is distinct from 'customer' then/);
  assert.match(policy, /a helper cancelling was charged the customer fee/);
  assert.match(policy, /an admin cancelling was charged a fee/);
});

test("status, actor, policy and consent are settled in one locked call", () => {
  assert.match(policy, /create or replace function public\.cancel_booking_with_fee/);
  assert.match(policy, /for update/);
  assert.match(policy, /CONSENT IS CHECKED HERE, under the same lock/);
  assert.match(policy, /a fee-bearing cancellation went through with no acceptance/);
  assert.match(policy, /a cancellation went through on the wrong accepted amount/);
  // And TypeScript no longer decides any of it.
  assert.match(shared, /THE POLICY IS NOT HERE/);
  assert.doesNotMatch(shared, /floor\(.*0\.10|\* 0\.1\b/);
});

test("a completed job cannot be cancelled into a refund", () => {
  /*
    complete_booking and cancel_booking_with_fee take the same row
    lock, so whichever commits first makes the other impossible.
  */
  assert.match(policy, /COMPLETION WINS, ALWAYS/);
  assert.match(policy, /a completed job was cancelled/);
  assert.match(policy, /a captured booking was cancelled into a refund/);
});

test("the grace window and the disclosure instant are real values", () => {
  assert.match(policy, /interval '5 minutes'/);
  // Midnight was never when anything was published.
  assert.match(policy, /2026-11-12 22:21:13\+00/);
  assert.match(policy, /which is not when\s*\n\s*anything was published/);
  assert.match(policy, /a booking made before the policy was charged/);
});

/* ------------------------------------------------------------------ */
/* REPORTING WHAT ACTUALLY HAPPENED                                    */
/* ------------------------------------------------------------------ */

test("the charge reported is what the processor took", () => {
  /*
    captureBookingPayment returns the FULL booking amount when it finds
    the booking already captured. Reporting the requested fee
    regardless announced a CA$22.45 fee with CA$202.05 released to a
    customer who had paid for everything.
  */
  assert.match(shared, /WHAT THE PROCESSOR ACTUALLY TOOK, not what we asked for/);
  assert.match(shared, /charged = captured\.capturedCents/);
  assert.match(shared, /released = Math\.max\(0, decision\.total_cents - charged\)/);
  // And an over-capture is recovered rather than left.
  assert.match(shared, /charged > decision\.fee_cents/);
  assert.match(shared, /system_cancellation_refund/);
});

test("a failed capture is not reported as proof that nothing happened", () => {
  /*
    A dropped connection cannot establish that the card was untouched,
    and every failure used to say "nothing has been charged".
  */
  assert.match(shared, /A FAILED CALL IS NOT PROOF THAT NOTHING HAPPENED/);
  assert.match(shared, /could not confirm whether the cancellation fee was taken/);
  // Only a definite refusal claims nothing moved.
  assert.match(shared, /captured\.code === "card_declined"/);
});

test("the automatic refund has its own narrow door", () => {
  /*
    It used to call admin_refund_request with the service key, which
    cannot work: is_admin() reads the app_metadata role and a
    service-role token has none. Every call failed 42501 and the whole
    automatic path was dead.
  */
  assert.match(policy, /Bypassing RLS is not the same as being an admin/);
  assert.match(policy, /The answer is NOT to make service_role an admin/);
  assert.match(policy, /grant execute on function public\.system_cancellation_refund\(uuid, integer, text\) to service_role/);
  assert.doesNotMatch(policy, /system_cancellation_refund\(uuid, integer, text\) to authenticated/);
  // And the file that skipped the shared protections is gone.
  assert.throws(() => readFileSync("lib/cancellation-refund.ts", "utf8"));
});

/* ------------------------------------------------------------------ */
/* THE CLIENTS                                                         */
/* ------------------------------------------------------------------ */

test("the app sends the amount it showed", () => {
  /*
    The shipped client sent only `reason`, so every fee-bearing
    cancellation from the app was refused — and a build that forgets
    the field must be refused rather than charging without consent.
  */
  const api = readFileSync(
    "../helpward-ios/Helpward/Shared/Services/APIClient.swift", "utf8");
  const sheet = readFileSync(
    "../helpward-ios/Helpward/Customer/Views/Booking/CancelBookingSheet.swift", "utf8");

  assert.match(api, /acceptedFeeCents: Int/);
  assert.match(api, /let acceptedFeeCents: Int/);
  assert.match(sheet, /acceptedFeeCents: shown\.cancellationFeeCents/);
  assert.match(sheet, /NOTHING IS SENT WITHOUT THE AMOUNT ON SCREEN/);
  // It decodes what the new response actually carries.
  assert.match(api, /cancellationFeeChargedCents/);
  assert.doesNotMatch(api, /let releaseProblem/);
  // A 409 re-asks rather than showing an error nobody can act on.
  assert.match(sheet, /isFeeChanged/);
  assert.match(sheet, /The cancellation fee changed/);
  // And the button names the charge.
  assert.match(sheet, /Cancel and pay/);
});

test("the server refuses a client that did not confirm", () => {
  assert.match(route, /acceptedFeeCents/);
  assert.match(route, /status: 409/);
  assert.match(policy, /errcode = 'HW152'/);
});

test("every page that describes cancelling agrees with the code", () => {
  const pricing = readFileSync("app/pricing/page.tsx", "utf8");
  const terms = readFileSync("app/terms/page.tsx", "utf8");
  const help = readFileSync("lib/help-articles.ts", "utf8");

  assert.doesNotMatch(pricing, /There is no cancellation fee/);
  assert.doesNotMatch(terms, /We don't charge one today/);
  for (const [name, page] of [["pricing", pricing], ["terms", terms], ["help", help]] as const) {
    assert.match(page, /10%/, `${name} must state the rate`);
  }
  assert.match(terms, /Bookings made before this fee existed are never charged it/);
});

/* ------------------------------------------------------------------ */
/* THE FUNCTIONS ANYONE COULD CALL                                     */
/* ------------------------------------------------------------------ */

const lock = readFileSync("supabase/migrations/0127_lock_internal_functions.sql", "utf8");

test("revoking from PUBLIC does not lock a function", () => {
  /*
    Supabase's DEFAULT PRIVILEGES grant EXECUTE on new functions in
    `public` to anon, authenticated and service_role INDIVIDUALLY. So
    `revoke all … from public` removes a grant that was never the one
    letting them in, and every internal function written that way was
    callable by anyone — including ingest_refund_event, which is
    SECURITY DEFINER, has no is_admin() check by design, and writes
    refund rows and booking payment states.
  */
  assert.match(lock, /EVERY INTERNAL FUNCTION I ADDED WAS CALLABLE BY ANYONE/);
  assert.match(lock, /from anon, authenticated/);
  assert.match(lock, /ingest_refund_event is the serious one/);
  // Both doors, where PUBLIC still held one.
  assert.match(lock, /from public, anon, authenticated/);
  // The test fails loudly rather than reporting a tidy list.
  assert.match(lock, /still reachable from a browser session/);
  // And the service role keeps what it needs to work.
  assert.match(lock, /the webhook can no longer record refunds/);
});

test("the fee preview resolves the caller instead of believing them", () => {
  /*
    cancellation_fee_for(booking, actor) let the caller name which
    party they were, so anyone could ask what a stranger's booking
    would cost "as the customer" and be told the fee and the total.
  */
  assert.match(lock, /TOOK THE CALLER'S WORD FOR WHO THEY WERE/);
  assert.match(lock, /'not_your_booking'/);
  assert.match(lock, /revoke all on function public\.cancellation_fee_for\(uuid, text\) from anon, authenticated/);
  assert.match(shared, /THE DATABASE WORKS OUT WHO IS ASKING/);
  assert.doesNotMatch(shared, /p_actor: actor/);
});
