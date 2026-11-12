/*
  MODERATING FEEDBACK, AND THE ONE CONFUSION THAT MATTERS MOST.

  A LOW RATING IS NOT A POLICY VIOLATION. Two stars is a customer's
  honest opinion of a job, and a console that files it beside abuse
  teaches its moderators to delete criticism. Low-star filtering exists
  to help somebody read the feedback; it is never a reason on a
  decision, and the reason list below does not contain one.

  AND THE TEXT AND THE RATING ARE TWO DECISIONS. Hiding a comment that
  contains somebody's phone number says nothing about whether the two
  stars were deserved — but in this product hiding does currently
  remove the rating from the public average, because
  refresh_provider_rating() aggregates only customer_visible rows and
  runs on update. That is stated wherever it matters rather than left
  to be discovered.
*/

export type ReviewVisibility = "published" | "hidden" | "pending_appeal";

export const VISIBILITY_LABEL: Record<ReviewVisibility, string> = {
  published: "Published",
  hidden: "Hidden",
  pending_appeal: "Appeal open",
};

export const VISIBILITY_TONE: Record<ReviewVisibility, string> = {
  published: "bg-emerald-50 text-emerald-700",
  hidden: "bg-slate-200 text-slate-700",
  pending_appeal: "bg-violet-50 text-violet-700",
};

/*
  WHY A REVIEW WAS REPORTED — reasons somebody can act on. There is no
  "low rating" here on purpose: nobody may record that as grounds.
*/
export const REPORT_REASONS = [
  { value: "personal_information", label: "Personal information", policy: "Privacy & personal information" },
  { value: "abusive_language", label: "Abusive language", policy: "Respectful communication" },
  { value: "disputed_accuracy", label: "Disputed accuracy", policy: "Accuracy of feedback" },
  { value: "not_about_service", label: "Not about the service", policy: "Relevance" },
  { value: "safety_concern", label: "Safety concern", policy: "Safety" },
  { value: "spam", label: "Spam or promotion", policy: "Spam" },
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number]["value"];

export const REASON_LABEL: Record<string, string> = Object.fromEntries(
  REPORT_REASONS.map((r) => [r.value, r.label]),
);

/*
  WHAT A DECISION DOES TO THE NUMBERS, in the words of what the code
  actually does today. "Check policy" is not an answer a moderator can
  act on; these are.
*/
export type RatingEffect = "included" | "excluded";

export const RATING_EFFECT_LABEL: Record<RatingEffect, string> = {
  included: "Included in public average",
  excluded: "Excluded from public average",
};

export const RATING_EFFECT_TONE: Record<RatingEffect, string> = {
  included: "bg-emerald-50 text-emerald-700",
  excluded: "bg-amber-50 text-amber-800",
};

export type ReportState = "unassigned" | "assigned" | "decided" | "appealed";

export const REPORT_STATE_LABEL: Record<ReportState, string> = {
  unassigned: "Unassigned",
  assigned: "In review",
  decided: "Decided",
  appealed: "Appealed",
};
