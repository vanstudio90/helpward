"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
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

// Add (or update) a tip on a completed booking. 100% of the tip flows to the
// helper — Helpward takes no cut. Capped at $500 to prevent fat-finger zeroes.
//
// The tip is the one amount that moves payout_cents after acceptance, so it
// is applied by set_booking_tip() rather than written here. This action
// used to UPDATE tip_cents, total_cents and payout_cents directly: the
// arithmetic was correct, but `authenticated` held table-level UPDATE on
// bookings, so any customer could PostgREST their own booking and set
// payout_cents to whatever they liked. 0040 revoked that grant, and the
// function re-derives both totals from the booking's priced components.
export async function setTipAction(bookingId: string, tipDollars: number) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not logged in." };

  if (!Number.isFinite(tipDollars) || tipDollars < 0) return { error: "Tip must be a positive number." };
  if (tipDollars > 500) return { error: "Tip is capped at $500. Email billing@helpward.com to send more." };

  const tipCents = Math.round(tipDollars * 100);
  const { error } = await supabase.rpc("set_booking_tip", {
    p_booking_id: bookingId,
    p_tip_cents: tipCents,
  });
  if (error) return { error: error.message };

  // The tip is a second charge, not a larger capture: the original hold was
  // authorized before the tip existed, and a capture can never exceed the
  // amount authorized. 100% goes to the helper.
  if (stripeConfigured() && tipCents > 0) {
    const charged = await chargeTip(bookingId, tipCents);
    if (!charged.ok) {
      // Undo the recorded tip so the helper is not shown earnings that
      // were never collected.
      await supabase.rpc("set_booking_tip", { p_booking_id: bookingId, p_tip_cents: 0 });
      return { error: `The tip could not be charged: ${charged.message}` };
    }
  }

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
