"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function cancelRequestAction(requestId: string) {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("cancel_request", { p_request_id: requestId });
  if (error) return { error: error.message };
  revalidatePath("/bookings");
  revalidatePath("/dashboard");
  revalidatePath("/admin/bookings");
  return { success: "Cancelled." };
}

// Add (or update) a tip on a completed booking. 100% of the tip flows to the
// helper — Helpward takes no cut. Capped at $500 to prevent fat-finger zeroes.
// Customer-only; helpers cannot tip themselves and admins go through the
// refund flow if they need to adjust.
export async function setTipAction(bookingId: string, tipDollars: number) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not logged in." };

  if (!Number.isFinite(tipDollars) || tipDollars < 0) return { error: "Tip must be a positive number." };
  if (tipDollars > 500) return { error: "Tip is capped at $500. Email billing@helpward.com to send more." };

  // RLS enforces customer-only update via the policy; we also pre-check here
  // so the user gets a useful error instead of a silent no-op row count.
  const { data: booking } = await supabase
    .from("bookings")
    .select("customer_id, status, tip_cents, base_price_cents, service_fee_cents, distance_cents, payout_cents")
    .eq("id", bookingId)
    .single();
  if (!booking) return { error: "Booking not found." };
  if (booking.customer_id !== user.id) return { error: "Only the customer can add a tip." };
  if (booking.status !== "completed") return { error: "You can only tip a completed booking." };

  const tipCents = Math.round(tipDollars * 100);
  // Tip is added to total (customer pays it) and to payout (helper receives 100%).
  const newTotal =
    (booking.base_price_cents ?? 0) + (booking.service_fee_cents ?? 0) +
    (booking.distance_cents ?? 0) + tipCents;
  const newPayout = (booking.payout_cents ?? 0) - (booking.tip_cents ?? 0) + tipCents;

  const { error } = await supabase
    .from("bookings")
    .update({ tip_cents: tipCents, total_cents: newTotal, payout_cents: newPayout })
    .eq("id", bookingId);
  if (error) return { error: error.message };

  revalidatePath(`/bookings/${bookingId}`);
  revalidatePath("/bookings");
  return { success: tipCents > 0 ? `Tip of $${tipDollars.toFixed(2)} added.` : "Tip removed." };
}

export async function cancelBookingAction(bookingId: string, reason?: string) {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("cancel_booking", {
    p_booking_id: bookingId,
    p_reason: reason ?? null,
  });
  if (error) return { error: error.message };
  revalidatePath("/bookings");
  revalidatePath(`/bookings/${bookingId}`);
  revalidatePath("/dashboard");
  revalidatePath("/admin/bookings");
  return { success: "Cancelled." };
}
