"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { acceptRequestForHelper } from "@/lib/helper-jobs";

/*
  The RPC-plus-money part of accepting now lives in lib/helper-jobs.ts,
  because the iOS helper app has to do exactly the same thing and a
  second copy of the settlement rules is how two surfaces drift.

  What stays here is what is genuinely Next's: revalidating the two
  pages whose contents just changed, and the redirect.
*/
export async function acceptRequestAction(requestId: string) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not logged in." };

  const result = await acceptRequestForHelper(supabase, requestId, user.id);

  revalidatePath("/helper/inbox");
  revalidatePath("/helper/active");

  if (!result.ok) return { error: result.error };
  // Kept, but not startable yet — the customer's bank wants them
  // present. Reported as an error because it is the helper's blocker.
  if ("needsCustomerConfirmation" in result) return { error: result.message };

  redirect(`/helper/active`);
}

export async function declineRequestAction(requestId: string) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not logged in." };

  const { error } = await supabase.rpc("decline_request", {
    p_request_id: requestId,
    p_provider_id: user.id,
  });

  if (error) return { error: error.message };
  revalidatePath("/helper/inbox");
  return { success: "Declined." };
}
