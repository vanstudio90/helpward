import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Read } from "@/lib/data/admin-overview";

/*
  THE APPROVAL QUEUE AND ONE APPLICATION.

  Both read admin_helper_queue / admin_helper_detail (0100), which share
  a single definition of why an application is still open — so the chip
  in the list and the checklist in the panel can never disagree about
  what this helper is waiting on.
*/

import type { HelperState } from "@/lib/admin-helper-states";

/* Said in lib/admin-helper-states.ts so the client panel can read them
   without importing this server-only module; re-exported for server
   code, which then has one import. */
export { STATE_LABEL, STATE_TONE } from "@/lib/admin-helper-states";
export type { HelperState };

export type HelperRow = {
  user_id: string;
  ref: string;
  name: string | null;
  avatar_url: string | null;
  status: string;
  state: HelperState;
  owner_id: string | null;
  owner_name: string | null;
  services: string | null;
  service_count: number;
  area: string | null;
  waiting_seconds: number;
  created_at: string;
  dispatchable: boolean;
  payout_ready: boolean;
};

export type HelperQueue = {
  as_of: string;
  total: number;
  limit: number;
  offset: number;
  counts: {
    pending_review: number; ready_for_decision: number; needs_information: number;
    checks_pending: number; approved: number; suspended: number;
  };
  priorities: { waiting_over_48h: number; unassigned: number; ready_for_decision: number };
  owners: { id: string; name: string | null }[];
  rows: HelperRow[];
};

export type HelperCheck = {
  key: string; label: string; ok: boolean; value: string; note: string | null;
};

export type HelperDetail = {
  user_id: string;
  ref: string;
  name: string | null;
  avatar_url: string | null;
  status: string;
  state: HelperState;
  bio: string | null;
  languages: string[] | null;
  base_address: string | null;
  country: string | null;
  created_at: string;
  approved_at: string | null;
  approved_by: string | null;
  rejection_reason: string | null;
  owner: { id: string; name: string | null } | null;
  is_review_helper: boolean;
  services: string[];
  cities: string[];
  checks: HelperCheck[];
  events: { kind: string; body: string | null; at: string; actor: string }[];
  dispatch: {
    dispatchable: boolean; is_online: boolean; vacation_mode: boolean;
    location_updated_at: string | null; service_radius_km: number | null;
    services_chosen: number;
  };
  actions: {
    approve: boolean;
    approve_blocked_reason: string | null;
    reject: boolean;
    request_info: boolean;
  };
};



function describe(error: { message?: string; code?: string } | null): string {
  const message = error?.message ?? "Unknown error";
  if (error?.code === "PGRST202" || /function .* does not exist/i.test(message)) {
    return "This page needs migration 0100 (helper_review). It has not been applied to this database yet.";
  }
  if (error?.code === "42501" || /not permitted/i.test(message)) return "This account is not an admin.";
  return message;
}

export async function getHelperQueue(opts: {
  tab?: "queue" | "all" | "approved" | "suspended";
  region?: string | null; owner?: string | null; state?: string | null;
  search?: string | null; sort?: "oldest" | "newest";
  includeReview?: boolean; limit?: number; offset?: number;
} = {}): Promise<Read<HelperQueue>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("admin_helper_queue", {
    p_tab: opts.tab ?? "queue",
    p_region: opts.region ?? null,
    p_owner: opts.owner ?? null,
    p_state: opts.state ?? null,
    p_search: opts.search ?? null,
    p_sort: opts.sort ?? "oldest",
    p_include_review: opts.includeReview ?? false,
    p_limit: opts.limit ?? 6,
    p_offset: opts.offset ?? 0,
  });
  if (error) return { ok: false, error: describe(error) };
  return { ok: true, data: data as HelperQueue };
}

export async function getHelperDetail(userId: string): Promise<Read<HelperDetail | null>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("admin_helper_detail", { p_user_id: userId });
  if (error) return { ok: false, error: describe(error) };
  return { ok: true, data: data as HelperDetail | null };
}

/** Admins who can own an application, for the Owner picker. */
export async function getAdmins(): Promise<{ id: string; name: string | null }[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("profiles").select("id, full_name").eq("role", "admin").order("full_name");
  return (data ?? []).map((row) => ({ id: row.id, name: row.full_name }));
}
