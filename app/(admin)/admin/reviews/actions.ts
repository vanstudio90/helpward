"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServiceClient, createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/admin";

// Hide a review from public listings. The row is kept (we need it for the
// provider's internal stats + dispute trails) but customer_visible flips to
// false, so it disappears from /providers/[id] and the provider's review tab.
export async function setReviewVisibilityAction(reviewId: string, visible: boolean) {
  await requireAdmin();
  const supabase = createSupabaseServiceClient();
  const userClient = await createSupabaseServerClient();
  const { data: { user } } = await userClient.auth.getUser();

  // Pull provider_id for the audit log + revalidation, in one round-trip.
  const { data: review } = await supabase
    .from("reviews")
    .select("provider_id")
    .eq("id", reviewId)
    .single();

  const { error } = await supabase
    .from("reviews")
    .update({ customer_visible: visible })
    .eq("id", reviewId);
  if (error) return { error: error.message };

  await supabase.from("audit_log").insert({
    actor_id: user?.id ?? null,
    action: visible ? "review.restore" : "review.hide",
    target_table: "reviews",
    target_id: reviewId,
    payload: { visible },
  });

  revalidatePath("/admin/reviews");
  if (review?.provider_id) revalidatePath(`/providers/${review.provider_id}`);
  return { success: visible ? "Review restored." : "Review hidden." };
}
