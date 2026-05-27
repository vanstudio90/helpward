"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function acceptRequestAction(requestId: string) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not logged in." };

  const { data: bookingId, error } = await supabase.rpc("accept_request", {
    p_request_id: requestId,
    p_provider_id: user.id,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/provider/inbox");
  revalidatePath("/provider/active");
  redirect(`/provider/active`);
}

export async function declineRequestAction(requestId: string) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not logged in." };

  const { error } = await supabase.rpc("decline_request", {
    p_request_id: requestId,
    p_provider_id: user.id,
  });

  if (error) return { error: error.message };
  revalidatePath("/provider/inbox");
  return { success: "Declined." };
}
