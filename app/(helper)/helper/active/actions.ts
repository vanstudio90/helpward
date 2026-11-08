"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { completeBookingForHelper } from "@/lib/helper-jobs";

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

  /*
    The RPC, the capture-or-void decision and the crew payout live in
    lib/helper-jobs.ts, shared with /api/v1/helper so the app and the
    website cannot disagree about what a given ending costs.
  */
  const result = await completeBookingForHelper(supabase, bookingId, outcome);
  if (!result.ok) return { error: result.error };

  revalidatePath("/helper", "layout");
  return result.warning
    ? { success: result.message, warning: result.warning }
    : { success: result.message };
}
