import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Read } from "@/lib/data/admin-overview";
import type { AccountState, Attention } from "@/lib/admin-customer-states";

/*
  THE CUSTOMER LIST AND ONE CUSTOMER.

  Both read admin_customer_list / admin_customer_detail (0101), which
  share one definition of a customer's account state and of what needs
  attention — so the chip in the row and the banner in the record cannot
  disagree about the same person.

  CONTACT DETAILS NEVER ARRIVE HERE. The documents below carry
  email_masked and phone_masked and nothing else; the real values come
  only from revealCustomerContactAction, which writes who asked and why
  to the audit log before it answers. A panel that ships the address in
  the payload and hides it in CSS has already revealed it.
*/

export { ACCOUNT_LABEL, ACCOUNT_TONE, ATTENTION_LABEL, ATTENTION_TONE } from "@/lib/admin-customer-states";
export type { AccountState, Attention };

export type CustomerRow = {
  id: string;
  ref: string;
  name: string | null;
  avatar_url: string | null;
  region: string | null;
  bookings_total: number;
  bookings_active: number;
  account_state: AccountState;
  attention: Attention;
  open_cases: number;
  last_booking_at: string | null;
  created_at: string;
};

export type CustomerList = {
  as_of: string;
  total: number;
  limit: number;
  offset: number;
  counts: {
    total_customers: number;
    new_this_month: number;
    with_active_bookings: number;
    open_support_cases: number;
    deletion_requests: number;
    restricted: number;
  };
  follow_up: {
    cases_unassigned: number;
    payments_to_review: number;
    deletions_scheduled: number;
  };
  regions: string[];
  rows: CustomerRow[];
};

export type CustomerCase = {
  /* A dispute is worked on the safety page; a support case in the inbox.
     The panel has to know which, so the row says so (0102). */
  kind: "dispute" | "support";
  id: string;
  ref: string;
  category: string;
  description: string;
  status: string;
  created_at: string;
  age_seconds: number;
  owner_id: string | null;
  owner_name: string | null;
  booking_id: string | null;
  booking_ref: string | null;
};

export type CustomerDetail = {
  id: string;
  ref: string;
  name: string | null;
  avatar_url: string | null;
  created_at: string;
  account_state: AccountState;
  attention: Attention;
  is_review_account: boolean;
  restriction: { at: string; reason: string | null; by: string | null } | null;
  contact: {
    email_masked: string | null;
    has_email: boolean;
    phone_masked: string | null;
    has_phone: boolean;
    phone_verified: boolean;
    country: string | null;
    account_currency: string | null;
    locale: string | null;
    timezone: string | null;
  };
  stats: {
    completed_jobs: number;
    active_bookings: number;
    open_cases: number;
    cancelled_bookings: number;
    total_bookings: number;
  };
  latest_booking: {
    id: string; ref: string; service: string | null; status: string;
    payment_status: string | null; currency: string | null; total_cents: number | null;
    scheduled_for: string | null; created_at: string;
    helper: string | null; helper_id: string | null;
  } | null;
  cases: CustomerCase[];
  money: {
    currency: string;
    captured_count: number;
    captured_cents: number;
    refunded_cents: number;
    holds_open: number;
  }[];
  bookings: {
    id: string; ref: string; service: string | null; status: string;
    payment_status: string | null; currency: string | null; total_cents: number | null;
    scheduled_for: string | null; created_at: string; helper: string | null;
  }[];
  payments: {
    at: string; kind: "authorized" | "captured" | "refunded" | "failed";
    currency: string | null; amount_cents: number | null;
    booking_ref: string; detail: string | null;
  }[];
  activity: { at: string; label: string; detail: string | null; actor: string | null }[];
  notes: { body: string; at: string; author: string }[];
  privacy: {
    deletion: { status: string; requested_at: string; grace_until: string | null; reason: string | null } | null;
    export: { status: string; requested_at: string; completed_at: string | null; expires_at: string | null } | null;
  };
  actions: {
    restrict: boolean;
    lift_restriction: boolean;
    open_case: boolean;
    open_case_booking_ref: string | null;
    open_case_blocked_reason: string | null;
    reveal_contact: boolean;
  };
};

/* A failed read must never read as an empty list, so the reason is
   carried instead of discarded — the old Users page asked PostgREST for
   a column that had been dropped and rendered "0 users" for a year. */
function describe(error: { message?: string; code?: string } | null): string {
  const message = error?.message ?? "Unknown error";
  if (error?.code === "PGRST202" || /function .* does not exist/i.test(message)) {
    return "This page needs migration 0101 (admin_customers). It has not been applied to this database yet.";
  }
  if (error?.code === "42501" || /not permitted/i.test(message)) return "This account is not an admin.";
  return message;
}

export type CustomerListOpts = {
  tab?: "all" | "active" | "attention" | "deletion";
  region?: string | null;
  joined?: string | null;
  status?: string | null;
  attention?: string | null;
  search?: string | null;
  includeReview?: boolean;
  limit?: number;
  offset?: number;
};

export async function getCustomerList(opts: CustomerListOpts = {}): Promise<Read<CustomerList>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("admin_customer_list", {
    p_tab: opts.tab ?? "all",
    p_region: opts.region ?? null,
    p_joined: opts.joined ?? null,
    p_status: opts.status ?? null,
    p_attention: opts.attention ?? null,
    p_search: opts.search ?? null,
    p_include_review: opts.includeReview ?? false,
    p_limit: opts.limit ?? 7,
    p_offset: opts.offset ?? 0,
  });
  if (error) return { ok: false, error: describe(error) };
  return { ok: true, data: data as CustomerList };
}

export async function getCustomerDetail(id: string): Promise<Read<CustomerDetail | null>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("admin_customer_detail", { p_user_id: id });
  if (error) return { ok: false, error: describe(error) };
  return { ok: true, data: data as CustomerDetail | null };
}
