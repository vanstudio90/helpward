import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// CSV download of the calling customers bookings for a date range. Mirror
// of /api/provider/export/bookings but flipped to the customer's
// perspective — different default window (365d for tax-year personal
// records), different columns (customer-paid breakdown: base + service
// fee + tip + total instead of helper payout), helper first name instead
// of customer first name. RLS already restricts bookings to
// customer_id = auth.uid() so the route is safe behind the regular
// cookie-bound SSR client — no service-role, no admin gate.
//
// Query params:
//   ?days=<int 1..730> (default 365)  — customers usually want tax-year
//   ?status=<status>                — optional single-status filter

const DEFAULT_DAYS = 365;
const MAX_DAYS = 730;

export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Not logged in." }, { status: 401 });
  }

  const url = new URL(req.url);
  const days = clamp(Number(url.searchParams.get("days")) || DEFAULT_DAYS, 1, MAX_DAYS);
  const statusFilter = url.searchParams.get("status");
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  let q = supabase
    .from("bookings")
    .select(`
      id, status, base_price_cents, service_fee_cents, tip_cents, total_cents,
      currency, completed_at, created_at, scheduled_for,
      service:services(title),
      provider:provider_profiles!bookings_provider_id_fkey(
        profile:profiles!provider_profiles_user_id_fkey(full_name)
      )
    `)
    .eq("customer_id", user.id)
    .gte("created_at", since)
    .order("created_at", { ascending: false });
  if (statusFilter) q = q.eq("status", statusFilter);
  const { data, error } = await q;
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  type Row = {
    id: string; status: string;
    base_price_cents: number; service_fee_cents: number; tip_cents: number | null;
    total_cents: number; currency: string;
    completed_at: string | null; created_at: string; scheduled_for: string | null;
    service: { title: string } | null;
    provider: { profile: { full_name: string } | null } | null;
  };
  const rows = (data ?? []) as Row[];

  const header = [
    "id",
    "status",
    "service",
    "helper_first_name",
    "scheduled_for",
    "completed_at",
    "base_dollars",
    "service_fee_dollars",
    "tip_dollars",
    "total_dollars",
    "currency",
  ].join(",");

  const lines = rows.map((r) => [
    r.id,
    r.status,
    csvEscape(r.service?.title ?? ""),
    csvEscape(firstName(r.provider?.profile?.full_name ?? "")),
    r.scheduled_for ?? "",
    r.completed_at ?? "",
    (r.base_price_cents / 100).toFixed(2),
    (r.service_fee_cents / 100).toFixed(2),
    ((r.tip_cents ?? 0) / 100).toFixed(2),
    (r.total_cents / 100).toFixed(2),
    r.currency,
  ].join(","));

  const csv = [header, ...lines].join("\n") + "\n";
  const today = new Date().toISOString().slice(0, 10);
  const filename = `helpward-my-bookings-${today}${statusFilter ? `-${statusFilter}` : ""}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.floor(n)));
}

function firstName(full: string): string {
  return full.trim().split(/\s+/)[0] ?? "";
}

function csvEscape(s: string): string {
  if (s === "") return "";
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
