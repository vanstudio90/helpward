import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Read } from "@/lib/data/admin-overview";
import type {
  CaseStatus, CasePriority, Channel, Delivery, AlertSeverity,
} from "@/lib/admin-inbox-states";

/*
  THE INBOX AND ONE CONVERSATION.

  Both read admin_inbox_list / admin_inbox_detail (0102). The clock a
  row shows and the clock the thread shows are the same column, written
  by a trigger on the messages themselves, so neither screen can be
  told a reply happened that did not.
*/

export {
  STATUS_LABEL, STATUS_TONE, PRIORITY_LABEL, PRIORITY_TONE,
  CHANNEL_LABEL, DELIVERY_LABEL, DELIVERY_TONE, REPLY_TARGET_HOURS,
} from "@/lib/admin-inbox-states";
export type { CaseStatus, CasePriority, Channel, Delivery, AlertSeverity };

export type InboxRow = {
  id: string;
  ref: string;
  subject: string;
  snippet: string;
  last_kind: "inbound" | "outbound" | null;
  customer_id: string | null;
  customer_name: string;
  customer_avatar: string | null;
  channel: Channel;
  status: CaseStatus;
  priority: CasePriority;
  assignee_id: string | null;
  assignee_name: string | null;
  due_at: string | null;
  snoozed_until: string | null;
  unread: boolean;
  attachment_count: number;
  last_message_at: string;
  message_count: number;
  age_seconds: number;
};

export type Inbox = {
  as_of: string;
  total: number;
  limit: number;
  offset: number;
  /* Null when nobody has configured a response target. Every screen
     reads this before it says the words "Reply due" (0103). */
  reply_target_minutes: number | null;
  counts: {
    unassigned: number; due_soon: number; overdue: number;
    waiting_on_customer: number; awaiting_reply: number; snoozed: number;
    unread: number; mine: number; urgent: number; open_total: number;
  };
  rows: InboxRow[];
};

export type CaseAttachment = {
  id: string;
  filename: string;
  mime_type: string | null;
  size_bytes: number | null;
};

export type CaseMessage = {
  id: string;
  kind: "inbound" | "outbound" | "note";
  channel: Channel | null;
  body: string;
  author: string | null;
  author_id: string | null;
  from_address: string | null;
  to_address: string | null;
  delivery_status: Delivery;
  delivery_error: string | null;
  at: string;
  attachments: CaseAttachment[];
};

export type CaseDetail = {
  id: string;
  ref: string;
  subject: string;
  status: CaseStatus;
  priority: CasePriority;
  channel: Channel;
  tags: string[];
  due_at: string | null;
  snoozed_until: string | null;
  reply_target_minutes: number | null;
  created_at: string;
  last_inbound_at: string | null;
  resolved_at: string | null;
  assignee: { id: string; name: string | null } | null;
  customer: {
    id: string; name: string | null; ref: string;
    avatar_url: string | null; is_review_account: boolean;
    joined_at: string; bookings_total: number;
  } | null;
  contact_email: string | null;
  messages: CaseMessage[];
  booking: {
    id: string; ref: string; service: string | null; status: string;
    scheduled_for: string | null; helper: string | null; currency: string | null;
    total_cents: number | null; payment_status: string | null;
    captured_at: string | null; authorized_at: string | null;
  } | null;
  dispute: { id: string; ref: string; status: string; category: string } | null;
  related: {
    kind: "support" | "dispute"; id: string; ref: string;
    title: string; status: string; at: string; href: string;
  }[];
  activity: { at: string; label: string; detail: string | null }[];
  actions: {
    resolve: boolean;
    reopen: boolean;
    snooze: boolean;
    open_safety_case: boolean;
    open_safety_case_blocked_reason: string | null;
    email_to: string | null;
  };
};

export type OperationalAlert = {
  key: string;
  severity: AlertSeverity;
  title: string;
  detail: string;
  href: string;
  count: number;
  rank: number;
};

function describe(error: { message?: string; code?: string } | null): string {
  const message = error?.message ?? "Unknown error";
  if (error?.code === "PGRST202" || /function .* does not exist/i.test(message)) {
    return "This page needs migration 0102 (support_inbox). It has not been applied to this database yet.";
  }
  if (error?.code === "42501" || /not permitted/i.test(message)) return "This account is not an admin.";
  return message;
}

export type InboxOpts = {
  status?: "open" | "waiting" | "resolved" | "snoozed" | "all";
  owner?: string | null;
  priority?: string | null;
  channel?: string | null;
  search?: string | null;
  sort?: "oldest" | "newest" | "due";
  includeReview?: boolean;
  limit?: number;
  offset?: number;
};

/*
  The owner filter is cast to uuid inside the function, so a hand-typed
  ?owner=garbage would abort the whole query rather than filter nothing.
  Anything that is not one of the two keywords or a uuid is dropped.
*/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function safeOwner(owner: string | null | undefined): string | null {
  if (!owner) return null;
  if (owner === "me" || owner === "unassigned") return owner;
  return UUID.test(owner) ? owner : null;
}

export async function getInbox(opts: InboxOpts = {}): Promise<Read<Inbox>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("admin_inbox_list", {
    p_status: opts.status ?? "open",
    p_owner: safeOwner(opts.owner),
    p_priority: opts.priority ?? null,
    p_channel: opts.channel ?? null,
    p_search: opts.search ?? null,
    p_sort: opts.sort ?? "oldest",
    p_include_review: opts.includeReview ?? false,
    p_limit: opts.limit ?? 8,
    p_offset: opts.offset ?? 0,
  });
  if (error) return { ok: false, error: describe(error) };
  return { ok: true, data: data as Inbox };
}

export async function getCaseDetail(id: string): Promise<Read<CaseDetail | null>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("admin_inbox_detail", { p_case_id: id });
  if (error) return { ok: false, error: describe(error) };
  return { ok: true, data: data as CaseDetail | null };
}

export async function getOperationalAlerts(includeReview = false): Promise<Read<OperationalAlert[]>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("admin_operational_alerts", {
    p_include_review: includeReview,
  });
  if (error) return { ok: false, error: describe(error) };
  return { ok: true, data: (data ?? []) as OperationalAlert[] };
}
