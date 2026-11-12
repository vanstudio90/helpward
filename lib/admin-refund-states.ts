/*
  THE WORDS THE REFUNDS SCREEN USES.

  THE DISTINCTION THIS FILE EXISTS FOR: "awaiting review" is a request
  somebody inside Helpward has made. Nothing has been sent to Stripe,
  no money has moved, and the customer has been told nothing. Drawing
  it in the same family as "succeeded" is how a support agent comes to
  tell somebody their refund is on its way when it has not been
  submitted.

  AND "SUCCEEDED" IS NOT "THE CUSTOMER HAS THE MONEY". Stripe accepting
  a refund starts a journey through card networks that takes days. The
  label says what we know — the processor took it — and the screen says
  the rest out loud.
*/

export type RefundState = "awaiting_review" | "processing" | "succeeded" | "failed" | "cancelled";

export const REFUND_LABEL: Record<RefundState, string> = {
  awaiting_review: "Awaiting review",
  processing: "Processing",
  succeeded: "Succeeded",
  failed: "Failed",
  cancelled: "Cancelled",
};

export const REFUND_TONE: Record<RefundState, string> = {
  awaiting_review: "bg-violet-50 text-violet-700",
  processing: "bg-amber-50 text-amber-800",
  succeeded: "bg-emerald-50 text-emerald-700",
  failed: "bg-rose-50 text-rose-700",
  cancelled: "bg-slate-100 text-slate-600",
};

export const REFUND_MEANING: Record<RefundState, string> = {
  awaiting_review: "An internal request. Nothing has been sent to Stripe and nobody has been told.",
  processing: "Submitted to Stripe and not yet settled. The outcome is not known.",
  succeeded: "Stripe accepted it. The customer's bank may take days to show it.",
  failed: "The attempt did not go through. Check whether an earlier attempt did before retrying.",
  cancelled: "The request was withdrawn before it was submitted.",
};

export const REFUND_REASONS = [
  { value: "service_issue", label: "Service issue" },
  { value: "no_show", label: "Helper did not arrive" },
  { value: "duplicate_charge", label: "Duplicate charge" },
  { value: "overcharge", label: "Charged the wrong amount" },
  { value: "cancelled_late", label: "Cancelled outside the window" },
  { value: "goodwill", label: "Goodwill" },
  { value: "chargeback_pre_empt", label: "Pre-empting a chargeback" },
] as const;

/*
  A refund has TWO outcomes, not one: the money going back to the
  customer, and the helper's transfer being adjusted. They are separate
  operations at Stripe and either can fail on its own, so the console
  tracks them separately and never reports one as the other.
*/
export type EffectState = "pending" | "requires_review" | "applied" | "failed" | "not_applicable";

export const EFFECT_LABEL: Record<EffectState, string> = {
  pending: "Will be calculated",
  requires_review: "Requires review",
  applied: "Applied",
  failed: "Failed",
  not_applicable: "Not applicable",
};

export const EFFECT_TONE: Record<EffectState, string> = {
  pending: "bg-slate-100 text-slate-600",
  requires_review: "bg-amber-100 text-amber-900",
  applied: "bg-emerald-50 text-emerald-700",
  failed: "bg-rose-50 text-rose-700",
  not_applicable: "bg-slate-100 text-slate-500",
};
