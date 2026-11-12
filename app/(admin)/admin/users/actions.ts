"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/*
  THE WRITES ON A CUSTOMER RECORD.

  Every one goes through a function in 0101 that checks the admin claim
  ITSELF rather than trusting this file to have done it, so a mistake
  here is a failed call and not an open door. The reasons are checked in
  the database too: an eight-character minimum on a reveal and on a
  restriction is not a form validation, it is a condition of the write.
*/

export type ActionResult = { ok: true; message: string } | { ok: false; error: string };

export async function revealCustomerContactAction(
  userId: string,
  reason: string,
): Promise<{ ok: true; email: string | null; phone: string | null } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("admin_reveal_customer_contact", {
    p_user_id: userId,
    p_reason: reason,
  });
  if (error) return { ok: false, error: error.message };
  const row = data as { email: string | null; phone: string | null };
  /*
    No revalidate. The reveal is already recorded; refreshing the page
    would only re-render the masked values over the operator's answer.
  */
  return { ok: true, email: row.email, phone: row.phone };
}

export async function setCustomerRestrictionAction(
  userId: string,
  restricted: boolean,
  reason: string | null,
): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("admin_set_customer_restriction", {
    p_user_id: userId,
    p_restricted: restricted,
    p_reason: reason,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/users");
  revalidatePath("/admin");
  return {
    ok: true,
    message: restricted
      ? "Restricted. This account can no longer open new requests."
      : "Restriction lifted. This account can book again.",
  };
}

export async function addCustomerNoteAction(userId: string, body: string): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("admin_add_customer_note", {
    p_user_id: userId,
    p_body: body,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/users");
  return { ok: true, message: "Note saved. Staff only — the customer never sees it." };
}

export async function openCustomerCaseAction(
  userId: string,
  category: string,
  description: string,
): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("admin_open_customer_case", {
    p_user_id: userId,
    p_category: category,
    p_description: description,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/users");
  revalidatePath("/admin/disputes");
  return { ok: true, message: "Case opened against their most recent booking, and assigned to you." };
}

export async function assignCaseAction(caseId: string, ownerId: string | null): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("admin_assign_case", {
    p_case_id: caseId,
    p_owner_id: ownerId,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/users");
  revalidatePath("/admin/disputes");
  return { ok: true, message: ownerId ? "Assigned." : "Unassigned." };
}
