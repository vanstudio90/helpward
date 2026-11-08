import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import {
  authorizeBookingPayment, captureBookingPayment, voidBookingAuthorization, payCrew,
} from "@/lib/payments";
import { stripeConfigured } from "@/lib/stripe";

/*
  WHAT ACCEPTING AND COMPLETING A JOB ACTUALLY MEAN.

  Both are an RPC plus money, and the money is the reason this file
  exists rather than the app calling the RPC itself.

  accept_request is granted to `authenticated`, so a phone COULD call it
  directly — and would then hold a booking nobody has authorised a card
  for. The helper travels, the job completes, and the capture finds no
  payment intent. Completing is the same shape in reverse: the hold has
  to be captured or voided according to what complete_booking returns,
  and a crew has to be paid out separately because a destination charge
  has exactly one destination.

  None of that can happen on a device: it needs the Stripe secret key.

  So it lives here, once, and both callers delegate — the web's server
  actions and /api/v1/helper/*. The alternative is two implementations
  of the same settlement rules, which is how this codebase ended up with
  three definitions of helper readiness that disagreed.

  Everything here takes the CALLER'S Supabase client, not a service
  client, because accept_request checks auth.uid() against the provider
  it is accepting for. Passing a service client would make the guard
  pass vacuously.
*/

export type AcceptOutcome =
  | { ok: true; bookingId: string }
  /**
   * Accepted, but the bank wants the customer present. The booking is
   * KEPT: they have a usable card and a route to confirm it.
   */
  | { ok: true; bookingId: string; needsCustomerConfirmation: true; message: string }
  | { ok: false; error: string; requeued?: boolean };

/**
 * Take a job that was offered to you.
 *
 * The hold is placed AFTER the RPC because the total and the helper are
 * not known until the booking row exists — so there is a window where
 * the job is accepted and unpaid. If authorisation fails the acceptance
 * comes back out, because dispatching a helper to a job that cannot be
 * paid for is worse than telling someone their card was declined.
 */
export async function acceptRequestForHelper(
  supabase: SupabaseClient,
  requestId: string,
  providerId: string,
): Promise<AcceptOutcome> {
  const { data: bookingId, error } = await supabase.rpc("accept_request", {
    p_request_id: requestId,
    p_provider_id: providerId,
  });

  if (error) return { ok: false, error: error.message };
  if (!bookingId) return { ok: false, error: "The request could not be accepted." };

  const id = bookingId as string;
  if (!stripeConfigured()) return { ok: true, bookingId: id };

  const payment = await authorizeBookingPayment(id);

  /*
    ok but not held. Two routes arrive here: Stripe may return a
    requires_action intent, or — for a card that always challenges — it
    raises a card error with code authentication_required and the intent
    attached. authorizeBookingPayment normalises both into this flag;
    the second used to read as a plain decline and cancelled the booking.
  */
  if (payment.ok && payment.requiresAction) {
    const admin = createSupabaseServiceClient();
    const { data: booking } = await admin
      .from("bookings").select("customer_id").eq("id", id).single();
    await admin.from("notifications").insert({
      user_id: booking?.customer_id,
      type: "payment_needs_confirmation",
      payload: { booking_id: id },
    });
    return {
      ok: true,
      bookingId: id,
      needsCustomerConfirmation: true,
      message:
        "Accepted, but the customer's bank needs them to confirm the payment. "
        + "You'll be able to start once they do — we've asked them.",
    };
  }

  if (!payment.ok) {
    /*
      A helper-side problem (payouts not set up) is fixable by a
      different helper, so the job goes back out. A card problem is not
      — every helper would hit the same decline — so the request is
      cancelled and the customer is told.
    */
    const requeue = payment.code === "helper_not_payable";
    const admin = createSupabaseServiceClient();
    const { error: releaseError } = await admin.rpc("release_unpaid_booking", {
      p_booking_id: id,
      p_reason: `Payment could not be authorized: ${payment.message}`,
      p_requeue: requeue,
    });
    if (releaseError) {
      // The booking is accepted and unpayable and we could not undo it.
      // Loud, because it needs a human: the helper may be on their way.
      console.error(
        "STRANDED BOOKING: authorization failed and release failed",
        { bookingId: id, payment, releaseError },
      );
    }
    return {
      ok: false,
      requeued: requeue,
      error: requeue
        ? "Finish setting up payouts before accepting jobs. This one has gone back out to other helpers."
        : `This job could not be paid for: ${payment.message}`,
    };
  }

  return { ok: true, bookingId: id };
}

export type CompleteOutcome =
  | { ok: true; settlement: "capture" | "release"; message: string; warning?: string }
  | { ok: false; error: string };

/**
 * Finish a job, and settle the hold the way the outcome requires.
 *
 * complete_booking returns "capture" or "release" rather than this
 * deciding, so the rule lives with the outcome in one place and the
 * helper's app and any admin tool cannot drift on what a given ending
 * costs.
 */
export async function completeBookingForHelper(
  supabase: SupabaseClient,
  bookingId: string,
  outcome?: string | null,
): Promise<CompleteOutcome> {
  const { data: settlement, error } = await supabase.rpc("complete_booking", {
    p_booking_id: bookingId,
    p_outcome: outcome ?? null,
  });
  if (error) return { ok: false, error: error.message };

  /*
    A venue that refused a stand-in means no valid waiting was possible.
    The customer must not pay for that, so the authorisation is released
    rather than captured. The helper's travel is a real cost and is NOT
    settled here: Helpward has no disclosed travel-compensation policy,
    and inventing a charge for one would be worse than leaving it
    visible.
  */
  if (settlement === "release") {
    if (stripeConfigured()) {
      const voided = await voidBookingAuthorization(bookingId);
      if (!voided.ok) {
        console.error("could not release hold for refused venue", bookingId, voided);
        return {
          ok: true,
          settlement: "release",
          message: "Recorded.",
          warning:
            "Recorded that the venue refused. The hold on the customer's card is still "
            + "releasing — support has been notified if it does not clear.",
        };
      }
    }
    return {
      ok: true,
      settlement: "release",
      message: "Recorded — the venue refused a stand-in, so your customer hasn't been charged.",
    };
  }

  /*
    Settle the hold placed at acceptance. The job is done either way, so
    a capture failure must not un-complete it — the helper has already
    worked. It is recorded on the booking (payment_error) and surfaced
    to admin instead, which is a collections problem, not a dispatch one.
  */
  if (stripeConfigured()) {
    const captured = await captureBookingPayment(bookingId);

    // Capture sends the whole payout to the LEAD's account, because a
    // destination charge has one destination. Everyone else on the crew
    // is paid by a separate transfer.
    if (captured.ok) {
      const crew = await payCrew(bookingId);
      if (crew.ok && crew.failures.length > 0) {
        console.error("crew members unpaid after capture", bookingId, crew.failures);
      }
    }

    if (!captured.ok) {
      console.error("capture failed for completed booking", bookingId, captured);
      return {
        ok: true,
        settlement: "capture",
        message: "Completed.",
        warning:
          "The job is marked complete. Payment is still settling — support has been "
          + "notified if it does not clear.",
      };
    }
  }

  return { ok: true, settlement: "capture", message: "Completed." };
}
