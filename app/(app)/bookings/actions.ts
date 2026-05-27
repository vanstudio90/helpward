"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function cancelRequestAction(requestId: string) {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("cancel_request", { p_request_id: requestId });
  if (error) return { error: error.message };
  revalidatePath("/bookings");
  revalidatePath("/dashboard");
  return { success: "Cancelled." };
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
  return { success: "Cancelled." };
}
