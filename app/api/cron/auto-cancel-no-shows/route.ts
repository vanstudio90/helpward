import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { isAuthorizedCron } from "@/lib/cron-auth";

// Auto-cancel 'scheduled' bookings where the scheduled_for time passed by
// >GRACE_MINUTES and the provider still hasn't called start_booking.
// Without this, a provider can accept a job then ghost and the customer
// waits forever.

const GRACE_MINUTES = 20;

export async function GET(req: NextRequest) {
  if (!isAuthorizedCron(req.headers.get("authorization"))) {
    return NextResponse.json({ ok: false, reason: "unauthorized" }, { status: 401 });
  }

  const cutoff = new Date(Date.now() - GRACE_MINUTES * 60_000).toISOString();
  const admin = createSupabaseServiceClient();

  const { data: stale, error: selErr } = await admin
    .from("bookings")
    .select("id, customer_id, provider_id, scheduled_for")
    .eq("status", "scheduled")
    .is("started_at", null)
    .not("scheduled_for", "is", null)
    .lt("scheduled_for", cutoff);

  if (selErr) return NextResponse.json({ ok: false, error: selErr.message }, { status: 500 });
  if (!stale || stale.length === 0) return NextResponse.json({ ok: true, cancelled: 0 });

  const ids = stale.map((b) => b.id);
  const { error: updErr } = await admin
    .from("bookings")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      cancel_reason: "Provider did not arrive — auto-cancelled by system",
    })
    .in("id", ids);
  if (updErr) return NextResponse.json({ ok: false, error: updErr.message }, { status: 500 });

  // Notify both parties so the customer can re-book and the provider sees the no-show
  const notifs = stale.flatMap((b) => [
    {
      user_id: b.customer_id,
      type: "booking_auto_cancelled",
      payload: { booking_id: b.id, reason: "Provider did not arrive" },
    },
    {
      user_id: b.provider_id,
      type: "booking_no_show",
      payload: { booking_id: b.id, scheduled_for: b.scheduled_for },
    },
  ]);
  await admin.from("notifications").insert(notifs);

  return NextResponse.json({ ok: true, cancelled: ids.length });
}
