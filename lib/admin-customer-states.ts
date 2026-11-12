/*
  THE CUSTOMER'S TWO STATES, NAMED ONCE.

  These live apart from lib/data/admin-customers.ts because that module
  is `server-only` — it holds the database reads — and the detail panel
  is a client component that renders the same chips. Importing the
  reader to borrow a label drags the Supabase server client into the
  browser bundle, and the build says so.

  ACCOUNT STATE AND ATTENTION ARE DIFFERENT QUESTIONS, which is why
  they are two types and two columns. The account state is about the
  account: is it open, is it stopped, is it on its way out. Attention is
  about work somebody has to do today. A restricted account with
  nothing outstanding needs no one; an active account with a failed
  capture needs someone this morning.
*/

export type AccountState = "active" | "restricted" | "deletion_scheduled";

export const ACCOUNT_LABEL: Record<AccountState, string> = {
  active: "Active",
  restricted: "Restricted",
  deletion_scheduled: "Deletion scheduled",
};

export const ACCOUNT_TONE: Record<AccountState, string> = {
  active: "bg-emerald-50 text-emerald-700",
  restricted: "bg-rose-50 text-rose-700",
  deletion_scheduled: "bg-amber-50 text-amber-800",
};

export type Attention =
  | "support_case" | "payment_issue" | "account_review" | "privacy_request" | "none";

export const ATTENTION_LABEL: Record<Attention, string> = {
  support_case: "Support case",
  payment_issue: "Payment issue",
  account_review: "Account review",
  privacy_request: "Privacy request",
  none: "None",
};

/*
  TONE SAYS WHO IS WAITING, as on the helper queue: rose where money or
  safety is at stake and the clock is ours, amber where a person is
  waiting on a reply, sky where it is a process with its own deadline,
  and nothing at all where nobody is waiting.
*/
export const ATTENTION_TONE: Record<Attention, string> = {
  support_case: "bg-amber-50 text-amber-800",
  payment_issue: "bg-rose-50 text-rose-700",
  account_review: "bg-rose-50 text-rose-700",
  privacy_request: "bg-sky-50 text-sky-700",
  none: "bg-slate-100 text-slate-400",
};

/** Lowercase, for sentences: "2 accounts need a payment issue looked at". */
export const ATTENTION_SENTENCE: Record<Attention, string> = {
  support_case: "an open support case",
  payment_issue: "a payment that needs review",
  account_review: "a restriction under review",
  privacy_request: "a privacy request in progress",
  none: "nothing outstanding",
};
