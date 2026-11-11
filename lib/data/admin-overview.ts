import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/*
  THE OPERATIONS OVERVIEW, READ ONCE.

  Two calls, both admin-guarded in the database rather than here:
  admin_overview_snapshot for the counters, queues and money, and
  admin_live_operations for the map. Each returns one jsonb document, so
  a card and the map never show two different instants of the same
  marketplace.

  NOTHING HERE INVENTS A NUMBER. If a read fails the caller is told it
  failed and shows the previous figures with a warning, because a
  dashboard that silently renders zeros during an outage is worse than
  one that says it is stale: zero is a number somebody will act on.
*/

export type Money = {
  currency: string;
  captured_cents: number;
  authorized_cents: number;
  refunded_cents: number;
  payouts_pending_cents: number;
};

export type AttentionItem = {
  kind: "safety" | "unmatched" | "capture_failed" | "approvals" | "overdue";
  severity: "urgent" | "attention";
  title: string;
  detail: string;
  age_seconds: number;
  owner: string | null;
  action: string;
  href: string;
};

export type QueueRow = {
  id: string;
  ref: string;
  service_title: string;
  customer_name: string | null;
  helper_name: string | null;
  status: string;
  created_at: string;
  scheduled_for?: string | null;
  started_at?: string | null;
  payment_status?: string | null;
  href: string;
};

export type CoverageRow = {
  service_id: string;
  title: string;
  waiting: number;
  eligible_online: number;
  offering_total: number;
};

export type Snapshot = {
  as_of: string;
  window_seconds: number;
  includes_review_activity: boolean;
  region: string | null;
  regions: { name: string; requests: number }[];
  kpis: {
    requests: { value: number; prior: number };
    active_bookings: { value: number; in_progress: number };
    eligible_helpers: { value: number; payout_ready: number; approved_total: number };
    captured: { currency: string; cents: number | null; prior_cents: number | null }[];
    completion: { completed: number; ended: number; prior_completed: number; prior_ended: number };
  };
  needs_attention: AttentionItem[];
  bookings_in_motion: { matching: QueueRow[]; scheduled: QueueRow[]; in_progress: QueueRow[] };
  money: Money[];
  coverage: CoverageRow[];
  health: {
    dispatch_refusals_1h: {
      reason: string; occurrences: number; requests: number;
      last_seen: string; configuration_fault: boolean;
    }[];
    failed_captures_24h: number;
    online_with_stale_location: number;
    last_recorded_job_action: string | null;
    boundary_enforcement: string;
  };
  activity: { kind: string; at: string; label: string; detail: string; href: string }[];
};

export type LiveHelper = {
  id: string;
  name: string;
  avatar_url: string | null;
  lat: number;
  lng: number;
  is_online: boolean;
  location_updated_at: string | null;
  location_age_seconds: number | null;
  is_review_helper: boolean;
  payout_ready: boolean;
  state: "on_job" | "assigned" | "waiting" | "stale";
  booking_id: string | null;
  booking_status: string | null;
  service_id: string | null;
  service_title: string | null;
  customer_name: string | null;
  started_at: string | null;
  scheduled_for: string | null;
};

export type LiveJob = {
  booking_id: string;
  status: string;
  service_title: string | null;
  customer_name: string | null;
  helper_name: string | null;
  helper_id: string | null;
  scheduled_for: string | null;
  started_at: string | null;
  crew_size: number | null;
  lat: number | null;
  lng: number | null;
  address: string | null;
};

export type LiveWaiting = {
  request_id: string;
  service_title: string | null;
  customer_name: string | null;
  created_at: string;
  age_seconds: number;
  offers_sent: number;
  lat: number | null;
  lng: number | null;
  address: string | null;
};

export type LiveOperations = {
  as_of: string;
  location_max_age_seconds: number;
  helpers: LiveHelper[];
  jobs: LiveJob[];
  waiting: LiveWaiting[];
};

export type Read<T> = { ok: true; data: T } | { ok: false; error: string };

/** Windows the console offers. Seconds, because the RPC takes an interval. */
export const WINDOWS = {
  today: { label: "Today", interval: "1 day" },
  "7d": { label: "Last 7 days", interval: "7 days" },
  "30d": { label: "Last 30 days", interval: "30 days" },
} as const;
export type WindowKey = keyof typeof WINDOWS;

/*
  MISSING FUNCTION, SAID PLAINLY.

  0098 has to be applied before this console has anything to read. A
  PostgREST 404 for an unknown function is indistinguishable from a
  network failure in the UI unless it is named here, and "apply the
  migration" is a different action from "try again".
*/
function describe(error: { message?: string; code?: string } | null): string {
  const message = error?.message ?? "Unknown error";
  if (error?.code === "PGRST202" || /function .* does not exist/i.test(message)) {
    return "This console needs migration 0098 (admin_overview). It has not been applied to this database yet.";
  }
  if (error?.code === "42501" || /not permitted/i.test(message)) {
    return "This account is not an admin.";
  }
  return message;
}

export async function getOverviewSnapshot(
  { window = "today", includeReview = false, region = null }:
    { window?: WindowKey; includeReview?: boolean; region?: string | null } = {},
): Promise<Read<Snapshot>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("admin_overview_snapshot", {
    p_window: WINDOWS[window].interval,
    p_include_review: includeReview,
    p_region: region,
  });
  if (error) return { ok: false, error: describe(error) };
  return { ok: true, data: data as Snapshot };
}

export async function getLiveOperations(
  { includeReview = false }: { includeReview?: boolean } = {},
): Promise<Read<LiveOperations>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("admin_live_operations", {
    p_include_review: includeReview,
  });
  if (error) return { ok: false, error: describe(error) };
  return { ok: true, data: data as LiveOperations };
}

/*
  The formatters live in lib/admin-format.ts so the client components can
  use them without importing this server-only module; re-exported here so
  server code has one import.
*/
export { money, age, delta } from "@/lib/admin-format";

// ============================================================ activity

export type ActivityRow = {
  kind: "request" | "booking";
  id: string;
  ref: string;
  service_id: string;
  service_title: string;
  customer_name: string | null;
  helper_name: string | null;
  status: string;
  payment_status: string | null;
  total_cents: number | null;
  currency: string;
  updated_at: string;
  created_at: string;
  needs_attention: boolean;
};

export type ActivityList = {
  as_of: string;
  total: number;
  limit: number;
  offset: number;
  counts: {
    needs_attention: number; matching: number; scheduled: number;
    in_progress: number; completed: number; cancelled: number;
  };
  rows: ActivityRow[];
};

export type ActivityDetail = {
  kind: "request" | "booking";
  id: string;
  ref: string;
  request_id: string | null;
  booking_id: string | null;
  service_id: string;
  service_title: string | null;
  status: string;
  created_at: string;
  scheduled_for: string | null;
  crew_size: number | null;
  customer: { id: string; name: string | null; country: string | null; is_review_account: boolean } | null;
  helper: { id: string; name: string | null; status: string | null; is_review_helper: boolean } | null;
  pickup: { formatted: string; city: string | null; lat: number | null; lng: number | null; verified: boolean } | null;
  dropoff: { formatted: string; city: string | null; lat: number | null; lng: number | null } | null;
  intake: Record<string, unknown> | null;
  handover_shared: Record<string, unknown> | null;
  has_private_details: boolean;
  money: {
    currency: string | null; quote_cents: number | null; base_cents: number | null;
    service_fee_cents: number | null; tip_cents: number | null; platform_fee_cents: number | null;
    payout_cents: number | null; payment_status: string | null;
    authorized_at: string | null; captured_at: string | null; payment_error: string | null;
    refunds: { amount_cents: number; status: string; reason: string | null; created_at: string }[];
  };
  timeline: { at: string; label: string; detail: string }[] | null;
  offers: { helper_name: string | null; response: string; distance_km: number | null; notified_at: string; responded_at: string | null }[];
  notes: { body: string; at: string; author: string }[];
  disputes: { category: string; status: string; created_at: string }[] | null;
  conversation_id: string | null;
  actions: {
    cancel_request: boolean;
    cancel_booking: boolean;
    cancel_booking_reason: string | null;
    refund: boolean;
    reveal_private: boolean;
  };
};

export async function getActivity(opts: {
  window?: WindowKey; includeReview?: boolean; region?: string | null;
  service?: string | null; kind?: "all" | "requests" | "bookings";
  flag?: string | null; search?: string | null; currency?: string | null;
  limit?: number; offset?: number;
} = {}): Promise<Read<ActivityList>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("admin_activity", {
    p_window: WINDOWS[opts.window ?? "7d"].interval,
    p_include_review: opts.includeReview ?? false,
    p_region: opts.region ?? null,
    p_service: opts.service ?? null,
    p_kind: opts.kind ?? "all",
    p_flag: opts.flag ?? null,
    p_search: opts.search ?? null,
    p_currency: opts.currency ?? null,
    p_limit: opts.limit ?? 25,
    p_offset: opts.offset ?? 0,
  });
  if (error) return { ok: false, error: describe(error) };
  return { ok: true, data: data as ActivityList };
}

export async function getActivityDetail(
  kind: "request" | "booking", id: string,
): Promise<Read<ActivityDetail | null>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("admin_activity_detail", {
    p_kind: kind, p_id: id,
  });
  if (error) return { ok: false, error: describe(error) };
  return { ok: true, data: data as ActivityDetail | null };
}

/** The services the catalogue actually offers, for the filter. */
export async function getActiveServices(): Promise<{ id: string; title: string }[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("services").select("id, title").eq("active", true).order("title");
  return data ?? [];
}
