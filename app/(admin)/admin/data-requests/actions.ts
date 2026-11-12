"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/*
  GETTING A STUCK DATA REQUEST MOVING AGAIN.

  Three acts, each performed on a person's own data at their request,
  so each one goes through a database function that checks the admin
  claim, demands a reason, refuses the states where the act would be a
  lie, and writes its own audit event.

  NONE OF THESE IS A DOWNLOAD. Nothing here hands an operator somebody
  else's personal data; they queue work, stop work, or record that work
  failed.
*/

export type RecoveryResult =
  | { ok: true; message: string; detail?: string }
  | { ok: false; error: string };

function fail(error: { message?: string; code?: string } | null): RecoveryResult {
  const message = (error?.message ?? "That could not be done.")
    .replace(/^[^:]*:\s*/, "")
    .trim();
  switch (error?.code) {
    case "42501": return { ok: false, error: "You are not permitted to change data requests." };
    case "HW110": return { ok: false, error: message };
    case "HW111": return { ok: false, error: "That request no longer exists. Reload the queue." };
    case "HW112": return { ok: false, error: message };
    case "HW113": return { ok: false, error: message };
    case "HW114": return { ok: false, error: message };
    default: return { ok: false, error: error?.message ?? "That could not be done." };
  }
}

export async function retryExportAction(id: string, reason: string): Promise<RecoveryResult> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("admin_data_export_retry", {
    p_id: id, p_reason: reason,
  });
  if (error) return fail(error);
  revalidatePath("/admin/data-requests");
  return {
    ok: true,
    message: "Queued for a fresh build.",
    detail: (data as { note: string }).note,
  };
}

export async function cancelDeletionAction(id: string, reason: string): Promise<RecoveryResult> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("admin_deletion_cancel", {
    p_id: id, p_reason: reason,
  });
  if (error) return fail(error);
  const result = data as { requester_notified: boolean; note: string };
  revalidatePath("/admin/data-requests");
  return {
    ok: true,
    message: "Deletion cancelled.",
    /* Whether the person was actually told is part of the outcome, not
       a detail somebody has to go and check. */
    detail: result.note,
  };
}

export async function markExportFailedAction(id: string, reason: string): Promise<RecoveryResult> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("admin_data_export_mark_failed", {
    p_id: id, p_reason: reason,
  });
  if (error) return fail(error);
  revalidatePath("/admin/data-requests");
  return {
    ok: true,
    message: "Recorded as failed.",
    detail: (data as { note: string }).note,
  };
}
