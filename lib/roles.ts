/* Who someone is, during a rename.
 *
 * The worker role is stored as the Postgres enum value 'provider' and
 * mirrored into auth app_metadata. Renaming the enum value is atomic —
 * Postgres stores enums by OID, so every row flips at once — which is
 * exactly why the comparison has to stop being a string literal BEFORE
 * the rename runs. A deploy that still said `role === "provider"` would
 * lock every helper out of their own app the instant the migration
 * landed, mid-shift, with a job in progress.
 *
 * So reads accept both spellings and writes keep emitting the old one
 * until the data has moved. The pair is removed once production has no
 * 'provider' left; until then, accepting both is the only safe state.
 */

export type UserRole = "customer" | "helper" | "provider" | "admin";

/** The worker role, under either spelling. */
export function isHelperRole(role: string | null | undefined): boolean {
  return role === "helper" || role === "provider";
}

export function isAdminRole(role: string | null | undefined): boolean {
  return role === "admin";
}

/** A worker, or an admin acting as one. */
export function canUseHelperArea(role: string | null | undefined): boolean {
  return isHelperRole(role) || isAdminRole(role);
}

/**
 * What a NEW account is given, and what a favourited helper is filed as.
 *
 * Both are still the RETIRED spelling, deliberately. The enum rename
 * (migration 0081) has not been applied to production yet, and these are
 * writes: handle_new_user casts meta_role::user_role, and favorites has
 * a CHECK constraint. Writing "helper" before the schema accepts it
 * fails the signup outright, after the auth user row already exists.
 *
 * These two constants are the whole switch. Flip them in the same change
 * that applies 0081; everything else already reads through isHelperRole
 * or the tolerant pair below and needs no edit.
 */
export const NEW_HELPER_ROLE = "provider";
export const FAVORITE_HELPER_KIND = "provider";

/**
 * Both spellings, for READS that must work either side of the migration.
 *
 * A read filtered on one spelling returns nothing the moment the data
 * moves — an empty favourites list rather than an error, which is the
 * kind of break nobody reports and everybody notices.
 */
export const HELPER_KINDS = ["helper", "provider"] as const;

/** Where someone lands after signing in. */
export function homePathFor(role: string | null | undefined): string {
  if (isAdminRole(role)) return "/admin";
  return isHelperRole(role) ? "/helper/dashboard" : "/dashboard";
}
