"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type State = { error?: string } | undefined;

export async function submitReviewAction(
  bookingId: string,
  _prev: State,
  formData: FormData
): Promise<State> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not logged in." };

  const rating = Number(formData.get("rating"));
  const comment = String(formData.get("comment") ?? "").trim() || null;

  if (!rating || rating < 1 || rating > 5) {
    return { error: "Pick 1–5 stars." };
  }

  // Look up the booking to grab provider_id
  const { data: booking } = await supabase
    .from("bookings")
    .select("provider_id, status, customer_id")
    .eq("id", bookingId)
    .single();

  if (!booking) return { error: "Booking not found." };
  if (booking.customer_id !== user.id) return { error: "Not your booking." };
  if (booking.status !== "completed") return { error: "Can only rate completed bookings." };

  const { error } = await supabase
    .from("reviews")
    .insert({
      booking_id: bookingId,
      customer_id: user.id,
      provider_id: booking.provider_id,
      rating,
      comment,
      customer_visible: true,
    });

  if (error) return { error: error.message };

  revalidatePath("/bookings");
  revalidatePath("/dashboard");
  redirect("/bookings");
}
