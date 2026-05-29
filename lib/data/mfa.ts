import { randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { generateRecoveryCodeSet, normaliseRecoveryCode } from "@/lib/mfa-pure";

// Recovery-code hashing — scrypt with a 16-byte salt per code. Stored as
// "<salt_b64>:<hash_b64>". scrypt's design (memory-hard) keeps brute-force
// expensive even if the DB is leaked; our codes are short but high-entropy,
// so a single scrypt round per verification is fast enough.

const SCRYPT_KEY_LEN = 32;
const SCRYPT_COST = 16384; // N — Node default, good balance for v1

function hashRecoveryCode(plaintext: string): string {
  const salt = randomBytes(16);
  const key = scryptSync(plaintext.normalize("NFKC"), salt, SCRYPT_KEY_LEN, { N: SCRYPT_COST });
  return `${salt.toString("base64")}:${key.toString("base64")}`;
}

function verifyRecoveryCodeHash(plaintext: string, stored: string): boolean {
  const [saltB64, hashB64] = stored.split(":");
  if (!saltB64 || !hashB64) return false;
  let salt: Buffer, expected: Buffer;
  try {
    salt = Buffer.from(saltB64, "base64");
    expected = Buffer.from(hashB64, "base64");
  } catch { return false; }
  const candidate = scryptSync(plaintext.normalize("NFKC"), salt, SCRYPT_KEY_LEN, { N: SCRYPT_COST });
  if (candidate.length !== expected.length) return false;
  return timingSafeEqual(candidate, expected);
}

// Generate + persist a fresh set of 10 recovery codes for a user. Returns
// the plaintexts so the UI can show them ONCE; we never persist the
// plaintexts (only the salted hashes).
export async function generateAndStoreRecoveryCodes(userId: string): Promise<string[]> {
  const admin = createSupabaseServiceClient();

  // Clear any existing rows first — a code-set rotation invalidates the
  // previous set in its entirety.
  await admin.from("mfa_recovery_codes").delete().eq("user_id", userId);

  const codes = generateRecoveryCodeSet();
  const rows = codes.map((c) => ({
    user_id: userId,
    code_hash: hashRecoveryCode(c),
  }));
  const { error } = await admin.from("mfa_recovery_codes").insert(rows);
  if (error) throw new Error(`Couldn't store recovery codes: ${error.message}`);
  return codes;
}

// Verify a recovery code for a user. On match: mark the row as used and
// return true. Constant-time per check so a malicious user can't probe by
// timing; we scan every active row even after finding a match because the
// scrypt cost dominates the wall-clock and short-circuiting would still
// leak position-ordering anyway.
export async function consumeRecoveryCode(
  userId: string,
  rawCode: string,
  usedIp: string | null,
): Promise<boolean> {
  const code = normaliseRecoveryCode(rawCode);
  if (!code) return false;

  const admin = createSupabaseServiceClient();
  const { data: rows } = await admin
    .from("mfa_recovery_codes")
    .select("id, code_hash")
    .eq("user_id", userId)
    .is("used_at", null);

  if (!rows || rows.length === 0) return false;

  let matchedRowId: string | null = null;
  for (const row of rows) {
    // Don't short-circuit — keep verifying so timing doesn't leak position.
    if (verifyRecoveryCodeHash(code, row.code_hash)) {
      matchedRowId = matchedRowId ?? row.id;
    }
  }
  if (!matchedRowId) return false;

  await admin
    .from("mfa_recovery_codes")
    .update({ used_at: new Date().toISOString(), used_ip: usedIp })
    .eq("id", matchedRowId);
  return true;
}

// Counts for the settings page badge — "X of 10 unused".
export async function getRecoveryCodeStatus(userId: string): Promise<{ total: number; remaining: number }> {
  const admin = createSupabaseServiceClient();
  const [{ count: total }, { count: remaining }] = await Promise.all([
    admin.from("mfa_recovery_codes").select("*", { count: "exact", head: true }).eq("user_id", userId),
    admin.from("mfa_recovery_codes").select("*", { count: "exact", head: true }).eq("user_id", userId).is("used_at", null),
  ]);
  return { total: total ?? 0, remaining: remaining ?? 0 };
}

// Wipe ALL recovery codes for a user. Called when 2FA is unenrolled.
export async function clearRecoveryCodes(userId: string): Promise<void> {
  const admin = createSupabaseServiceClient();
  await admin.from("mfa_recovery_codes").delete().eq("user_id", userId);
}
