"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/*
  THE THREE THINGS THIS CONSOLE CAN WRITE.

  Each one goes through a database function that checks the admin claim
  itself, so the permission lives in one place rather than being
  re-stated — and badly — in a server action. What these add is the
  human part: a reason, and a sentence the operator can act on when the
  server says no.

  CANCELLING A LIVE BOOKING IS NOT HERE, on purpose. cancel_booking
  (0008) authorises the customer and the assigned helper only, and the
  hold release and cancellation fee live in the API route the apps call.
  An admin flipping the status directly would leave the customer's money
  reserved on a booking marked cancelled. The panel explains that in
  place of the button.
*/

type Result = { ok: true; message: string } | { ok: false; error: string };

export async function cancelRequestAction(requestId: string, reason: string): Promise<Result> {
  const trimmed = reason.trim();
  if (trimmed.length < 8) {
    return { ok: false, error: "Give a reason of at least eight characters — it goes in the audit log." };
  }

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.app_metadata?.role !== "admin") {
    return { ok: false, error: "Not permitted." };
  }

  const { error } = await supabase.rpc("cancel_request", { p_request_id: requestId });
  if (error) return { ok: false, error: error.message };

  /*
    Recorded after the fact rather than before: an audit line for
    something that then failed is a line that misleads whoever reads it
    next.
  */
  await supabase.from("audit_log").insert({
    actor_id: user.id,
    action: "admin.request_cancelled",
    target_table: "requests",
    target_id: requestId,
    payload: { reason: trimmed },
  });

  revalidatePath("/admin/bookings");
  revalidatePath("/admin");
  return { ok: true, message: "Request cancelled." };
}

export async function revealPrivateDetailsAction(
  requestId: string, reason: string,
): Promise<
  { ok: true; details: Record<string, unknown> | null; note: string | null }
  | { ok: false; error: string }
> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("admin_reveal_private_details", {
    p_request_id: requestId,
    p_reason: reason,
  });
  if (error) return { ok: false, error: error.message };
  const result = data as { details: Record<string, unknown> | null; note: string | null };
  return { ok: true, details: result.details, note: result.note };
}

export async function addNoteAction(
  subjectKind: "booking" | "request", subjectId: string, body: string,
): Promise<Result> {
  if (body.trim().length === 0) return { ok: false, error: "A note needs some words in it." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("admin_add_note", {
    p_subject_kind: subjectKind,
    p_subject_id: subjectId,
    p_body: body,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/bookings");
  return { ok: true, message: "Note saved." };
}
