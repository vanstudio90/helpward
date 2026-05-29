// Pure helpers — safe to import from client components. Server fetchers
// live in lib/data/referrals.ts; this file deliberately has no Supabase
// imports so the client bundle stays small.

// Code alphabet: excludes 0/O, 1/I/L, U (looks like V in some fonts).
// Capital letters + digits gives us 27 chars × 7 positions ≈ 10 billion combos,
// plenty for v1 even if every Helpward user gets a code.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789";
const CODE_LENGTH = 7;

export function generateReferralCode(): string {
  let out = "";
  // crypto.getRandomValues works in browser AND Node 16+ — Next runtime
  // exposes the global. No external dep needed.
  const buf = new Uint8Array(CODE_LENGTH);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(buf);
  } else {
    for (let i = 0; i < CODE_LENGTH; i++) buf[i] = Math.floor(Math.random() * 256);
  }
  for (let i = 0; i < CODE_LENGTH; i++) {
    out += CODE_ALPHABET[buf[i] % CODE_ALPHABET.length];
  }
  return out;
}

// Validate a code shape WITHOUT hitting the DB — for early rejection on
// malformed input ("hi mom", with spaces, etc.). Real existence check is
// still a server-side query.
export function isValidCodeShape(s: string): boolean {
  if (typeof s !== "string") return false;
  if (s.length < 4 || s.length > 16) return false;
  // Allow uppercase letters + digits — we normalise input to uppercase
  // before storing so users typing in lowercase still match.
  return /^[A-Z0-9]+$/.test(s);
}

export function normaliseCode(s: string): string {
  return s.trim().toUpperCase();
}

export type ReferralStats = {
  totalShared: number;       // # signups via your code
  qualified: number;         // # of those that completed a first booking
  earnedCents: number;       // sum of qualified referrer_credit_cents
  balanceCents: number;      // current spendable balance (profile column)
};

// Default rewards (mirror migration default). Used by the UI copy.
export const DEFAULT_REWARD_CENTS = 1000; // $10
