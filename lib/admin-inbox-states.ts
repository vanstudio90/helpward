/*
  WHAT THE INBOX'S WORDS MEAN, in one place the browser can import.

  Kept apart from lib/data/admin-inbox.ts because that module is
  `server-only`; the thread and the composer are client components and
  render the same badges.

  THE DELIVERY LABELS ARE THE POINT OF THIS FILE. A support console
  that draws every outbound message the same way teaches its operators
  that pressing Send is the same thing as the customer reading it. It
  is not, and these five words are the difference.
*/

export type CaseStatus = "open" | "waiting" | "resolved";

export const STATUS_LABEL: Record<CaseStatus, string> = {
  open: "Open",
  waiting: "Waiting",
  resolved: "Resolved",
};

export const STATUS_TONE: Record<CaseStatus, string> = {
  open: "bg-emerald-50 text-emerald-700",
  waiting: "bg-amber-50 text-amber-800",
  resolved: "bg-slate-100 text-slate-600",
};

/** What the status actually means, for the operator who has to choose one. */
export const STATUS_MEANING: Record<CaseStatus, string> = {
  open: "We owe them a reply. The clock is running.",
  waiting: "They owe us an answer. The clock is stopped.",
  resolved: "Finished. A new message reopens it.",
};

export type CasePriority = "low" | "normal" | "high" | "urgent";

export const PRIORITY_LABEL: Record<CasePriority, string> = {
  low: "Low", normal: "Normal", high: "High", urgent: "Urgent",
};

export const PRIORITY_DOT: Record<CasePriority, string> = {
  low: "bg-slate-300",
  normal: "bg-amber-400",
  high: "bg-orange-500",
  urgent: "bg-rose-500",
};

export const PRIORITY_TONE: Record<CasePriority, string> = {
  low: "bg-slate-100 text-slate-600",
  normal: "bg-slate-100 text-slate-700",
  high: "bg-orange-50 text-orange-700",
  urgent: "bg-rose-50 text-rose-700",
};

export type Channel = "email" | "in_app";

export const CHANNEL_LABEL: Record<Channel, string> = {
  email: "Email",
  in_app: "In-app",
};

export type Delivery = "recorded" | "sent" | "delivered" | "not_configured" | "failed";

export const DELIVERY_LABEL: Record<Delivery, string> = {
  recorded: "Written down — not sent",
  sent: "Sent",
  delivered: "Delivered",
  not_configured: "Not sent — no mail key here",
  failed: "Not sent",
};

export const DELIVERY_TONE: Record<Delivery, string> = {
  recorded: "bg-slate-100 text-slate-600",
  sent: "bg-emerald-50 text-emerald-700",
  delivered: "bg-emerald-50 text-emerald-700",
  not_configured: "bg-amber-50 text-amber-800",
  failed: "bg-rose-50 text-rose-700",
};

export type AlertSeverity = "critical" | "warning" | "info";

export const SEVERITY_TONE: Record<AlertSeverity, {
  card: string; chip: string; label: string;
}> = {
  critical: {
    card: "bg-rose-50 border-rose-200",
    chip: "bg-rose-100 text-rose-800",
    label: "Needs someone now",
  },
  warning: {
    card: "bg-amber-50 border-amber-200",
    chip: "bg-amber-100 text-amber-900",
    label: "Today",
  },
  info: {
    card: "bg-white border-slate-200",
    chip: "bg-slate-100 text-slate-700",
    label: "Backlog",
  },
};

/** The reply target, stated once and shown wherever a clock appears. */
export const REPLY_TARGET_HOURS = 4;
