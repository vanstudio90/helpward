import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { cancellationFeeFor, CANCELLATION_FEE_RATE } from "../lib/cancellation.ts";

/*
  WHAT CANCELLING COSTS.

  This is money a customer agrees to on a screen, so the arithmetic is
  run rather than described. The rule: Helpward holds money at booking
  and only takes it when the work is done, so cancelling normally
  costs nothing — except once a helper has taken the job, which is
  what this fee is for.
*/

const BOOKING = {
  status: "scheduled",
  total_cents: 22450,
  captured_at: null as string | null,
};

test("a job a helper has taken costs 10% to cancel", () => {
  const fee = cancellationFeeFor(BOOKING);
  assert.equal(fee.cents, 2245);
  assert.equal(fee.rate, CANCELLATION_FEE_RATE);
  // The customer is told the amount in money, not the rule.
  assert.match(fee.explanation, /CA\$22\.45/);
  assert.match(fee.explanation, /CA\$224\.50/);
  assert.match(fee.because, /accepted this job/);
});

test("a job already under way costs the same", () => {
  // "Picked up" covers a helper on their way and a helper working.
  const fee = cancellationFeeFor({ ...BOOKING, status: "in_progress" });
  assert.equal(fee.cents, 2245);
});

test("the fee rounds in the customer's favour", () => {
  /*
    A half-cent in our favour on every cancellation is not worth the
    sentence it would take to explain.
  */
  assert.equal(cancellationFeeFor({ ...BOOKING, total_cents: 2999 }).cents, 299);
  assert.equal(cancellationFeeFor({ ...BOOKING, total_cents: 105 }).cents, 10);
  assert.equal(cancellationFeeFor({ ...BOOKING, total_cents: 9 }).cents, 0);
});

test("there is nothing to charge when there is nothing to cancel", () => {
  for (const status of ["completed", "cancelled", "disputed"]) {
    const fee = cancellationFeeFor({ ...BOOKING, status });
    assert.equal(fee.cents, 0, `${status} must not be charged a fee`);
    assert.match(fee.because, new RegExp(status));
  }
});

test("a booking with no charge behind it is free to cancel", () => {
  const fee = cancellationFeeFor({ ...BOOKING, total_cents: 0 });
  assert.equal(fee.cents, 0);
  assert.match(fee.explanation, /costs nothing/);
});

test("an already-charged booking is a refund, and says the amounts", () => {
  /*
    The money is taken, so there is no hold to release. The fee is
    kept and the rest goes back — and the customer is told both
    figures rather than one.
  */
  const fee = cancellationFeeFor({ ...BOOKING, captured_at: "2026-11-12T10:00:00Z" });
  assert.equal(fee.alreadyCharged, true);
  assert.equal(fee.cents, 2245);
  assert.match(fee.explanation, /already been charged CA\$224\.50/);
  assert.match(fee.explanation, /returns CA\$202\.05/);
  assert.match(fee.explanation, /keeps a CA\$22\.45/);
  // 202.05 + 22.45 = 224.50, which is what they paid.
  assert.equal(22450 - fee.cents, 20205);
});

test("the currency shown is the booking's", () => {
  assert.match(cancellationFeeFor(BOOKING, "USD").explanation, /\$22\.45/);
  assert.doesNotMatch(cancellationFeeFor(BOOKING, "USD").explanation, /CA\$/);
});

/* ------------------------------------------------------------------ */
/* THE PARTS THAT MOVE MONEY                                           */
/* ------------------------------------------------------------------ */

const shared = readFileSync("lib/cancel-booking.ts", "utf8");
const action = readFileSync("app/(app)/bookings/actions.ts", "utf8");
const route = readFileSync("app/api/v1/bookings/[id]/cancellation/route.ts", "utf8");
const button = readFileSync("app/(app)/bookings/[id]/cancel-button.tsx", "utf8");

test("nothing is charged that the customer has not accepted", () => {
  // The figure is checked again on the server at the moment of cancelling.
  assert.match(shared, /THE CUSTOMER HAS TO HAVE SEEN THE NUMBER/);
  assert.match(shared, /input\.acceptedFeeCents !== fee\.cents/);
  assert.match(shared, /needsAcceptance: true/);
  // And the button names the amount rather than saying "cancel".
  assert.match(button, /Cancel and pay \$\{money\(fee!\.cents\)\}/);
  assert.match(button, /THE AMOUNT, BEFORE THE BUTTON/);
});

test("the booking is cancelled before any money moves", () => {
  /*
    The other order risks charging for a job that is still going
    ahead. This order's worst case costs Helpward, not the customer.
  */
  assert.match(shared, /THE ORDER MATTERS AND IT IS DELIBERATE/);
  assert.ok(
    shared.indexOf('rpc("cancel_booking"') < shared.indexOf("captureBookingPayment("),
    "the cancellation must be committed before the fee is taken",
  );
});

test("the fee is a partial capture, not a charge and a refund", () => {
  // Capturing the fee releases the remainder in the same call, so the
  // customer is never charged in full and then credited.
  assert.match(shared, /ONE CALL\./);
  assert.match(shared, /captureBookingPayment\(bookingId, fee\.cents\)/);
});

test("the race that used to charge for a cancelled booking is handled", () => {
  /*
    The job completing between the customer pressing cancel and the
    hold being released left them charged in full with nothing
    recording it — Stripe even said "refund it instead".
  */
  assert.match(shared, /THE JOB COMPLETED BETWEEN THE CUSTOMER PRESSING CANCEL/);
  assert.match(shared, /result\.code === "already_captured"/);
  assert.match(shared, /refundCapturedRemainder/);
  // Neither surface swallows it any more.
  assert.doesNotMatch(action, /already_captured/);
  assert.doesNotMatch(route, /already_captured/);
});

test("both surfaces share one implementation", () => {
  // Two copies of money-moving logic is two places for it to drift.
  assert.match(shared, /ONCE, FOR BOTH THE WEBSITE AND THE APP/);
  assert.match(action, /performCancellation\(\{/);
  assert.match(route, /performCancellation\(\{/);
  assert.doesNotMatch(route, /cancellationFeeCents: 0/);
});

test("the app is told the fee instead of being left to assume zero", () => {
  assert.match(route, /cancellationFeeCents: fee\.cents/);
  assert.match(route, /THERE IS A CANCELLATION FEE NOW/);
  // And it must send back what it showed.
  assert.match(route, /acceptedFeeCents/);
  assert.match(route, /status: 409/);
});

test("a fee that was charged is recorded with what was agreed", () => {
  const sql = readFileSync("supabase/migrations/0125_cancellation_fee.sql", "utf8");
  assert.match(sql, /A FEE NOBODY CAN POINT AT IS A CHARGEBACK WAITING TO HAPPEN/);
  assert.match(sql, /cancellation_fee_accepted_cents/);
  assert.match(sql, /matched_what_was_shown/);
  assert.match(sql, /a fee that differed from what was shown was recorded as matching/);
});

/* ------------------------------------------------------------------ */
/* THE PROMISE IN THE TERMS                                            */
/* ------------------------------------------------------------------ */

test("a booking made before the fee existed is never charged it", () => {
  /*
    /terms said: "we will not introduce one retrospectively for a
    booking made without that fee being clearly disclosed." A booking
    taken under those words was taken on the understanding that
    cancelling was free.
  */
  const old = cancellationFeeFor({
    ...BOOKING, created_at: "2026-11-01T12:00:00Z",
  });
  assert.equal(old.cents, 0);
  assert.match(old.because, /before cancellation fees existed/);

  const now = cancellationFeeFor({
    ...BOOKING, created_at: "2026-11-20T12:00:00Z",
  });
  assert.equal(now.cents, 2245);
});

test("a booking with no creation date is charged, not grandfathered", () => {
  // Absence of a date is not evidence of an old booking, and treating
  // it as one would be a loophole rather than a kindness.
  assert.equal(cancellationFeeFor({ ...BOOKING, created_at: null }).cents, 2245);
});

test("every page that describes cancelling agrees with the code", () => {
  const pricing = readFileSync("app/pricing/page.tsx", "utf8");
  const terms = readFileSync("app/terms/page.tsx", "utf8");
  const help = readFileSync("lib/help-articles.ts", "utf8");

  // The claims that are now false must be gone, not merely softened.
  assert.doesNotMatch(pricing, /There is no cancellation fee/);
  assert.doesNotMatch(terms, /Helpward does not currently apply a cancellation fee/);
  assert.doesNotMatch(terms, /We don't charge one today/);
  assert.doesNotMatch(help, /A small cancellation fee may apply close to the scheduled time/);

  // And each says the same thing: free until accepted, then 10%.
  for (const [name, page] of [["pricing", pricing], ["terms", terms], ["help", help]] as const) {
    assert.match(page, /10%/, `${name} must state the rate`);
  }
  // The promise is restated where it is kept.
  assert.match(terms, /Bookings made before this fee existed are never charged it/);
});
