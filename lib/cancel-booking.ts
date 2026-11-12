import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { captureBookingPayment, voidBookingAuthorization } from "@/lib/payments";
import { stripeConfigured } from "@/lib/stripe";
import { describeCancellationFee, type CancellationFee } from "@/lib/cancellation";

/*
  CANCELLING A BOOKING, ONCE, FOR THE WEBSITE AND THE APP.

  THE POLICY IS NOT HERE. Status, who is cancelling, what it costs and
  whether the customer agreed to that are all settled by
  cancel_booking_with_fee, inside the row lock that decides the race
  with completion. Working the fee out here was how a helper
  abandoning a job came to charge the customer 10%: this file could
  see the booking but not who was asking.

  What is left here is the money, which cannot be done in SQL: capture
  the fee, or release the hold, and then report honestly what actually
  happened.

  THE ORDER IS STILL DELIBERATE. The booking is cancelled first; only
  then is anything taken. The worst case that way is a cancelled
  booking and no fee, which costs Helpward. The other way round risks
  charging for a job still going ahead, which costs the customer.
*/

export type CancellationOutcome = {
  cancelled: boolean;
  /** What was actually taken, as the processor reported it. */
  chargedCents: number;
  /** Released back to the customer's available balance. */
  holdReleasedCents: number;
  fee: CancellationFee;
  cancelledBy?: "customer" | "helper" | "admin";
  note?: string;
  error?: string;
  /** The fee has to be shown and accepted before this can proceed. */
  needsAcceptance?: boolean;
};

type CancelDecision = {
  cancelled_by: "customer" | "helper" | "admin";
  fee_cents: number;
  fee_reason: string;
  rate: number;
  total_cents: number;
  currency: string | null;
  hold_exists: boolean;
};

export async function performCancellation(input: {
  supabase: SupabaseClient;
  bookingId: string;
  actorId: string;
  reason?: string | null;
  acceptedFeeCents?: number;
}): Promise<CancellationOutcome> {
  const { supabase, bookingId } = input;

  /*
    ONE CALL settles status, actor, policy and consent together. It
    runs as the CALLER, so the database decides who this is rather
    than believing what we pass it.
  */
  const { data, error } = await supabase.rpc("cancel_booking_with_fee", {
    p_booking: bookingId,
    p_reason: input.reason ?? null,
    p_accepted_fee_cents: input.acceptedFeeCents ?? null,
  });

  if (error) {
    /* HW152 is not a failure: the customer has simply not been shown
       the amount yet, or was shown a different one. */
    if (error.code === "HW152") {
      const preview = await previewCancellation(supabase, bookingId);
      return {
        cancelled: false, chargedCents: 0, holdReleasedCents: 0,
        fee: preview,
        needsAcceptance: true,
        error: input.acceptedFeeCents === undefined ? undefined
          : "The cancellation fee has changed since it was shown to you. Please check the new amount.",
      };
    }
    return {
      cancelled: false, chargedCents: 0, holdReleasedCents: 0,
      fee: describeCancellationFee({ cents: 0, rate: 0, reason: "error" }),
      error: error.message,
    };
  }

  const decision = data as CancelDecision;
  const fee = describeCancellationFee({
    cents: decision.fee_cents, rate: decision.rate,
    reason: decision.fee_reason, total_cents: decision.total_cents,
  }, decision.currency ?? "CAD");

  let charged = 0;
  let released = 0;
  let note: string | undefined;

  if (stripeConfigured()) {
    if (decision.fee_cents > 0) {
      const captured = await captureBookingPayment(bookingId, decision.fee_cents);

      if (captured.ok) {
        /*
          WHAT THE PROCESSOR ACTUALLY TOOK, not what we asked for.

          captureBookingPayment returns the FULL booking amount when it
          finds the booking already captured, and this used to report
          the requested fee regardless — so a booking charged in full
          was announced to the customer as a CA$22.45 fee with
          CA$202.05 released, when nothing had been released and they
          had paid for everything.
        */
        charged = captured.capturedCents;
        released = Math.max(0, decision.total_cents - charged);

        if (charged > decision.fee_cents) {
          /* More was taken than the fee. Recover the difference
             through a refund request rather than leaving it. */
          const over = charged - decision.fee_cents;
          const admin = createSupabaseServiceClient();
          const { error: refundError } = await admin.rpc("system_cancellation_refund", {
            p_booking: bookingId,
            p_amount_cents: over,
            p_note: `Cancellation captured ${charged} cents when the fee was ${decision.fee_cents}. Raised automatically to return the difference.`,
          });
          if (refundError) {
            console.error("OVER-CAPTURED ON CANCELLATION AND COULD NOT RAISE THE REFUND", {
              bookingId, charged, fee: decision.fee_cents, refundError,
            });
          }
          note = "More than the cancellation fee was taken. A refund of the difference has been raised and our team is completing it.";
        }
      } else {
        /*
          A FAILED CALL IS NOT PROOF THAT NOTHING HAPPENED. A dropped
          connection cannot establish that the card was untouched, and
          this used to tell the customer "nothing has been charged" on
          any failure at all.
        */
        console.error("cancellation fee capture did not succeed", bookingId, captured);
        note = captured.code === "card_declined" || captured.code === "bad_amount"
          ? "The cancellation fee could not be taken, so nothing has been charged."
          : "We could not confirm whether the cancellation fee was taken. Our team is checking it and you will not be charged twice.";
      }
    } else {
      const result = await voidBookingAuthorization(bookingId);
      if (result.ok) {
        released = decision.hold_exists ? decision.total_cents : 0;
      } else if (result.code === "already_captured") {
        /*
          Unreachable through the front door — the database refuses to
          cancel a captured booking — so reaching it means something
          captured outside that lock. Loud, and recovered.
        */
        console.error("CANCELLED BOOKING WAS ALREADY CAPTURED", { bookingId });
        const admin = createSupabaseServiceClient();
        await admin.rpc("system_cancellation_refund", {
          p_booking: bookingId,
          p_amount_cents: decision.total_cents,
          p_note: "The booking was captured despite being cancelled. Raised automatically to return it.",
        });
        note = "This booking had already been charged. A full refund has been raised and our team is completing it.";
      } else {
        console.error("could not void authorization on cancel", bookingId, result);
        note = "The hold could not be released automatically. Our team has been alerted.";
      }
    }
  }

  if (charged > 0) {
    const admin = createSupabaseServiceClient();
    const { error: recordError } = await admin.rpc("record_cancellation_fee", {
      p_booking: bookingId,
      p_fee_cents: charged,
      p_rate: decision.rate,
      p_accepted_cents: input.acceptedFeeCents ?? decision.fee_cents,
      p_actor: input.actorId,
    });
    if (recordError) {
      console.error("CANCELLATION FEE CHARGED BUT NOT RECORDED", {
        bookingId, charged, recordError,
      });
    }
  }

  return {
    cancelled: true,
    chargedCents: charged,
    holdReleasedCents: released,
    fee,
    cancelledBy: decision.cancelled_by,
    note,
  };
}

/**
 * What cancelling would cost, for the person asking.
 *
 * The actor is resolved by the database from the caller's own token,
 * so a helper previewing their own cancellation is correctly told it
 * is free rather than being quoted the customer's fee.
 */
export async function previewCancellation(
  supabase: SupabaseClient,
  bookingId: string,
): Promise<CancellationFee> {
  /*
    THE DATABASE WORKS OUT WHO IS ASKING. It used to take the actor as
    an argument, resolved here — which meant anybody could ask what a
    stranger's booking would cost "as the customer" and be told the
    fee and the total. It reads the caller's own token now, and
    answers nothing to somebody with no part in the booking.
  */
  const { data, error } = await supabase.rpc("cancellation_fee_for", {
    p_booking: bookingId,
  });
  if (error) {
    return describeCancellationFee({ cents: 0, rate: 0, reason: "error" });
  }

  const decision = data as {
    cents: number; rate: number; reason: string; total_cents?: number;
  };

  /* The currency is only needed to format what is already decided. */
  const { data: booking } = await supabase
    .from("bookings").select("currency").eq("id", bookingId).maybeSingle();

  return describeCancellationFee(
    decision,
    (booking as { currency: string | null } | null)?.currency ?? "CAD",
  );
}
