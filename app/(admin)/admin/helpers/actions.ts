"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServiceClient, createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/admin";

export type ActionResult = { ok: true; message: string } | { ok: false; error: string };

export async function approveProviderAction(providerId: string): Promise<ActionResult> {
  await requireAdmin();
  // Audit who approved
  const supabaseUser = await createSupabaseServerClient();
  const { data: { user } } = await supabaseUser.auth.getUser();

  const admin = createSupabaseServiceClient();
  /*
    THE DATABASE GETS THE LAST WORD, and this used to ignore it.

    require_helper_photo_for_approval (0095) refuses the move to
    'approved' for a helper with no photo — a trigger, so the service
    role is refused too. The error was being discarded, so the page
    revalidated, the row had not changed, and the only clue was that
    the application was somehow still in the queue.
  */
  const { error } = await admin
    .from("provider_profiles")
    .update({
      status: "approved",
      approved_at: new Date().toISOString(),
      approved_by: user?.id ?? null,
    })
    .eq("user_id", providerId);

  if (error) {
    return {
      ok: false,
      error: /HW020|profile photo/i.test(error.message)
        ? "This helper has no profile photo, so they cannot be approved."
        : error.message,
    };
  }

  await admin.from("notifications").insert({
    user_id: providerId,
    type: "provider_approved",
    payload: {},
  });

  await admin.from("audit_log").insert({
    actor_id: user?.id ?? null,
    action: "provider.approve",
    target_table: "provider_profiles",
    target_id: providerId,
  });

  // Visible to the next reviewer, in the Activity tab.
  await admin.from("helper_review_events").insert({
    provider_id: providerId, kind: "approved", actor_id: user?.id ?? null,
  });

  revalidatePath("/admin/helpers");
  revalidatePath("/admin");
  return { ok: true, message: "Approved." };
}

export async function rejectProviderAction(providerId: string, reason?: string): Promise<ActionResult> {
  await requireAdmin();
  if (!reason || reason.trim().length < 8) {
    return { ok: false, error: "Give a reason — the applicant is told, and it goes in the audit log." };
  }
  const supabaseUser = await createSupabaseServerClient();
  const { data: { user } } = await supabaseUser.auth.getUser();

  const admin = createSupabaseServiceClient();
  const { error } = await admin
    .from("provider_profiles")
    .update({
      status: "suspended",
      rejection_reason: reason.trim(),
    })
    .eq("user_id", providerId);
  if (error) return { ok: false, error: error.message };

  await admin.from("notifications").insert({
    user_id: providerId,
    type: "provider_rejected",
    payload: { reason: reason ?? null },
  });

  await admin.from("audit_log").insert({
    actor_id: user?.id ?? null,
    action: "provider.reject",
    target_table: "provider_profiles",
    target_id: providerId,
    payload: { reason: reason.trim() },
  });

  await admin.from("helper_review_events").insert({
    provider_id: providerId, kind: "rejected", body: reason.trim(), actor_id: user?.id ?? null,
  });

  revalidatePath("/admin/helpers");
  revalidatePath("/admin");
  return { ok: true, message: "Application rejected and the applicant told." };
}

/*
  THE THREE SMALLER MOVES, each through a function that checks the admin
  claim itself (0100) rather than trusting this file to have done it.
*/
export async function assignReviewerAction(providerId: string, ownerId: string | null): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("admin_assign_helper_review", {
    p_provider_id: providerId, p_owner_id: ownerId,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/helpers");
  return { ok: true, message: ownerId ? "Assigned." : "Unassigned." };
}

export async function requestHelperInfoAction(providerId: string, message: string): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("admin_request_helper_info", {
    p_provider_id: providerId, p_message: message,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/helpers");
  return { ok: true, message: "Asked, and the applicant has been notified." };
}

export async function addHelperNoteAction(providerId: string, body: string): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("admin_add_helper_note", {
    p_provider_id: providerId, p_body: body,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/helpers");
  return { ok: true, message: "Note saved." };
}
