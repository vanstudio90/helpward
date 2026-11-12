"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/*
  THE CUSTOMER'S HALF OF A SUPPORT CONVERSATION.

  support_customer_reply (0102) checks that the case is theirs and
  writes the message; the trigger on the table starts the reply clock.
  Nothing here decides who may post — a page cannot be trusted with
  that, and this one is not asked to be.
*/
export async function replyToSupportAction(
  caseId: string,
  body: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("support_customer_reply", {
    p_case_id: caseId,
    p_body: body,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/support/${caseId}`);
  revalidatePath("/support");
  return { ok: true };
}
