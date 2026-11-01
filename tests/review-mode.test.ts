import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/*
  App Review isolation.

  The danger with a review mode is that it becomes a bypass: capture
  skipped, payment status written by hand, a request quietly not
  dispatched. A reviewer would then verify a path no customer takes.
  These assert the opposite — that review differs ONLY in who can be
  matched and which Stripe keys are used.
*/

const migration = readFileSync("supabase/migrations/0088_review_accounts.sql", "utf8");
const payments = readFileSync("lib/payments.ts", "utf8");
const stripe = readFileSync("lib/stripe.ts", "utf8");

test("the review isolation is symmetric", () => {
  // A test helper taking a stranger's booking is as bad as the reverse.
  assert.match(migration, /coalesce\(pp\.is_review_helper, false\) = coalesce\(p_review, false\)/);
});

test("the rebase kept the municipality filter from 0072", () => {
  // Restating a function's body is how a later migration gets reverted.
  assert.match(migration, /provider_cities/);
  assert.match(migration, /REBASED ON 0072/);
});

test("neither review flag can be set by its owner", () => {
  assert.match(migration, /profiles_review_flag_guard/);
  assert.match(migration, /helper_review_flag_guard/);
  assert.match(migration, /may only be changed by an admin/);
});

test("review mode never skips a payment transition", () => {
  /*
    No branch anywhere may write a payment state because the account is
    a review account, or step over capture. If this ever fails, someone
    has started simulating payment rather than running it in test mode.
  */
  assert.doesNotMatch(payments, /is_review_account[\s\S]{0,200}payment_status\s*[:=]/);
  assert.doesNotMatch(payments, /isReview[A-Za-z]*\s*\?\s*["']captured["']/);
  assert.doesNotMatch(payments, /skip[A-Za-z]*Capture/i);
});

test("test mode is resolved from the database, never from the caller", () => {
  // A client that could ask to be billed in test mode would be a way to
  // get a free booking.
  assert.match(payments, /async function isReviewCustomer\(userId: string\)/);
  assert.match(payments, /\.from\("profiles"\)[\s\S]{0,120}is_review_account/);
  assert.doesNotMatch(payments, /function stripeForUser\([^)]*isReview/);
});

test("a live key can never serve a review account", () => {
  assert.match(stripe, /STRIPE_TEST_SECRET_KEY/);
  assert.match(stripe, /startsWith\("sk_test_"\)/);
  // And the guard throws rather than falling back to the live client.
  assert.match(stripe, /must not transact against live Stripe/);
});

test("the app is told its publishable key rather than compiling one in", () => {
  const me = readFileSync("app/api/v1/me/route.ts", "utf8");
  assert.match(me, /publishableKeyFor/);
  assert.match(me, /isReviewAccount/);
});

test("an unknown record can never select a Stripe mode", () => {
  /*
    The safeguard: when payment mode is unknown, nothing may quietly
    pick one. Defaulting to live is a live operation chosen on a guess;
    defaulting to test could let an unknown booking settle against test
    money and become a free job. Neither is defensible, so there is no
    default — the lookups refuse.

    This asserts the structural property, not "every caller currently
    remembers to check first".
  */
  assert.doesNotMatch(payments, /\bgetStripe\(\)/,
    "payments.ts still has an unresolved getStripe(); every path must resolve a mode or refuse");

  // The booking lookup throws rather than returning a client.
  assert.match(payments, /Cannot determine the payment mode for booking/);

  // The payout-account lookup fails rather than asking live Stripe about
  // an account it cannot attribute.
  assert.match(payments, /unknown_account/);
  assert.match(payments, /its payment mode is unknown/);
});

test("mode is resolved only after the record is known to exist", () => {
  // refundBooking and payCrew used to build a client before checking the
  // booking existed. Harmless then, because the Stripe call came later —
  // but it meant a mode was chosen from a missing row.
  for (const fn of ["refundBooking", "payCrew"]) {
    const start = payments.indexOf(`export async function ${fn}`);
    assert.ok(start > -1, `${fn} not found`);
    const body = payments.slice(start, start + 4000);
    const check = body.indexOf('return fail("no_booking"');
    const resolve = body.indexOf("stripeForBooking(bookingId)");
    assert.ok(check > -1 && resolve > -1, `${fn} missing one of the two`);
    assert.ok(check < resolve,
      `${fn} resolves a payment mode before confirming the booking exists`);
  }
});

test("a helper's connected account follows the same mode as its bookings", () => {
  // A test-mode destination charge cannot pay a live connected account.
  assert.match(payments, /async function stripeForHelper\(/);
  assert.match(payments, /is_review_helper/);
});

test("the webhook accepts test-mode events without accepting unsigned ones", () => {
  const hook = readFileSync("app/api/webhooks/stripe/route.ts", "utf8");
  assert.match(hook, /STRIPE_TEST_WEBHOOK_SECRET/);
  // A live event signed by the test endpoint is still refused.
  assert.match(hook, /event\.livemode/);
  assert.match(hook, /mode_mismatch/);
  // And a bad signature is still a 400, not a pass-through.
  assert.match(hook, /bad_signature/);
});

test("the controlled helper uses the real actions, never a status write", () => {
  const rh = readFileSync("lib/review-helper.ts", "utf8");
  for (const rpc of ["accept_request", "start_booking", "complete_booking"]) {
    assert.ok(rh.includes(rpc), `review helper does not call ${rpc}`);
  }
  assert.match(rh, /authorizeBookingPayment/);
  assert.match(rh, /captureBookingPayment/);
  // No direct status writes, which would fabricate a transition.
  assert.doesNotMatch(rh, /\.update\(\{[^}]*status:/);
  assert.doesNotMatch(rh, /payment_status/);
});

test("the controlled helper cannot be aimed at a real booking", () => {
  const rh = readFileSync("lib/review-helper.ts", "utf8");
  assert.match(rh, /isReviewRequest/);
  assert.match(rh, /isReviewBooking/);
  // The lead must be verified as a CONTROLLED helper, not merely a review
  // customer who happened to match someone real. Checked against the SET
  // of controlled accounts rather than one id: a crew job needs more than
  // one, and comparing against a single id would refuse every booking the
  // second helper happened to lead.
  assert.match(rh, /isReviewHelper\(row\.provider_id\)/);
  assert.match(rh, /\.eq\("is_review_helper", true\)/);
});

test("the review crew is staffed only from controlled accounts", () => {
  const rh = readFileSync("lib/review-helper.ts", "utf8");
  const seat = rh.slice(rh.indexOf("async function seatReviewCrew"));
  assert.ok(seat.length > 0, "seatReviewCrew is missing");
  assert.match(seat, /accept_crew_invite/);
  // Ordering is the guarantee, not mere presence: the invited list has to
  // be narrowed to controlled accounts BEFORE any invitation is accepted,
  // or a real helper could be conscripted into a demonstration booking.
  assert.ok(
    seat.indexOf("is_review_helper") < seat.indexOf("accept_crew_invite"),
    "seatReviewCrew accepts an invite before filtering to controlled helpers",
  );
});

test("the advance endpoint is gated on the account, not on a parameter", () => {
  const route = readFileSync("app/api/v1/review/advance/route.ts", "utf8");
  assert.match(route, /is_review_account/);
  assert.match(route, /status: 403/);
  // And the booking must be the caller's own.
  assert.match(route, /\.eq\("customer_id", user\.id\)/);
});
