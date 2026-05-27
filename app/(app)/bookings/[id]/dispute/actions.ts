"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient, createSupabaseServiceClient } from "@/lib/supabase/server";

type State = { error?: string } | undefined;

export async function openDisputeAction(
  bookingId: string,
  _prev: State,
  formData: FormData
): Promise<State> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not logged in." };

  const category = String(formData.get("category") ?? "");
  const description = String(formData.get("description") ?? "").trim();

  if (!["no_show", "quality", "damage", "billing", "safety", "other"].includes(category)) {
    return { error: "Pick a category." };
  }
  if (description.length < 20) {
    return { error: "Please give us at least a few sentences (20+ characters)." };
  }

  const { error } = await supabase.from("disputes").insert({
    booking_id: bookingId,
    opened_by: user.id,
    category,
    description,
    status: "open",
  });
  if (error) return { error: error.message };

  // Notify admins (use service role to insert notifications regardless of who they are)
  const admin = createSupabaseServiceClient();
  const { data: admins } = await admin.from("profiles").select("id").eq("role", "admin");
  if (admins && admins.length > 0) {
    await admin.from("notifications").insert(
      admins.map((a) => ({
        user_id: a.id,
        type: "dispute_opened",
        payload: { booking_id: bookingId, category },
      }))
    );
  }

  revalidatePath("/bookings");
  revalidatePath("/admin/disputes");
  revalidatePath("/admin");
  redirect(`/bookings/${bookingId}?dispute=opened`);
}
