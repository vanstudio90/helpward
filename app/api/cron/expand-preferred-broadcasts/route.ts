import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { isAuthorizedCron } from "@/lib/cron-auth";

// Vercel Cron pings this every minute (see vercel.json).
// Closes the preferred-helper-only window: any request whose customer
// asked to route to a specific favourite, where that 2-minute exclusive
// window has expired, gets broadcast to the wider pool.
//
// We can't do this with setTimeout from createRequestAction because Vercel
// kills post-response promises (see [[feedback_vercel_serverless_no_fire_and_forget]]).
// One-minute granularity means the customer waits at most 3 minutes total
// (2 min preferred + up to 1 min cron drift) before the pool sees the
// request — acceptable for v1.

export async function GET(req: NextRequest) {
  if (!isAuthorizedCron(req.headers.get("authorization"))) {
    return NextResponse.json({ ok: false, reason: "unauthorized" }, { status: 401 });
  }

  const admin = createSupabaseServiceClient();

  const { data: stale, error: selErr } = await admin
    .from("requests")
    .select("id")
    .eq("status", "matching")
    .not("preferred_helper_id", "is", null)
    .not("preferred_until", "is", null)
    .lte("preferred_until", new Date().toISOString());

  if (selErr) {
    return NextResponse.json({ ok: false, error: selErr.message }, { status: 500 });
  }
  if (!stale || stale.length === 0) {
    return NextResponse.json({ ok: true, expanded: 0 });
  }

  let total = 0;
  const failures: { id: string; error: string }[] = [];
  for (const r of stale) {
    const { data, error } = await admin.rpc("expand_broadcast_to_pool", {
      p_request_id: r.id,
      p_radius_km: 20,
    });
    if (error) {
      failures.push({ id: r.id, error: error.message });
    } else {
      total += data ?? 0;
    }
  }

  return NextResponse.json({
    ok: failures.length === 0,
    checked: stale.length,
    added: total,
    failures: failures.length > 0 ? failures : undefined,
  });
}
