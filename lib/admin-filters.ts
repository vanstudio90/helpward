/*
  ONE FILTER VOCABULARY, SHARED BY THE CONTROL AND THE READER.

  The date control submitted `today`, `7d`, `30d`, `90d`. The payments
  reader looked those up in a table keyed `Today`, `Last 7 days`,
  `Last 30 days`. Every lookup missed, every miss fell through to "no
  cutoff", and so changing the date range on a live console silently
  removed the date range. The control looked like it worked.

  Both sides now import from here. A key that is not in this table is
  not a window, and `windowDays` says so by returning undefined rather
  than quietly meaning "everything".
*/

export const WINDOW_OPTIONS = [
  { value: "today", label: "Today", days: 1 },
  { value: "7d", label: "Last 7 days", days: 7 },
  { value: "30d", label: "Last 30 days", days: 30 },
  { value: "90d", label: "Last 90 days", days: 90 },
  { value: "all", label: "Everything", days: null },
] as const;

export type WindowValue = (typeof WINDOW_OPTIONS)[number]["value"];

export const DEFAULT_WINDOW: WindowValue = "30d";

/** Null means "no cutoff". Undefined means the key was not a window. */
export function windowDays(key: string | null | undefined): number | null | undefined {
  const found = WINDOW_OPTIONS.find((w) => w.value === key);
  return found ? found.days : undefined;
}

export function windowLabel(key: string | null | undefined): string {
  return WINDOW_OPTIONS.find((w) => w.value === key)?.label
    ?? WINDOW_OPTIONS.find((w) => w.value === DEFAULT_WINDOW)!.label;
}

/** The ISO cutoff for a window key, or null when there is none. */
export function windowSince(key: string | null | undefined, now = Date.now()): string | null {
  const days = windowDays(key ?? DEFAULT_WINDOW);
  const resolved = days === undefined ? windowDays(DEFAULT_WINDOW)! : days;
  return resolved === null ? null : new Date(now - resolved * 86400_000).toISOString();
}

/*
  MODE IS A PROPERTY OF THE TRANSACTION, NOT OF THE VIEW.

  The payments reader assigned whatever the filter said to every row,
  so the same payment read "Captured · Live", then "Captured · Test"
  after clicking a chip — a console inventing a fact about money. In
  this product the test Stripe is used for review accounts
  (stripeForUser → isReviewCustomer in lib/payments.ts), so the
  account the charge belongs to is the authority.

  Inclusion and mode are still different questions. "Show me review
  and test activity at all" is one setting; "which Stripe did this
  transaction go through" is a property of the row. One must never be
  rendered as the other.
*/
export function modeOfAccount(isReviewAccount: boolean | null | undefined): "live" | "test" {
  return isReviewAccount ? "test" : "live";
}
