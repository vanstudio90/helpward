import "server-only";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { windowSince, windowLabel, modeOfAccount } from "@/lib/admin-filters";
import type { PaymentState, PaymentLeg, PaymentMode } from "@/lib/admin-payment-states";

/*
  THE PAYMENTS VIEW.

  WIRED. Every figure here is read from `bookings` and `refunds` — the
  rows Helpward wrote when it took the money. A console that shows
  invented money while looking exactly like the real one is the single
  most dangerous thing in this product, which is why this file was a
  stamped sample until it could be read from the database instead.

  WHAT THIS IS NOT: a mirror of Stripe. There is no local copy of
  Stripe's event log, so the timeline is built from the timestamps
  Helpward itself recorded — authorized_at, captured_at, the refund
  rows — and says so where it is shown. An "event feed" that looked
  like Stripe's but was assembled here would be the same lie in a
  different font.

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
  /*
    THE SOURCE IS ONLY EVER HELPWARD, and the type says so rather than
    leaving a "stripe" case in the union that nothing can produce.
    A union implying a processor mirror is a promise the shape cannot
    keep — and the first person to read it would go looking for the
    webhook table that stores it.
  */
  events: { label: string; detail: string | null; at: string; source: "helpward" }[];
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
  /*
    NOTHING ON THIS SCREEN MOVES MONEY, and that is deliberate rather
    than unfinished. Refunds are the one act here that takes money
    back, and they live on their own screen with their own decision
    trail. Export and saved views have no server, so they stay off.
  */
  writable: boolean;
  /** Set when the read failed. Never rendered as "no payments". */
  load_error: string | null;
  /*
    WHY THE LIST IS EMPTY, WHEN IT IS. A payments console showing
    nothing is alarming; showing nothing because every booking so far
    belongs to a test account is information.
  */
  empty_reason: string | null;
  /** Currencies present that this view is NOT showing. Never summed in. */
  other_currencies: { currency: string; payments: number }[];
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
/* THE REAL MONEY                                                       */
/* ------------------------------------------------------------------ */

const TZ = "America/Vancouver";

function at(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-CA", {
    timeZone: TZ, day: "numeric", month: "short",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
}

function ago(iso: string | null): string {
  if (!iso) return "—";
  const secs = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (secs < 60) return `${secs}s`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h`;
  return `${Math.floor(secs / 86400)}d`;
}

type BookingDb = {
  id: string; customer_id: string | null; provider_id: string | null;
  service_id: string | null; status: string; payment_status: string;
  base_price_cents: number | null; distance_cents: number | null;
  service_fee_cents: number | null; tip_cents: number | null;
  total_cents: number | null; platform_fee_cents: number | null;
  payout_cents: number | null; currency: string | null;
  request_id: string | null;
  stripe_payment_intent_id: string | null; stripe_charge_id: string | null;
  tip_payment_intent_id: string | null; payment_error: string | null;
  authorized_at: string | null; captured_at: string | null;
  tip_charged_at: string | null; cancelled_at: string | null;
  completed_at: string | null; created_at: string;
};

type RefundDb = {
  id: string; booking_id: string; amount_cents: number; reason: string | null;
  status: string; stripe_refund_id: string | null; created_at: string;
};

/*
  THE STATE OF A SERVICE PAYMENT, from what actually happened rather
  than from the label.

  `payment_status` is a label that goes stale: the first partial refund
  of a captured booking leaves it reading "captured", and a booking
  cancelled after authorization keeps reading "authorized" when the
  hold is long gone. So the timestamps and the refunds decide, and the
  label is only the fallback.
*/
function stateOf(b: BookingDb, refunded: number): PaymentState {
  const captured = Boolean(b.captured_at);
  const authorized = Boolean(b.authorized_at);

  if (captured && refunded > 0) {
    return refunded >= (b.total_cents ?? 0) ? "refunded" : "partially_refunded";
  }
  if (captured) return "captured";
  if (authorized && b.payment_error) return "capture_failed";
  if (authorized && (b.cancelled_at || b.status === "cancelled")) return "hold_released";
  if (authorized) return "authorized";
  if (b.payment_status === "failed") return "capture_failed";
  return "pending";
}

/** Which event dates the row, so a total can be checked against it. */
function datedBy(state: PaymentState): PaymentRow["dated_by"] {
  switch (state) {
    case "captured": return "capture";
    case "refunded": case "partially_refunded": return "refund";
    case "hold_released": return "release";
    default: return "authorization";
  }
}

function dateOf(b: BookingDb, state: PaymentState, lastRefundAt: string | null): string | null {
  switch (datedBy(state)) {
    case "capture": return b.captured_at;
    case "refund": return lastRefundAt ?? b.captured_at;
    case "release": return b.cancelled_at;
    default: return b.authorized_at ?? b.created_at;
  }
}

/*
  WHO ACTUALLY GETS WHAT — AND THE SERVICE FEE IS COUNTED ONCE.

  `platform_fee_cents` is everything Helpward keeps, which INCLUDES the
  customer service fee. Listing the two beside each other reads as a
  breakdown and is a double count: a CA$29.50 job showed CA$20.00 +
  CA$9.50 + CA$4.50 = CA$34.00, four and a half dollars that nobody
  paid. The commission is therefore derived by taking the service fee
  back out, so the three lines add up to the amount charged.

  AND THE SUM IS CHECKED. If the figures saved with the booking do not
  add up to what was taken, the panel says so instead of printing a
  tidy total that happens to be wrong — the one thing a money screen
  must never do is look balanced when it is not.
*/
function allocationOf(b: BookingDb): PaymentDetail["allocation"] {
  const total = b.total_cents ?? 0;
  const payout = b.payout_cents;
  const platform = b.platform_fee_cents;
  const serviceFee = b.service_fee_cents ?? 0;

  /* Unknown is a real state. CA$0.00 in its place is how somebody pays
     a helper the wrong amount. */
  if (payout === null || platform === null) {
    return [
      { label: "Helper payout", amount_cents: payout,
        note: payout === null ? "Not recorded on this booking." : undefined },
      { label: "Helpward keeps", amount_cents: platform,
        note: platform === null ? "Not recorded on this booking." : undefined },
    ];
  }

  const commission = platform - serviceFee;
  const balances = payout + platform === total;

  return [
    { label: "Helper payout", amount_cents: payout },
    { label: "Platform commission", amount_cents: commission,
      note: "The service fee is taken out of this, so the three lines add up to the amount charged." },
    { label: "Customer service fee", amount_cents: serviceFee },
    ...(balances ? [] : [{
      label: "Unaccounted",
      amount_cents: total - (payout + platform),
      note: "The figures saved with this booking do not add up to what was charged. Check it before paying anybody.",
    }]),
  ];
}

function allocationNote(b: BookingDb): string {
  const base = "From the figures saved with this booking when it was quoted, not from today's pricing.";
  if (b.payout_cents === null || b.platform_fee_cents === null) {
    return `${base} Part of the split was never recorded, so it is shown as not known rather than as zero.`;
  }
  return (b.payout_cents + b.platform_fee_cents) === (b.total_cents ?? 0)
    ? `${base} These add up to the amount charged.`
    : `${base} THESE DO NOT ADD UP to the amount charged — the difference is shown above.`;
}

export async function getPaymentsView(opts: {
  window?: string; region?: string | null; currency?: string;
  mode?: PaymentMode; tab?: string; open?: string | null;
  includeReview?: boolean; search?: string | null; state?: string | null;
} = {}): Promise<PaymentsView> {
  const db = createSupabaseServiceClient();

  /* One vocabulary, shared with the control. A key the control cannot
     produce falls back to the default window rather than to "no
     cutoff" — see lib/admin-filters.ts for the bug that caused. */
  const since = windowSince(opts.window);

  const [bookingsRes, refundsRes] = await Promise.all([
    db.from("bookings")
      .select("id, request_id, customer_id, provider_id, service_id, status, payment_status," +
        " base_price_cents, distance_cents, service_fee_cents, tip_cents, total_cents," +
        " platform_fee_cents, payout_cents, currency, stripe_payment_intent_id," +
        " stripe_charge_id, tip_payment_intent_id, payment_error, authorized_at," +
        " captured_at, tip_charged_at, cancelled_at, completed_at, created_at")
      .order("created_at", { ascending: false })
      .limit(500),
    db.from("refunds")
      .select("id, booking_id, amount_cents, reason, status, stripe_refund_id, created_at")
      .order("created_at", { ascending: false })
      .limit(500),
  ]);

  const base: Omit<PaymentsView, "rows" | "totals" | "detail" | "attention"> = {
    sample: false,
    writable: false,
    load_error: null,
    empty_reason: null,
    other_currencies: [],
    as_of: "just now",
    currency: opts.currency ?? "CAD",
    mode: opts.mode ?? "live",
    window_label: windowLabel(opts.window),
    region_label: opts.region ?? "All regions",
    total_rows: 0,
    reconciliation: {
      last_check_at: null,
      items_to_investigate: 0,
      note: "",
    },
  };

  const empty = (error: string | null, reason: string | null): PaymentsView => ({
    ...base,
    load_error: error,
    empty_reason: reason,
    totals: {
      captured_cents: 0, open_holds_cents: 0, refunded_cents: 0, net_captured_cents: 0,
      needs_attention: 0,
      captured_dating: "Dated by capture",
      refunded_dating: "Dated by refund",
      holds_as_of: "As of just now",
    },
    rows: [],
    attention: [],
    detail: null,
    reconciliation: {
      last_check_at: null,
      items_to_investigate: 0,
      note: "No reconciliation run is recorded. Nothing has compared this console against the Stripe balance.",
    },
  });

  if (bookingsRes.error) {
    /* A failed read is not an empty ledger. */
    return empty(`Payments could not be read: ${bookingsRes.error.message}`, null);
  }

  const allBookings = (bookingsRes.data ?? []) as unknown as BookingDb[];
  const refunds = (refundsRes.data ?? []) as unknown as RefundDb[];

  /* Review and test activity is excluded by default, everywhere. */
  const customerIds = Array.from(new Set(allBookings.map((b) => b.customer_id).filter(Boolean) as string[]));
  const people = new Map<string, { full_name: string | null; is_review: boolean }>();
  if (customerIds.length) {
    const { data } = await db.from("profiles")
      .select("id, full_name, is_review_account").in("id", customerIds);
    for (const p of (data ?? []) as { id: string; full_name: string | null; is_review_account: boolean | null }[]) {
      people.set(p.id, { full_name: p.full_name, is_review: Boolean(p.is_review_account) });
    }
  }

  const reviewExcluded = allBookings.filter(
    (b) => b.customer_id && people.get(b.customer_id)?.is_review).length;

  /*
    THE ROW'S MODE COMES FROM THE ACCOUNT THE CHARGE BELONGS TO.
    Review accounts transact against the test Stripe (stripeForUser →
    isReviewCustomer), so that is the authority. The filter selects
    which transactions to show; it does not decide what they were.
  */
  const modeOf = (b: BookingDb): PaymentMode =>
    modeOfAccount(b.customer_id ? people.get(b.customer_id)?.is_review : false);

  let bookings = opts.includeReview
    ? allBookings
    : allBookings.filter((b) => !(b.customer_id && people.get(b.customer_id)?.is_review));

  /* And a mode filter EXCLUDES the other mode rather than relabelling it. */
  const modeFilter: PaymentMode = opts.mode ?? "live";
  const modeExcluded = bookings.filter((b) => modeOf(b) !== modeFilter).length;
  bookings = bookings.filter((b) => modeOf(b) === modeFilter);

  /*
    CURRENCIES ARE NEVER SUMMED. The view is one currency at a time and
    says which; anything else present is counted and named, never added.
  */
  const byCurrency = new Map<string, number>();
  for (const b of bookings) byCurrency.set(b.currency ?? "CAD", (byCurrency.get(b.currency ?? "CAD") ?? 0) + 1);
  const currency = opts.currency
    ?? [...byCurrency.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
    ?? "CAD";
  const otherCurrencies = [...byCurrency.entries()]
    .filter(([c]) => c !== currency)
    .map(([c, n]) => ({ currency: c, payments: n }));
  bookings = bookings.filter((b) => (b.currency ?? "CAD") === currency);

  /* Refunds that actually returned money. A requested refund has not. */
  const settledRefunds = refunds.filter((r) => ["succeeded", "completed", "refunded"].includes(r.status));
  const refundsByBooking = new Map<string, RefundDb[]>();
  for (const r of settledRefunds) {
    refundsByBooking.set(r.booking_id, [...(refundsByBooking.get(r.booking_id) ?? []), r]);
  }
  const refundedOf = (id: string) =>
    (refundsByBooking.get(id) ?? []).reduce((sum, r) => sum + r.amount_cents, 0);

  const nameOf = (b: BookingDb) => {
    const full = b.customer_id ? people.get(b.customer_id)?.full_name : null;
    if (!full) return "Unknown";
    const [first, ...rest] = full.split(" ");
    return rest.length ? `${first} ${rest[rest.length - 1][0]}.` : first;
  };

  /*
    A BOOKING'S REGION LIVES ON THE REQUEST IT CAME FROM. Bookings
    carry no region of their own, which is why the control had nothing
    to filter against.
  */
  const regionOf = new Map<string, string | null>();
  const requestIds = Array.from(new Set(bookings.map((b) => b.request_id).filter(Boolean) as string[]));
  if (requestIds.length) {
    const { data } = await db.from("requests")
      .select("id, pickup_region, pickup_city").in("id", requestIds);
    const byRequest = new Map<string, string | null>();
    for (const r of (data ?? []) as { id: string; pickup_region: string | null; pickup_city: string | null }[]) {
      byRequest.set(r.id, r.pickup_city ?? r.pickup_region);
    }
    for (const b of bookings) {
      if (b.request_id) regionOf.set(b.id, byRequest.get(b.request_id) ?? null);
    }
  }

  const ref = (id: string) => id.slice(0, 4).toUpperCase();

  /*
    ONE ROW PER CHARGE, NOT PER BOOKING. A tip is a separate charge
    against a separate intent; folding it into the service payment is
    how a console comes to report a total nobody was ever charged.
  */
  const rows: PaymentRow[] = [];
  for (const b of bookings) {
    const refunded = refundedOf(b.id);
    const state = stateOf(b, refunded);
    const lastRefundAt = (refundsByBooking.get(b.id) ?? [])[0]?.created_at ?? null;
    const when = dateOf(b, state, lastRefundAt);
    if (since && when && when < since) continue;

    const captured = b.captured_at ? (b.total_cents ?? 0) : null;
    const authorized = b.authorized_at ? (b.total_cents ?? 0) : null;

    rows.push({
      id: `PY-${ref(b.id)}`,
      booking_ref: `BK-${ref(b.id)}`,
      booking_id: b.id,
      customer_name: nameOf(b),
      leg: "service",
      state,
      amount_cents: (b.total_cents ?? 0) - (state === "partially_refunded" ? refunded : 0),
      authorized_cents: authorized,
      captured_cents: captured,
      /* Null is "not applicable or not yet known" — never zero standing
         in for an unknown. */
      refunded_cents: b.captured_at ? refunded : null,
      remaining_refundable_cents: b.captured_at ? Math.max(0, (b.total_cents ?? 0) - refunded) : null,
      currency,
      mode: modeOf(b),
      dated_by: datedBy(state),
      updated_at: ago(when),
    });

    if ((b.tip_cents ?? 0) > 0) {
      rows.push({
        id: `PY-${ref(b.id)}T`,
        booking_ref: `BK-${ref(b.id)}`,
        booking_id: b.id,
        customer_name: nameOf(b),
        leg: "tip",
        state: b.tip_charged_at ? "captured" : "pending",
        amount_cents: b.tip_cents ?? 0,
        authorized_cents: b.tip_cents ?? 0,
        captured_cents: b.tip_charged_at ? (b.tip_cents ?? 0) : null,
        refunded_cents: null,
        remaining_refundable_cents: b.tip_charged_at ? (b.tip_cents ?? 0) : null,
        currency,
        mode: modeOf(b),
        dated_by: "capture",
        updated_at: ago(b.tip_charged_at),
      });
    }
  }

  /*
    EVERY CONTROL THAT IS ON MUST NARROW THE LIST.

    The tab and the region were accepted and dropped: clicking
    "Authorized holds" showed captured payments, and choosing a region
    changed nothing. A filter that looks like it worked is worse than
    one that is missing, because the reader believes the result.
  */
  const inTab = (r: PaymentRow) => {
    switch (opts.tab) {
      case "holds": return r.state === "authorized";
      case "captured": return r.state === "captured";
      case "refunded": return r.state === "refunded" || r.state === "partially_refunded";
      case "attention": return r.state === "capture_failed";
      default: return true;
    }
  };
  const inRegion = (r: PaymentRow) => {
    if (!opts.region) return true;
    const booking = r.booking_id ? regionOf.get(r.booking_id) : null;
    return booking === opts.region;
  };

  const search = (opts.search ?? "").trim().toLowerCase();
  const filtered = rows.filter((r) =>
    inTab(r) && inRegion(r) &&
    (!opts.state || opts.state.startsWith("State") || r.state === opts.state) &&
    (!search || `${r.id} ${r.booking_ref} ${r.customer_name}`.toLowerCase().includes(search)));

  /*
    THE FOUR FIGURES, EACH DATED BY ITS OWN EVENT.

    Captures are dated by capture and refunds by refund — a January
    charge refunded in March is March's refund and January's capture.
    Open holds are not a period total at all: they are a balance right
    now, which is why they carry an "as of" rather than a window.
  */
  const capturedCents = filtered
    .filter((r) => r.captured_cents !== null)
    .reduce((sum, r) => sum + (r.captured_cents ?? 0), 0);
  const refundedCents = filtered.reduce((sum, r) => sum + (r.refunded_cents ?? 0), 0);
  const openHolds = bookings
    .filter((b) => b.authorized_at && !b.captured_at && !b.cancelled_at && !b.payment_error)
    .reduce((sum, b) => sum + (b.total_cents ?? 0), 0);

  const captureFailed = filtered.filter((r) => r.state === "capture_failed").length;

  const attention: AttentionItem[] = [
    ...(captureFailed > 0 ? [{
      key: "capture_failed", label: "Capture failed", count: captureFailed,
      action: "Review", href: "/admin/payments?state=capture_failed", tone: "critical" as const,
    }] : []),
  ];

  const detail = opts.open ? buildDetail(opts.open) : null;

  function buildDetail(id: string): PaymentDetail | null {
    const row = rows.find((r) => r.id === id);
    const b = row ? bookings.find((x) => x.id === row.booking_id) : null;
    if (!row || !b) return null;
    const refunded = refundedOf(b.id);
    const bookingRefunds = refundsByBooking.get(b.id) ?? [];
    const tipRow = rows.find((r) => r.booking_id === b.id && r.leg === "tip");

    return {
      id: row.id,
      booking_ref: row.booking_ref,
      booking_id: b.id,
      service: b.service_id ?? "—",
      customer_name: row.customer_name,
      helper_name: null,
      state: row.state,
      mode: modeOf(b),
      currency,
      amount_cents: row.amount_cents,
      /* The card is not stored against the booking, and guessing one
         from a payment method row would name the wrong card. */
      card: null,
      stripe_payment_intent_id: row.leg === "tip" ? b.tip_payment_intent_id : b.stripe_payment_intent_id,
      breakdown: [
        ...(b.base_price_cents ? [{ label: "Service", amount_cents: b.base_price_cents }] : []),
        ...(b.distance_cents ? [{ label: "Distance", amount_cents: b.distance_cents }] : []),
        ...(b.service_fee_cents ? [{ label: "Customer service fee", amount_cents: b.service_fee_cents }] : []),
        { label: b.captured_at ? "Captured total" : "Authorized total",
          amount_cents: b.total_cents ?? 0, emphasis: true },
      ],
      /*
        WHAT EACH PARTY IS OWED, FROM THE FIGURES SAVED WITH THIS
        BOOKING — never recalculated from today's prices, or a job
        quoted in January would be re-split at March's commission.
        Null is a real state: "we do not know what this settled at" is
        not CA$0.00.
      */
      allocation: allocationOf(b),
      allocation_source: allocationNote(b),
      tip: tipRow ? { payment_id: tipRow.id, amount_cents: tipRow.amount_cents } : null,
      timeline: [
        ...(b.authorized_at ? [{ label: "Authorized", at: at(b.authorized_at), state: "done" as const }] : []),
        ...(b.captured_at ? [{ label: "Captured", at: at(b.captured_at), state: "done" as const }] : []),
        ...(b.payment_error ? [{ label: "Capture failed", at: at(b.completed_at), state: "failed" as const }] : []),
        ...(b.cancelled_at && !b.captured_at ? [{ label: "Hold released", at: at(b.cancelled_at), state: "done" as const }] : []),
        ...(b.tip_charged_at ? [{ label: "Tip charged", at: at(b.tip_charged_at), state: "done" as const }] : []),
      ],
      refunds: bookingRefunds.map((r) => ({
        id: r.id.slice(0, 8),
        amount_cents: r.amount_cents,
        reason: r.reason,
        state: r.status,
        at: at(r.created_at),
        /* Whether the helper's share was pulled back is not recorded
           on the refund row, so nothing here claims to know. */
        transfer_effect: null,
      })),
      refund_summary: {
        refunded_cents: refunded,
        remaining_refundable_cents: Math.max(0, (b.total_cents ?? 0) - refunded),
      },
      /*
        WHAT HELPWARD RECORDED, NOT WHAT STRIPE SENT. There is no local
        copy of Stripe's event log; every line below is a timestamp this
        application wrote, and the page says so rather than implying a
        mirror that does not exist.
      */
      events: [
        ...(b.authorized_at ? [{ label: "Hold placed", detail: b.stripe_payment_intent_id, at: at(b.authorized_at), source: "helpward" as const }] : []),
        ...(b.captured_at ? [{ label: "Captured", detail: b.stripe_charge_id, at: at(b.captured_at), source: "helpward" as const }] : []),
        ...(b.payment_error ? [{ label: "Payment error", detail: b.payment_error, at: at(b.completed_at), source: "helpward" as const }] : []),
        ...bookingRefunds.map((r) => ({
          label: "Refund recorded", detail: r.stripe_refund_id,
          at: at(r.created_at), source: "helpward" as const,
        })),
      ],
    };
  }

  return {
    ...base,
    currency,
    other_currencies: otherCurrencies,
    as_of: "just now",
    total_rows: filtered.length,
    empty_reason: filtered.length > 0 ? null
      : allBookings.length === 0
        ? "No booking has been paid for yet."
        : modeExcluded > 0
          ? `No ${modeFilter} payment to show. ${modeExcluded} payment${modeExcluded === 1 ? " is" : "s are"} on the ${modeFilter === "live" ? "test" : "live"} processor, which this view is not showing — switching the mode shows ${modeExcluded === 1 ? "it" : "them"}.`
          : reviewExcluded > 0 && !opts.includeReview
            ? `No payment to show. Every booking so far — ${reviewExcluded} of them — belongs to a review or test account, which this view excludes.`
            : "No payment matches this window and these filters.",
    totals: {
      captured_cents: capturedCents,
      open_holds_cents: openHolds,
      refunded_cents: refundedCents,
      /* captured − refunded. Before fees and transfers. Not profit. */
      net_captured_cents: capturedCents - refundedCents,
      needs_attention: attention.reduce((sum, a) => sum + a.count, 0),
      captured_dating: "Dated by capture",
      refunded_dating: "Dated by refund",
      holds_as_of: "As of just now",
    },
    rows: filtered.slice(0, 25),
    attention,
    reconciliation: {
      last_check_at: null,
      items_to_investigate: 0,
      note: "No reconciliation run is recorded. Nothing has yet compared what this console believes against the Stripe balance.",
    },
    detail,
  };
}
