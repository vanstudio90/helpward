/*
  THE AUDIT LOG'S VOCABULARY.

  TWO DISTINCTIONS THIS FILE EXISTS FOR.

  AN ATTEMPT IS NOT AN OUTCOME. "Refund requested" is a person asking;
  "Refund confirmed" is the processor agreeing. Logging the first and
  styling it like the second is how somebody reads a trail and
  concludes money moved when it did not. Outcomes are therefore four
  words, not two, and `submitted` is the honest state of anything whose
  result is still with somebody else.

  AND THE ROLE IS THE ROLE AT THE TIME. A person's profile says what
  they are today. An event says what they were when they did it — the
  two drift, and when they do it is the event that is right. This
  matters more than it sounds: the admin claim in this product lives in
  the JWT, not in profiles.role, so somebody can act as an admin while
  their profile row says customer, and a log that reads the profile
  today will label them wrongly forever.
*/

export type EventOutcome = "succeeded" | "submitted" | "denied" | "failed";

export const OUTCOME_LABEL: Record<EventOutcome, string> = {
  succeeded: "Succeeded",
  submitted: "Submitted",
  denied: "Denied",
  failed: "Failed",
};

export const OUTCOME_TONE: Record<EventOutcome, string> = {
  succeeded: "bg-emerald-50 text-emerald-700",
  submitted: "bg-sky-50 text-sky-700",
  denied: "bg-amber-50 text-amber-800",
  failed: "bg-rose-50 text-rose-700",
};

export const OUTCOME_MEANING: Record<EventOutcome, string> = {
  succeeded: "The server completed it.",
  submitted: "Handed to somebody else — a processor, a mail provider — and not yet confirmed.",
  denied: "Refused. The actor was not permitted, or a rule said no.",
  failed: "Attempted and did not complete. The reason is on the event.",
};

export type ActorKind = "staff" | "customer" | "helper" | "system" | "removed";

export const ACTOR_LABEL: Record<ActorKind, string> = {
  staff: "Admin",
  customer: "Customer",
  helper: "Helper",
  system: "System",
  removed: "Removed account",
};

export const ACTOR_TONE: Record<ActorKind, string> = {
  staff: "bg-violet-50 text-violet-700",
  customer: "bg-slate-100 text-slate-600",
  helper: "bg-sky-50 text-sky-700",
  system: "bg-slate-100 text-slate-500",
  removed: "bg-amber-50 text-amber-800",
};

/*
  RAW ACTION CODES ARE FOR MACHINES. An operator reading a trail at
  nine in the morning should not have to parse "provider.approve". The
  map is the one place a code becomes a sentence; anything missing from
  it falls back to a tidied version of the code rather than a blank.
*/
export const ACTION_LABEL: Record<string, string> = {
  "provider.approve": "Helper approved",
  "provider.reject": "Helper application rejected",
  "helper.info_requested": "Information requested from helper",
  "customer.restrict": "Customer account restricted",
  "customer.unrestrict": "Customer restriction lifted",
  "admin.customer_contact_revealed": "Customer contact details revealed",
  "admin.private_details_revealed": "Private instructions revealed",
  "admin.customers_exported": "Customer list exported",
  "dispute.created": "Safety case opened",
  "dispute.resolved": "Safety case resolved",
  "dispute.reopened": "Safety case reopened",
  "dispute.escalated": "Safety case escalated",
  "dispute.evidence_viewed": "Case evidence opened",
  "dispute.exported": "Case list exported",
  "support.case_updated": "Support case updated",
  "support.snoozed": "Support case snoozed",
  "support.reply_target_set": "Reply target changed",
  "review.hide": "Review hidden",
  "review.restore": "Review restored",
  "refund.requested": "Refund requested",
  "refund.confirmed": "Refund confirmed",
  "venue.policy_published": "Venue policy published",
  "user.data_export_requested": "Data export requested",
  "connect.onboarding_failed": "Payout onboarding failed",
  "audit.correction": "Correction to an earlier entry",
};

export function actionLabel(code: string): string {
  if (ACTION_LABEL[code]) return ACTION_LABEL[code];
  const tidy = code.replace(/[._]/g, " ").trim();
  return tidy.charAt(0).toUpperCase() + tidy.slice(1);
}

export const TIMEZONES = [
  "America/Vancouver",
  "America/Toronto",
  "America/Los_Angeles",
  "UTC",
] as const;
