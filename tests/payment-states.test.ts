// The two payment defects independent testing found in the native
// bank-confirmation flow, locked down.

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  isTerminal,
  isRecoverableIntentStatus,
  needsFreshPaymentMethod,
} from "../lib/payment-states-pure.ts";

describe("a settled or closed booking is never reopened", () => {
  /*
    The reported regression: both confirmation endpoints turned a
    completed, fully refunded booking back into `authorized`. A refunded
    PaymentIntent still reads `succeeded` at Stripe, so the intent alone
    cannot be trusted to say whether a hold is outstanding.
  */
  test("refunded and partially refunded bookings are terminal", () => {
    assert.equal(isTerminal({ status: "completed", payment_status: "refunded" }), true);
    assert.equal(isTerminal({ status: "completed", payment_status: "partial_refund" }), true);
    assert.equal(isTerminal({ status: "completed", payment_status: "captured" }), true);
  });

  test("a closed booking is terminal whatever its payment says", () => {
    for (const status of ["completed", "cancelled", "disputed"]) {
      for (const payment of ["pending", "failed", "authorized"]) {
        assert.equal(
          isTerminal({ status, payment_status: payment }),
          true,
          `${status}/${payment} must not be confirmable`,
        );
      }
    }
  });

  test("a live booking awaiting its bank is NOT terminal", () => {
    // The whole point of the feature: these must still be confirmable.
    assert.equal(isTerminal({ status: "scheduled", payment_status: "pending" }), false);
    assert.equal(isTerminal({ status: "scheduled", payment_status: "failed" }), false);
    assert.equal(isTerminal({ status: "in_progress", payment_status: "pending" }), false);
  });

  test("missing fields are not treated as confirmable by accident", () => {
    // An unknown shape must not read as "live" — but it must not read as
    // terminal either, or a real pending booking with a null status would
    // silently stop being confirmable. Explicit about what it does.
    assert.equal(isTerminal({}), false);
    assert.equal(isTerminal({ status: null, payment_status: null }), false);
  });
});

describe("a failed bank challenge can be tried again", () => {
  /*
    The reported regression: after choosing FAIL on a real 3-D Secure
    challenge, every "Confirm with your bank" tap returned "this payment
    can't be confirmed — please contact support", and switching cards did
    not help. A failed challenge leaves the intent on
    requires_payment_method with payment_intent_authentication_failure,
    which the old check did not count as recoverable.
  */
  test("a challenge that was never attempted is recoverable", () => {
    assert.equal(isRecoverableIntentStatus("requires_action", "authentication_required"), true);
    assert.equal(isRecoverableIntentStatus("requires_confirmation", null), true);
  });

  test("a challenge the customer FAILED is recoverable", () => {
    assert.equal(
      isRecoverableIntentStatus("requires_payment_method", "payment_intent_authentication_failure"),
      true,
    );
  });

  test("a declined card is recoverable — with a different card", () => {
    for (const code of ["card_declined", "expired_card", "incorrect_cvc", "insufficient_funds"]) {
      assert.equal(isRecoverableIntentStatus("requires_payment_method", code), true, code);
    }
  });

  test("a spent or voided intent is not", () => {
    assert.equal(
      isRecoverableIntentStatus("requires_payment_method", "payment_intent_unexpected_state"),
      false,
    );
    assert.equal(isRecoverableIntentStatus("succeeded", null), false);
    assert.equal(isRecoverableIntentStatus("canceled", null), false);
    assert.equal(isRecoverableIntentStatus("requires_capture", null), false);
  });

  test("a retry uses a fresh card, never the one that just failed", () => {
    // Reusing the attached card is why switching to a working one changed
    // nothing for the tester.
    assert.equal(needsFreshPaymentMethod("requires_payment_method"), true);
    // But a challenge not yet attempted keeps the card it was set up with.
    assert.equal(needsFreshPaymentMethod("requires_action"), false);
    assert.equal(needsFreshPaymentMethod("requires_confirmation"), false);
  });
});
