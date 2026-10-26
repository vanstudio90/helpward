"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient, createSupabaseServiceClient } from "@/lib/supabase/server";
import { voidBookingAuthorization, chargeTip } from "@/lib/payments";
import { stripeConfigured } from "@/lib/stripe";

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

export async function cancelBookingAction(bookingId: string, reason?: string) {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("cancel_booking", {
    p_booking_id: bookingId,
    p_reason: reason ?? null,
  });
  if (error) return { error: error.message };

  // Release the hold rather than refunding it. A void never reaches the
  // customer's statement; a refund appears as a charge and then a credit
  // days later, which reads as being charged for a job that never happened.
  if (stripeConfigured()) {
    const released = await voidBookingAuthorization(bookingId);
    if (!released.ok && released.code !== "already_captured") {
      console.error("could not void authorization on cancel", bookingId, released);
    }
  }
  revalidatePath("/bookings");
  revalidatePath(`/bookings/${bookingId}`);
  revalidatePath("/dashboard");
  revalidatePath("/admin/bookings");
  return { success: "Cancelled." };
}
