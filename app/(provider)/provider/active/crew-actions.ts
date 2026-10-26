"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Join a crewed job you were invited to.
 *
 * The provider id is taken from the session, never from the caller:
 * accept_crew_invite checks it too, but an action that accepted an id
 * from the browser would let one helper commit another to a job.
 */
export async function acceptCrewInviteAction(bookingId: string) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not logged in." };

  const { error } = await supabase.rpc("accept_crew_invite", {
    p_booking_id: bookingId,
    p_provider_id: user.id,
  });
  if (error) return { error: error.message };

  revalidatePath("/provider/active");
  revalidatePath("/provider/inbox");
  return { success: "You're on the job." };
}

export async function markArrivedAction(bookingId: string) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not logged in." };

  const { error } = await supabase.rpc("mark_crew_arrived", {
    p_booking_id: bookingId,
    p_provider_id: user.id,
  });
  if (error) return { error: error.message };

  revalidatePath("/provider/active");
  return { success: "Marked as arrived." };
}
