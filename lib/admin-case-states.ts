/*
  THE WORDS A SAFETY CASE USES, in one client-safe place.

  The distinction this file exists to hold is between a SAFETY report
  and a SERVICE dispute. They are the same table and nothing alike in
  practice: one is about a person's conduct and one is about a job not
  being done properly, and a queue that renders them identically
  teaches a reviewer to triage them identically.
*/

export type CaseKind = "safety" | "service";

export const KIND_LABEL: Record<CaseKind, string> = {
  safety: "Safety",
  service: "Service",
};

export const KIND_TONE: Record<CaseKind, string> = {
  safety: "bg-violet-50 text-violet-700 border-violet-200",
  service: "bg-slate-50 text-slate-600 border-slate-200",
};

export type CaseStatus =
  | "open" | "investigating" | "awaiting_response" | "evidence_requested"
  | "resolved" | "escalated";

/* 'open' means nobody has picked it up yet. The stored value kept its
   name so that every query written before 0104 still counts it. */
export const CASE_STATUS_LABEL: Record<CaseStatus, string> = {
  open: "New",
  investigating: "Investigating",
  awaiting_response: "Awaiting response",
  evidence_requested: "Evidence requested",
  resolved: "Resolved",
  escalated: "Escalated",
};

export const CASE_STATUS_TONE: Record<CaseStatus, string> = {
  open: "bg-brand-50 text-brand-700",
  investigating: "bg-sky-50 text-sky-700",
  awaiting_response: "bg-amber-50 text-amber-800",
  evidence_requested: "bg-amber-50 text-amber-800",
  resolved: "bg-emerald-50 text-emerald-700",
  escalated: "bg-rose-50 text-rose-700",
};

export const CASE_STATUS_MEANING: Record<CaseStatus, string> = {
  open: "Nobody has started on this yet.",
  investigating: "Somebody is working it now.",
  awaiting_response: "We are waiting on a person.",
  evidence_requested: "We are waiting on a file or a record.",
  resolved: "Closed with a finding. Reopening keeps that finding.",
  escalated: "Handed to somebody senior, who has been told.",
};

export type CasePriority = "low" | "normal" | "high" | "urgent";

export const CASE_PRIORITY_LABEL: Record<CasePriority, string> = {
  low: "Low", normal: "Normal", high: "High", urgent: "Urgent",
};

export const CASE_PRIORITY_TONE: Record<CasePriority, string> = {
  low: "bg-slate-100 text-slate-600",
  normal: "bg-slate-100 text-slate-700",
  high: "bg-amber-100 text-amber-900",
  urgent: "bg-rose-100 text-rose-800",
};

export type CaseOutcome =
  | "upheld" | "partly_upheld" | "not_upheld" | "no_action" | "duplicate" | "withdrawn";

export const OUTCOME_LABEL: Record<CaseOutcome, string> = {
  upheld: "Upheld",
  partly_upheld: "Partly upheld",
  not_upheld: "Not upheld",
  no_action: "No action needed",
  duplicate: "Duplicate of another case",
  withdrawn: "Withdrawn by the reporter",
};

/* What each outcome commits us to — shown beside the choice, because
   "upheld" means different things to different reviewers otherwise. */
export const OUTCOME_MEANING: Record<CaseOutcome, string> = {
  upheld: "We found the report to be accurate.",
  partly_upheld: "Some of the report stands; some does not.",
  not_upheld: "We found no support for the report.",
  no_action: "Nothing further is needed from us.",
  duplicate: "The same matter is being handled on another case.",
  withdrawn: "The person who reported it withdrew it.",
};

export const SOURCE_LABEL: Record<string, string> = {
  in_app: "Reported in the app",
  email: "Reported by email",
  phone: "Reported by telephone",
  staff: "Recorded by staff",
  other: "Other source",
};

export const EVENT_LABEL: Record<string, string> = {
  reported: "Reported",
  assigned: "Owner changed",
  status_changed: "Status changed",
  priority_changed: "Priority changed",
  note: "Internal note",
  task_added: "Step added",
  task_completed: "Step completed",
  task_reopened: "Step reopened",
  evidence_added: "Evidence added",
  evidence_viewed: "Evidence opened",
  party_contacted: "Party contacted",
  review_scheduled: "Review scheduled",
  resolved: "Resolved",
  reopened: "Reopened",
  escalated: "Escalated",
  escalation_acknowledged: "Escalation acknowledged",
  linked: "Linked",
};
