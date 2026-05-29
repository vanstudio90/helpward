// Pure helpers for MFA recovery codes — safe to import anywhere. The hashing
// helpers themselves live in lib/data/mfa.ts because Node crypto.scrypt
// requires a server runtime. Here we only do the cosmetics + shape checks.

const ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789";
const SEGMENTS = 2;
const SEGMENT_LENGTH = 4;
const RECOVERY_CODE_COUNT = 10;

// "ABCD-EFGH" style — 8 chars across two segments, ~30^8 ≈ 6.5e11 keyspace
// (more than enough for a one-shot recovery token).
export function generateRecoveryCode(): string {
  const buf = new Uint8Array(SEGMENTS * SEGMENT_LENGTH);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(buf);
  } else {
    for (let i = 0; i < buf.length; i++) buf[i] = Math.floor(Math.random() * 256);
  }
  const chars = Array.from(buf, (b) => ALPHABET[b % ALPHABET.length]);
  return Array.from({ length: SEGMENTS }, (_, i) =>
    chars.slice(i * SEGMENT_LENGTH, (i + 1) * SEGMENT_LENGTH).join("")
  ).join("-");
}

export function generateRecoveryCodeSet(): string[] {
  const out: string[] = [];
  // Defend against the (astronomically unlikely) chance of an in-batch
  // collision — single set, so we can dedupe in JS.
  while (out.length < RECOVERY_CODE_COUNT) {
    const code = generateRecoveryCode();
    if (!out.includes(code)) out.push(code);
  }
  return out;
}

// Loose validator — accepts ABCD-EFGH or ABCDEFGH (users will sometimes
// strip the dash when typing). Normalises to the canonical form.
export function normaliseRecoveryCode(raw: string): string | null {
  const cleaned = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (cleaned.length !== SEGMENTS * SEGMENT_LENGTH) return null;
  // Reject chars outside our alphabet so a hash-lookup attempt with garbage
  // is rejected before we hit the DB.
  for (const c of cleaned) {
    if (!ALPHABET.includes(c)) return null;
  }
  return Array.from({ length: SEGMENTS }, (_, i) =>
    cleaned.slice(i * SEGMENT_LENGTH, (i + 1) * SEGMENT_LENGTH)
  ).join("-");
}

// 6-digit TOTP — verifier in Supabase, client-side we just sanity-check.
export function isValidTotpShape(raw: string): boolean {
  return /^\d{6}$/.test(raw);
}
