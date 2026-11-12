/*
  WHAT IT COSTS TO CANCEL ONCE A HELPER HAS TAKEN THE JOB.

  Helpward holds the money at booking and only takes it when the work
  is done, so cancelling before that normally costs nothing — the hold
  is released and no charge ever lands. That stays true for everything
  this policy does not cover.

  THE ONE CASE IT DOES COVER: a helper has accepted the job. They have
  committed a slot and turned down other work for it, and until now a
  customer could take that away at no cost and at any notice. The fee
  is 10% of what the booking would have cost.

  THREE THINGS THIS FILE REFUSES TO DO:

  * CHARGE A FEE NOBODY AGREED TO. The amount is computed here, shown
    to the customer in money before they confirm, and checked again on
    the server against what they accepted. A fee the customer did not
    see is a chargeback with extra steps.

  * TAKE MORE THAN THE FEE. The hold covers the whole booking. Only
    the fee is captured; Stripe releases the rest in the same call, so
    there is no window where the customer has been charged in full.

  * KEEP THE WHOLE FEE. It is split by the booking's own commission,
    the same way the job would have been — the point of the fee is
    the helper's lost slot, so the helper's share of it reaches them.
*/

export const CANCELLATION_FEE_RATE = 0.10;

/*
  THE TERMS PROMISE THIS, SO THE CODE HAS TO KEEP IT.

  Before this policy existed, /terms said: "We don't charge one today,
  and we won't add one retrospectively to an existing booking", and
  again, "we will not introduce one retrospectively for a booking made
  without that fee being clearly disclosed."

  A booking made under those words was made on the understanding that
  cancelling was free. Charging it 10% now because the page has since
  changed would be exactly the thing we promised not to do — so a
  booking created before the fee was disclosed is free to cancel, for
  ever, whatever the pricing page says today.

  This date is when the disclosure went live on /pricing, /terms and
  the cancel screen. It is not a configuration knob: moving it
  backwards would break the same promise.
*/
export const CANCELLATION_FEE_DISCLOSED_FROM = Date.parse("2026-11-12T00:00:00Z");

export type CancellationFee = {
  /** What the customer will be charged, in cents. Zero means free. */
  cents: number;
  rate: number;
  /** One sentence, in money, for the customer to accept or decline. */
  explanation: string;
  /** Why it applies — or why it does not. */
  because: string;
  /** True when the money was already taken and this is a refund case. */
  alreadyCharged: boolean;
};

type BookingForFee = {
  status: string;
  total_cents: number | null;
  captured_at?: string | null;
  provider_id?: string | null;
  /** When the booking was made. A booking that predates the disclosure
      is free to cancel — see CANCELLATION_FEE_DISCLOSED_FROM. */
  created_at?: string | null;
};

const money = (cents: number, currency = "CAD") =>
  `${currency === "USD" ? "$" : "CA$"}${(cents / 100).toFixed(2)}`;

/**
 * The fee for cancelling this booking, right now.
 *
 * A booking only exists once a helper has accepted it, so the status
 * is what decides: `scheduled` and `in_progress` are a taken job,
 * everything else is either already finished or already cancelled and
 * cannot be cancelled again.
 */
export function cancellationFeeFor(
  booking: BookingForFee,
  currency = "CAD",
): CancellationFee {
  const total = booking.total_cents ?? 0;
  const taken = booking.status === "scheduled" || booking.status === "in_progress";

  if (!taken) {
    return {
      cents: 0, rate: 0, alreadyCharged: Boolean(booking.captured_at),
      explanation: "There is nothing to cancel.",
      because: `This booking is ${booking.status}.`,
    };
  }

  if (total <= 0) {
    return {
      cents: 0, rate: 0, alreadyCharged: false,
      explanation: "Cancelling this costs nothing.",
      because: "This booking has no charge against it.",
    };
  }

  /* The promise in /terms, kept. */
  const madeAt = booking.created_at ? Date.parse(booking.created_at) : NaN;
  if (Number.isFinite(madeAt) && madeAt < CANCELLATION_FEE_DISCLOSED_FROM) {
    return {
      cents: 0, rate: 0, alreadyCharged: Boolean(booking.captured_at),
      explanation: "Cancelling this costs nothing.",
      because: "This booking was made before cancellation fees existed, and we do not apply them to bookings taken under the old terms.",
    };
  }

  /*
    ROUNDED DOWN, deliberately. A half-cent in our favour on every
    cancellation is not worth the sentence it would take to explain.
  */
  const cents = Math.floor(total * CANCELLATION_FEE_RATE);

  if (booking.captured_at) {
    return {
      cents, rate: CANCELLATION_FEE_RATE, alreadyCharged: true,
      explanation: `You have already been charged ${money(total, currency)} for this booking. Cancelling now returns ${money(total - cents, currency)} and keeps a ${money(cents, currency)} cancellation fee.`,
      because: "A helper had taken this job and the payment had already been collected.",
    };
  }

  return {
    cents, rate: CANCELLATION_FEE_RATE, alreadyCharged: false,
    explanation: `A helper has already taken this job, so cancelling now costs ${money(cents, currency)} — 10% of the ${money(total, currency)} booking. The rest of the hold is released.`,
    because: "A helper accepted this job and set the time aside for it.",
  };
}
