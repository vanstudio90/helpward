import { createSupabaseServerClient, createSupabaseServiceClient } from "@/lib/supabase/server";
import {
  generateReferralCode, isValidCodeShape, normaliseCode,
  type ReferralStats,
} from "@/lib/referrals-pure";

export type { ReferralStats } from "@/lib/referrals-pure";
export { isValidCodeShape, normaliseCode, DEFAULT_REWARD_CENTS } from "@/lib/referrals-pure";

export type ReferralAttribution = {
  id: string;
  referee_id: string | null;
  referee_name: string | null;
  referee_avatar: string | null;
  status: "pending" | "qualified" | "credited" | "expired" | "fraudulent";
  referrer_credit_cents: number;
  referee_signed_up_at: string | null;
  qualified_at: string | null;
};

// Look up a code (no auth required — used during signup flow before the
// referee has a session). Returns the referrer_id so we can create the
// attribution row. Code is normalised; collisions are impossible (PK).
export async function lookupReferralCode(rawCode: string): Promise<{ code: string; referrer_id: string } | null> {
  const code = normaliseCode(rawCode);
  if (!isValidCodeShape(code)) return null;
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("referral_codes")
    .select("code, user_id")
    .eq("code", code)
    .maybeSingle();
  if (error || !data) return null;
  return { code: data.code, referrer_id: data.user_id };
}

// Get-or-create the caller's referral code. Loops on collision (extremely
// rare — 27^7 namespace + PK constraint) up to a few tries.
export async function ensureMyReferralCode(): Promise<{ code: string } | { error: string }> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not logged in." };

  const { data: existing } = await supabase
    .from("referral_codes")
    .select("code")
    .eq("user_id", user.id)
    .maybeSingle();
  if (existing?.code) return { code: existing.code };

  // Use service-role for the insert because the new code is owned by the
  // user but we generate it server-side; the user-client wouldn't be able
  // to read the table for the collision check otherwise.
  const admin = createSupabaseServiceClient();
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateReferralCode();
    const { error } = await admin
      .from("referral_codes")
      .insert({ code, user_id: user.id });
    if (!error) return { code };
    if (error.code !== "23505") return { error: error.message }; // 23505 = PK collision
  }
  return { error: "Could not allocate a unique code. Try again." };
}

// Caller's full referral picture — code, custom message, attributions list,
// running balance. One query per concern (the attribution join is RLS-scoped
// to referrer_id = auth.uid()).
export async function getMyReferralData(): Promise<{
  code: string | null;
  customMessage: string | null;
  attributions: ReferralAttribution[];
  stats: ReferralStats;
} | null> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const [
    { data: codeRow },
    { data: attributions },
    { data: profile },
  ] = await Promise.all([
    supabase
      .from("referral_codes")
      .select("code, custom_message")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("referral_attributions")
      .select(`
        id, status, referrer_credit_cents, referee_signed_up_at, qualified_at,
        referee:profiles!referral_attributions_referee_id_fkey(id, full_name, avatar_url)
      `)
      .eq("referrer_id", user.id)
      .order("referee_signed_up_at", { ascending: false })
      .limit(50),
    supabase
      .from("profiles")
      .select("referral_credits_cents")
      .eq("id", user.id)
      .maybeSingle(),
  ]);

  const flat: ReferralAttribution[] = (attributions ?? []).map((row) => {
    const r = row as unknown as {
      id: string; status: ReferralAttribution["status"]; referrer_credit_cents: number;
      referee_signed_up_at: string | null; qualified_at: string | null;
      referee: { id: string; full_name: string; avatar_url: string | null } | null;
    };
    return {
      id: r.id,
      referee_id: r.referee?.id ?? null,
      referee_name: r.referee?.full_name ?? null,
      referee_avatar: r.referee?.avatar_url ?? null,
      status: r.status,
      referrer_credit_cents: r.referrer_credit_cents,
      referee_signed_up_at: r.referee_signed_up_at,
      qualified_at: r.qualified_at,
    };
  });

  const qualified = flat.filter((a) => a.status === "qualified" || a.status === "credited");
  const stats: ReferralStats = {
    totalShared: flat.length,
    qualified: qualified.length,
    earnedCents: qualified.reduce((s, a) => s + a.referrer_credit_cents, 0),
    balanceCents: profile?.referral_credits_cents ?? 0,
  };

  return {
    code: codeRow?.code ?? null,
    customMessage: codeRow?.custom_message ?? null,
    attributions: flat,
    stats,
  };
}

// Server-side attribution creation, called from signupAction after the user
// is created. Uses service-role because the new user's session isn't fully
// established yet and we need to insert against their profile row + the
// referrer's code without RLS friction.
export async function recordReferralAttribution(
  refereeId: string,
  rawCode: string,
  ip: string | null,
  userAgent: string | null,
): Promise<{ ok: true } | { error: string }> {
  const lookup = await lookupReferralCode(rawCode);
  if (!lookup) return { error: "Unknown referral code." };
  if (lookup.referrer_id === refereeId) return { error: "Cannot refer yourself." };

  const admin = createSupabaseServiceClient();

  // Idempotent: the unique constraint on referee_id ensures one row per
  // referee even if signupAction fires twice.
  const { error } = await admin
    .from("referral_attributions")
    .insert({
      code: lookup.code,
      referrer_id: lookup.referrer_id,
      referee_id: refereeId,
      status: "pending",
      signup_ip: ip,
      signup_user_agent: userAgent?.slice(0, 200) ?? null,
    });
  if (error) {
    if (error.code === "23505") return { ok: true }; // already attributed, fine
    return { error: error.message };
  }

  // Bump the code's usage counter. Two-step read-then-write because v1
  // doesn't have an increment RPC defined; correctness here doesn't matter
  // for billing (the source of truth for credit is referral_attributions),
  // it's just a cheap counter for the dashboard.
  const { data: codeRow } = await admin
    .from("referral_codes")
    .select("use_count")
    .eq("code", lookup.code)
    .maybeSingle();
  if (codeRow) {
    await admin
      .from("referral_codes")
      .update({ use_count: (codeRow.use_count ?? 0) + 1 })
      .eq("code", lookup.code);
  }

  return { ok: true };
}
