import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { voidBookingAuthorization, captureBookingPayment } from "@/lib/payments";
import { stripeConfigured } from "@/lib/stripe";
import { cancellationFeeFor, type CancellationFee } from "@/lib/cancellation";
import { refundCapturedRemainder } from "@/lib/cancellation-refund";

/*
  CANCELLING A BOOKING, ONCE, FOR BOTH THE WEBSITE AND THE APP.

  Two surfaces cancel bookings and they used to do it differently: the
  website released the hold, the app released the hold and reported a
  fee of zero — with a comment noting that the help article already
  promised "a small cancellation fee may apply". The article and the
  system disagreed, and the system is what the customer's card follows.

  Now there is one implementation. A second copy of money-moving logic
  is a second place for the policy to drift, and drift here is a
  customer charged an amount the other screen said was free.

  THE ORDER MATTERS AND IT IS DELIBERATE:

    1. work out the fee from the booking as it is NOW;
    2. refuse unless the customer has accepted that exact figure;
    3. cancel the booking;
    4. then move money.

  Cancelling before charging means the worst failure is a cancelled
  booking with no fee taken — which costs Helpward. The other order
  risks charging for a job that is still going ahead, which costs the
  customer, and that is not a trade worth making.
*/

export type CancellationOutcome = {
  cancelled: boolean;
  /** Charged as a cancellation fee, in cents. */
  chargedCents: number;
  /** Released back to the customer's available balance, in cents. */
  holdReleasedCents: number;
  fee: CancellationFee;
  /** Anything the customer has to be told that is not the happy path. */
  note?: string;
  error?: string;
  /** Set when the fee changed and must be shown again before proceeding. */
  needsAcceptance?: boolean;
};

export async function performCancellation(input: {
  supabase: SupabaseClient;
  bookingId: string;
  actorId: string;
  reason?: string | null;
  /** What the customer was shown and agreed to. */
  acceptedFeeCents?: number;
}): Promise<CancellationOutcome> {
  const { supabase, bookingId, actorId } = input;

  const { data } = await supabase
    .from("bookings")
    .select("id, status, total_cents, captured_at, created_at, currency, customer_id, payment_status")
    .eq("id", bookingId)
    .maybeSingle();

  const booking = data as unknown as {
    status: string; total_cents: number | null; captured_at: string | null;
    created_at: string | null; currency: string | null;
    customer_id: string | null; payment_status: string;
  } | null;

  const empty: CancellationFee = {
    cents: 0, rate: 0, alreadyCharged: false,
    explanation: "", because: "",
  };

  if (!booking) {
    return { cancelled: false, chargedCents: 0, holdReleasedCents: 0, fee: empty, error: "Booking not found." };
  }

  const fee = cancellationFeeFor(booking, booking.currency ?? "CAD");

  /*
    THE CUSTOMER HAS TO HAVE SEEN THE NUMBER. Not "a fee applies" —
    this number, in money. If what they accepted no longer matches
    what the booking says, they are shown the new figure instead of
    being charged one they never agreed to.
  */
  if (fee.cents > 0) {
    if (input.acceptedFeeCents === undefined) {
      return {
        cancelled: false, chargedCents: 0, holdReleasedCents: 0, fee,
        needsAcceptance: true,
      };
    }
    if (input.acceptedFeeCents !== fee.cents) {
      return {
        cancelled: false, chargedCents: 0, holdReleasedCents: 0, fee,
        needsAcceptance: true,
        error: "The cancellation fee has changed since it was shown to you. Please check the new amount.",
      };
    }
  }

  /* Run as the CALLER: cancel_booking checks auth.uid() against the
     booking's customer, provider or an admin role itself. */
  const { error } = await supabase.rpc("cancel_booking", {
    p_booking_id: bookingId,
    p_reason: input.reason ?? null,
  });
  if (error) {
    return { cancelled: false, chargedCents: 0, holdReleasedCents: 0, fee, error: error.message };
  }

  let charged = 0;
  let released = 0;
  let note: string | undefined;

  if (stripeConfigured()) {
    if (fee.alreadyCharged) {
      /* No hold is left to release — the money is taken. The fee is
         kept and the balance goes back automatically. */
      const back = (booking.total_cents ?? 0) - fee.cents;
      const refund = await refundCapturedRemainder(bookingId, back);
      note = refund.note;
      charged = fee.cents;
    } else if (fee.cents > 0) {
      /*
        ONE CALL. Capturing the fee releases the remainder of the hold
        at the same moment, so there is no instant at which the
        customer has been charged the full amount.
      */
      const captured = await captureBookingPayment(bookingId, fee.cents);
      if (captured.ok) {
        charged = fee.cents;
        released = Math.max(0, (booking.total_cents ?? 0) - fee.cents);
      } else {
        console.error("cancellation fee not captured", bookingId, captured);
        note = "We could not take the cancellation fee, so nothing has been charged.";
      }
    } else {
      const result = await voidBookingAuthorization(bookingId);
      if (result.ok) {
        released = booking.payment_status === "authorized" ? (booking.total_cents ?? 0) : 0;
      } else if (result.code === "already_captured") {
        /*
          THE JOB COMPLETED BETWEEN THE CUSTOMER PRESSING CANCEL AND
          THIS LINE. Their money is taken. Both surfaces used to
          swallow this exact case — Stripe even says "refund it
          instead" — and the customer was left charged for a cancelled
          booking with nothing recording it.
        */
        const refund = await refundCapturedRemainder(bookingId, booking.total_cents ?? 0);
        note = refund.note;
      } else {
        console.error("could not void authorization on cancel", bookingId, result);
        note = "The hold could not be released automatically. Our team has been alerted.";
      }
    }
  }

  if (charged > 0) {
    /* Written with the service key: the customer may not update their
       own booking, and this is a record about them rather than by them. */
    const admin = createSupabaseServiceClient();
    const { error: recordError } = await admin.rpc("record_cancellation_fee", {
      p_booking: bookingId,
      p_fee_cents: charged,
      p_rate: fee.rate,
      p_accepted_cents: input.acceptedFeeCents ?? charged,
      p_actor: actorId,
    });
    if (recordError) {
      /* The money moved and the record did not. Loud, because the
         charge is now harder to explain than it should be. */
      console.error("CANCELLATION FEE CHARGED BUT NOT RECORDED", {
        bookingId, charged, recordError,
      });
    }
  }

  return { cancelled: true, chargedCents: charged, holdReleasedCents: released, fee, note };
}
