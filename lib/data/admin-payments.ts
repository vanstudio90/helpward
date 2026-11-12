import type { PaymentState, PaymentLeg, PaymentMode } from "@/lib/admin-payment-states";

/*
  THE PAYMENTS VIEW — TYPES FIRST, DATA LATER.

  This file is deliberately the only place the payments screen gets
  anything from, and right now what it returns is SAMPLE DATA. The page
  says so, loudly, in the place a reader looks first.

  WHY A SEAM RATHER THAN A WIRED PAGE: the brief for this screen is
  being settled before the plumbing is built, and a console that shows
  invented money while looking exactly like the real one is the single
  most dangerous thing in this product. So the shape is fixed here, the
  numbers are obviously fake, and the page is stamped.

  WIRING IT LATER IS ONE FUNCTION. getPaymentsView() keeps its
  signature and returns the same shape built from bookings, refunds and
  the Stripe mirror; every component below already reads that shape.
  Nothing else has to change, and the SAMPLE flag is what the page uses
  to decide whether to keep shouting.

  THE ARITHMETIC THIS SCREEN MUST NEVER GET WRONG, encoded in the
  shape itself:

    * Holds are not captured funds, so open_holds is its own figure and
      is never added to captured.
    * Tips are separate charges against separate intents, so a tip is
      its own row with its own payment id.
    * Net captured is captures minus refunds, BEFORE fees and
      transfers — it is not profit and it is not what lands in the
      bank.
    * Currencies are never summed. The view is one currency at a time
      and says which.
*/

export type PaymentRow = {
  id: string;                  // PY-1040
  booking_ref: string;         // BK-1040
  booking_id: string | null;
  customer_name: string;
  leg: PaymentLeg;
  state: PaymentState;
  /** The headline figure for the row's current state. */
  amount_cents: number;
  /*
    THE FOUR AMOUNTS, SEPARATELY. One "Amount" column cannot describe a
    partially refunded payment: CA$34.50 of what, and what is left?
    Null means not applicable or not yet known — never zero standing in
    for an unknown.
  */
  authorized_cents: number | null;
  captured_cents: number | null;
  refunded_cents: number | null;
  remaining_refundable_cents: number | null;
  currency: string;
  mode: PaymentMode;
  /** Which event dates this row, so a total can be checked against it. */
  dated_by: "authorization" | "capture" | "refund" | "release";
  updated_at: string;
};

export type PaymentTotals = {
  /** Money we have actually taken, in this currency, in this window. */
  captured_cents: number;
  /** Authorized and not captured. The bank is holding it; we are not. */
  open_holds_cents: number;
  refunded_cents: number;
  /** captured − refunded. Before fees and transfers. Not profit. */
  net_captured_cents: number;
  needs_attention: number;
  /*
    WHAT EACH FIGURE IS DATED BY. Captures are dated by capture, refunds
    by refund — a January charge refunded in March is March's refund and
    January's capture. Open holds are not a period total at all: they
    are a balance right now, which is why they carry an "as of" rather
    than a window.
  */
  captured_dating: string;
  refunded_dating: string;
  holds_as_of: string;
};

export type PaymentDetail = {
  id: string;
  booking_ref: string;
  booking_id: string | null;
  service: string;
  customer_name: string;
  helper_name: string | null;
  state: PaymentState;
  mode: PaymentMode;
  currency: string;
  amount_cents: number;
  card: { brand: string; last4: string } | null;
  stripe_payment_intent_id: string | null;
  breakdown: { label: string; amount_cents: number; emphasis?: boolean }[];
  /* What each party is owed on paper, FROM THE SNAPSHOT SAVED WITH THE
     BOOKING — never recalculated from today's prices, or a job quoted
     in January would be re-split at March's commission.

     amount_cents is nullable because "we do not know what this job
     settled at" is a real state, and printing CA$0.00 in its place is
     how somebody pays a helper the wrong amount. */
  allocation: { label: string; amount_cents: number | null; note?: string }[];
  allocation_source: string;
  tip: { payment_id: string; amount_cents: number } | null;
  timeline: { label: string; at: string; state: "done" | "failed" | "pending" }[];
  refunds: {
    id: string; amount_cents: number; reason: string | null;
    state: string; at: string; transfer_effect: string | null;
  }[];
  refund_summary: { refunded_cents: number; remaining_refundable_cents: number };
  events: { label: string; detail: string | null; at: string; source: "stripe" | "helpward" }[];
};

export type AttentionItem = {
  key: string;
  label: string;
  count: number;
  action: string;
  href: string;
  tone: "critical" | "warning";
};

export type Reconciliation = {
  last_check_at: string | null;
  items_to_investigate: number;
  note: string;
};

export type PaymentsView = {
  /** True while this screen is a design with invented numbers in it. */
  sample: boolean;
  as_of: string;
  currency: string;
  mode: PaymentMode;
  window_label: string;
  region_label: string;
  totals: PaymentTotals;
  rows: PaymentRow[];
  total_rows: number;
  attention: AttentionItem[];
  reconciliation: Reconciliation;
  detail: PaymentDetail | null;
};

/* ------------------------------------------------------------------ */
/* SAMPLE DATA. Every figure below is invented, and the page says so.  */
/* The references are deliberately in a range nothing real uses, so a  */
/* screenshot of this can never be mistaken for a record.              */
/* ------------------------------------------------------------------ */

const SAMPLE_ROWS: PaymentRow[] = [
  { id: "PY-1040", booking_ref: "BK-1040", booking_id: null, customer_name: "Maya C.", leg: "service", state: "captured",
    amount_cents: 9450, authorized_cents: 9450, captured_cents: 9450, refunded_cents: 0, remaining_refundable_cents: 9450,
    currency: "CAD", mode: "live", dated_by: "capture", updated_at: "2m" },
  { id: "PY-1041", booking_ref: "BK-1040", booking_id: null, customer_name: "Maya C.", leg: "tip", state: "captured",
    amount_cents: 1000, authorized_cents: 1000, captured_cents: 1000, refunded_cents: 0, remaining_refundable_cents: 1000,
    currency: "CAD", mode: "live", dated_by: "capture", updated_at: "1m" },
  { id: "PY-1042", booking_ref: "BK-1042", booking_id: null, customer_name: "Oliver T.", leg: "service", state: "authorized",
    amount_cents: 22450, authorized_cents: 22450, captured_cents: null, refunded_cents: null, remaining_refundable_cents: null,
    currency: "CAD", mode: "live", dated_by: "authorization", updated_at: "8m" },
  { id: "PY-1036", booking_ref: "BK-1036", booking_id: null, customer_name: "Nora L.", leg: "service", state: "capture_failed",
    amount_cents: 6450, authorized_cents: 6450, captured_cents: 0, refunded_cents: null, remaining_refundable_cents: null,
    currency: "CAD", mode: "live", dated_by: "authorization", updated_at: "12m" },
  { id: "PY-1032", booking_ref: "BK-1032", booking_id: null, customer_name: "Ava D.", leg: "service", state: "hold_released",
    amount_cents: 4450, authorized_cents: 4450, captured_cents: 0, refunded_cents: null, remaining_refundable_cents: null,
    currency: "CAD", mode: "live", dated_by: "release", updated_at: "30m" },
  { id: "PY-1028", booking_ref: "BK-1028", booking_id: null, customer_name: "Noah W.", leg: "service", state: "partially_refunded",
    amount_cents: 3450, authorized_cents: 5950, captured_cents: 5950, refunded_cents: 2500, remaining_refundable_cents: 3450,
    currency: "CAD", mode: "live", dated_by: "refund", updated_at: "1h" },
];

const SAMPLE_DETAIL: PaymentDetail = {
  id: "PY-1040",
  booking_ref: "BK-1040",
  booking_id: null,
  service: "Maid Service",
  customer_name: "Maya C.",
  helper_name: "Jamie R.",
  state: "captured",
  mode: "live",
  currency: "CAD",
  amount_cents: 9450,
  card: { brand: "Visa", last4: "4242" },
  stripe_payment_intent_id: "pi_sample_1040",
  breakdown: [
    { label: "Service", amount_cents: 9000 },
    { label: "Customer service fee", amount_cents: 450 },
    { label: "Captured total", amount_cents: 9450, emphasis: true },
  ],
  allocation: [
    { label: "Helper service share", amount_cents: 7200 },
    { label: "Platform commission", amount_cents: 1800 },
    { label: "Customer service fee", amount_cents: 450 },
  ],
  allocation_source: "From the quote saved with this booking, not from today's pricing.",
  tip: { payment_id: "PY-1041", amount_cents: 1000 },
  timeline: [
    { label: "Authorized", at: "Today 15:02", state: "done" },
    { label: "Captured", at: "Today 16:18", state: "done" },
    { label: "Last reconciled", at: "Today 19:58", state: "done" },
  ],
  refunds: [],
  refund_summary: { refunded_cents: 0, remaining_refundable_cents: 9450 },
  events: [
    { label: "payment_intent.amount_capturable_updated", detail: "Hold placed by the bank", at: "Today 15:02", source: "stripe" },
    { label: "Booking accepted", detail: "Jamie R.", at: "Today 15:04", source: "helpward" },
    { label: "payment_intent.succeeded", detail: "Captured CA$94.50", at: "Today 16:18", source: "stripe" },
    { label: "Reconciliation check", detail: "Matched against the Stripe balance", at: "Today 19:58", source: "helpward" },
  ],
};

const SAMPLE: PaymentsView = {
  sample: true,
  as_of: "12 sec ago",
  currency: "CAD",
  mode: "live",
  window_label: "Last 30 days",
  region_label: "Vancouver",
  totals: {
    captured_cents: 124000,
    open_holds_cents: 32000,
    refunded_cents: 8500,
    net_captured_cents: 115500,
    needs_attention: 3,
    captured_dating: "Dated by capture",
    refunded_dating: "Dated by refund",
    holds_as_of: "As of 12 sec ago",
  },
  rows: SAMPLE_ROWS,
  total_rows: 30,
  attention: [
    { key: "capture_failed", label: "Capture failed", count: 1, action: "Review", href: "/admin/payments?tab=attention", tone: "critical" },
    { key: "bank_confirmation", label: "Bank confirmation needed", count: 1, action: "Open recovery", href: "/admin/payments?tab=attention&flow=recovery", tone: "warning" },
    { key: "reconciliation", label: "Reconciliation mismatch", count: 1, action: "Investigate", href: "/admin/payments?tab=attention", tone: "warning" },
  ],
  reconciliation: {
    last_check_at: "Today 19:58",
    items_to_investigate: 1,
    note: "Compares what this console believes against the Stripe balance.",
  },
  detail: SAMPLE_DETAIL,
};

/*
  THE SEAM. Replace the body with real reads — bookings for captures and
  holds, refunds for returns, the Stripe mirror for events — and set
  `sample: false`. Every component on the page already reads this shape,
  and the design-concept banner disappears on its own when sample is
  false.
*/
export async function getPaymentsView(_opts: {
  window?: string; region?: string | null; currency?: string;
  mode?: PaymentMode; tab?: string; open?: string | null;
} = {}): Promise<PaymentsView> {
  return SAMPLE;
}
