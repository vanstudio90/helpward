/*
  EXPORTS AND DELETIONS, AND THE WORDS THAT MUST NOT BLUR.

  SCHEDULED, ELIGIBLE AND DELETED ARE THREE DIFFERENT THINGS. A
  deletion request becomes eligible when its grace period ends; it is
  deleted when the work has actually run and every step reported
  success. A console that shows "Deleted" at the eligible date is
  telling somebody their data is gone while it is still sitting there.

  AND A GENERATED FILE IS NOT A DELIVERED ONE. Three separate facts —
  the file exists, the notice went out, somebody downloaded it — and
  where we cannot establish the third, it reads "Not recorded" rather
  than "No".
*/

export type RequestKind = "export" | "deletion";

export type ExportState =
  | "requested" | "processing" | "available" | "expired" | "failed" | "delivered";

export const EXPORT_LABEL: Record<ExportState, string> = {
  requested: "Requested",
  processing: "Processing",
  available: "Available",
  expired: "Expired",
  failed: "Failed",
  delivered: "Downloaded",
};

export const EXPORT_TONE: Record<ExportState, string> = {
  requested: "bg-slate-100 text-slate-600",
  processing: "bg-sky-50 text-sky-700",
  available: "bg-emerald-50 text-emerald-700",
  expired: "bg-slate-200 text-slate-600",
  failed: "bg-rose-50 text-rose-700",
  delivered: "bg-emerald-50 text-emerald-700",
};

export type DeletionState =
  | "scheduled" | "eligible" | "running" | "deleted" | "partial" | "cancelled" | "failed";

export const DELETION_LABEL: Record<DeletionState, string> = {
  scheduled: "Scheduled",
  eligible: "Eligible",
  running: "Running",
  deleted: "Deleted",
  partial: "Partly completed",
  cancelled: "Cancelled",
  failed: "Failed",
};

export const DELETION_TONE: Record<DeletionState, string> = {
  scheduled: "bg-amber-50 text-amber-800",
  eligible: "bg-amber-100 text-amber-900",
  running: "bg-sky-50 text-sky-700",
  deleted: "bg-slate-200 text-slate-700",
  partial: "bg-rose-50 text-rose-700",
  cancelled: "bg-slate-100 text-slate-600",
  failed: "bg-rose-50 text-rose-700",
};

export const DELETION_MEANING: Record<DeletionState, string> = {
  scheduled: "Requested, inside its grace period. Nothing has been removed.",
  eligible: "The grace period has passed. The work has not run yet — eligible is not deleted.",
  running: "The deletion is being carried out now.",
  deleted: "Every step finished successfully.",
  partial: "Some steps succeeded and some did not. The account is not fully deleted.",
  cancelled: "Withdrawn before the grace period ended.",
  failed: "Nothing was removed. The reason is on the record.",
};

/* A download we cannot evidence is not a download we deny. */
export type Evidence = "yes" | "no" | "not_recorded";

export const EVIDENCE_LABEL: Record<Evidence, string> = {
  yes: "Yes",
  no: "No",
  not_recorded: "Not recorded",
};

export const EVIDENCE_TONE: Record<Evidence, string> = {
  yes: "text-emerald-700",
  no: "text-rose-700",
  not_recorded: "text-slate-500",
};

/*
  WHAT IS KEPT WHEN AN ACCOUNT IS DELETED, and why. Promising that
  everything disappears is a promise no marketplace can keep: a booking
  somebody else was on, a payment a regulator can ask about, a safety
  report about a third party. Naming the categories is the honest
  version.
*/
export const RETENTION_CATEGORIES = [
  { label: "Payment and payout records", treatment: "Kept, with the person's identifiers removed where the law allows.", why: "Tax and chargeback obligations." },
  { label: "Bookings involving other people", treatment: "Kept as the other party's record, with this account shown as a removed user.", why: "The other side of a transaction is their data too." },
  { label: "Safety reports and disputes", treatment: "Kept in full where they concern somebody else's safety.", why: "A report cannot be erased by the person it is about." },
  { label: "Aggregate counts", treatment: "Kept without any link back to the person.", why: "Nothing identifying remains." },
] as const;
