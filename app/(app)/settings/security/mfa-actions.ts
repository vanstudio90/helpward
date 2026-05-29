"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  generateAndStoreRecoveryCodes,
  consumeRecoveryCode,
  clearRecoveryCodes,
} from "@/lib/data/mfa";
import { isValidTotpShape } from "@/lib/mfa-pure";

type EnrollState = {
  error?: string;
  factorId?: string;
  qrSvg?: string;
  uri?: string;
  secret?: string;
} | undefined;

type VerifyState = {
  error?: string;
  recoveryCodes?: string[]; // shown once after successful enrollment
} | undefined;

type SimpleState = { error?: string; success?: string; recoveryCodes?: string[] } | undefined;

// Kick off enrollment — returns the QR code SVG + secret so the UI can
// render it. The factor is "unverified" at this point; verifyEnrollmentAction
// completes it with the first 6-digit code.
export async function startEnrollmentAction(): Promise<EnrollState> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not logged in." };

  // Reject if already enrolled with a verified factor — Supabase allows
  // multiple unverified factors to accumulate; we keep it to one.
  const { data: factors } = await supabase.auth.mfa.listFactors();
  if (factors?.totp?.some((f) => f.status === "verified")) {
    return { error: "Two-factor is already enabled. Disable it first to re-enroll." };
  }
  // Clean up stray unverified factors from past attempts.
  for (const f of factors?.totp ?? []) {
    if (f.status !== "verified") {
      await supabase.auth.mfa.unenroll({ factorId: f.id });
    }
  }

  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: "Helpward authenticator",
  });
  if (error || !data) return { error: error?.message ?? "Couldn't start enrollment." };

  return {
    factorId: data.id,
    qrSvg: data.totp?.qr_code,
    uri: data.totp?.uri,
    secret: data.totp?.secret,
  };
}

// Finish enrollment: user types the first 6-digit code from their app.
// On success: factor flips to verified, we mint 10 recovery codes, and
// return them to the UI which shows them ONCE.
export async function verifyEnrollmentAction(
  factorId: string,
  _prev: VerifyState,
  formData: FormData,
): Promise<VerifyState> {
  const code = String(formData.get("code") ?? "").trim();
  if (!isValidTotpShape(code)) return { error: "Enter the 6-digit code from your app." };

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not logged in." };

  const { data: challenge, error: chErr } = await supabase.auth.mfa.challenge({ factorId });
  if (chErr || !challenge) return { error: chErr?.message ?? "Couldn't start challenge." };

  const { error: vErr } = await supabase.auth.mfa.verify({
    factorId,
    challengeId: challenge.id,
    code,
  });
  if (vErr) {
    // Common case: wrong code. Return a friendly error without nuking the
    // factor — the user can try again.
    return { error: "That code didn't match. Try again with a fresh 6-digit code from your app." };
  }

  // Enrollment verified. Generate one-time recovery codes.
  let recoveryCodes: string[] = [];
  try {
    recoveryCodes = await generateAndStoreRecoveryCodes(user.id);
  } catch (e) {
    console.error("recovery code generation failed:", e);
    // Don't block enrollment if recovery-code persistence fails — the user
    // can regenerate from the settings page once we recover. Still surface
    // a warning.
    return { error: "Two-factor enabled, but recovery codes failed to save. Visit /settings/security to regenerate." };
  }

  await logMfaEvent(user.id, "mfa.enrolled");
  revalidatePath("/settings/security");
  return { recoveryCodes };
}

// Disable 2FA — requires a fresh TOTP (or recovery) verification to confirm
// the user is the legitimate account owner.
export async function unenrollAction(
  _prev: SimpleState,
  formData: FormData,
): Promise<SimpleState> {
  const code = String(formData.get("code") ?? "").trim();
  const useRecovery = formData.get("use_recovery") === "1";

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not logged in." };

  // Verify the user actually controls a factor right now before unenrolling.
  const verifyOk = useRecovery
    ? await verifyRecoveryFor(user.id, code)
    : await verifyTotpFor(supabase, code);
  if (!verifyOk) return { error: "Code didn't verify. Try again." };

  // Pull every verified factor and unenroll each (defensive — there should
  // only be one, but past enrollments can leave artefacts).
  const { data: factors } = await supabase.auth.mfa.listFactors();
  for (const f of factors?.totp ?? []) {
    await supabase.auth.mfa.unenroll({ factorId: f.id });
  }
  await clearRecoveryCodes(user.id);
  await logMfaEvent(user.id, "mfa.disabled");
  revalidatePath("/settings/security");
  return { success: "Two-factor authentication disabled." };
}

// Mint a fresh set of recovery codes — invalidates the old set. Requires a
// fresh TOTP verification to confirm the device.
export async function regenerateRecoveryCodesAction(
  _prev: SimpleState,
  formData: FormData,
): Promise<SimpleState> {
  const code = String(formData.get("code") ?? "").trim();
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not logged in." };

  const ok = await verifyTotpFor(supabase, code);
  if (!ok) return { error: "Code didn't verify. Try again with a fresh 6-digit code." };

  const codes = await generateAndStoreRecoveryCodes(user.id);
  await logMfaEvent(user.id, "mfa.recovery_codes_regenerated");
  revalidatePath("/settings/security");
  return { success: "New recovery codes generated. Save them — the previous set no longer works.", recoveryCodes: codes };
}

// Internal: verify a 6-digit TOTP using the user's verified factor (if any).
// Returns true on match, false otherwise.
async function verifyTotpFor(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  code: string,
): Promise<boolean> {
  if (!isValidTotpShape(code)) return false;
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const verified = factors?.totp?.find((f) => f.status === "verified");
  if (!verified) return false;
  const { data: ch } = await supabase.auth.mfa.challenge({ factorId: verified.id });
  if (!ch) return false;
  const { error } = await supabase.auth.mfa.verify({
    factorId: verified.id,
    challengeId: ch.id,
    code,
  });
  return !error;
}

async function verifyRecoveryFor(userId: string, raw: string): Promise<boolean> {
  const h = await headers();
  const ip = h.get("x-forwarded-for") ?? h.get("x-real-ip") ?? null;
  return consumeRecoveryCode(userId, raw, ip);
}

async function logMfaEvent(userId: string, action: string) {
  try {
    const supabase = await createSupabaseServerClient();
    await supabase.from("audit_log").insert({
      actor_id: userId,
      action,
      target_table: "auth.mfa_factors",
      target_id: userId,
    });
  } catch {/* audit best-effort */}
}
