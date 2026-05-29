"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ensureMyReferralCode } from "@/lib/data/referrals";

type State = { error?: string; success?: string; code?: string } | undefined;

// Idempotently allocate a code for the caller. Used by the dashboard page
// on first visit so the user always has a code to share without needing to
// click anything.
export async function ensureMyReferralCodeAction(): Promise<State> {
  const result = await ensureMyReferralCode();
  if ("error" in result) return { error: result.error };
  revalidatePath("/referrals");
  return { success: "Code ready.", code: result.code };
}

// Update the optional custom message that ships with share links.
export async function setReferralMessageAction(
  _prev: State,
  formData: FormData,
): Promise<State> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not logged in." };

  const message = String(formData.get("message") ?? "").trim();
  if (message.length > 240) return { error: "Message is too long (max 240 chars)." };

  const { error } = await supabase
    .from("referral_codes")
    .update({ custom_message: message || null })
    .eq("user_id", user.id);
  if (error) return { error: error.message };

  revalidatePath("/referrals");
  return { success: message ? "Message saved." : "Message cleared." };
}
