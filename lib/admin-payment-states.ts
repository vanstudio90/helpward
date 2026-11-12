/*
  THE WORDS THE PAYMENTS SCREEN USES.

  A payment console is read by people deciding whether somebody has
  been charged. Four of these five states are routinely collapsed into
  "paid" elsewhere, and each collapse is a different wrong answer:

    Authorized        the bank is holding the money. We have not taken it.
    Captured          we have taken it. This is the only one that is revenue.
    Capture failed    the job happened and the money did not move.
    Hold released     we let the hold go. Nobody was charged.
    Partly refunded   captured, then some of it sent back.

  Client-safe on purpose: the filters and the detail panel are browser
  components and must name a state exactly as the table does.
*/

export type PaymentState =
  | "authorized" | "captured" | "capture_failed" | "hold_released"
  | "partially_refunded" | "refunded" | "pending";

export const PAYMENT_LABEL: Record<PaymentState, string> = {
  pending: "Not authorized",
  authorized: "Authorized",
  captured: "Captured",
  capture_failed: "Capture failed",
  hold_released: "Hold released",
  partially_refunded: "Partially refunded",
  refunded: "Refunded",
};

export const PAYMENT_TONE: Record<PaymentState, string> = {
  pending: "bg-slate-100 text-slate-600",
  authorized: "bg-sky-50 text-sky-700",
  captured: "bg-emerald-50 text-emerald-700",
  capture_failed: "bg-rose-50 text-rose-700",
  hold_released: "bg-slate-100 text-slate-600",
  partially_refunded: "bg-amber-50 text-amber-800",
  refunded: "bg-amber-50 text-amber-800",
};

/** What the state commits us to, for the person deciding what to do. */
export const PAYMENT_MEANING: Record<PaymentState, string> = {
  pending: "No hold has been placed. Nothing is reserved.",
  authorized: "The bank is holding this. It is not our money yet.",
  captured: "Taken. This is the only state that is revenue.",
  capture_failed: "The job is done and the money did not move.",
  hold_released: "The hold was let go. Nobody was charged.",
  partially_refunded: "Captured, then some of it was sent back.",
  refunded: "Captured, then all of it was sent back.",
};

/* A tip is its own charge against its own intent. Showing it inside the
   service payment is how a console comes to report a total nobody was
   ever charged. */
export type PaymentLeg = "service" | "tip";

export const LEG_LABEL: Record<PaymentLeg, string> = {
  service: "Service",
  tip: "Tip",
};

export type PaymentMode = "live" | "test";

export const MODE_TONE: Record<PaymentMode, string> = {
  live: "bg-brand-600 text-white",
  test: "bg-amber-100 text-amber-900",
};
