"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { recordReferralAttribution } from "@/lib/data/referrals";

type ActionState = { error?: string; success?: string } | undefined;

export async function loginAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Email and password are required." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: error.message };
  }

  // If the account has a verified TOTP factor, the password sign-in lands us
  // at AAL1 (authentication assurance level 1 — single-factor). We redirect
  // to /login/mfa to step up to AAL2 before letting the user into the app.
  //
  // listFactors only returns factors for the current authenticated user, so
  // we can call it right after sign-in without leaking factor existence to
  // unauthenticated probers.
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const verifiedTotp = factors?.totp?.find((f) => f.status === "verified");
  if (verifiedTotp) {
    // Stash the destination so the challenge page can redirect properly
    // after the step-up succeeds.
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .single();
    const destination =
      profile?.role === "provider" ? "/provider/dashboard"
      : profile?.role === "admin" ? "/admin"
      : "/dashboard";
    redirect(`/login/mfa?next=${encodeURIComponent(destination)}`);
  }

  // Determine role to send them to the right home
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .single();

  revalidatePath("/", "layout");

  if (profile?.role === "provider") {
    redirect("/provider/dashboard");
  } else if (profile?.role === "admin") {
    redirect("/admin");
  }
  redirect("/dashboard");
}

export async function signupAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const fullName = String(formData.get("full_name") ?? "").trim();
  const country = String(formData.get("country") ?? "US");
  const role = String(formData.get("role") ?? "customer");

  if (!email || !password || !fullName) {
    return { error: "All fields are required." };
  }
  // Sanity check: email must contain an @ and a dot AFTER the @. Supabase
  // also validates but rejecting here gives a clearer error than the generic
  // "Unable to validate email address" we'd get from auth.signUp.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "Please enter a valid email address." };
  }
  if (email.length > 254) return { error: "Email is too long." };
  if (fullName.length > 80) return { error: "Name is too long (max 80 chars)." };
  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }
  if (password.length > 128) {
    return { error: "Password is too long (max 128 chars)." };
  }
  if (!["customer", "provider"].includes(role)) {
    return { error: "Invalid role." };
  }
  if (!["US", "CA"].includes(country)) {
    return { error: "Country must be US or CA." };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
        role,
        country,
      },
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://helpward.com"}/auth/callback`,
    },
  });

  if (error) {
    return { error: error.message };
  }

  // Best-effort referral attribution. If the visitor was carrying an hw_ref
  // cookie (set by proxy.ts when they landed via ?ref=CODE), we record an
  // attribution row now. Failures here don't block signup — referrals are a
  // nice-to-have, the account is the must-have.
  try {
    const cookieStore = await cookies();
    const refCode = cookieStore.get("hw_ref")?.value;
    if (refCode && data.user?.id) {
      const h = await headers();
      const ip = h.get("x-forwarded-for") ?? h.get("x-real-ip") ?? null;
      const ua = h.get("user-agent");
      await recordReferralAttribution(data.user.id, refCode, ip, ua);
      // Clear the cookie so a friend who shares a device doesn't get
      // double-credited when they sign up next.
      cookieStore.delete("hw_ref");
    }
  } catch (e) {
    console.error("referral attribution failed:", e);
  }

  redirect("/verify-email?email=" + encodeURIComponent(email));
}

export async function logoutAction() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}

export async function forgotPasswordAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email) return { error: "Email is required." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://helpward.com"}/auth/reset-password`,
  });
  if (error) return { error: error.message };
  return { success: "Check your inbox — if that email is registered we just sent a reset link." };
}

// In-app password change for an already-authenticated user. Requires the
// current password (re-authenticates via signInWithPassword) before updating
// — Supabase's updateUser({ password }) does NOT enforce re-auth on its own,
// so an attacker who steals a session cookie could otherwise silently rotate
// the password. We check the current password first to close that gap.
export async function changePasswordAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const currentPassword = String(formData.get("current_password") ?? "");
  const newPassword = String(formData.get("new_password") ?? "");

  if (!currentPassword) return { error: "Enter your current password." };
  if (newPassword.length < 8) return { error: "New password must be at least 8 characters." };
  if (newPassword.length > 128) return { error: "New password is too long (max 128)." };
  if (newPassword === currentPassword) return { error: "New password must differ from the current one." };

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return { error: "Not logged in." };

  // Re-authenticate. signInWithPassword issues a fresh session even when the
  // user is already signed in — that's the supported way to verify the
  // current password without bespoke server-side hashing.
  const { error: reauthErr } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  });
  if (reauthErr) return { error: "Current password is incorrect." };

  const { error: updErr } = await supabase.auth.updateUser({ password: newPassword });
  if (updErr) return { error: updErr.message };

  // Best-effort audit trail; admin reviewers can spot suspicious patterns.
  try {
    await supabase.from("audit_log").insert({
      actor_id: user.id,
      action: "user.password_changed",
      target_table: "auth.users",
      target_id: user.id,
    });
  } catch {/* table read-only by user but accept silent fail */}

  return { success: "Password updated." };
}

export async function resetPasswordAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const password = String(formData.get("password") ?? "");
  if (password.length < 8) return { error: "Password must be at least 8 characters." };
  if (password.length > 128) return { error: "Password is too long (max 128 chars)." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: error.message };
  return { success: "Password updated. You can now log in." };
}
