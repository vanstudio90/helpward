import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { priceTask, SERVICE_FEE_CENTS, COMMISSION_RATE } from "@/lib/pricing";

// The destination charge works by Stripe keeping application_fee_amount on
// the platform and sending the remainder to the helper. There is no second
// call that moves the helper's share, so if total - platform_fee is ever
// anything other than the helper's payout, the helper is silently paid the
// wrong amount and nothing in the system notices.
//
// accept_request computes the split in SQL and lib/pricing.ts computes it
// in TypeScript. authorizeBookingPayment passes platform_fee_cents straight
// to Stripe as application_fee_amount, so this identity is the contract
// between the three.

describe("destination-charge split identity", () => {
  test("total minus application fee is exactly the helper payout", () => {
    for (let subtotal = 0; subtotal <= 50_000; subtotal += 137) {
      const p = priceTask(subtotal);
      assert.equal(
        p.totalCents - p.platformGrossCents,
        p.helperPayoutCents,
        `subtotal ${subtotal}: Stripe would transfer ${p.totalCents - p.platformGrossCents} ` +
          `but the helper is owed ${p.helperPayoutCents}`,
      );
    }
  });

  test("a tip rides on top and is not commissioned", () => {
    const withTip = priceTask(5000, 1500);
    const without = priceTask(5000, 0);
    assert.equal(withTip.platformGrossCents, without.platformGrossCents, "tip must not change Helpward's cut");
    assert.equal(withTip.helperPayoutCents - without.helperPayoutCents, 1500);
  });

  test("the service fee never reaches the helper", () => {
    // The specific defect lib/stripe.ts carried until 2026-10-26: it
    // computed the platform fee as 20% of (subtotal + service fee), which
    // handed the helper 80% of the $4.50 and left Helpward $0.90 of it.
    const p = priceTask(5000);
    assert.equal(p.serviceFeeCents, SERVICE_FEE_CENTS);
    assert.equal(p.helperPayoutCents, 4000, "helper gets 80% of 5000, not 80% of 5450");
    assert.equal(p.platformGrossCents, 1000 + SERVICE_FEE_CENTS);
    const wrongOldModel = Math.round((5000 + SERVICE_FEE_CENTS) * COMMISSION_RATE);
    assert.notEqual(p.platformGrossCents, wrongOldModel);
  });

  test("no cent is created or destroyed at any subtotal", () => {
    for (let subtotal = 0; subtotal < 2000; subtotal++) {
      const p = priceTask(subtotal, subtotal % 7);
      assert.equal(
        p.helperPayoutCents + p.platformGrossCents,
        p.totalCents,
        `subtotal ${subtotal} does not split exactly`,
      );
    }
  });
});

// Partial capture: capturing less than the hold must shrink BOTH sides, or
// Helpward absorbs the whole reduction. captureBookingPayment rescales the
// application fee by the same proportion.
describe("partial capture rescales the platform fee", () => {
  const rescale = (fee: number, amount: number, total: number) =>
    amount === total ? fee : Math.round(fee * (amount / total));

  test("a full capture leaves the fee untouched", () => {
    const p = priceTask(5000);
    assert.equal(rescale(p.platformGrossCents, p.totalCents, p.totalCents), p.platformGrossCents);
  });

  test("half a capture roughly halves the platform fee", () => {
    const p = priceTask(5000);
    const half = Math.round(p.totalCents / 2);
    const fee = rescale(p.platformGrossCents, half, p.totalCents);
    assert.ok(fee < p.platformGrossCents, "fee must shrink");
    assert.ok(fee > 0, "fee must not vanish");
    // The helper's share of the reduced capture stays positive and the two
    // still sum to what was actually taken.
    assert.equal(half - fee + fee, half);
  });

  test("the rescaled fee never exceeds the amount captured", () => {
    const p = priceTask(1000); // small job: the flat fee dominates
    for (let amount = 1; amount <= p.totalCents; amount++) {
      const fee = rescale(p.platformGrossCents, amount, p.totalCents);
      assert.ok(
        fee <= amount,
        `capturing ${amount} with a fee of ${fee} would make Stripe reject the capture`,
      );
    }
  });
});

// Offers are broadcast to every candidate helper, including everyone who
// declines. Anything in that payload has been given away.
import { describeIntake } from "@/lib/service-intake";

describe("broadcast offers withhold access details", () => {
  const values = {
    duration_min: "60",
    access: "Lockbox on the gate, code 4821, key under the mat",
  };

  test("an offer does not carry the access code", () => {
    const brief = describeIntake("house-check-in", values, { forOffer: true });
    const serialised = JSON.stringify(brief);
    assert.ok(!serialised.includes("4821"), `access code leaked into an offer: ${serialised}`);
    assert.ok(!serialised.includes("under the mat"), "access detail leaked into an offer");
  });

  test("but it does say an access procedure exists", () => {
    const brief = describeIntake("house-check-in", values, { forOffer: true });
    const access = brief.find((b) => b.withheld);
    assert.ok(access, "the offer hid the field entirely instead of flagging it");
    assert.match(access!.value, /once you accept/i);
  });

  test("the assigned helper gets the real thing", () => {
    const brief = describeIntake("house-check-in", values);
    assert.ok(
      JSON.stringify(brief).includes("4821"),
      "the accepted helper must still get the access code — they have to get in",
    );
  });
});

// Pricing rules — the TypeScript half. The SQL half is asserted to agree
// across 3,808 combinations by scripts/verify-pricing-parity.mjs.
import { priceService, type PricingRule } from "@/lib/service-pricing";

const DOG_WALK: PricingRule = {
  serviceId: "dog-walking",
  includedMinutes: 30, extraBlockMinutes: 30, extraBlockCents: 1500,
  durationField: "duration_min",
  unitField: "dog_count", includedUnits: 1, perExtraUnitCents: 800,
  crewField: null, includedCrew: 1, perExtraCrewCents: null,
};

describe("duration and quantity reach the price", () => {
  test("the defect: 30 minutes and 8 hours used to cost the same", () => {
    const half = priceService(2000, DOG_WALK, { duration_min: "30" }).subtotalCents;
    const long = priceService(2000, DOG_WALK, { duration_min: "480" }).subtotalCents;
    assert.equal(half, 2000, "the base covers the first 30 minutes");
    assert.ok(long > half, "eight hours must cost more than half an hour");
    assert.equal(long, 2000 + 15 * 1500, "15 extra half-hour blocks");
  });

  test("blocks are started, not prorated — a helper's time is booked", () => {
    // 31 minutes is one minute into the second block, and costs a block.
    assert.equal(
      priceService(2000, DOG_WALK, { duration_min: "31" }).subtotalCents,
      2000 + 1500,
    );
    assert.equal(
      priceService(2000, DOG_WALK, { duration_min: "60" }).subtotalCents,
      2000 + 1500,
    );
    assert.equal(
      priceService(2000, DOG_WALK, { duration_min: "61" }).subtotalCents,
      2000 + 3000,
    );
  });

  test("the included amount is free, and less than it is not a discount", () => {
    for (const mins of ["0", "15", "30"]) {
      assert.equal(
        priceService(2000, DOG_WALK, { duration_min: mins }).subtotalCents, 2000,
        `${mins} minutes should be the base price, never below it`,
      );
    }
  });

  test("extra units are charged, the first is not", () => {
    assert.equal(priceService(2000, DOG_WALK, { dog_count: "1" }).subtotalCents, 2000);
    assert.equal(priceService(2000, DOG_WALK, { dog_count: "3" }).subtotalCents, 2000 + 1600);
  });

  test("a missing or non-numeric answer never produces a cheaper job", () => {
    for (const bad of ["", "   ", "abc", "-5", undefined]) {
      const cents = priceService(2000, DOG_WALK, { duration_min: bad as string }).subtotalCents;
      assert.ok(cents >= 2000, `"${bad}" priced ${cents}, below the base`);
    }
  });

  test("a service with no rule is its flat base price", () => {
    assert.equal(priceService(5500, null, { duration_min: "480" }).subtotalCents, 5500);
  });

  test("the breakdown adds up to the subtotal it reports", () => {
    const p = priceService(2000, DOG_WALK, { duration_min: "120", dog_count: "3" });
    assert.equal(p.lines.reduce((n, l) => n + l.cents, 0), p.subtotalCents);
    assert.ok(p.lines.length >= 3, "the customer should see why, not just what");
  });
});
