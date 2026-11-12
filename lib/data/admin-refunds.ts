import type { RefundState, EffectState } from "@/lib/admin-refund-states";
import type { PaymentLeg, PaymentMode } from "@/lib/admin-payment-states";

/*
  THE REFUNDS VIEW — TYPES FIRST, DATA LATER.

  Same seam as the payments screen: everything comes from
  getRefundsView(), which today returns sample data and says so. When
  it is wired it sets `sample: false` and the stamps turn themselves
  off.

  THE FOUR DISTINCTIONS BUILT INTO THE SHAPE, because each one is a way
  a refunds console lies to its operator:

    1. A REQUEST IS NOT A REFUND. `awaiting_review` rows have no
       processor reference, because nothing has been sent. The type
       makes that impossible to fake: processor_refund_id is null
       until something is submitted.

    2. A HOLD IS NOT REFUNDABLE. Releasing an authorization returns
       nothing because nothing was taken, so eligibility carries its
       own route — `release` rather than `refund`.

    3. TWO OUTCOMES, NOT ONE. The customer's money and the helper's
       transfer are separate operations that can fail separately, so
       each effect carries its own state.

    4. UNKNOWN IS NOT ZERO. helper_adjustment_cents is `number | null`
       on purpose: null means we do not know what this refund does to
       the helper's transfer, and the screen must say so rather than
       print CA$0.00 and let somebody act on it.
*/

export type RefundRow = {
  id: string;                     // RF-0108
  booking_ref: string;
  payment_ref: string;
  customer_name: string;
  leg: PaymentLeg;
  amount_cents: number;
  currency: string;
  state: RefundState;
  mode: PaymentMode;
  /** Null until something has actually been submitted to the processor. */
  processor_refund_id: string | null;
  updated_at: string;
  /** Where the record came from: this console, or found during a sync. */
  origin: "console" | "stripe_sync";
};

export type RefundTotals = {
  /* Amounts are in ONE currency and dated by the refund event, not the
     original capture — a refund in March against a January charge is
     March's number. */
  succeeded_cents: number;
  processing_cents: number;
  awaiting_review_count: number;
  failed_count: number;
  dating_note: string;
};

export type RefundEffect = {
  key: "customer" | "helper_transfer" | "platform";
  label: string;
  /** Null means unknown. It is never rendered as zero. */
  amount_cents: number | null;
  state: EffectState;
  note: string | null;
};

export type RefundReview = {
  id: string;
  state: RefundState;
  mode: PaymentMode;
  currency: string;

  payment: {
    ref: string;                  // PY-1040
    booking_ref: string;
    booking_id: string | null;
    service: string;
    customer_name: string;
    helper_name: string | null;
    card: { brand: string; last4: string } | null;
  };

  /** Which charge is being refunded. A tip is a different charge. */
  leg: PaymentLeg;
  separate_leg: { leg: PaymentLeg; payment_ref: string; amount_cents: number } | null;

  balances: {
    captured_cents: number;
    refunded_cents: number;
    /** Refunds already in flight. Subtracted before anything new is allowed. */
    processing_cents: number;
    available_cents: number;
  };

  proposal: {
    kind: "partial" | "full";
    amount_cents: number;
    reason: string | null;
    internal_note: string;
    notify_customer: boolean;
  };

  effects: RefundEffect[];
  /** Set when the console will not let this proceed, with the reason. */
  blocked_reason: string | null;

  requested_by: string | null;
  requested_at: string | null;
  history_count: number;
};

export type RefundsView = {
  sample: boolean;
  as_of: string;
  currency: string;
  mode: PaymentMode;
  window_label: string;
  /** Set when the processor could not be reached. NEVER rendered as zero refunds. */
  sync_error: string | null;
  totals: RefundTotals;
  rows: RefundRow[];
  total_rows: number;
  failures: { id: string; reason: string; href: string }[];
  review: RefundReview | null;
};

/* ------------------------------------------------------------------ */
/* SAMPLE DATA — every figure invented, every reference out of range.  */
/* ------------------------------------------------------------------ */

const SAMPLE_ROWS: RefundRow[] = [
  { id: "RF-0108", booking_ref: "BK-1040", payment_ref: "PY-1040", customer_name: "Maya C.", leg: "service", amount_cents: 2000, currency: "CAD", state: "awaiting_review", mode: "live", processor_refund_id: null, updated_at: "5m", origin: "console" },
  { id: "RF-0107", booking_ref: "BK-1038", payment_ref: "PY-1038", customer_name: "Oliver T.", leg: "service", amount_cents: 4000, currency: "CAD", state: "processing", mode: "live", processor_refund_id: "re_sample_0107", updated_at: "12m", origin: "console" },
  { id: "RF-0106", booking_ref: "BK-1036", payment_ref: "PY-1036", customer_name: "Nora L.", leg: "service", amount_cents: 6450, currency: "CAD", state: "succeeded", mode: "live", processor_refund_id: "re_sample_0106", updated_at: "30m", origin: "console" },
  { id: "RF-0105", booking_ref: "BK-1035", payment_ref: "PY-1035", customer_name: "Alex R.", leg: "tip", amount_cents: 1000, currency: "CAD", state: "succeeded", mode: "live", processor_refund_id: "re_sample_0105", updated_at: "1h", origin: "stripe_sync" },
  { id: "RF-0104", booking_ref: "BK-1032", payment_ref: "PY-1032", customer_name: "Ava D.", leg: "service", amount_cents: 2950, currency: "CAD", state: "failed", mode: "live", processor_refund_id: "re_sample_0104", updated_at: "2h", origin: "console" },
];

const SAMPLE_REVIEW: RefundReview = {
  id: "RF-0108",
  state: "awaiting_review",
  mode: "live",
  currency: "CAD",
  payment: {
    ref: "PY-1040",
    booking_ref: "BK-1040",
    booking_id: null,
    service: "Maid Service",
    customer_name: "Maya C.",
    helper_name: "Jamie R.",
    card: { brand: "Visa", last4: "4242" },
  },
  leg: "service",
  separate_leg: { leg: "tip", payment_ref: "PY-1041", amount_cents: 1000 },
  balances: {
    captured_cents: 9450,
    refunded_cents: 0,
    processing_cents: 0,
    available_cents: 9450,
  },
  proposal: {
    kind: "partial",
    amount_cents: 2000,
    reason: "service_issue",
    internal_note: "Customer reported part of the cleaning was not completed.",
    notify_customer: true,
  },
  /*
    THE HELPER AND PLATFORM EFFECTS ARE DELIBERATELY UNKNOWN in this
    sample, because that is the honest state of this product today:
    there is no settlement rule in the database that says what a
    partial refund does to a transfer that has already been made. A
    proportional split would be a guess, and a guess here is somebody's
    pay.
  */
  effects: [
    { key: "customer", label: "Customer refund", amount_cents: 2000, state: "pending", note: "Goes back to the card ending 4242." },
    { key: "helper_transfer", label: "Helper transfer adjustment", amount_cents: null, state: "requires_review", note: "No settlement rule is recorded for a partial refund after a transfer." },
    { key: "platform", label: "Platform adjustment", amount_cents: null, state: "requires_review", note: "Follows whatever the helper adjustment turns out to be." },
  ],
  blocked_reason:
    "The helper and platform effects are unknown. Nothing is submitted until somebody resolves what this refund does to the transfer.",
  requested_by: "Alex",
  requested_at: "Today 20:05",
  history_count: 3,
};

const SAMPLE: RefundsView = {
  sample: true,
  as_of: "12 sec ago",
  currency: "CAD",
  mode: "live",
  window_label: "Last 30 days",
  sync_error: null,
  totals: {
    succeeded_cents: 18500,
    processing_cents: 4000,
    awaiting_review_count: 2,
    failed_count: 1,
    dating_note: "Amounts use refund event dates. CAD only.",
  },
  rows: SAMPLE_ROWS,
  total_rows: 12,
  failures: [
    { id: "RF-0104", reason: "The card issuer declined the return.", href: "/admin/refunds?open=RF-0104" },
  ],
  review: SAMPLE_REVIEW,
};

/*
  THE SEAM. Wiring this means reading refunds, their payments and the
  processor's view of both, then setting `sample: false`.

  Two things the wiring must not do, which the types already discourage:
  substitute zero for an unknown effect, and report a count of zero when
  the processor could not be reached — that is what `sync_error` is for.
*/
export async function getRefundsView(_opts: {
  window?: string; currency?: string; mode?: PaymentMode;
  region?: string | null; tab?: string; open?: string | null; start?: string | null;
} = {}): Promise<RefundsView> {
  return SAMPLE;
}
