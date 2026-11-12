import "server-only";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { windowSince, windowLabel, modeOfAccount } from "@/lib/admin-filters";
import { refundSendingEnabled } from "@/lib/refund-approval";
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
  /* The row's real id, and the token a decision is made against. */
  id_uuid: string;
  updated_at: string;
  /* Null until the request has actually been handed to the processor.
     An approved row with no id is one that was never sent. */
  processor_refund_id: string | null;
  /*
    A PROCESSOR EVENT THAT DISAGREED WITH THIS RECORD. It blocks every
    refund action on the booking until a person resolves it, and the
    panel has to say so rather than leaving a button that will be
    refused.
  */
  quarantine: string | null;
  /*
    AN UNKNOWN PROCESSOR OUTCOME IS A SEPARATE BLOCK from a
    quarantined identity, and it needs its own control: clearing the
    identity used to be the only thing on offer, which left an
    operator correctly told the booking was still blocked and given no
    way to resolve it.
  */
  outcome_unknown: boolean;
  outcome_note: string | null;
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
  /*
    ONE FLAG PER CONTROL. Requesting and deciding have database
    functions behind them. Sending is the server action calling
    refundBooking(); exporting and syncing do not exist.
  */
  can: {
    request: boolean;
    decide: boolean;
    /*
      WHETHER APPROVING ALSO SENDS. The server has refused to send
      since HELPWARD_REFUND_SEND was introduced; the panel went on
      saying "Approve and send" and promising the money would go
      immediately. The button has to know.
    */
    send: boolean;
  };
  /** Why the list is empty, when it is. Never a blank table. */
  empty_reason: string | null;
  /*
    THE PAYMENT SOMEBODY ARRIVED HERE TO REFUND.

    "Review refund" on a payment linked to ?start=PY-…, and this
    reader accepted the parameter and ignored it — so the only route
    into the workflow produced an empty table and no form. Eligibility
    is decided here, on the server, from the charge's own balances.
  */
  start: {
    paymentRef: string;
    bookingId: string;
    bookingRef: string;
    customerName: string;
    currency: string;
    legs: { leg: "service" | "tip"; label: string; captured_cents: number; available_cents: number }[];
    blocked_reason: string | null;
  } | null;
  /** Set when the read failed. NEVER rendered as zero refunds. */
  load_error: string | null;
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
/* THE REAL REFUNDS                                                     */
/* ------------------------------------------------------------------ */

const TZ = "America/Vancouver";

function ago(iso: string | null): string {
  if (!iso) return "—";
  const secs = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (secs < 3600) return `${Math.max(1, Math.floor(secs / 60))}m`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h`;
  return `${Math.floor(secs / 86400)}d`;
}

function at(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleString("en-CA", {
    timeZone: TZ, day: "numeric", month: "short",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
}

type RefundDb = {
  id: string; booking_id: string; leg: string; amount_cents: number;
  needs_reconciliation?: boolean | null;
  reconcile_note?: string | null;
  quarantine_note?: string | null;
  quarantine_cleared_at?: string | null;
  reason: string | null; status: string; stripe_refund_id: string | null;
  requested_by: string | null; requested_at: string | null;
  decided_by: string | null; decided_at: string | null;
  decision_reason: string | null; internal_note: string | null;
  absorb_helper_share: boolean | null; failure_reason: string | null;
  created_at: string; updated_at: string;
};

type BookingForRefund = {
  id: string; customer_id: string | null; provider_id: string | null;
  service_id: string | null; total_cents: number | null; tip_cents: number | null;
  payout_cents: number | null; currency: string | null; captured_at: string | null;
};

/*
  WHAT A REFUND DOES TO EACH PARTY.

  A refund has TWO outcomes and either can fail on its own: the money
  going back to the customer, and the helper's transfer being adjusted.
  Reporting one as the other is how a console says "refunded" while a
  helper is still holding the share of a job the customer no longer
  paid for.

  THE TWO CHARGES SPLIT DIFFERENTLY, and this got it wrong. The
  service charge is split between the helper's payout and Helpward's
  commission, so reversing part of it pulls back that proportion — on
  a CA$224.50 job paying out CA$176.00, CA$5.00 reversed takes CA$3.92
  from the helper. A TIP carries no commission: all of it went to the
  helper, so CA$5.00 of a tip reversed takes CA$5.00, not CA$3.92. The
  old code applied the service ratio to both, and quietly understated
  what a helper would lose on every tip refund.

  AND THESE ARE ESTIMATES UNTIL THE PROCESSOR SAYS OTHERWISE. Stripe
  performs the reversal and we do not store what it actually reversed,
  so nothing here is marked "applied" on the strength of a refund
  status alone. The customer's leg is confirmed by the refund
  succeeding; the transfer is not, and says so.
*/
export function refundEffects(
  r: Pick<RefundDb, "leg" | "amount_cents" | "status" | "absorb_helper_share">,
  b: Pick<BookingForRefund, "total_cents" | "payout_cents"> | undefined,
): RefundEffect[] {
  const settled = r.status === "succeeded";
  const sent = r.status === "processing" || settled;
  const absorb = r.absorb_helper_share ?? false;
  const isTip = r.leg === "tip";

  /*
    The helper's share of THIS charge. A tip is wholly theirs; the
    service charge is theirs in the proportion the booking recorded.
  */
  const helperShare: number | null = isTip
    ? r.amount_cents
    : b && b.total_cents && b.payout_cents !== null
      ? Math.round(r.amount_cents * (b.payout_cents / b.total_cents))
      : null;

  const reversed = absorb ? 0 : helperShare;

  return [
    {
      key: "customer",
      label: "Back to the customer",
      amount_cents: r.amount_cents,
      /* This one IS confirmed by the refund succeeding. */
      state: settled ? "applied" : sent ? "pending" : "requires_review",
      note: settled ? null : "Not sent yet.",
    },
    {
      key: "helper_transfer",
      label: absorb ? "Helper keeps their share" : "Taken back from the helper",
      amount_cents: reversed,
      /*
        NEVER "applied" ON THE STRENGTH OF A REFUND STATUS. The
        reversal is a separate operation at the processor and nothing
        here reads what it actually did.
      */
      state: absorb ? "not_applicable" : "requires_review",
      note: absorb
        ? "This reason leaves the helper paid. Helpward carries the refund."
        : helperShare === null
          ? "The split saved with this booking is incomplete, so the amount cannot be worked out here."
          : isTip
            ? "The whole tip was the helper's, so the whole refund comes back out of their balance. An estimate until the processor's own reversal is checked."
            : "The helper's share of this charge, in the proportion saved with the booking. An estimate until the processor's own reversal is checked.",
    },
    {
      key: "platform",
      label: absorb ? "Helpward absorbs" : "Helpward's share returned",
      amount_cents: reversed === null ? null : absorb ? r.amount_cents : r.amount_cents - reversed,
      state: settled ? "applied" : sent ? "pending" : "requires_review",
      note: isTip && !absorb
        ? "A tip carries no commission, so none of it comes back to Helpward."
        : null,
    },
  ];
}

export async function getRefundsView(opts: {
  window?: string; currency?: string; mode?: PaymentMode;
  state?: string | null; search?: string | null; open?: string | null;
  includeReview?: boolean;
  /* Offered by the page, not yet implemented here — declared rather
     than swallowed by a loose signature. */
  region?: string | null; tab?: string; start?: string | null;
} = {}): Promise<RefundsView> {
  const db = createSupabaseServiceClient();

  const [refundsRes, bookingsRes] = await Promise.all([
    db.from("refunds")
      .select("id, booking_id, leg, amount_cents, reason, status, stripe_refund_id," +
        " requested_by, requested_at, decided_by, decided_at, decision_reason," +
        " internal_note, absorb_helper_share, failure_reason, needs_reconciliation," +
        " reconcile_note, quarantine_note, quarantine_cleared_at, created_at, updated_at")
      .order("updated_at", { ascending: false }).limit(500),
    db.from("bookings")
      .select("id, customer_id, provider_id, service_id, total_cents, tip_cents," +
        " payout_cents, currency, captured_at")
      .not("captured_at", "is", null).limit(1000),
  ]);

  const shell = (loadError: string | null, emptyReason: string | null): RefundsView => ({
    sample: false,
    can: { request: true, decide: true, send: refundSendingEnabled() },
    empty_reason: emptyReason,
    load_error: loadError,
    as_of: "just now",
    currency: opts.currency ?? "CAD",
    mode: opts.mode ?? "live",
    window_label: windowLabel(opts.window),
    /* Nothing syncs from the processor, so this is never a sync error. */
    sync_error: null,
    totals: {
      succeeded_cents: 0, processing_cents: 0,
      awaiting_review_count: 0, failed_count: 0,
      dating_note: "Dated by the refund, not by the original charge.",
    },
    rows: [], total_rows: 0, failures: [], review: null, start: null,
  });

  if (refundsRes.error) {
    /* A failed read is a failed read. Never "no refunds". */
    return shell(`Refunds could not be read: ${refundsRes.error.message}`, null);
  }

  const refunds = (refundsRes.data ?? []) as unknown as RefundDb[];
  const bookings = new Map<string, BookingForRefund>();
  for (const b of (bookingsRes.data ?? []) as unknown as BookingForRefund[]) bookings.set(b.id, b);

  const personIds = Array.from(new Set([
    ...refunds.map((r) => r.requested_by), ...refunds.map((r) => r.decided_by),
    ...[...bookings.values()].map((b) => b.customer_id),
    ...[...bookings.values()].map((b) => b.provider_id),
  ].filter(Boolean) as string[]));
  const people = new Map<string, { full_name: string | null; is_review: boolean }>();
  if (personIds.length) {
    const { data } = await db.from("profiles")
      .select("id, full_name, is_review_account").in("id", personIds);
    for (const p of (data ?? []) as { id: string; full_name: string | null; is_review_account: boolean | null }[]) {
      people.set(p.id, { full_name: p.full_name, is_review: Boolean(p.is_review_account) });
    }
  }
  const nameOf = (id: string | null | undefined, fallback = "Unknown") =>
    (id ? people.get(id)?.full_name : null) ?? fallback;
  const shortName = (id: string | null | undefined) => {
    const full = id ? people.get(id)?.full_name : null;
    if (!full) return "Unknown";
    const parts = full.split(" ");
    return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : parts[0];
  };

  const isReviewRefund = (r: RefundDb) => {
    const b = bookings.get(r.booking_id);
    return Boolean(b?.customer_id && people.get(b.customer_id)?.is_review);
  };
  /* THE ROW'S MODE IS THE ACCOUNT'S, not the filter's. See
     lib/admin-filters.ts — the payments list relabelled the same
     transaction Live then Test by reading the chip instead. */
  const modeOfRefund = (r: RefundDb): PaymentMode => {
    const b = bookings.get(r.booking_id);
    return modeOfAccount(b?.customer_id ? people.get(b.customer_id)?.is_review : false);
  };
  const excluded = refunds.filter(isReviewRefund).length;
  let scoped = opts.includeReview ? refunds : refunds.filter((r) => !isReviewRefund(r));

  const modeFilter: PaymentMode = opts.mode ?? "live";
  const modeExcluded = scoped.filter((r) => modeOfRefund(r) !== modeFilter).length;
  scoped = scoped.filter((r) => modeOfRefund(r) === modeFilter);

  /* A date range that is set must actually narrow the list. */
  const since = windowSince(opts.window);
  if (since) scoped = scoped.filter((r) => (r.updated_at ?? r.created_at) >= since);

  /* Currencies are never summed. One at a time, and the view says which. */
  const currency = opts.currency
    ?? bookings.get(scoped[0]?.booking_id ?? "")?.currency
    ?? "CAD";
  scoped = scoped.filter((r) => (bookings.get(r.booking_id)?.currency ?? "CAD") === currency);

  const ref = (id: string) => id.slice(0, 4).toUpperCase();

  const toRow = (r: RefundDb): RefundRow => {
    const b = bookings.get(r.booking_id);
    return {
      id: `RF-${ref(r.id)}`,
      booking_ref: `BK-${ref(r.booking_id)}`,
      payment_ref: `PY-${ref(r.booking_id)}${r.leg === "tip" ? "T" : ""}`,
      customer_name: shortName(b?.customer_id),
      leg: (r.leg === "tip" ? "tip" : "service") as PaymentLeg,
      amount_cents: r.amount_cents,
      currency,
      state: (["awaiting_review", "processing", "succeeded", "failed", "cancelled"]
        .includes(r.status) ? r.status : "succeeded") as RefundState,
      mode: modeOfRefund(r),
      /* Null until something has actually been submitted to the processor. */
      processor_refund_id: r.stripe_refund_id,
      updated_at: ago(r.updated_at),
      /* A row with no requester predates the console and was written by
         the refund executor after the fact. */
      origin: r.requested_by ? "console" : "stripe_sync",
    };
  };

  let rows = scoped.map(toRow);

  /* The tab is a filter, not a label. */
  const TAB_STATES: Record<string, RefundState[]> = {
    awaiting: ["awaiting_review"],
    processing: ["processing"],
    succeeded: ["succeeded"],
    failed: ["failed", "cancelled"],
  };
  const tabStates = opts.tab ? TAB_STATES[opts.tab] : undefined;
  if (tabStates) rows = rows.filter((r) => tabStates.includes(r.state));

  if (opts.state && !opts.state.startsWith("State")) {
    rows = rows.filter((r) => r.state === opts.state);
  }
  const search = (opts.search ?? "").trim().toLowerCase();
  if (search) {
    rows = rows.filter((r) =>
      `${r.id} ${r.booking_ref} ${r.payment_ref} ${r.customer_name}`.toLowerCase().includes(search));
  }

  const totals: RefundTotals = {
    succeeded_cents: scoped.filter((r) => r.status === "succeeded")
      .reduce((sum, r) => sum + r.amount_cents, 0),
    processing_cents: scoped.filter((r) => r.status === "processing")
      .reduce((sum, r) => sum + r.amount_cents, 0),
    awaiting_review_count: scoped.filter((r) => r.status === "awaiting_review").length,
    failed_count: scoped.filter((r) => r.status === "failed").length,
    dating_note: "Dated by the refund, not by the original charge — a refund in March against a January charge is March's number.",
  };

  /*
    THE TARGET OF A NEW REQUEST, resolved from the reference in the
    link. The booking must exist, must have been captured, and must
    actually have the charge being refunded — checked here rather than
    trusted from a query string.
  */
  const startTarget = opts.start ? buildStart(opts.start) : null;

  function buildStart(reference: string): RefundsView["start"] {
    const wanted = reference.replace(/^PY-/i, "").replace(/T$/i, "").toUpperCase();
    const b = [...bookings.values()].find((x) => ref(x.id) === wanted);
    if (!b) return null;

    const legFor = (leg: "service" | "tip") => {
      const captured = leg === "tip" ? (b.tip_cents ?? 0) : (b.total_cents ?? 0);
      const same = refunds.filter((r) => r.booking_id === b.id && r.leg === leg);
      const taken = same
        .filter((r) => ["succeeded", "processing", "awaiting_review"].includes(r.status))
        .reduce((sum, r) => sum + r.amount_cents, 0);
      return {
        leg,
        label: leg === "tip" ? "Tip" : "Service charge",
        captured_cents: captured,
        available_cents: Math.max(0, captured - taken),
      };
    };

    const legs = [legFor("service"), ...((b.tip_cents ?? 0) > 0 ? [legFor("tip")] : [])];
    const unknown = refunds.some((r) => r.booking_id === b.id && r.needs_reconciliation);
    const quarantined = refunds.find(
      (r) => r.booking_id === b.id && r.quarantine_note && !r.quarantine_cleared_at);

    return {
      paymentRef: reference,
      bookingId: b.id,
      bookingRef: `BK-${ref(b.id)}`,
      customerName: shortName(b.customer_id),
      currency: b.currency ?? currency,
      legs,
      blocked_reason: !b.captured_at
        ? "This booking was never charged, so there is nothing to refund. Releasing a hold is a different act."
        : quarantined
          ? `A processor event about this booking disagreed with our record and is quarantined: ${quarantined.quarantine_note} Nothing may be requested against it until somebody resolves that.`
        : unknown
          ? "A refund on this booking has an unknown outcome and is waiting to be reconciled. Nothing further may be requested against it until somebody has checked Stripe."
          : legs.every((l) => l.available_cents === 0)
            ? "Everything on this payment has already been refunded or reserved."
            : null,
    };
  }

  const review = opts.open ? buildReview(opts.open) : null;

  function buildReview(id: string): RefundReview | null {
    const r = scoped.find((x) => `RF-${ref(x.id)}` === id);
    if (!r) return null;
    const b = bookings.get(r.booking_id);
    const leg = (r.leg === "tip" ? "tip" : "service") as PaymentLeg;
    const captured = leg === "tip" ? (b?.tip_cents ?? 0) : (b?.total_cents ?? 0);

    /*
      WHAT IS LEFT, counting what is already in flight. Leaving
      in-flight requests out of this is how two people each approve
      half and the second one fails at the processor.
    */
    const sameLeg = scoped.filter((x) => x.booking_id === r.booking_id && x.leg === r.leg);
    const refunded = sameLeg.filter((x) => x.status === "succeeded")
      .reduce((sum, x) => sum + x.amount_cents, 0);
    const processing = sameLeg.filter((x) => ["processing", "awaiting_review"].includes(x.status) && x.id !== r.id)
      .reduce((sum, x) => sum + x.amount_cents, 0);

    const tipLeg = scoped.find((x) => x.booking_id === r.booking_id && x.leg !== r.leg);

    return {
      id: `RF-${ref(r.id)}`,
      id_uuid: r.id,
      updated_at: r.updated_at,
      processor_refund_id: r.stripe_refund_id,
      quarantine: r.quarantine_cleared_at ? null : r.quarantine_note ?? null,
      outcome_unknown: Boolean(r.needs_reconciliation),
      outcome_note: r.reconcile_note ?? null,
      state: (r.status as RefundState),
      mode: modeOfRefund(r),
      currency,
      payment: {
        ref: `PY-${ref(r.booking_id)}${leg === "tip" ? "T" : ""}`,
        booking_ref: `BK-${ref(r.booking_id)}`,
        booking_id: r.booking_id,
        service: b?.service_id ?? "—",
        customer_name: shortName(b?.customer_id),
        helper_name: b?.provider_id ? nameOf(b.provider_id) : null,
        /* The card is not stored against the booking; naming one would
           name the wrong card. */
        card: null,
      },
      leg,
      separate_leg: tipLeg
        ? {
            leg: (tipLeg.leg === "tip" ? "tip" : "service") as PaymentLeg,
            payment_ref: `PY-${ref(tipLeg.booking_id)}${tipLeg.leg === "tip" ? "T" : ""}`,
            amount_cents: tipLeg.amount_cents,
          }
        : null,
      balances: {
        captured_cents: captured,
        refunded_cents: refunded,
        processing_cents: processing,
        available_cents: Math.max(0, captured - refunded - processing),
      },
      proposal: {
        kind: r.amount_cents >= captured ? "full" : "partial",
        amount_cents: r.amount_cents,
        reason: r.reason,
        internal_note: r.internal_note ?? "",
        notify_customer: false,
      },
      effects: refundEffects(r, b),
      blocked_reason:
        (!r.quarantine_cleared_at && r.quarantine_note)
          ? r.quarantine_note
        : r.status !== "awaiting_review"
          ? `This refund is ${r.status}. There is nothing to decide.`
          : r.amount_cents > Math.max(0, captured - refunded - processing)
            ? "More is requested than is left on this charge once refunds in flight are counted. It would fail at the processor."
            : null,
      requested_by: r.requested_by ? nameOf(r.requested_by) : null,
      requested_at: at(r.requested_at ?? r.created_at),
      history_count: sameLeg.length,
    };
  }

  return {
    sample: false,
    can: { request: true, decide: true, send: refundSendingEnabled() },
    load_error: null,
    empty_reason: rows.length > 0 ? null
      : refunds.length === 0
        ? "Nothing has been refunded, and nothing has been asked for."
        : modeExcluded > 0
          ? `No ${modeFilter} refund to show. ${modeExcluded} ${modeExcluded === 1 ? "is" : "are"} on the ${modeFilter === "live" ? "test" : "live"} processor.`
          : excluded > 0 && !opts.includeReview
            ? `No refund to show. ${excluded} of them belong to review or test bookings, which this view excludes.`
            : "No refund matches these filters.",
    as_of: "just now",
    currency,
    mode: opts.mode ?? "live",
    window_label: windowLabel(opts.window),
    sync_error: null,
    totals,
    rows: rows.slice(0, 25),
    total_rows: rows.length,
    start: startTarget,
    failures: scoped.filter((r) => r.status === "failed").map((r) => ({
      id: `RF-${ref(r.id)}`,
      reason: r.failure_reason ?? "No reason was recorded with the failure.",
      href: `/admin/refunds?open=RF-${ref(r.id)}`,
    })),
    review,
  };
}
