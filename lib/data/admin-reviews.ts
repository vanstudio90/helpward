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
/* SAMPLE REVIEWS. Fictional, as the stamp on the page says.           */
/* ------------------------------------------------------------------ */

const SAMPLE_ROWS: ReviewRow[] = [
  { id: "RV-0042", booking_ref: "BK-1042", service: "Moving Help", rating: 2,
    report_reason: "personal_information", report_state: "assigned", visibility: "hidden", owner: "Alex", updated_at: "8m" },
  { id: "RV-0040", booking_ref: "BK-1040", service: "Maid Service", rating: 3,
    report_reason: "disputed_accuracy", report_state: "assigned", visibility: "published", owner: "Sam", updated_at: "25m" },
  { id: "RV-0038", booking_ref: "BK-1038", service: "Package Delivery", rating: 1,
    report_reason: "abusive_language", report_state: "unassigned", visibility: "published", owner: null, updated_at: "1h" },
  { id: "RV-0036", booking_ref: "BK-1036", service: "Furniture Assembly", rating: 4,
    report_reason: null, report_state: "appealed", visibility: "hidden", owner: "Alex", updated_at: "2h" },
];

const SAMPLE_DETAIL: ReviewDetail = {
  id: "RV-0042",
  service: "Moving Help",
  booking_ref: "BK-1042",
  booking_id: null,
  booking_completed_at: "10 Nov 2026",
  booking_city: "Vancouver",
  booking_verified: true,
  customer: { name: "Maya C.", id: null },
  helper: { name: "Jamie R.", id: null },
  rating: 2,
  original_text:
    "The move took longer than expected. I also included the helper's personal contact details.",
  original_restricted: true,
  public_text_available: false,
  visibility: "hidden",
  report_reason: "personal_information",
  reports: [
    { id: "RP-0071", reason: "personal_information", reported_by: "helper",
      detail: "My phone number is in the text.", at: "10 Nov 2026 18:40" },
  ],
  /*
    THE ASSESSMENT SEPARATES THE TWO THINGS A REPORTED REVIEW USUALLY
    IS. One of these is a violation; the other is a customer being
    unhappy, which is not.
  */
  policy_assessment: [
    { key: "personal_information", label: "Personal information present", checked: true,
      note: "A helper's contact details in a public review." },
    { key: "negative_only", label: "Negative feedback alone", checked: false,
      note: "Not a violation. Recorded so a decision cannot rest on it." },
  ],
  /* No policy screen exists yet, so the reference names the policy
     without pretending there is somewhere to open it. */
  policy_reference: { label: "Privacy & personal information", href: null },
  rating_treatment: {
    /* THE ACTUAL RESULT, not "check policy". */
    public_effect: "excluded",
    mechanism:
      "refresh_provider_rating() aggregates only customer_visible reviews and runs on update, so hiding this review removed its two stars from Jamie R.'s public average.",
    internal_record:
      "The row is kept in full — the rating, the words and who wrote them.",
    internal_average_exists: false,
  },
  decisions: [
    { at: "10 Nov 2026 19:02", actor: "Alex", action: "Hidden", reason: "Personal information",
      policy_reference: "Privacy & personal information",
      from_visibility: "published", to_visibility: "hidden",
      note: "Helper's mobile number appears in the third sentence." },
    { at: "10 Nov 2026 18:41", actor: "System", action: "Reported", reason: "Personal information",
      policy_reference: null, from_visibility: "published", to_visibility: "published", note: null },
  ],
  appeal: null,
  actions: { hide: false, restore: true, open_safety_case: true, notify_author: true },
};

const SAMPLE: ReviewsView = {
  sample: true,
  as_of: "just now",
  load_error: null,
  counts: { published: 24, reported: 3, hidden: 2, appeals: 1 },
  rows: SAMPLE_ROWS,
  total_rows: 4,
  total_reviews: 29,
  tasks: [
    { key: "unassigned", label: "1 report unassigned", action: "Assign reviewer", href: "/admin/reviews?tab=reported&owner=unassigned" },
    { key: "appeal", label: "1 appeal awaiting review", action: "Open appeal", href: "/admin/reviews?tab=appeals" },
  ],
  selected: SAMPLE_DETAIL,
};

/*
  THE SEAM. Wiring reads `reviews` (rating, comment, customer_visible),
  the reports against them, and the audit_log entries that already
  record review.hide and review.restore — then sets `sample: false`.

  The rating treatment must be read from the implementation rather than
  assumed: today that is refresh_provider_rating(), which excludes
  hidden reviews from the public average.
*/
export async function getReviewsView(_opts: {
  tab?: string; rating?: string | null; service?: string | null;
  region?: string | null; owner?: string | null; search?: string | null; open?: string | null;
} = {}): Promise<ReviewsView> {
  return SAMPLE;
}
