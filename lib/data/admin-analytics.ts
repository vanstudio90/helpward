import { createSupabaseServiceClient } from "@/lib/supabase/server";

// Admin analytics aggregations. Service-role because admins read across all
// tenants; the page itself enforces role === 'admin' before calling these.
//
// Performance notes:
//  - We cap each query at 50k rows. Admin traffic is tiny so on-the-fly
//    bucketing is fine; once we cross 50k bookings/week we'll materialise.
//  - Bucketing is server-side (in TS) over a raw select. Postgres can do this
//    faster with date_trunc + group by, but that needs an RPC; v1 ships
//    plain selects to keep iteration cheap.

export type DayBucket = {
  date: string; // YYYY-MM-DD
  label: string; // "Jun 3"
  count: number;
  // Optional sum field — e.g. GMV in cents. Only populated for series that
  // care about totals (bookings have GMV; signups don't).
  sumCents?: number;
};

export type KPISeries = {
  total: number;             // sum over the whole window
  values: number[];          // day-by-day counts (or sums) for the sparkline
  deltaVsPrev: number | null; // pct change vs the matching previous window; null when prev=0
};

const DEFAULT_DAYS = 30;

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function dayLabel(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

// Generate the date keys we want to bucket into. Always returns `days` keys
// ending today (inclusive) so the chart never has a gap for "no rows on
// that day" — we want to render the zero.
function makeDateKeys(days: number, endDate = new Date()): DayBucket[] {
  const out: DayBucket[] = [];
  const end = new Date(Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), endDate.getUTCDate()));
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(end);
    d.setUTCDate(d.getUTCDate() - i);
    out.push({ date: isoDay(d), label: dayLabel(d), count: 0 });
  }
  return out;
}

// Bucket rows by a date column. Mutates a pre-seeded buckets array so the
// "no rows on that day" days still appear with count=0.
function bucketByDay(
  rows: Array<{ [k: string]: unknown }>,
  dateColumn: string,
  buckets: DayBucket[],
  sumColumn?: string,
) {
  const byKey = new Map(buckets.map((b) => [b.date, b]));
  for (const r of rows) {
    const ts = r[dateColumn];
    if (typeof ts !== "string") continue;
    const key = ts.slice(0, 10);
    const b = byKey.get(key);
    if (!b) continue;
    b.count += 1;
    if (sumColumn) {
      const v = r[sumColumn];
      if (typeof v === "number") b.sumCents = (b.sumCents ?? 0) + v;
    }
  }
}

// =========================================================================
// Time-series queries
// =========================================================================

export async function getBookingsSeries(days = DEFAULT_DAYS): Promise<DayBucket[]> {
  const supabase = createSupabaseServiceClient();
  const since = new Date(Date.now() - days * 86400_000).toISOString();
  const { data, error } = await supabase
    .from("bookings")
    .select("created_at, total_cents")
    .gte("created_at", since)
    .limit(50_000);
  if (error) {
    console.error("getBookingsSeries:", error.message);
    return makeDateKeys(days);
  }
  const buckets = makeDateKeys(days);
  bucketByDay(data ?? [], "created_at", buckets, "total_cents");
  return buckets;
}

export async function getDisputesSeries(days = DEFAULT_DAYS): Promise<DayBucket[]> {
  const supabase = createSupabaseServiceClient();
  const since = new Date(Date.now() - days * 86400_000).toISOString();
  const { data, error } = await supabase
    .from("disputes")
    .select("created_at")
    .gte("created_at", since)
    .limit(50_000);
  if (error) {
    console.error("getDisputesSeries:", error.message);
    return makeDateKeys(days);
  }
  const buckets = makeDateKeys(days);
  bucketByDay(data ?? [], "created_at", buckets);
  return buckets;
}

export async function getSignupsSeries(days = DEFAULT_DAYS): Promise<{
  customers: DayBucket[];
  providers: DayBucket[];
}> {
  const supabase = createSupabaseServiceClient();
  const since = new Date(Date.now() - days * 86400_000).toISOString();
  const { data, error } = await supabase
    .from("profiles")
    .select("created_at, role")
    .gte("created_at", since)
    .limit(50_000);
  if (error) {
    console.error("getSignupsSeries:", error.message);
    return { customers: makeDateKeys(days), providers: makeDateKeys(days) };
  }
  const customers = makeDateKeys(days);
  const providers = makeDateKeys(days);
  for (const r of data ?? []) {
    const ts = (r as { created_at?: string }).created_at;
    const role = (r as { role?: string }).role;
    if (typeof ts !== "string") continue;
    const key = ts.slice(0, 10);
    if (role === "provider") {
      const b = providers.find((p) => p.date === key);
      if (b) b.count += 1;
    } else {
      const b = customers.find((p) => p.date === key);
      if (b) b.count += 1;
    }
  }
  return { customers, providers };
}

// =========================================================================
// KPI roll-ups: total + sparkline + delta vs previous matching window
// =========================================================================

export function rollupKPI(buckets: DayBucket[], useSumCents = false): KPISeries {
  const values = buckets.map((b) => useSumCents ? (b.sumCents ?? 0) : b.count);
  const total = values.reduce((s, v) => s + v, 0);

  // Compare second half (recent) vs first half (older). Captures whether
  // the trend is up or down without needing a separate prev-period query.
  const half = Math.floor(buckets.length / 2);
  if (half === 0) return { total, values, deltaVsPrev: null };
  const recent = values.slice(half).reduce((s, v) => s + v, 0);
  const older = values.slice(0, half).reduce((s, v) => s + v, 0);
  const deltaVsPrev = older === 0 ? null : ((recent - older) / older) * 100;
  return { total, values, deltaVsPrev };
}

// =========================================================================
// Snapshot counts: current open / pending / active states
// =========================================================================

export type Snapshot = {
  totalUsers: number;
  approvedProviders: number;
  pendingProviders: number;
  activeBookings: number;
  scheduledBookings: number;
  openDisputes: number;
  unresolved24h: number; // disputes open >24h
};

export async function getSnapshot(): Promise<Snapshot> {
  const supabase = createSupabaseServiceClient();
  const yesterday = new Date(Date.now() - 86400_000).toISOString();
  const [
    { count: totalUsers },
    { count: approvedProviders },
    { count: pendingProviders },
    { count: activeBookings },
    { count: scheduledBookings },
    { count: openDisputes },
    { count: unresolved24h },
  ] = await Promise.all([
    supabase.from("profiles").select("*", { count: "exact", head: true }),
    supabase.from("provider_profiles").select("*", { count: "exact", head: true }).eq("status", "approved"),
    supabase.from("provider_profiles").select("*", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("bookings").select("*", { count: "exact", head: true }).eq("status", "in_progress"),
    supabase.from("bookings").select("*", { count: "exact", head: true }).eq("status", "scheduled"),
    supabase.from("disputes").select("*", { count: "exact", head: true }).eq("status", "open"),
    supabase.from("disputes").select("*", { count: "exact", head: true }).eq("status", "open").lt("created_at", yesterday),
  ]);
  return {
    totalUsers: totalUsers ?? 0,
    approvedProviders: approvedProviders ?? 0,
    pendingProviders: pendingProviders ?? 0,
    activeBookings: activeBookings ?? 0,
    scheduledBookings: scheduledBookings ?? 0,
    openDisputes: openDisputes ?? 0,
    unresolved24h: unresolved24h ?? 0,
  };
}

// =========================================================================
// Top-services + dispute-breakdown
// =========================================================================

export type TopService = { id: string; title: string; count: number; gmvCents: number };

export async function getTopServices(days = 7, limit = 5): Promise<TopService[]> {
  const supabase = createSupabaseServiceClient();
  const since = new Date(Date.now() - days * 86400_000).toISOString();
  const { data, error } = await supabase
    .from("bookings")
    .select("service_id, total_cents, service:services(title)")
    .gte("created_at", since)
    .limit(50_000);
  if (error) {
    console.error("getTopServices:", error.message);
    return [];
  }
  const map = new Map<string, TopService>();
  for (const row of data ?? []) {
    const r = row as { service_id: string | null; total_cents: number | null; service: { title: string } | null };
    const id = r.service_id;
    if (!id) continue;
    const existing = map.get(id) ?? {
      id, title: r.service?.title ?? id, count: 0, gmvCents: 0,
    };
    existing.count += 1;
    existing.gmvCents += r.total_cents ?? 0;
    map.set(id, existing);
  }
  return Array.from(map.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

export type DisputeBreakdown = { category: string; count: number };

export async function getDisputeBreakdown(days = 30): Promise<DisputeBreakdown[]> {
  const supabase = createSupabaseServiceClient();
  const since = new Date(Date.now() - days * 86400_000).toISOString();
  const { data, error } = await supabase
    .from("disputes")
    .select("category")
    .gte("created_at", since)
    .limit(50_000);
  if (error) {
    console.error("getDisputeBreakdown:", error.message);
    return [];
  }
  const map = new Map<string, number>();
  for (const row of data ?? []) {
    const cat = (row as { category: string | null }).category ?? "other";
    map.set(cat, (map.get(cat) ?? 0) + 1);
  }
  return Array.from(map.entries())
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count);
}

// =========================================================================
// Helper-supply funnel: applied → ID-verified → BG-cleared → approved
// =========================================================================

export type HelperFunnel = {
  applied: number;
  idVerified: number;
  bgCleared: number;
  approved: number;
};

export async function getHelperFunnel(): Promise<HelperFunnel> {
  const supabase = createSupabaseServiceClient();
  // We can derive this from provider_profiles columns: status + verified-at
  // timestamps. The "applied" count is every row regardless of status.
  const { data } = await supabase
    .from("provider_profiles")
    .select("status, id_verified_at, background_verified_at")
    .limit(50_000);
  let applied = 0, idVerified = 0, bgCleared = 0, approved = 0;
  for (const r of data ?? []) {
    applied += 1;
    if (r.id_verified_at) idVerified += 1;
    if (r.background_verified_at) bgCleared += 1;
    if (r.status === "approved") approved += 1;
  }
  return { applied, idVerified, bgCleared, approved };
}

// =========================================================================
// Recent rows for the activity feed
// =========================================================================

export type RecentEvent = {
  id: string;
  kind: "signup" | "booking" | "dispute" | "review";
  label: string;
  href: string;
  at: string;
};

export async function getRecentEvents(limit = 10): Promise<RecentEvent[]> {
  const supabase = createSupabaseServiceClient();
  const [{ data: signups }, { data: bookings }, { data: disputes }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, role, created_at")
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("bookings")
      .select("id, status, created_at, service:services(title)")
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("disputes")
      .select("id, category, created_at")
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  const events: RecentEvent[] = [];
  for (const s of signups ?? []) {
    events.push({
      id: `signup-${s.id}`, kind: "signup",
      label: `${s.full_name ?? "Anonymous"} signed up as ${s.role ?? "customer"}`,
      href: `/admin/users`,
      at: s.created_at,
    });
  }
  for (const row of bookings ?? []) {
    const b = row as { id: string; status: string; created_at: string; service: { title: string } | null };
    events.push({
      id: `booking-${b.id}`, kind: "booking",
      label: `Booking ${b.id.slice(0, 8)} — ${b.service?.title ?? "task"} (${b.status})`,
      href: `/admin/bookings`,
      at: b.created_at,
    });
  }
  for (const d of disputes ?? []) {
    events.push({
      id: `dispute-${d.id}`, kind: "dispute",
      label: `Dispute opened — ${d.category}`,
      href: `/admin/disputes`,
      at: d.created_at,
    });
  }
  events.sort((a, b) => (a.at < b.at ? 1 : -1));
  return events.slice(0, limit);
}
