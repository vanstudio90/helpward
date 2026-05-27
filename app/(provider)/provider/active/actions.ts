"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function setOnlineAction(isOnline: boolean) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not logged in." };

  // If going online and no current_location, seed a default (Vancouver downtown)
  // so matching works pre-GPS. Real GPS pings land in Phase 5.
  const { data: pp } = await supabase
    .from("provider_profiles")
    .select("current_location")
    .eq("user_id", user.id)
    .single();

  const updates: Record<string, unknown> = { is_online: isOnline };
  if (isOnline && !pp?.current_location) {
    // Default to Vancouver downtown until real GPS lands
    updates.current_location = "POINT(-123.1207 49.2827)";
  }

  const { error } = await supabase
    .from("provider_profiles")
    .update(updates)
    .eq("user_id", user.id);

  if (error) return { error: error.message };
  revalidatePath("/provider", "layout");
  return { success: isOnline ? "You're online." : "You're offline." };
}

export async function startBookingAction(bookingId: string) {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("start_booking", { p_booking_id: bookingId });
  if (error) return { error: error.message };
  revalidatePath("/provider/active");
  return { success: "Started." };
}

export async function completeBookingAction(bookingId: string) {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("complete_booking", { p_booking_id: bookingId });
  if (error) return { error: error.message };
  revalidatePath("/provider", "layout");
  return { success: "Completed." };
}
