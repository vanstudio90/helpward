import "server-only";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

/*
  CANCELLING A SCHEDULED DELETION BY COMING BACK.

  The app and the website both promise this in so many words — "signing
  back in during those 30 days cancels it entirely", "Sign back in
  within that window to cancel" — and nothing did it. The only thing
  that ever cancelled a request was a button on /settings/data, so a
  customer who followed the instruction they were actually given kept
  their deletion date and had no way to know.

  That is the shape of promise that has to be code rather than copy: the
  cost of believing it is the account.

  ONE IMPLEMENTATION, because there are two sign-in paths. The website
  signs in through a Server Action; the app signs in against Supabase
  directly and then calls /api/v1/account/deletion/cancel. Two separate
  versions of "undelete my account" is how one of them ends up
  forgotten, which is how this started.
*/

/** Why the deletion was called off — recorded in the audit entry. */
export type CancellationTrigger = "signed_in" | "undo";

export type DeletionCancellation =
  /** A pending request was called off. `graceUntil` is the date that no longer applies. */
  | { cancelled: true; graceUntil: string }
  /** Nothing was pending. The ordinary case on nearly every sign-in, and not an error. */
  | { cancelled: false };

/**
 * Cancel this user's pending deletion request, if they have one.
 *
 * ONLY WHILE THE GRACE WINDOW IS OPEN. "Sign back in before that date"
 * is the promise that was made; reviving an account whose date has
 * already passed would be a different and larger one. A request past its
 * date is left alone for the cron to execute.
 */
export async function cancelPendingDeletion(
  userId: string,
  trigger: CancellationTrigger,
): Promise<DeletionCancellation> {
  const admin = createSupabaseServiceClient();

  /*
    `status = 'pending'` is part of the UPDATE rather than a check before
    it, so two sign-ins racing each other cannot both report that they
    were the one that cancelled it, and neither can revive a request the
    cron has already moved to `executing`.
  */
  const { data, error } = await admin
    .from("account_deletion_requests")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("status", "pending")
    .gt("grace_until", new Date().toISOString())
    .select("grace_until")
    .maybeSingle();

  if (error) {
    /*
      Reported, not swallowed. A failure here means somebody is still
      scheduled for deletion while being told they are not, and that is
      worth a line in the log even though the caller carries on.
    */
    console.error("could not cancel pending deletion", userId, error.message);
    return { cancelled: false };
  }
  if (!data) return { cancelled: false };

  await admin.from("audit_log").insert({
    actor_id: userId,
    action: "user.deletion_cancelled",
    target_table: "account_deletion_requests",
    target_id: userId,
    payload: { trigger },
  });

  return { cancelled: true, graceUntil: (data as { grace_until: string }).grace_until };
}
