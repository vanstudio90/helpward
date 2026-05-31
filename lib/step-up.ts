// Step-up authentication helper.
//
// Some actions are too destructive (delete account) or too exfiltratable
// (data export — one click and your whole life is in a JSON file) to gate
// only on the session cookie. We require a fresh password re-entry right
// before the action runs.
//
// Implementation: reuse signInWithPassword on the user's own SSR-bound
// Supabase client. That call issues a fresh session for the SAME user,
// which is the supported way to re-verify a password without bespoke
// server-side hashing. The pattern mirrors changePasswordAction.
//
// We deliberately don't track a "step-up verified within last X minutes"
// timestamp in a cookie. Forcing a real password re-entry every single
// time costs the user 4 seconds and removes a whole class of session-
// hijack escalation. Cheap UX tax; expensive safety dividend.

import { createSupabaseServerClient } from "@/lib/supabase/server";

export type StepUpResult =
  | { ok: true; userId: string }
  | { ok: false; error: string };

export async function verifyPasswordStepUp(password: string): Promise<StepUpResult> {
  if (!password) return { ok: false, error: "Enter your password to continue." };
  if (password.length > 200) return { ok: false, error: "Password is too long." };

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return { ok: false, error: "Not logged in." };

  const { error } = await supabase.auth.signInWithPassword({
    email: user.email,
    password,
  });
  if (error) return { ok: false, error: "Password is incorrect." };

  return { ok: true, userId: user.id };
}
