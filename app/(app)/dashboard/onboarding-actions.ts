"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Dismiss the customer onboarding tour. Stamps profiles.onboarded_at via
// RLS-scoped update so the modal doesnt re-show on next dashboard visit
// (or on a different device — server-side gate beats localStorage).
export async function dismissOnboardingAction(): Promise<{ ok: true } | { error: string }> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not logged in." };

  const { error } = await supabase
    .from("profiles")
    .update({ onboarded_at: new Date().toISOString() })
    .eq("id", user.id);
  if (error) return { error: error.message };

  revalidatePath("/dashboard");
  return { ok: true };
}
