import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

// Auto-complete bookings that have been 'in_progress' for >MAX_HOURS.
// Catches the case where a provider starts a task and forgets (or can't)
// call complete_booking — the booking would otherwise hang forever,
// blocking the provider's online queue and the customer's review prompt.

const MAX_HOURS = 6;

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const secret = process.env.CRON_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, reason: "unauthorized" }, { status: 401 });
  }

  const cutoff = new Date(Date.now() - MAX_HOURS * 3600_000).toISOString();
  const admin = createSupabaseServiceClient();

  const { data: stale, error: selErr } = await admin
    .from("bookings")
    .select("id, customer_id, provider_id")
    .eq("status", "in_progress")
    .lt("started_at", cutoff);

  if (selErr) return NextResponse.json({ ok: false, error: selErr.message }, { status: 500 });
  if (!stale || stale.length === 0) return NextResponse.json({ ok: true, completed: 0 });

  const ids = stale.map((b) => b.id);
  const now = new Date().toISOString();

  const { error: updErr } = await admin
    .from("bookings")
    .update({ status: "completed", completed_at: now })
    .in("id", ids);
  if (updErr) return NextResponse.json({ ok: false, error: updErr.message }, { status: 500 });

  // Notify customer they can leave a review; ping admin to spot-check the booking
  const notifs = stale.flatMap((b) => [
    {
      user_id: b.customer_id,
      type: "booking_auto_completed",
      payload: { booking_id: b.id, reason: `Auto-completed after ${MAX_HOURS}h` },
    },
  ]);
  await admin.from("notifications").insert(notifs);

  return NextResponse.json({ ok: true, completed: ids.length });
}
