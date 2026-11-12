"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient, createSupabaseServiceClient } from "@/lib/supabase/server";
import { voidBookingAuthorization, captureBookingPayment, chargeTip } from "@/lib/payments";
import { performCancellation, previewCancellation } from "@/lib/cancel-booking";
import { stripeConfigured } from "@/lib/stripe";
import { validateHandover, isHandoverEmpty } from "@/lib/handover";

export async function cancelRequestAction(requestId: string) {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("cancel_request", { p_request_id: requestId });
  if (error) return { error: error.message };
  revalidatePath("/bookings");
  revalidatePath("/dashboard");
  revalidatePath("/admin/bookings");
  return { success: "Cancelled." };
}

// Add a tip to a completed booking. 100% goes to the helper — Helpward
// takes no cut.
//
// Charge first, record second. The previous order recorded the tip through
// an RPC the customer could call directly, so `authenticated` could raise
// its own helper's payout_cents without any money moving; 0043 revoked
// that EXECUTE and set_booking_tip is now service-role only.
//
// A charged tip is final. Editing one used to raise a NEW intent for the
// full new amount while replacing the stored value, so $5 changed to $10
// collected $15 and recorded $10, and removing a tip wrote zero and
// refunded nothing. Rather than build a reversal ledger for a $5 edit, the
// amount is committed once and the UI says so.
export async function setTipAction(bookingId: string, tipDollars: number) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not logged in." };

  if (!Number.isFinite(tipDollars) || tipDollars <= 0) {
    return { error: "Enter a tip amount." };
  }
  if (tipDollars > 500) {
    return { error: "Tip is capped at $500. Email billing@helpward.com to send more." };
  }
  if (!stripeConfigured()) return { error: "Tipping is not available yet." };

  // Ownership is checked here, as the signed-in customer, because the
  // recording function now runs as the service role and cannot see who
  // asked. RLS restricts this read to the customer's own bookings.
  const { data: booking } = await supabase
    .from("bookings")
    .select("id, customer_id, status, payment_status, tip_charged_at")
    .eq("id", bookingId)
    .maybeSingle();

  if (!booking) return { error: "Booking not found." };
  if (booking.customer_id !== user.id) return { error: "Only the customer can add a tip." };
  if (booking.status !== "completed") return { error: "You can only tip a completed booking." };
  if (booking.payment_status !== "captured") {
    return { error: "This booking has not been paid for yet." };
  }
  if (booking.tip_charged_at) {
    return { error: "A tip has already been sent for this booking." };
  }

  const tipCents = Math.round(tipDollars * 100);

  // The money moves first. Only a successful charge produces a recorded
  // tip, so there is no state in which the helper is shown earnings that
  // were never collected.
  const charged = await chargeTip(bookingId, tipCents);
  if (!charged.ok) return { error: `The tip could not be charged: ${charged.message}` };

  const admin = createSupabaseServiceClient();
  const { error } = await admin.rpc("set_booking_tip", {
    p_booking_id: bookingId,
    p_tip_cents: tipCents,
    p_payment_intent_id: charged.paymentIntentId,
  });
  if (error) {
    // Charged but not recorded. The customer's money has moved, so this
    // must never look like a failed tip they might retry.
    console.error("TIP CHARGED BUT NOT RECORDED", {
      bookingId, tipCents, intent: charged.paymentIntentId, error,
    });
    return {
      success: `Tip of $${tipDollars.toFixed(2)} sent.`,
      warning: "It may take a moment to appear on this page.",
    };
  }

  revalidatePath(`/bookings/${bookingId}`);
  revalidatePath("/bookings");
  return { success: `Tip of $${tipDollars.toFixed(2)} sent to your helper.` };
}

/*
  WHAT CANCELLING WILL COST, BEFORE IT IS CANCELLED.

  The customer is shown this and has to accept it. It is computed on
  the server from the booking's own figures — a fee the browser worked
  out is a fee the browser can change.
*/
export async function previewCancellationAction(bookingId: string) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in to cancel a booking." };

  /* The database resolves who is asking from their own token and
     answers for THAT person — a helper previewing their own
     cancellation is told it is free, not quoted the customer's fee. */
  const fee = await previewCancellation(supabase, bookingId);
  return { fee };
}

export async function cancelBookingAction(
  bookingId: string,
  reason?: string,
  /*
    WHAT THE CUSTOMER SAW AND AGREED TO. Checked against what the
    server computes at the moment of cancelling: if the two disagree —
    because the job started, or the price moved — the cancellation is
    refused and they are shown the new figure rather than charged an
    amount they never accepted.
  */
  acceptedFeeCents?: number,
) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in to cancel a booking." };

  /* One implementation, shared with the app's cancellation endpoint —
     a second copy of money-moving logic is a second place for the
     policy to drift. */
  const outcome = await performCancellation({
    supabase, bookingId, actorId: user.id, reason, acceptedFeeCents,
  });

  if (outcome.needsAcceptance) {
    return { needsAcceptance: true, fee: outcome.fee, error: outcome.error };
  }
  if (outcome.error) return { error: outcome.error };

  const charged = outcome.chargedCents;
  const note = outcome.note;
  const fee = outcome.fee;

  revalidatePath("/bookings");
  revalidatePath(`/bookings/${bookingId}`);
  revalidatePath("/dashboard");
  revalidatePath("/admin/bookings");

  return {
    success: charged > 0
      ? `Cancelled. A cancellation fee of ${(charged / 100).toFixed(2)} was charged and the rest of the hold was released.`
      : "Cancelled.",
    warning: note,
  };
}

/*
  EDIT THE HANDOVER INSTRUCTIONS ON AN EXISTING BOOKING.

  SCOPE, and it is the whole point: this writes `handover_details` and
  `request_private_details` and NOTHING ELSE. It never touches the
  address, the stops, the duration, the quantities or the service — the
  four things that set the price. A customer who needs one of those
  changed is told how to arrange it rather than having their booking
  quietly altered underneath a quote that no longer matches it.

  The split is done again, server-side, by the same validator the
  original submission used. A client cannot promote a meeting point into
  the shareable half by sending it under a different key.
*/
export async function updateHandoverAction(
  bookingId: string,
  handover: Record<string, Record<string, string>>,
) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Please sign in." };

  // Read as the CALLER, so b_read decides whether this booking is theirs.
  // The service_id is needed to validate against the right question set.
  const { data: booking } = await supabase
    .from("bookings")
    .select("id, customer_id, service_id, status")
    .eq("id", bookingId)
    .maybeSingle();

  if (!booking) return { error: "We couldn't find that booking." };
  if (booking.customer_id !== user.id) {
    return { error: "Only the customer who made this booking can change its instructions." };
  }

  const check = validateHandover(booking.service_id ?? "", handover);
  if (!check.ok) return { error: check.error };
  const { shared, restricted } = check.split;

  /*
    ONE GUARDED WRITE, not three.

    The edit has to touch the booking, the request and the private
    details, and a customer cannot update `bookings` from the client —
    there is no such policy, and adding one would also let them set
    total_cents. `set_booking_handover` (0086) is SECURITY DEFINER, checks
    the caller is the customer, refuses a finished booking, writes the
    three rows and notifies the helper. It changes instructions and
    nothing else: no address, no stops, no duration, no quantities, no
    service, no money.

    Writing the booking row is also what refreshes the helper's screen —
    their active task subscribes to UPDATEs on their own bookings.
  */
  const { error } = await supabase.rpc("set_booking_handover", {
    p_booking_id: bookingId,
    p_shared: isHandoverEmpty(shared) ? null : shared,
    p_private: isHandoverEmpty(restricted) ? null : restricted,
  });

  if (error) {
    // The caller keeps the customer's draft; nothing here clears it.
    const friendly =
      error.message?.includes("has finished")
        ? "This booking has finished, so its instructions can't be changed."
        : error.message?.includes("Only the customer")
          ? "Only the customer who made this booking can change its instructions."
          : "Couldn't save those instructions. Please try again.";
    return { error: friendly };
  }

  revalidatePath(`/bookings/${bookingId}`);
  revalidatePath("/bookings");
  revalidatePath("/helper/active");
  return { success: "Instructions updated" };
}
