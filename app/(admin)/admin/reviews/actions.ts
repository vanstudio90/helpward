"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServiceClient, createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/admin";

// Hide a review from public listings. The row is kept (we need it for the
// provider's internal stats + dispute trails) but customer_visible flips to
// false, so it disappears from /helpers/[id] and the provider's review tab.
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
  if (review?.provider_id) revalidatePath(`/helpers/${review.provider_id}`);
  return { success: visible ? "Review restored." : "Review hidden." };
}

/* ================================================================== */
/* MODERATION WITH A TRAIL                                            */
/* ================================================================== */
/*
  setReviewVisibilityAction above writes straight through and predates
  the decision trail. The three below are the console's path: the admin
  claim is checked in the database, a reason is demanded, a decision
  against a row somebody else has moved is refused, and every act
  records what it did to the words AND what it did to the score.

  THE SCORE AND THE WORDS ARE DIFFERENT DECISIONS. Hiding abusive
  wording used to remove the customer's stars from the helper's average
  as a side effect, which lets a helper's rating be improved by their
  customers' rudeness. Since 0117 the aggregate follows
  `rating_visible`, and excluding a score is an explicit act with its
  own reason.
*/

export type ModerationResult =
  | { ok: true; message: string; detail?: string; updatedAt?: string }
  | { ok: false; error: string; conflict?: boolean };

function moderationFail(error: { message?: string; code?: string } | null): ModerationResult {
  const message = (error?.message ?? "The decision could not be recorded.")
    .replace(/^[^:]*:\s*/, "").trim();
  switch (error?.code) {
    case "42501": return { ok: false, error: "You are not permitted to moderate reviews." };
    case "HW080": return { ok: false, error: message, conflict: true };
    case "HW120": return { ok: false, error: message };
    case "HW121": return { ok: false, error: "That review no longer exists. Reload the queue." };
    case "HW122": return { ok: false, error: message };
    default: return { ok: false, error: error?.message ?? "The decision could not be recorded." };
  }
}

export async function hideReviewAction(
  reviewId: string,
  expectedUpdatedAt: string | null,
  reason: string,
  policy?: string | null,
  excludeRating = false,
): Promise<ModerationResult> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("admin_review_hide", {
    p_review: reviewId,
    p_expected: expectedUpdatedAt,
    p_reason: reason,
    p_policy: policy ?? null,
    p_exclude_rating: excludeRating,
  });
  if (error) return moderationFail(error);
  const result = data as { note: string; updated_at: string };
  revalidatePath("/admin/reviews");
  return {
    ok: true,
    message: "Hidden, and the decision is recorded.",
    /* Whether the helper's average moved is part of the outcome, not
       something somebody has to go and check. */
    detail: result.note,
    updatedAt: result.updated_at,
  };
}

export async function restoreReviewAction(
  reviewId: string, expectedUpdatedAt: string | null, reason: string,
): Promise<ModerationResult> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("admin_review_restore", {
    p_review: reviewId, p_expected: expectedUpdatedAt, p_reason: reason,
  });
  if (error) return moderationFail(error);
  const result = data as { note: string; updated_at: string };
  revalidatePath("/admin/reviews");
  return {
    ok: true,
    message: "Published again, and the reversal is recorded.",
    detail: result.note,
    updatedAt: result.updated_at,
  };
}

export async function setRatingCountsAction(
  reviewId: string, expectedUpdatedAt: string | null, counts: boolean, reason: string,
): Promise<ModerationResult> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("admin_review_set_rating_counts", {
    p_review: reviewId, p_expected: expectedUpdatedAt, p_counts: counts, p_reason: reason,
  });
  if (error) return moderationFail(error);
  const result = data as { note: string; updated_at: string };
  revalidatePath("/admin/reviews");
  return {
    ok: true,
    message: counts ? "The score counts again." : "The score no longer counts.",
    detail: result.note,
    updatedAt: result.updated_at,
  };
}
