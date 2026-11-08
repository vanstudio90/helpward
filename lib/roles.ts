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
 * 0081 WAS APPLIED TO PRODUCTION on 2026-11-01. These were left on the
 * retired spelling, and the two writes did not fail the same way:
 *
 *   signup   SURVIVED. 0081 rewrote handle_new_user to map 'provider' to
 *            'helper' before the cast, precisely so a deploy still
 *            sending the old word could not break account creation. Real
 *            helpers signed up on 4, 5 and 7 November and are in the
 *            table to prove it.
 *   favorites BROKE. There is no coercion for it — 0081 widened the
 *            CHECK, moved the rows, then NARROWED it to
 *            ('helper','service','address'). An insert of 'provider'
 *            returns 23514, verified against production. So saving a
 *            helper has failed since the migration, and the saved-helpers
 *            list read the dead spelling and came back empty, which is
 *            the kind of break nobody reports and everybody notices.
 *
 * Both now emit what the schema accepts. Reads stay tolerant below until
 * the last token minted with the old word has expired.
 */
export const NEW_HELPER_ROLE = "helper";
export const FAVORITE_HELPER_KIND = "helper";

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
