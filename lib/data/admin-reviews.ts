import "server-only";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import type {
  ReviewVisibility, ReportState, RatingEffect,
} from "@/lib/admin-review-states";

/*
  REVIEWS MODERATION — TYPES FIRST, DATA LATER.

  Same seam as the other design pages. Four rules are built into the
  shape rather than left to the wiring:

    1. THE ORIGINAL IS NEVER EDITED. `original_text` has no setter
       anywhere in this design. A moderator hides, restores or
       escalates; nobody rewrites what a customer wrote, and nobody
       manufactures a replacement.

    2. A VERIFIED BOOKING IS NOT A VERIFIED CLAIM. `booking_verified`
       says the transaction happened. It says nothing about whether the
       helper really was late, and the panel says so in that many words.

    3. THE RATING EFFECT IS A FACT, NOT A QUESTION. This product
       aggregates rating_avg from customer_visible rows and recomputes
       on update, so hiding a review removes its rating from the public
       average. The type carries the resulting effect, and
       `internal_average_exists` records the other half of the truth:
       the row is kept, but nothing computes an average that includes
       hidden reviews today.

    4. REVIEW AND TEST FEEDBACK NEVER COUNTS. A trigger already forces
       customer_visible false for review accounts (0089); this view
       excludes them again rather than relying on that alone.
*/

export type ReviewRow = {
  id: string;                     // RV-0042
  booking_ref: string;
  service: string;
  rating: number;
  report_reason: string | null;
  report_state: ReportState;
  visibility: ReviewVisibility;
  owner: string | null;
  updated_at: string;
};

export type ReviewReport = {
  id: string;
  reason: string;
  reported_by: "customer" | "helper" | "staff" | "automated";
  detail: string | null;
  at: string;
};

export type ReviewDecision = {
  at: string;
  actor: string;
  action: string;
  reason: string | null;
  policy_reference: string | null;
  from_visibility: ReviewVisibility;
  to_visibility: ReviewVisibility;
  note: string | null;
};

export type ReviewDetail = {
  id: string;
  /* The row's real id, and the token a decision is made against. */
  uuid: string;
  updated_at: string;
  service: string;
  booking_ref: string;
  booking_id: string | null;
  booking_completed_at: string | null;
  booking_city: string | null;
  booking_verified: boolean;
  customer: { name: string; id: string | null };
  helper: { name: string; id: string | null };
  rating: number;
  /* The words the customer wrote. Read-only, everywhere, forever. */
  original_text: string;
  /** True when the original holds personal information and is restricted. */
  original_restricted: boolean;
  public_text_available: boolean;
  visibility: ReviewVisibility;
  report_reason: string | null;
  reports: ReviewReport[];
  policy_assessment: { key: string; label: string; checked: boolean; note: string | null }[];
  policy_reference: { label: string; href: string | null } | null;
  rating_treatment: {
    public_effect: RatingEffect;
    mechanism: string;
    internal_record: string;
    internal_average_exists: boolean;
  };
  decisions: ReviewDecision[];
  appeal: { opened_at: string; by: string; grounds: string; state: string } | null;
  actions: {
    hide: boolean;
    restore: boolean;
    open_safety_case: boolean;
    notify_author: boolean;
  };
};

export type ReviewsView = {
  sample: boolean;
  /*
    ONE FLAG PER CONTROL. Hiding, restoring and deciding whether a
    score counts each have a database function behind them. Opening a
    safety case from here and notifying an author do not, so they stay
    off and say why.
  */
  can: {
    hide: boolean;
    restore: boolean;
    set_rating_counts: boolean;
  };
  /** Why the list is empty, when it is. Never a blank table. */
  empty_reason: string | null;
  as_of: string;
  load_error: string | null;
  counts: { published: number; reported: number; hidden: number; appeals: number };
  rows: ReviewRow[];
  total_rows: number;
  /** The whole corpus, so "no reports" and "no reviews" stay different. */
  total_reviews: number;
  tasks: { key: string; label: string; action: string; href: string }[];
  selected: ReviewDetail | null;
};

/* ------------------------------------------------------------------ */
/* THE REAL REVIEWS                                                     */
/* ------------------------------------------------------------------ */

const TZ = "America/Vancouver";

function at(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-CA", {
    timeZone: TZ, day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
}

function ago(iso: string | null): string {
  if (!iso) return "—";
  const secs = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (secs < 3600) return `${Math.max(1, Math.floor(secs / 60))}m`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h`;
  return `${Math.floor(secs / 86400)}d`;
}

type ReviewDb = {
  id: string; booking_id: string | null; customer_id: string | null;
  provider_id: string | null; rating: number; comment: string | null;
  customer_visible: boolean; rating_visible: boolean;
  created_at: string; updated_at: string;
};
type ReportDb = {
  id: string; review_id: string; reason: string; reporter_role: string;
  reported_by: string | null; detail: string | null; state: string; created_at: string;
};
type DecisionDb = {
  id: string; review_id: string; actor_id: string | null; action: string;
  reason: string; policy_reference: string | null; from_visibility: string;
  to_visibility: string; rating_excluded: boolean; note: string | null; created_at: string;
};
type AppealDb = {
  id: string; review_id: string; opened_by: string | null; grounds: string;
  state: string; created_at: string;
};

/*
  PERSONAL INFORMATION IS A REASON TO RESTRICT, NOT TO REWRITE.

  A review reported for containing somebody's phone number is held back
  from the panel's open view and shown behind a deliberate click, so an
  operator does not scatter it across a shared screen while triaging.
  The words themselves are never altered — they are the customer's.
*/
function restrictedBy(reports: ReportDb[]): boolean {
  return reports.some((r) => r.reason === "personal_information" && r.state !== "decided");
}

function reportStateOf(reports: ReportDb[], appeal: AppealDb | null): ReportState {
  if (appeal && appeal.state === "open") return "appealed";
  const open = reports.filter((r) => r.state !== "decided");
  if (open.length === 0) return reports.length > 0 ? "decided" : "unassigned";
  return open.some((r) => r.state === "assigned") ? "assigned" : "unassigned";
}

function visibilityOf(r: ReviewDb, appeal: AppealDb | null): ReviewVisibility {
  if (appeal && appeal.state === "open") return "pending_appeal";
  return r.customer_visible ? "published" : "hidden";
}

export async function getReviewsView(opts: {
  tab?: string; reason?: string | null; rating?: string | null;
  search?: string | null; open?: string | null; includeReview?: boolean;
  /*
    ACCEPTED AND NOT YET ACTED ON. The page offers these filters and
    this reader does not implement them, so they are declared here
    rather than silently dropped by a loose signature — and the page
    says the filter is not wired instead of appearing to filter.
  */
  service?: string | null; region?: string | null; owner?: string | null;
} = {}): Promise<ReviewsView> {
  const db = createSupabaseServiceClient();

  const [reviewsRes, reportsRes, decisionsRes, appealsRes] = await Promise.all([
    db.from("reviews")
      .select("id, booking_id, customer_id, provider_id, rating, comment," +
        " customer_visible, rating_visible, created_at, updated_at")
      .order("created_at", { ascending: false }).limit(500),
    db.from("review_reports")
      .select("id, review_id, reason, reporter_role, reported_by, detail, state, created_at")
      .order("created_at", { ascending: false }).limit(500),
    db.from("review_decisions")
      .select("id, review_id, actor_id, action, reason, policy_reference," +
        " from_visibility, to_visibility, rating_excluded, note, created_at")
      .order("created_at", { ascending: false }).limit(500),
    db.from("review_appeals")
      .select("id, review_id, opened_by, grounds, state, created_at")
      .order("created_at", { ascending: false }).limit(200),
  ]);

  const shell = (loadError: string | null, emptyReason: string | null): ReviewsView => ({
    sample: false,
    can: { hide: true, restore: true, set_rating_counts: true },
    empty_reason: emptyReason,
    as_of: "just now",
    load_error: loadError,
    counts: { published: 0, reported: 0, hidden: 0, appeals: 0 },
    rows: [], total_rows: 0, total_reviews: 0,
    tasks: [],
    selected: null,
  });

  if (reviewsRes.error) {
    /* A failed read is a failed read. Never "no reviews". */
    return shell(`Reviews could not be read: ${reviewsRes.error.message}`, null);
  }

  const allReviews = (reviewsRes.data ?? []) as unknown as ReviewDb[];
  const reports = (reportsRes.data ?? []) as unknown as ReportDb[];
  const decisions = (decisionsRes.data ?? []) as unknown as DecisionDb[];
  const appeals = (appealsRes.data ?? []) as unknown as AppealDb[];

  const byReview = <T extends { review_id: string }>(rows: T[]) => {
    const m = new Map<string, T[]>();
    for (const r of rows) m.set(r.review_id, [...(m.get(r.review_id) ?? []), r]);
    return m;
  };
  const reportsBy = byReview(reports);
  const decisionsBy = byReview(decisions);
  const openAppealBy = new Map<string, AppealDb>();
  for (const a of appeals) if (a.state === "open") openAppealBy.set(a.review_id, a);

  /* Names and test accounts. */
  const personIds = Array.from(new Set([
    ...allReviews.flatMap((r) => [r.customer_id, r.provider_id]),
    ...decisions.map((d) => d.actor_id),
    ...reports.map((r) => r.reported_by),
  ].filter(Boolean) as string[]));
  const people = new Map<string, { full_name: string | null; is_review: boolean }>();
  if (personIds.length) {
    const { data } = await db.from("profiles")
      .select("id, full_name, is_review_account").in("id", personIds);
    for (const p of (data ?? []) as { id: string; full_name: string | null; is_review_account: boolean | null }[]) {
      people.set(p.id, { full_name: p.full_name, is_review: Boolean(p.is_review_account) });
    }
  }
  const nameOf = (id: string | null, fallback = "Unknown") =>
    (id ? people.get(id)?.full_name : null) ?? fallback;

  const bookingIds = Array.from(new Set(allReviews.map((r) => r.booking_id).filter(Boolean) as string[]));
  const services = new Map<string, string>();
  const completed = new Map<string, string | null>();
  const cities = new Map<string, string | null>();
  if (bookingIds.length) {
    const { data } = await db.from("bookings")
      .select("id, service_id, completed_at").in("id", bookingIds);
    for (const b of (data ?? []) as { id: string; service_id: string | null; completed_at: string | null }[]) {
      services.set(b.id, b.service_id ?? "—");
      completed.set(b.id, b.completed_at);
      cities.set(b.id, null);
    }
  }

  const excludedByReview = allReviews.filter(
    (r) => r.customer_id && people.get(r.customer_id)?.is_review).length;
  const reviews = opts.includeReview
    ? allReviews
    : allReviews.filter((r) => !(r.customer_id && people.get(r.customer_id)?.is_review));

  const ref = (id: string) => id.slice(0, 4).toUpperCase();

  const toRow = (r: ReviewDb): ReviewRow => {
    const rr = reportsBy.get(r.id) ?? [];
    const appeal = openAppealBy.get(r.id) ?? null;
    const open = rr.filter((x) => x.state !== "decided");
    return {
      id: `RV-${ref(r.id)}`,
      booking_ref: r.booking_id ? `BK-${ref(r.booking_id)}` : "—",
      service: r.booking_id ? services.get(r.booking_id) ?? "—" : "—",
      rating: r.rating,
      report_reason: open[0]?.reason ?? null,
      report_state: reportStateOf(rr, appeal),
      visibility: visibilityOf(r, appeal),
      owner: null,
      updated_at: ago(r.updated_at),
    };
  };

  let rows = reviews.map(toRow);

  const tab = opts.tab ?? "reported";
  if (tab === "reported") rows = rows.filter((r) => r.report_state !== "decided" && r.report_reason !== null);
  else if (tab === "hidden") rows = rows.filter((r) => r.visibility === "hidden");
  else if (tab === "appeals") rows = rows.filter((r) => r.report_state === "appealed");

  if (opts.reason && !opts.reason.startsWith("Reason")) {
    rows = rows.filter((r) => r.report_reason === opts.reason);
  }
  if (opts.rating && /^[1-5]$/.test(opts.rating)) {
    rows = rows.filter((r) => r.rating === Number(opts.rating));
  }
  const search = (opts.search ?? "").trim().toLowerCase();
  if (search) {
    rows = rows.filter((r) =>
      `${r.id} ${r.booking_ref} ${r.service}`.toLowerCase().includes(search));
  }

  const counts = {
    published: reviews.filter((r) => r.customer_visible).length,
    reported: reviews.filter((r) => (reportsBy.get(r.id) ?? []).some((x) => x.state !== "decided")).length,
    hidden: reviews.filter((r) => !r.customer_visible).length,
    appeals: reviews.filter((r) => openAppealBy.has(r.id)).length,
  };

  const selected = opts.open ? buildDetail(opts.open) : null;

  function buildDetail(id: string): ReviewDetail | null {
    const r = reviews.find((x) => `RV-${ref(x.id)}` === id);
    if (!r) return null;
    const rr = reportsBy.get(r.id) ?? [];
    const dd = decisionsBy.get(r.id) ?? [];
    const appeal = openAppealBy.get(r.id) ?? null;
    const restricted = restrictedBy(rr);

    return {
      id: `RV-${ref(r.id)}`,
      uuid: r.id,
      updated_at: r.updated_at,
      service: r.booking_id ? services.get(r.booking_id) ?? "—" : "—",
      booking_ref: r.booking_id ? `BK-${ref(r.booking_id)}` : "—",
      booking_id: r.booking_id,
      booking_completed_at: r.booking_id ? at(completed.get(r.booking_id) ?? null) : null,
      booking_city: r.booking_id ? cities.get(r.booking_id) ?? null : null,
      /* A review attached to a booking is a review of work that was
         actually bought. One that is not says so. */
      booking_verified: Boolean(r.booking_id),
      customer: { name: nameOf(r.customer_id), id: r.customer_id },
      helper: { name: nameOf(r.provider_id), id: r.provider_id },
      rating: r.rating,
      /* The customer's words. Nothing in this console edits them. */
      original_text: r.comment ?? "",
      original_restricted: restricted,
      public_text_available: r.customer_visible,
      visibility: visibilityOf(r, appeal),
      report_reason: rr.filter((x) => x.state !== "decided")[0]?.reason ?? null,
      reports: rr.map((x) => ({
        id: x.id.slice(0, 8),
        reason: x.reason,
        reported_by: x.reporter_role as ReviewReport["reported_by"],
        detail: x.detail,
        at: at(x.created_at),
      })),
      /*
        NOTHING HAS ASSESSED THIS AGAINST POLICY. A checklist with
        ticks nobody earned is worse than no checklist, so the items
        are listed unchecked with the reason they are unchecked.
      */
      policy_assessment: [
        { key: "read", label: "A person has read it", checked: dd.length > 0,
          note: dd.length > 0 ? `Last decided ${at(dd[0].created_at)}` : "No decision has been recorded." },
        { key: "automated", label: "Automated check", checked: false,
          note: "No automated check runs over reviews. Nothing has scanned this." },
      ],
      policy_reference: dd[0]?.policy_reference
        ? { label: dd[0].policy_reference, href: null }
        : null,
      /*
        WHAT THE DECISION DID TO THE NUMBERS. Since 0117 the words and
        the score come apart: hiding the wording leaves the rating in
        the helper's average unless somebody decided otherwise.
      */
      rating_treatment: {
        public_effect: r.rating_visible ? "included" : "excluded",
        mechanism: r.rating_visible
          ? "This score counts toward the helper's public average."
          : "This score has been excluded from the helper's public average by a recorded decision.",
        internal_record: r.customer_visible
          ? "The words are published."
          : "The words are hidden; the score is a separate decision.",
        internal_average_exists: false,
      },
      decisions: dd.map((d) => ({
        at: at(d.created_at),
        actor: nameOf(d.actor_id, "System"),
        action: d.action,
        reason: d.reason,
        policy_reference: d.policy_reference,
        from_visibility: d.from_visibility as ReviewVisibility,
        to_visibility: d.to_visibility as ReviewVisibility,
        note: d.rating_excluded ? "The rating was excluded from the average by this decision." : d.note,
      })),
      appeal: appeal
        ? {
            opened_at: at(appeal.created_at),
            by: nameOf(appeal.opened_by, "Unknown"),
            grounds: appeal.grounds,
            state: appeal.state,
          }
        : null,
      actions: {
        hide: r.customer_visible,
        restore: !r.customer_visible,
        /* Neither of these has anything behind it yet. */
        open_safety_case: false,
        notify_author: false,
      },
    };
  }

  return {
    sample: false,
    can: { hide: true, restore: true, set_rating_counts: true },
    as_of: "just now",
    load_error: null,
    empty_reason: rows.length > 0 ? null
      : allReviews.length === 0
        ? "No review has been written yet. Nothing has been reported because nothing exists to report."
        : excludedByReview > 0 && !opts.includeReview
          ? `No review to show. ${excludedByReview} of them belong to review or test accounts, which this view excludes.`
          : tab === "reported"
            ? "Nothing is waiting for a decision. Reviews appear here when somebody reports one."
            : "No review matches these filters.",
    counts,
    rows: rows.slice(0, 25),
    total_rows: rows.length,
    /* The whole corpus, so "no reports" and "no reviews" stay different. */
    total_reviews: reviews.length,
    tasks: [
      ...(counts.reported > 0 ? [{
        key: "reported", label: `${counts.reported} waiting for a decision`,
        action: "Open", href: "/admin/reviews?tab=reported",
      }] : []),
      ...(counts.appeals > 0 ? [{
        key: "appeals", label: `${counts.appeals} under appeal`,
        action: "Open", href: "/admin/reviews?tab=appeals",
      }] : []),
    ],
    selected,
  };
}
