/*
  WHY AN APPLICATION IS STILL OPEN, in words.

  The states themselves are decided in the database by
  helper_review_state (0100) — one definition, so the queue's chip and
  the panel's checklist cannot disagree. This file is only how they are
  SAID, and it lives apart from lib/data/admin-helpers.ts because that
  module is server-only and the review panel is a client component.

  THE TONES CARRY MEANING, not decoration: green is ours to decide,
  amber is waiting on the applicant, blue is waiting on a third party.
  A reviewer scanning the column should see their own work without
  reading a word of it.
*/

export type HelperState =
  | "info_requested" | "photo_missing" | "contact_missing"
  | "identity_pending" | "background_pending" | "payout_incomplete" | "ready";

export const STATE_LABEL: Record<HelperState, string> = {
  ready: "Ready for decision",
  info_requested: "More information requested",
  photo_missing: "Photo missing",
  contact_missing: "No phone number",
  identity_pending: "Identity pending",
  background_pending: "Background check pending",
  payout_incomplete: "Payout setup incomplete",
};

export const STATE_TONE: Record<HelperState, string> = {
  ready: "bg-emerald-50 text-emerald-700",
  info_requested: "bg-amber-50 text-amber-800",
  photo_missing: "bg-amber-50 text-amber-800",
  contact_missing: "bg-amber-50 text-amber-800",
  identity_pending: "bg-sky-50 text-sky-700",
  background_pending: "bg-sky-50 text-sky-700",
  payout_incomplete: "bg-sky-50 text-sky-700",
};
