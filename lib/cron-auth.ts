import { timingSafeEqual } from "crypto";

// Timing-safe comparison of the `Authorization: Bearer …` header against
// CRON_SECRET. A plain `===` leaks the secret one char at a time via response
// timing; this constant-time check doesn't. Returns true iff authorised.
export function isAuthorizedCron(authHeader: string | null): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const expected = `Bearer ${secret}`;
  const provided = authHeader ?? "";
  // timingSafeEqual requires equal-length buffers — short-circuit on mismatch
  // length but only AFTER constructing the comparison, since the length check
  // itself is not the secret-leaking part.
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}
