import { test } from "node:test";
import assert from "node:assert/strict";
import { refundCharge, type RefundChargeIO } from "../lib/payments.ts";
import { recordRefundOutcome, settlementStatusFor } from "../lib/refund-approval.ts";

/*
  THESE TESTS RUN THE CODE.

  Every other suite in this project asserts on the TEXT of the source,
  which is right for a rule somebody has to keep writing down and
  useless for arithmetic. Four failures got through that way, all of
  them in the ten lines between "somebody approved CA$5" and "Stripe
  was asked for something":

    1. An approved CA$5 TIP refund asked for the whole CA$224.50
       service charge AND the whole CA$10 tip.
    2. A failed settlement write was never read, so the console said
       "Approved and sent" over a record that did not save.
    3. An error after Stripe accepted produced "no money has moved".
    4. A refund Stripe returned as `pending` was written down as
       succeeded.

  Each has a test below that fails if it comes back.
*/

const BOOKING = {
  id: "bk-1",
  payment_status: "captured",
  stripe_payment_intent_id: "pi_service",
  tip_payment_intent_id: "pi_tip",
};

type Created = {
  bookingId: string;
  params: {
    payment_intent: string; amount: number; reverse_transfer: boolean;
    refund_application_fee?: boolean; metadata: Record<string, string>;
  };
  idempotencyKey: string;
};

function fakeIO(opts: {
  booking?: typeof BOOKING | null;
  remaining?: Record<string, number>;
  status?: string;
  throwOnCreate?: unknown;
} = {}) {
  const created: Created[] = [];
  const io: RefundChargeIO = {
    async loadBooking() {
      return opts.booking === undefined ? BOOKING : opts.booking;
    },
    async remainingRefundable(_bookingId, intentId) {
      return (opts.remaining ?? { pi_service: 22450, pi_tip: 1000 })[intentId] ?? 0;
    },
    async createRefund(bookingId, params, idempotencyKey) {
      created.push({ bookingId, params, idempotencyKey });
      if (opts.throwOnCreate) throw opts.throwOnCreate;
      return { id: "re_1", status: opts.status ?? "succeeded", amount: params.amount };
    },
  };
  return { io, created };
}

/* ------------------------------------------------------------------ */
/* 1. THE WRONG CHARGE AND THE WRONG AMOUNT                            */
/* ------------------------------------------------------------------ */

test("a partial tip refund touches the tip, for exactly the approved amount", async () => {
  const { io, created } = fakeIO();
  const result = await refundCharge({
    bookingId: "bk-1", leg: "tip", amountCents: 500, operationId: "req-1",
  }, io);

  assert.equal(result.ok, true);
  assert.equal(created.length, 1, "exactly one charge may be refunded");
  assert.equal(created[0].params.payment_intent, "pi_tip", "the TIP intent, not the service charge");
  assert.equal(created[0].params.amount, 500, "exactly what was approved");
  // The bug: the service charge must not appear anywhere in this request.
  assert.notEqual(created[0].params.payment_intent, "pi_service");
  assert.equal(created[0].params.metadata.helpward_leg, "tip");
});

test("a partial service refund never reaches the tip", async () => {
  const { io, created } = fakeIO();
  await refundCharge({
    bookingId: "bk-1", leg: "service", amountCents: 1000, operationId: "req-2",
  }, io);
  assert.equal(created.length, 1);
  assert.equal(created[0].params.payment_intent, "pi_service");
  assert.equal(created[0].params.amount, 1000);
});

test("there is no 'everything left' fallback to fall into", async () => {
  // The old shape defaulted a missing amount to the whole charge. This
  // one refuses rather than interpreting.
  for (const bad of [0, -1, 1.5, Number.NaN]) {
    const { io, created } = fakeIO();
    const result = await refundCharge({
      bookingId: "bk-1", leg: "service", amountCents: bad, operationId: "req-3",
    }, io);
    assert.equal(result.ok, false, `${bad} must be refused`);
    assert.equal(created.length, 0, `${bad} must not reach the processor`);
  }
});

test("more than is left is refused before anything is sent", async () => {
  const { io, created } = fakeIO({ remaining: { pi_service: 22450, pi_tip: 1000 } });
  const result = await refundCharge({
    bookingId: "bk-1", leg: "tip", amountCents: 1500, operationId: "req-4",
  }, io);
  assert.equal(result.ok, false);
  assert.equal(created.length, 0);
  assert.match((result as { message: string }).message, /10\.00 is left on the tip/);
});

test("the tip carries no application fee to give back", async () => {
  const { io: tipIO, created: tipCalls } = fakeIO();
  await refundCharge({ bookingId: "bk-1", leg: "tip", amountCents: 500, operationId: "a" }, tipIO);
  assert.equal(tipCalls[0].params.refund_application_fee, undefined);

  const { io: svcIO, created: svcCalls } = fakeIO();
  await refundCharge({ bookingId: "bk-1", leg: "service", amountCents: 500, operationId: "b" }, svcIO);
  assert.equal(svcCalls[0].params.refund_application_fee, true);
});

test("who carries it reaches the processor as reverse_transfer", async () => {
  const { io: absorbIO, created: absorbCalls } = fakeIO();
  await refundCharge({
    bookingId: "bk-1", leg: "service", amountCents: 500,
    absorbHelperShare: true, operationId: "c",
  }, absorbIO);
  assert.equal(absorbCalls[0].params.reverse_transfer, false, "absorbing leaves the helper paid");

  const { io: reverseIO, created: reverseCalls } = fakeIO();
  await refundCharge({
    bookingId: "bk-1", leg: "service", amountCents: 500,
    absorbHelperShare: false, operationId: "d",
  }, reverseIO);
  assert.equal(reverseCalls[0].params.reverse_transfer, true);
});

test("the idempotency key is the approval, so a retry cannot double-send", async () => {
  const { io: a, created: ca } = fakeIO();
  await refundCharge({ bookingId: "bk-1", leg: "service", amountCents: 500, operationId: "req-9" }, a);
  const { io: b, created: cb } = fakeIO();
  await refundCharge({ bookingId: "bk-1", leg: "service", amountCents: 500, operationId: "req-9" }, b);
  assert.equal(ca[0].idempotencyKey, cb[0].idempotencyKey);
  // ...and two different approvals of the same size are distinguishable.
  const { io: c, created: cc } = fakeIO();
  await refundCharge({ bookingId: "bk-1", leg: "service", amountCents: 500, operationId: "req-10" }, c);
  assert.notEqual(ca[0].idempotencyKey, cc[0].idempotencyKey);
});

test("a booking with no tip charge is told so, not given the service charge", async () => {
  const { io, created } = fakeIO({
    booking: { ...BOOKING, tip_payment_intent_id: null },
  });
  const result = await refundCharge({
    bookingId: "bk-1", leg: "tip", amountCents: 500, operationId: "req-5",
  }, io);
  assert.equal(result.ok, false);
  assert.equal(created.length, 0);
  assert.match((result as { message: string }).message, /no tip charge/);
});

test("a hold is not a capture", async () => {
  const { io, created } = fakeIO({
    booking: { ...BOOKING, payment_status: "authorized" },
  });
  const result = await refundCharge({
    bookingId: "bk-1", leg: "service", amountCents: 500, operationId: "req-6",
  }, io);
  assert.equal(result.ok, false);
  assert.equal(created.length, 0);
  assert.match((result as { message: string }).message, /cancel it to release the hold/);
});

/* ------------------------------------------------------------------ */
/* 4. THE PROCESSOR'S OWN STATUS                                       */
/* ------------------------------------------------------------------ */

test("a pending refund comes back pending, not succeeded", async () => {
  const { io } = fakeIO({ status: "pending" });
  const result = await refundCharge({
    bookingId: "bk-1", leg: "service", amountCents: 500, operationId: "req-7",
  }, io);
  assert.equal(result.ok, true);
  assert.equal((result as { refund: { processorStatus: string } }).refund.processorStatus, "pending");
});

test("an unrecognised processor status is treated as pending, never as done", () => {
  assert.equal(settlementStatusFor("succeeded"), "succeeded");
  assert.equal(settlementStatusFor("pending"), "pending");
  assert.equal(settlementStatusFor("failed"), "failed");
  assert.equal(settlementStatusFor("canceled"), "canceled");
  assert.equal(settlementStatusFor("requires_action"), "pending");
  assert.equal(settlementStatusFor("something_new"), "pending");
});

/* ------------------------------------------------------------------ */
/* 3. AN UNKNOWN OUTCOME IS NOT A FAILURE                              */
/* ------------------------------------------------------------------ */

test("a dropped connection is uncertain, not 'no money moved'", async () => {
  const { io } = fakeIO({ throwOnCreate: Object.assign(new Error("socket hang up"), { type: "StripeConnectionError" }) });
  const result = await refundCharge({
    bookingId: "bk-1", leg: "service", amountCents: 500, operationId: "req-8",
  }, io);
  assert.equal(result.ok, false);
  assert.ok("uncertain" in result, "a dropped connection must not be a plain failure");
  assert.match((result as { message: string }).message, /may or may not have been taken/);
});

test("a rejection by Stripe is a definite failure", async () => {
  const { io } = fakeIO({
    throwOnCreate: Object.assign(new Error("charge already refunded"), { type: "StripeInvalidRequestError" }),
  });
  const result = await refundCharge({
    bookingId: "bk-1", leg: "service", amountCents: 500, operationId: "req-11",
  }, io);
  assert.equal(result.ok, false);
  assert.ok(!("uncertain" in result), "a refusal is not an unknown outcome");
});

/* ------------------------------------------------------------------ */
/* THE OUTCOMES, AS THE OPERATOR IS TOLD THEM                          */
/* ------------------------------------------------------------------ */

const settledOk = async () => ({ error: null });
const settleBroken = async () => ({ error: { message: "duplicate key value violates unique constraint" } });

test("an uncertain outcome never says the money stayed put", async () => {
  const calls: string[] = [];
  const outcome = await recordRefundOutcome(
    { ok: false, uncertain: true, code: "outcome_unknown", message: "no answer", operationId: "req-1" },
    async ({ status }) => { calls.push(status); return { error: null }; },
    { refundId: "req-1", absorbHelperShare: false },
  );
  assert.equal(outcome.ok, false);
  assert.deepEqual(calls, ["unknown"], "it is recorded as unknown, not failed");
  assert.match((outcome as { error: string }).error, /NOT known whether this refund was taken/);
  assert.doesNotMatch((outcome as { error: string }).error, /no money has moved/);
});

/* 2. THE BOOKKEEPING ERROR THAT WAS IGNORED */
test("a refund that was sent but not recorded is never reported as success", async () => {
  const outcome = await recordRefundOutcome(
    {
      ok: true,
      refund: {
        leg: "service", paymentIntentId: "pi_service", refundId: "re_1",
        processorStatus: "succeeded", amountCents: 500, helperShareReversed: true,
      },
    },
    settleBroken,
    { refundId: "req-1", absorbHelperShare: false },
  );
  assert.equal(outcome.ok, false, "money moved and the record did not — this is not success");
  assert.match((outcome as { error: string }).error, /WAS sent to the processor/);
  assert.match((outcome as { error: string }).error, /Do not send it again/);
});

test("a pending refund is not announced as money returned", async () => {
  const statuses: string[] = [];
  const outcome = await recordRefundOutcome(
    {
      ok: true,
      refund: {
        leg: "tip", paymentIntentId: "pi_tip", refundId: "re_2",
        processorStatus: "pending", amountCents: 500, helperShareReversed: false,
      },
    },
    async ({ status }) => { statuses.push(status); return { error: null }; },
    { refundId: "req-2", absorbHelperShare: true },
  );
  assert.equal(outcome.ok, true);
  assert.deepEqual(statuses, ["pending"]);
  assert.match((outcome as { detail?: string }).detail ?? "", /does not have the money yet/);
});

test("a successful refund reports the amount and the charge it came from", async () => {
  const outcome = await recordRefundOutcome(
    {
      ok: true,
      refund: {
        leg: "tip", paymentIntentId: "pi_tip", refundId: "re_3",
        processorStatus: "succeeded", amountCents: 500, helperShareReversed: false,
      },
    },
    settledOk,
    { refundId: "req-3", absorbHelperShare: true },
  );
  assert.equal(outcome.ok, true);
  assert.match((outcome as { message: string }).message, /5\.00 on the tip charge/);
  assert.match((outcome as { detail?: string }).detail ?? "", /helper keeps their share/);
});

test("the processor id is kept whatever the status", async () => {
  const seen: (string | null)[] = [];
  for (const status of ["succeeded", "pending", "failed"]) {
    await recordRefundOutcome(
      {
        ok: true,
        refund: {
          leg: "service", paymentIntentId: "pi_service", refundId: "re_keep",
          processorStatus: status, amountCents: 500, helperShareReversed: true,
        },
      },
      async ({ processorId }) => { seen.push(processorId); return { error: null }; },
      { refundId: "req-4", absorbHelperShare: false },
    );
  }
  assert.deepEqual(seen, ["re_keep", "re_keep", "re_keep"]);
});
