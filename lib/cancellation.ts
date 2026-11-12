/*
  WHAT CANCELLING COSTS, PUT INTO WORDS.

  THE POLICY IS NOT HERE ANY MORE. It lives in cancellation_fee_for()
  and cancel_booking_with_fee(), inside the row lock that decides
  whether the job was finished first and alongside the only place that
  knows who is actually asking. Deciding it in TypeScript from the
  booking alone is how a helper abandoning a job came to charge the
  customer 10%: this layer could see the booking and not the actor.

  What is left here is the sentence the customer reads. The numbers
  come from the database; this turns them into something a person can
  agree to — in money, with the reason, in their own currency.
*/

export const CANCELLATION_FEE_RATE = 0.10;

export type CancellationFee = {
  /** What the customer will be charged, in cents. Zero means free. */
  cents: number;
  rate: number;
  /** Why the database decided this. */
  reason: string;
  /** One sentence, in money, for the customer to accept or decline. */
  explanation: string;
  /** Why it applies — or why it does not. */
  because: string;
};

const money = (cents: number, currency = "CAD") =>
  `${currency === "USD" ? "$" : "CA$"}${(cents / 100).toFixed(2)}`;

/**
 * Turn the database's decision into what the customer is shown.
 *
 * Every branch names the reason, because "a fee applies" is not
 * something anybody can agree to or argue with.
 */
export function describeCancellationFee(
  decision: { cents: number; rate: number; reason: string; total_cents?: number },
  currency = "CAD",
): CancellationFee {
  const cents = decision.cents ?? 0;
  const total = decision.total_cents ?? 0;
  const base = { cents, rate: decision.rate ?? 0, reason: decision.reason };

  switch (decision.reason) {
    case "helper_accepted":
      return {
        ...base,
        explanation: `A helper has already taken this job, so cancelling now costs ${money(cents, currency)} — 10% of the ${money(total, currency)} booking. The rest of the hold is released.`,
        because: "A helper accepted this job and set the time aside for it.",
      };
    case "within_grace":
      return {
        ...base,
        explanation: "Cancelling this costs nothing.",
        because: "You are still within the few minutes after a helper accepted, so there is no charge.",
      };
    case "predates_policy":
      return {
        ...base,
        explanation: "Cancelling this costs nothing.",
        because: "This booking was made before cancellation fees existed, and we do not apply them to bookings taken under the old terms.",
      };
    case "not_the_customer":
      return {
        ...base,
        explanation: "Cancelling this costs nothing.",
        /* A helper walking away is a reliability matter, handled as
           one. It is never billed to the customer. */
        because: "Cancellation fees apply to the customer who booked, not to you.",
      };
    case "nothing_charged":
      return {
        ...base,
        explanation: "Cancelling this costs nothing.",
        because: "This booking has no charge against it.",
      };
    case "not_your_booking":
      return {
        ...base,
        explanation: "",
        because: "",
      };
    case "not_cancellable":
      return {
        ...base,
        explanation: "This booking can no longer be cancelled.",
        because: "It has already been completed or cancelled.",
      };
    default:
      return {
        ...base,
        explanation: cents > 0
          ? `Cancelling now costs ${money(cents, currency)}.`
          : "Cancelling this costs nothing.",
        because: "",
      };
  }
}
