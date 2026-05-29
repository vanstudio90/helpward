"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type State = { error?: string; success?: string } | undefined;

// Helper-side: mark a single bundle item as in_progress or completed. The
// RLS policy on request_bundle_items requires the caller to be the helper
// assigned to the parent request's booking, so a malicious user can't
// touch someone else's bundle.
export async function setBundleItemStatusAction(
  itemId: string,
  status: "in_progress" | "completed" | "skipped",
): Promise<State> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not logged in." };

  const update: Record<string, unknown> = { status };
  if (status === "completed") update.completed_at = new Date().toISOString();

  const { error } = await supabase
    .from("request_bundle_items")
    .update(update)
    .eq("id", itemId);
  if (error) return { error: error.message };

  // Refresh the customer's booking page + the helper's active view so the
  // status pill updates without a hard refresh.
  revalidatePath("/provider/active");
  revalidatePath("/bookings", "layout");
  return { success: "Updated." };
}
