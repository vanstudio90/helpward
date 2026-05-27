import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

// Vercel Cron pings this every 15 minutes (see vercel.json).
// Marks requests stuck in 'matching' for >30 minutes as 'expired' and notifies
// the customer so they can try again. Without this, no-provider-available
// requests would sit forever and customers would silently wait.

const STALE_MINUTES = 30;

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const secret = process.env.CRON_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, reason: "unauthorized" }, { status: 401 });
  }

  const cutoff = new Date(Date.now() - STALE_MINUTES * 60_000).toISOString();
  const admin = createSupabaseServiceClient();

  const { data: stale, error: selErr } = await admin
    .from("requests")
    .select("id, customer_id, service_id")
    .eq("status", "matching")
    .lt("created_at", cutoff);

  if (selErr) {
    return NextResponse.json({ ok: false, error: selErr.message }, { status: 500 });
  }
  if (!stale || stale.length === 0) {
    return NextResponse.json({ ok: true, expired: 0 });
  }

  const ids = stale.map((r) => r.id);
  const { error: updErr } = await admin
    .from("requests")
    .update({ status: "expired" })
    .in("id", ids);
  if (updErr) {
    return NextResponse.json({ ok: false, error: updErr.message }, { status: 500 });
  }

  await admin.from("notifications").insert(
    stale.map((r) => ({
      user_id: r.customer_id,
      type: "request_expired",
      payload: { request_id: r.id, service_id: r.service_id, reason: "No providers available — please try again" },
    }))
  );

  return NextResponse.json({ ok: true, expired: ids.length });
}
