"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isValidTotpShape } from "@/lib/mfa-pure";
import { consumeRecoveryCode } from "@/lib/data/mfa";

type State = { error?: string } | undefined;

// Step-up challenge: the user is logged in at AAL1 (password verified). They
// submit a 6-digit TOTP from their app OR an 8-character recovery code, and
// we promote the session to AAL2 by either calling mfa.verify or — for
// recovery — by consuming a code in our own table.
//
// Recovery-code consumption doesn't change the underlying Supabase AAL,
// which is a limitation we accept for v1: someone using a recovery code
// will not have AAL2-gated actions available; the assumption is recovery
// codes are last-resort, used to disable 2FA and re-enroll on a new device.
export async function challengeMfaAction(
  _prev: State,
  formData: FormData,
): Promise<State> {
  const codeRaw = String(formData.get("code") ?? "").trim();
  const useRecovery = formData.get("use_recovery") === "1";
  const next = String(formData.get("next") ?? "/dashboard");

  // Validate `next` is a safe internal path — prevents ?next=//evil.com
  // open-redirect after a successful challenge.
  const safeNext = /^\/[a-zA-Z0-9_\-\/?=&%]*$/.test(next) && !next.startsWith("//")
    ? next
    : "/dashboard";

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in again — your session expired." };

  if (useRecovery) {
    const h = await headers();
    const ip = h.get("x-forwarded-for") ?? h.get("x-real-ip") ?? null;
    const ok = await consumeRecoveryCode(user.id, codeRaw, ip);
    if (!ok) return { error: "Recovery code didn't match. Try another." };

    // Recovery success — log the event so it's auditable.
    await supabase.from("audit_log").insert({
      actor_id: user.id,
      action: "mfa.recovery_used_for_login",
      target_table: "auth.mfa_factors",
      target_id: user.id,
    });
  } else {
    if (!isValidTotpShape(codeRaw)) return { error: "Enter the 6-digit code from your authenticator app." };

    const { data: factors } = await supabase.auth.mfa.listFactors();
    const verified = factors?.totp?.find((f) => f.status === "verified");
    if (!verified) return { error: "No verified authenticator factor on this account." };

    const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId: verified.id });
    if (chErr || !ch) return { error: chErr?.message ?? "Couldn't start the challenge — try again." };

    const { error: vErr } = await supabase.auth.mfa.verify({
      factorId: verified.id,
      challengeId: ch.id,
      code: codeRaw,
    });
    if (vErr) return { error: "That code didn't match. Try again with a fresh 6-digit code." };
  }

  revalidatePath("/", "layout");
  redirect(safeNext);
}
