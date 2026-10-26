"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Record one finding.
 *
 * Runs as the signed-in helper: the RLS policy on inspection_items
 * restricts writes to the assigned helper of a live booking, so this
 * needs no service-role client and cannot touch another job's report.
 */
export async function saveInspectionItemAction(
  bookingId: string,
  itemId: string,
  patch: { condition?: string; note?: string },
) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not logged in." };

  const update: Record<string, string> = {};
  if (patch.condition) {
    const allowed = ["good", "fair", "poor", "not_checked", "not_present"];
    if (!allowed.includes(patch.condition)) return { error: "Unknown condition." };
    update.condition = patch.condition;
  }
  if (patch.note !== undefined) update.note = patch.note.slice(0, 2000);
  if (Object.keys(update).length === 0) return { success: "Nothing to save." };

  const { error } = await supabase
    .from("inspection_items")
    .update(update)
    .eq("id", itemId);
  if (error) return { error: error.message };

  revalidatePath("/provider/active");
  return { success: "Saved." };
}

/**
 * Send the report.
 *
 * submit_inspection_report refuses while any area is still unanswered —
 * "complete" has to mean someone looked. The button is disabled in that
 * state too, but the rule lives in the database, because a disabled
 * button is a suggestion.
 */
export async function submitInspectionReportAction(bookingId: string, summary: string) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not logged in." };

  const { error } = await supabase.rpc("submit_inspection_report", {
    p_booking_id: bookingId,
    p_summary: summary.slice(0, 4000) || null,
  });
  if (error) return { error: error.message };

  revalidatePath("/provider/active");
  revalidatePath(`/bookings/${bookingId}`);
  return { success: "Report sent." };
}
