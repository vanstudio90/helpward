// Slug helpers — shared by the provider profile editor + the URL resolver.
// Pure; safe to import from client.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Trailing -xxxx hex disambiguator we tack onto every auto-generated slug
// so "maya" and a second "maya" don't collide. Editor allows the helper
// to drop it if they pick a guaranteed-unique slug themselves.
const DISAMBIG = /-[0-9a-f]{4}$/i;

export function isUuid(s: string): boolean {
  return UUID_RE.test(s);
}

// kebab-case any free-form string. Collapses whitespace + punctuation,
// strips leading/trailing dashes, lowercases. Empty result is intentional
// — the caller decides whether to fall back ("helper") or error.
export function kebab(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

// Generate a slug from a full name + user_id. Matches the SQL backfill in
// 0022 so brand-new helpers and migrated ones look the same.
export function slugFromName(fullName: string | null | undefined, userId: string): string {
  const base = kebab(fullName ?? "helper") || "helper";
  return `${base}-${userId.slice(0, 4)}`;
}

// Validation for the helper-side slug editor. Returns null when ok.
// Allows 3-60 chars, lower-kebab, must not be a UUID shape (would be
// ambiguous with the legacy URL form).
export function validateSlug(s: string): string | null {
  if (s.length < 3) return "Slug must be at least 3 characters.";
  if (s.length > 60) return "Slug must be 60 characters or fewer.";
  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(s)) {
    return "Use lowercase letters, numbers, and dashes only — no leading/trailing dash.";
  }
  if (isUuid(s)) return "Slug can't look like a UUID.";
  return null;
}

export const HAS_DISAMBIGUATOR_SUFFIX = DISAMBIG;
