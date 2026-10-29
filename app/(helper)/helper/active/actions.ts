"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { voidBookingAuthorization, captureBookingPayment, payCrew } from "@/lib/payments";
import { stripeConfigured } from "@/lib/stripe";

export async function setOnlineAction(isOnline: boolean) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not logged in." };

  // Going online used to seed current_location with a hardcoded downtown
  // Vancouver point "so matching works pre-GPS". That placed every helper
  // in Vancouver regardless of where they actually were — the helper-side
  // twin of the address placeholder bug. There is no seed any more: a
  // helper's location comes from real GPS pings (lib/gps/ping.ts) or they
  // are simply not dispatchable yet.
  const { error } = await supabase.rpc("set_online", { p_online: isOnline });

  if (error) return { error: error.message };

  revalidatePath("/helper", "layout");
  if (!isOnline) return { success: "You're offline." };

  // Tell the helper the truth about whether they can actually receive work.
  const { data: pp } = await supabase
    .from("provider_profiles")
    .select("current_location, location_updated_at, status")
    .eq("user_id", user.id)
    .maybeSingle();

  if (pp?.status !== "approved") {
    return { success: "You're online — but your account is still awaiting approval, so tasks won't reach you yet." };
  }
  if (!pp?.current_location || !pp?.location_updated_at) {
    return { success: "You're online. Allow location access so nearby tasks can reach you." };
  }
  return { success: "You're online." };
}

export async function startBookingAction(bookingId: string) {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("start_booking", { p_booking_id: bookingId });
  if (error) return { error: error.message };
  revalidatePath("/helper/active");
  return { success: "Started." };
}

export async function completeBookingAction(bookingId: string, outcome?: string) {
  const supabase = await createSupabaseServerClient();

  // complete_booking returns the settlement its outcome requires —
  // "capture" or "release" — rather than this action deciding. The rule
  // lives with the outcome, in one place, so the helper's app and any
  // admin tool cannot drift apart on what a given ending costs.
  const { data: settlement, error } = await supabase.rpc("complete_booking", {
    p_booking_id: bookingId,
    p_outcome: outcome ?? null,
  });
  if (error) return { error: error.message };

  // A venue that refused a stand-in means no valid waiting was possible.
  // The customer must not pay for that, so the authorization is released
  // rather than captured. The helper's travel is a real cost and is NOT
  // settled here: Helpward has no disclosed travel-compensation policy,
  // and inventing a charge for one would be worse than leaving it visible.
  if (settlement === "release") {
    if (stripeConfigured()) {
      const voided = await voidBookingAuthorization(bookingId);
      if (!voided.ok) {
        console.error("could not release hold for refused venue", bookingId, voided);
        revalidatePath("/helper", "layout");
        return {
          success: "Recorded.",
          warning:
            "Recorded that the venue refused. The hold on the customer's card is still "
            + "releasing — support has been notified if it does not clear.",
        };
      }
    }
    revalidatePath("/helper", "layout");
    return {
      success: "Recorded — the venue refused a stand-in, so your customer hasn't been charged.",
    };
  }

  // Settle the hold placed at acceptance. The job is done either way, so a
  // capture failure must not un-complete it — the helper has already
  // worked. It is recorded on the booking (payment_error) and surfaced to
  // admin instead, which is a collections problem, not a dispatch one.
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
      revalidatePath("/helper", "layout");
      return {
        success: "Completed.",
        warning:
          "The job is marked complete. Payment is still settling — support has been notified if it does not clear.",
      };
    }
  }

  revalidatePath("/helper", "layout");
  return { success: "Completed." };
}
