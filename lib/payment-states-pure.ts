// Which payment states may still be moved, and which are finished with.
// Pure, and safe to import anywhere — lib/payments.ts needs Stripe and the
// service-role client, which is why this lives on its own and can be tested
// directly.

/*
  WHY THIS EXISTS.

  Refunding does NOT move the PaymentIntent back. A refunded charge still
  reads `succeeded` at Stripe, so any code that infers "there is a hold to
  record" from the intent alone will promote a completed, fully refunded
  booking to `authorized`. Independent testing found both confirmation
  endpoints doing exactly that: the refund at Stripe survived, and
  Helpward's own books went wrong.

  The intent is evidence about the MONEY. The booking row is the only
  thing that knows whether that money is still in play.
*/

/** Money that has already moved, in either direction. */
export const SETTLED_PAYMENT_STATES = ["captured", "refunded", "partial_refund"] as const;

/** A booking whose life is over, whatever its money did. */
export const CLOSED_BOOKING_STATES = ["completed", "cancelled", "disputed"] as const;

/** The only statuses a confirmation may write to. */
export const CONFIRMABLE_BOOKING_STATES = ["scheduled", "in_progress"] as const;

export type BookingLifecycle = {
  status?: string | null;
  payment_status?: string | null;
};

/**
 * True when nothing about this booking's payment may be changed by a
 * confirmation or a reconciliation.
 */
export function isTerminal(booking: BookingLifecycle): boolean {
  return (
    (SETTLED_PAYMENT_STATES as readonly string[]).includes(booking.payment_status ?? "") ||
    (CLOSED_BOOKING_STATES as readonly string[]).includes(booking.status ?? "")
  );
}

/*
  WHEN A FAILED AUTHORISATION CAN BE TRIED AGAIN.

  `requires_payment_method` is where Stripe parks an authorisation the
  customer has to have another go at, and the reason is in
  last_payment_error.code:

    authentication_required                — never attempted
    payment_intent_authentication_failure  — the customer FAILED or
                                             dismissed the 3-D Secure
                                             challenge
    card_declined / expired_card / …       — the bank refused this card

  Only the first was treated as recoverable, so a customer who failed a
  challenge — the ordinary way to reach this state — was told "this
  payment can't be confirmed, please contact support" on every retry, and
  switching cards changed nothing.

  All of these are recoverable by confirming again; the declines need a
  DIFFERENT card, which is why the caller re-resolves it rather than
  reusing whatever is attached.
*/
export const UNRECOVERABLE_FAILURE_CODES = ["payment_intent_unexpected_state"] as const;

export function isRecoverableIntentStatus(
  status: string,
  lastPaymentErrorCode?: string | null,
): boolean {
  if (status === "requires_action" || status === "requires_confirmation") return true;
  if (status !== "requires_payment_method") return false;
  return !(UNRECOVERABLE_FAILURE_CODES as readonly string[]).includes(lastPaymentErrorCode ?? "");
}

/**
 * True when the card on the intent is known not to work, so a retry must
 * use whatever the customer has chosen since rather than reusing it.
 */
export function needsFreshPaymentMethod(status: string): boolean {
  return status === "requires_payment_method";
}
