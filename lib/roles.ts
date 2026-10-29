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
 * What a NEW account is given.
 *
 * Still the old value: the enum has not been renamed yet, so writing
 * "helper" would be rejected by the type. Flipped in the same change
 * that renames the enum value.
 */
export const NEW_HELPER_ROLE = "provider";

/** Where someone lands after signing in. */
export function homePathFor(role: string | null | undefined): string {
  if (isAdminRole(role)) return "/admin";
  return isHelperRole(role) ? "/helper/dashboard" : "/dashboard";
}
