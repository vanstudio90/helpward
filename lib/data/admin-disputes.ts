import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Read } from "@/lib/data/admin-overview";
import type {
  CaseKind, CaseStatus, CasePriority, CaseOutcome,
} from "@/lib/admin-case-states";

/*
  THE SAFETY QUEUE AND ONE CASE FILE.

  Both read admin_dispute_queue / admin_dispute_detail (0105). The
  detail carries `updated_at`, which is not decoration: every write the
  panel makes sends it back, and the database refuses the write if the
  case has moved since. That is the whole of this console's answer to
  two reviewers working the same report at nine in the morning.
*/

export {
  KIND_LABEL, KIND_TONE, CASE_STATUS_LABEL, CASE_STATUS_TONE,
  CASE_PRIORITY_LABEL, CASE_PRIORITY_TONE, OUTCOME_LABEL,
} from "@/lib/admin-case-states";
export type { CaseKind, CaseStatus, CasePriority, CaseOutcome };

export type CaseRow = {
  id: string;
  ref: string;
  kind: CaseKind;
  category: string;
  title: string;
  summary: string;
  priority: CasePriority;
  status: CaseStatus;
  owner_id: string | null;
  owner_name: string | null;
  customer_name: string | null;
  helper_name: string | null;
  booking_id: string | null;
  area: string | null;
  open_tasks: number;
  evidence_count: number;
  next_review_at: string | null;
  review_overdue: boolean;
  stripe_dispute_id: string | null;
  created_at: string;
  updated_at: string;
  age_seconds: number;
};

export type CaseQueue = {
  as_of: string;
  total: number;
  limit: number;
  offset: number;
  counts: {
    open: number; urgent: number; unassigned: number;
    overdue_reviews: number; resolved_this_month: number;
    safety_open: number; service_open: number;
  };
  workload: { id: string | null; name: string; n: number }[];
  regions: string[];
  rows: CaseRow[];
};

export type CaseEvidence = {
  id: string;
  kind: "file" | "conversation" | "booking_photo" | "note";
  filename: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  description: string | null;
  reference_id: string | null;
  added_by: string | null;
  created_at: string;
  views: number;
};

export type CaseDetail = {
  id: string;
  ref: string;
  kind: CaseKind;
  category: string;
  title: string;
  status: CaseStatus;
  priority: CasePriority;
  outcome: CaseOutcome | null;
  next_review_at: string | null;
  created_at: string;
  resolved_at: string | null;
  reopened_count: number;
  stripe_dispute_id: string | null;
  /* The concurrency token. Sent back with every change. */
  updated_at: string;
  owner: { id: string; name: string | null } | null;
  report: {
    description: string;
    source: string;
    reported_at: string;
    reported_by: string | null;
    reported_by_name: string | null;
    reporter_is_staff: boolean;
  };
  parties: {
    customer: { id: string; name: string | null; ref: string } | null;
    helper: { id: string; name: string | null; ref: string } | null;
  };
  booking: {
    id: string; ref: string; service: string | null;
    status: string; scheduled_for: string | null; city: string | null;
  } | null;
  money: {
    currency: string | null; total_cents: number | null;
    captured_cents: number; captured_at: string | null;
    refunded_cents: number; refund_requested: boolean;
    payment_status: string | null;
  } | null;
  evidence: CaseEvidence[];
  tasks: {
    id: string; label: string; done: boolean;
    done_at: string | null; done_by: string | null; owner: string | null;
  }[];
  timeline: {
    kind: string; body: string | null;
    payload: Record<string, unknown>; at: string; actor: string;
  }[];
  resolutions: {
    outcome: CaseOutcome; reason: string; resolved_at: string;
    resolved_by: string | null; open_tasks_at_close: number;
    reopened_at: string | null; reopen_reason: string | null;
  }[];
  escalation: {
    to: string | null; to_id: string | null; at: string; reason: string | null;
    acknowledged_at: string | null; acknowledged_by: string | null;
  } | null;
  conversations: {
    id: string; ref: string; subject: string; status: string;
    party_role: string; channel: string; last_message_at: string;
    last_delivery: string | null;
  }[];
  related: { id: string; ref: string; title: string; status: string; at: string }[];
  actions: {
    resolve: boolean; reopen: boolean; escalate: boolean;
    acknowledge_escalation: boolean;
    contact_customer: boolean; contact_helper: boolean;
    contact_blocked_reason: string | null;
    open_tasks: number;
  };
};

function describe(error: { message?: string; code?: string } | null): string {
  const message = error?.message ?? "Unknown error";
  if (error?.code === "PGRST202" || /function .* does not exist/i.test(message)) {
    return "This page needs migrations 0104–0107 (safety cases). They have not been applied to this database yet.";
  }
  if (error?.code === "42501" || /not permitted/i.test(message)) return "This account is not an admin.";
  return message;
}

export type CaseQueueOpts = {
  tab?: "all" | "safety" | "service" | "resolved";
  region?: string | null;
  owner?: string | null;
  priority?: string | null;
  status?: string | null;
  search?: string | null;
  includeReview?: boolean;
  limit?: number;
  offset?: number;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* The owner filter is cast to uuid inside the function, so a hand-typed
   ?owner=garbage would abort the query rather than filter nothing. */
function safeOwner(owner: string | null | undefined): string | null {
  if (!owner) return null;
  if (owner === "me" || owner === "unassigned") return owner;
  return UUID.test(owner) ? owner : null;
}

export async function getCaseQueue(opts: CaseQueueOpts = {}): Promise<Read<CaseQueue>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("admin_dispute_queue", {
    p_tab: opts.tab ?? "all",
    p_region: opts.region ?? null,
    p_owner: safeOwner(opts.owner),
    p_priority: opts.priority ?? null,
    p_status: opts.status ?? null,
    p_search: opts.search ?? null,
    p_include_review: opts.includeReview ?? false,
    p_limit: opts.limit ?? 5,
    p_offset: opts.offset ?? 0,
  });
  if (error) return { ok: false, error: describe(error) };
  return { ok: true, data: data as CaseQueue };
}

export async function getCaseDetail(id: string): Promise<Read<CaseDetail | null>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("admin_dispute_detail", { p_id: id });
  if (error) return { ok: false, error: describe(error) };
  return { ok: true, data: data as CaseDetail | null };
}
