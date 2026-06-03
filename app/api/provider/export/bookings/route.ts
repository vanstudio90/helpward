import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// CSV download of the calling helpers bookings for a date range. RLS
// already restricts bookings to provider_id = auth.uid() so the route is
// safe behind the regular cookie-bound SSR client — no service-role,
// no admin gate. Returns a streaming-friendly Content-Disposition
// attachment so the browser triggers a download instead of rendering.
//
// Query params:
//   ?days=<int 1..730> (default 90)  — lookback window
//   ?status=<status>                — optional single-status filter
//
// Default columns chosen for "I want to file this with my accountant":
// id + completed_at + service_title + customer_first_name + status
// + total_cents + payout_cents + currency.

const DEFAULT_DAYS = 90;
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
      id, status, total_cents, payout_cents, currency, completed_at, created_at,
      scheduled_for, tip_cents,
      service:services(title),
      customer:profiles!bookings_customer_id_fkey(full_name)
    `)
    .eq("provider_id", user.id)
    .gte("created_at", since)
    .order("created_at", { ascending: false });
  if (statusFilter) q = q.eq("status", statusFilter);
  const { data, error } = await q;
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  type Row = {
    id: string; status: string; total_cents: number; payout_cents: number;
    currency: string; completed_at: string | null; created_at: string;
    scheduled_for: string | null; tip_cents: number | null;
    service: { title: string } | null;
    customer: { full_name: string } | null;
  };
  const rows = (data ?? []) as Row[];

  const header = [
    "id",
    "status",
    "service",
    "customer_first_name",
    "scheduled_for",
    "completed_at",
    "total_dollars",
    "tip_dollars",
    "payout_dollars",
    "currency",
  ].join(",");

  const lines = rows.map((r) => [
    r.id,
    r.status,
    csvEscape(r.service?.title ?? ""),
    csvEscape(firstName(r.customer?.full_name ?? "")),
    r.scheduled_for ?? "",
    r.completed_at ?? "",
    (r.total_cents / 100).toFixed(2),
    ((r.tip_cents ?? 0) / 100).toFixed(2),
    (r.payout_cents / 100).toFixed(2),
    r.currency,
  ].join(","));

  const csv = [header, ...lines].join("\n") + "\n";
  const today = new Date().toISOString().slice(0, 10);
  const filename = `helpward-bookings-${today}${statusFilter ? `-${statusFilter}` : ""}.csv`;

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

// Standard RFC-4180 CSV escaping — wrap fields containing comma/quote/
// newline in double-quotes, double up any internal quotes.
function csvEscape(s: string): string {
  if (s === "") return "";
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
