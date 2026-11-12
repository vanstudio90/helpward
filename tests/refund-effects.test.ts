import { test } from "node:test";
import assert from "node:assert/strict";
import { refundEffects } from "../lib/data/admin-refunds.ts";

/*
  WHAT A REFUND TAKES BACK FROM A HELPER.

  This was wrong for every tip refund and a source assertion could
  never have seen it: the function applied the SERVICE charge's payout
  ratio to a tip, so CA$5.00 off a tip showed CA$3.92 coming out of the
  helper's balance. A tip carries no commission — all CA$5.00 is
  theirs and all CA$5.00 goes back.

  tests/refund-effects — named so the design suite can point here.
*/

/* CA$224.50 job paying the helper CA$176.00 — a 0.7840 ratio. */
const BOOKING = { total_cents: 22450, payout_cents: 17600 };

const effect = (effects: ReturnType<typeof refundEffects>, key: string) =>
  effects.find((e) => e.key === key)!;

test("a tip refund takes the whole amount from the helper", () => {
  const effects = refundEffects(
    { leg: "tip", amount_cents: 500, status: "succeeded", absorb_helper_share: false },
    BOOKING,
  );
  // The bug: 500 * (17600/22450) = 392.
  assert.notEqual(effect(effects, "helper_transfer").amount_cents, 392);
  assert.equal(effect(effects, "helper_transfer").amount_cents, 500);
  // And none of a tip comes back to Helpward, because none of it was ours.
  assert.equal(effect(effects, "platform").amount_cents, 0);
  assert.match(effect(effects, "platform").note ?? "", /no commission/);
});

test("a service refund takes the helper's proportion of that charge", () => {
  const effects = refundEffects(
    { leg: "service", amount_cents: 500, status: "succeeded", absorb_helper_share: false },
    BOOKING,
  );
  assert.equal(effect(effects, "helper_transfer").amount_cents, 392);
  assert.equal(effect(effects, "platform").amount_cents, 108);
  // The two still add up to what the customer got back.
  assert.equal(
    effect(effects, "helper_transfer").amount_cents! + effect(effects, "platform").amount_cents!,
    effect(effects, "customer").amount_cents,
  );
});

test("absorbing leaves the helper whole, on either charge", () => {
  for (const leg of ["service", "tip"] as const) {
    const effects = refundEffects(
      { leg, amount_cents: 500, status: "succeeded", absorb_helper_share: true },
      BOOKING,
    );
    assert.equal(effect(effects, "helper_transfer").amount_cents, 0, `${leg} must not touch the helper`);
    assert.equal(effect(effects, "helper_transfer").state, "not_applicable");
    assert.equal(effect(effects, "platform").amount_cents, 500, `${leg}: Helpward carries all of it`);
  }
});

test("a reversal is never called applied on the strength of a refund status", () => {
  /*
    The transfer reversal is a separate operation at the processor and
    nothing here reads what it actually did. Showing "applied" because
    the refund succeeded is a claim about money we have not checked.
  */
  const effects = refundEffects(
    { leg: "service", amount_cents: 500, status: "succeeded", absorb_helper_share: false },
    BOOKING,
  );
  assert.equal(effect(effects, "customer").state, "applied", "the customer's leg IS confirmed");
  assert.equal(effect(effects, "helper_transfer").state, "requires_review");
  assert.match(effect(effects, "helper_transfer").note ?? "", /estimate until the processor/);
});

test("an incomplete split is unknown, not zero", () => {
  const effects = refundEffects(
    { leg: "service", amount_cents: 500, status: "succeeded", absorb_helper_share: false },
    { total_cents: 22450, payout_cents: null },
  );
  assert.equal(effect(effects, "helper_transfer").amount_cents, null);
  assert.match(effect(effects, "helper_transfer").note ?? "", /cannot be worked out/);
});

test("nothing is shown as returned before it is sent", () => {
  const effects = refundEffects(
    { leg: "service", amount_cents: 500, status: "awaiting_review", absorb_helper_share: false },
    BOOKING,
  );
  assert.equal(effect(effects, "customer").state, "requires_review");
  assert.match(effect(effects, "customer").note ?? "", /Not sent yet/);
});
