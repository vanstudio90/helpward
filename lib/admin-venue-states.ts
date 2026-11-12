/*
  WHAT A VENUE HAS ACTUALLY TOLD US.

  THE THIRD STATE IS THE IMPORTANT ONE. "Nobody has asked this venue"
  is not "this venue says no", and it is certainly not "this venue says
  yes". lib/venue-gate.ts already encodes that rule on the server: a
  refused venue blocks the request, an unchecked one proceeds with the
  customer told plainly that it is unverified.

  CONDITIONAL IS IN THIS DESIGN AND NOT YET IN THAT GATE. The gate
  understands allowed, refused and unknown. A conditional permission —
  "only before 10am", "only the general queue" — has to be evaluated,
  and where it cannot be, the brief is explicit that it goes for review
  rather than being read as permission. The console says so wherever
  the state appears, so nobody ships a condition the server cannot
  enforce.
*/

export type VenuePermission = "allowed" | "refused" | "unknown" | "conditional";

export const PERMISSION_LABEL: Record<VenuePermission, string> = {
  allowed: "Allowed",
  refused: "Refused",
  unknown: "Unchecked",
  conditional: "Conditional",
};

export const PERMISSION_TONE: Record<VenuePermission, string> = {
  allowed: "bg-emerald-50 text-emerald-700",
  refused: "bg-rose-50 text-rose-700",
  unknown: "bg-slate-100 text-slate-600",
  conditional: "bg-amber-50 text-amber-800",
};

/** What each answer does to a booking, in the words the gate uses. */
export const PERMISSION_EFFECT: Record<VenuePermission, string> = {
  allowed: "New requests go ahead, with the scope and conditions shown. Permission is not a guarantee of entry.",
  refused: "New Wait in Line requests for this venue and queue are blocked on the server, on the website and in the app.",
  unknown: "Requests go ahead with the customer told the venue is unverified, and the helper checks on arrival.",
  conditional: "The recorded conditions are evaluated. Where eligibility cannot be determined, the request goes for review — never through as unrestricted permission.",
};

/** Whether the enforcement path can act on this answer today. */
export const PERMISSION_ENFORCED: Record<VenuePermission, boolean> = {
  allowed: true,
  refused: true,
  unknown: true,
  conditional: false,
};

export type ReviewState = "current" | "due_soon" | "overdue" | "never_checked";

export const REVIEW_LABEL: Record<ReviewState, string> = {
  current: "Current",
  due_soon: "Due soon",
  overdue: "Overdue",
  never_checked: "Never checked",
};

export const REVIEW_TONE: Record<ReviewState, string> = {
  current: "bg-slate-100 text-slate-600",
  due_soon: "bg-amber-50 text-amber-800",
  overdue: "bg-rose-50 text-rose-700",
  never_checked: "bg-slate-100 text-slate-500",
};
