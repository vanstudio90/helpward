/**
 * What a Stripe `disabled_reason` actually means to the helper reading it.
 *
 * Stripe uses this field for two very different situations and we were
 * treating them alike:
 *
 *   requirements.*  — the account is incomplete. Nothing is wrong; Stripe
 *                     is waiting on information the helper has not entered
 *                     yet, or is checking what they did enter. This is the
 *                     ordinary state of every half-finished signup.
 *   rejected.* /
 *   listed /
 *   platform_paused — the account genuinely cannot be used, and a person
 *                     needs to look at it.
 *
 * Only the second kind warrants alarm or a support address.
 */
export function describeDisabledReason(
  reason: string | null,
): { message: string; serious: boolean } | null {
  if (!reason) return null;

  if (reason === "requirements.past_due") {
    return {
      serious: false,
      message: "Your payout setup isn't finished yet. Stripe needs the details below before you can be paid.",
    };
  }
  if (reason === "requirements.pending_verification") {
    return {
      serious: false,
      message: "Stripe is checking the details you submitted. This usually takes a few minutes, occasionally a day.",
    };
  }
  if (reason.startsWith("requirements.")) {
    return {
      serious: false,
      message: "Stripe needs more information before you can be paid. Continue below to provide it.",
    };
  }
  if (reason === "under_review" || reason === "listed") {
    return {
      serious: false,
      message: "Stripe is reviewing your payout account. You'll be able to be paid once that finishes.",
    };
  }
  // rejected.fraud, rejected.terms_of_service, rejected.listed,
  // rejected.other, platform_paused, and anything Stripe adds later.
  return {
    serious: true,
    message: "Stripe can't enable payouts on this account. Email support@helpward.com and we'll look into it.",
  };
}
