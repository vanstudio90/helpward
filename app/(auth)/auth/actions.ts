"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { recordReferralAttribution } from "@/lib/data/referrals";
import { SERVICE_AREAS, normalizeMunicipality } from "@/lib/service-areas";
import { isHelperRole } from "@/lib/roles";

type ActionState = {
  error?: string;
  success?: string;
  /** Set when the refusal was an unconfirmed address: the login form offers to resend. */
  resendEmail?: string;
  /** Set when signup hit an address that is already registered: the form links to login. */
  accountExists?: boolean;
} | undefined;

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
    // Supabase refuses an unconfirmed account with the bare string "Email
    // not confirmed", which reads like a system fault rather than something
    // the person can act on. Say what to do, and offer to send it again —
    // the first link expires, and "check your inbox" is useless advice when
    // the message is a week old or never arrived.
    if (error.code === "email_not_confirmed") {
      return {
        error: "Please confirm your email first — we sent you a link when you signed up. "
          + "Check your inbox and your spam folder.",
        resendEmail: email,
      };
    }
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
    const { data: { user: mfaUser } } = await supabase.auth.getUser();
    const { data: profile } = mfaUser
      ? await supabase.from("profiles").select("role").eq("id", mfaUser.id).maybeSingle()
      : { data: null };
    const destination =
      isHelperRole(profile?.role) ? "/helper/dashboard"
      : profile?.role === "admin" ? "/admin"
      : "/dashboard";
    redirect(`/login/mfa?next=${encodeURIComponent(destination)}`);
  }

  // Determine role to send them to the right home.
  //
  // Filtered by id: profiles_read exposes every provider row, so an
  // unfiltered .single() returned PGRST116 and a null role, which routed
  // every helper to the customer dashboard — the other half of the
  // sign-in redirect loop.
  const { data: { user: signedIn } } = await supabase.auth.getUser();
  const { data: profile } = signedIn
    ? await supabase.from("profiles").select("role").eq("id", signedIn.id).maybeSingle()
    : { data: null };

  revalidatePath("/", "layout");

  if (isHelperRole(profile?.role)) {
    redirect("/helper/dashboard");
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

  // Where a helper says they will work. The signup form has asked this
  // since the city cascade shipped, but nothing read it — the answer was
  // collected and discarded. It now rides in user metadata, and
  // handle_new_user() (migration 0072) seeds provider_cities from it so
  // dispatch honours it from the first request.
  //
  // Validated against SERVICE_AREAS rather than trusted: this is a posted
  // form field, and a value that no boundary answers to would leave the
  // helper configured and permanently undispatchable. "__other__" is the
  // not-listed sentinel and is not a place, so it is dropped here.
  const rawRegion = String(formData.get("work_region") ?? "").trim();
  const rawCity = String(formData.get("work_city") ?? "").trim();
  const workArea = SERVICE_AREAS.find((a) => a.id === rawRegion && a.country === country);
  const workCity = workArea?.municipalities.find(
    (m) => normalizeMunicipality(m) === normalizeMunicipality(rawCity),
  );

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
  // "provider" is the retired spelling. Still accepted so a browser tab
  // holding an older bundle can finish signing up; handle_new_user
  // normalises it before the enum cast.
  if (!["customer", "helper", "provider"].includes(role)) {
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
        // Only ever a real area id and a real municipality name, or absent.
        ...(isHelperRole(role) && workArea && workCity
          ? { work_region: workArea.id, work_city: workCity }
          : {}),
      },
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://helpward.com"}/auth/callback`,
    },
  });

  if (error) {
    return { error: error.message };
  }

  // An email that is already registered comes back as SUCCESS with an empty
  // identities array — Supabase does this deliberately so a signup form
  // cannot be used to discover who has an account. We were taking it at
  // face value and showing "Check your inbox — we sent a confirmation
  // link", for a link that was never sent. Someone with an existing account
  // then waits for mail that is not coming.
  //
  // This does tell a visitor that an address is registered, which is the
  // enumeration Supabase's silence avoids. It is the right trade here: the
  // address is one the person just typed, the alternative is lying to every
  // returning user about an email we did not send, and the practical value
  // to an attacker is small next to that cost.
  if (data.user && (data.user.identities?.length ?? 0) === 0) {
    return {
      error: "You already have a Helpward account with that email. Log in instead — "
        + "or reset your password if you don't remember it.",
      accountExists: true,
    };
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


// Re-send the signup confirmation link. Offered from the login form when a
// sign-in is refused for an unconfirmed address.
//
// Always reports success, even for an address with no account: this one is
// reachable by anyone who can type, with no prior step that already
// revealed the address, so it would be a genuine enumeration oracle.
// Supabase rate-limits resends on its own side.
export async function resendConfirmationAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "Enter the email you signed up with." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.resend({
    type: "signup",
    email,
    options: {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://helpward.com"}/auth/callback`,
    },
  });

  // A rate-limit is worth surfacing — it is the one case where trying again
  // immediately cannot work, and silence would just produce another click.
  if (error && /rate|too many|seconds/i.test(error.message)) {
    return { error: "That was just sent. Give it a minute before asking again." };
  }

  return { success: `Sent. Check ${email} — and your spam folder.` };
}
