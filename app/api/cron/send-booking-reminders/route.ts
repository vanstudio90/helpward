import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { sendPushToUser } from "@/lib/push";

// Vercel Cron pings this every 15 minutes (see vercel.json).
// Sends T-30 reminders to BOTH parties on any scheduled booking whose
// scheduled_for falls inside a generous window — 20 to 90 minutes from
// now. The window is wider than 30 minutes on both sides because the
// cron only runs every 15 min, so a booking at T-29 needs the previous
// tick to have already grabbed it; a booking at T-31 needs THIS tick to
// grab it before the next. 20-90 covers both worst cases.
//
// Idempotency: bookings.reminder_sent_at is stamped before the notif
// insert. A concurrent re-entrant tick that read the same row would
// fail the eq("reminder_sent_at", null) on the compare-and-swap update.
//
// Helpers get `helper_booking_reminder` (deep-link → /provider/active)
// while customers get `booking_reminder` (→ /bookings/{id}). Two types
// because the bell hrefFor needs different destinations based on which
// side of the marketplace the recipient is on.

const BATCH_LIMIT = 50;

export async function GET(req: NextRequest) {
  if (!isAuthorizedCron(req.headers.get("authorization"))) {
    return NextResponse.json({ ok: false, reason: "unauthorized" }, { status: 401 });
  }

  const admin = createSupabaseServiceClient();
  const now = Date.now();
  const windowStart = new Date(now + 20 * 60 * 1000).toISOString();
  const windowEnd = new Date(now + 90 * 60 * 1000).toISOString();

  const { data: due, error: selErr } = await admin
    .from("bookings")
    .select(`
      id, customer_id, provider_id, scheduled_for,
      service:services(title)
    `)
    .eq("status", "scheduled")
    .is("reminder_sent_at", null)
    .gte("scheduled_for", windowStart)
    .lte("scheduled_for", windowEnd)
    .order("scheduled_for", { ascending: true })
    .limit(BATCH_LIMIT);

  if (selErr) {
    return NextResponse.json({ ok: false, error: selErr.message }, { status: 500 });
  }
  if (!due || due.length === 0) {
    return NextResponse.json({ ok: true, reminded: 0 });
  }

  type Row = {
    id: string; customer_id: string; provider_id: string; scheduled_for: string;
    service: { title: string } | null;
  };
  let reminded = 0;
  const failures: { id: string; error: string }[] = [];

  for (const b of due as Row[]) {
    // Claim the row via compare-and-swap so concurrent ticks dont double-send.
    const { data: claim } = await admin
      .from("bookings")
      .update({ reminder_sent_at: new Date().toISOString() })
      .eq("id", b.id)
      .is("reminder_sent_at", null)
      .select("id")
      .maybeSingle();
    if (!claim) continue;

    const payload = {
      booking_id: b.id,
      scheduled_for: b.scheduled_for,
      service_title: b.service?.title ?? "your task",
    };
    const { error: insErr } = await admin.from("notifications").insert([
      { user_id: b.customer_id, type: "booking_reminder", payload },
      { user_id: b.provider_id, type: "helper_booking_reminder", payload },
    ]);
    if (insErr) {
      failures.push({ id: b.id, error: insErr.message });
      // Roll back the claim so the next tick can retry.
      await admin
        .from("bookings")
        .update({ reminder_sent_at: null })
        .eq("id", b.id);
      continue;
    }

    // Fan out push to both parties on top of the in-app notification.
    // sendPushToUser is a no-op when ONESIGNAL_APP_ID isn't set, so this
    // is safe to call unconditionally during the pre-key window.
    // Failures here are non-fatal — bell + email digest still cover.
    await Promise.allSettled([
      sendPushToUser(b.customer_id, {
        title: "Your task starts soon",
        body: `${payload.service_title} is coming up in ~30 minutes`,
        url: `https://helpward.com/bookings/${b.id}`,
      }),
      sendPushToUser(b.provider_id, {
        title: "You have a task starting soon",
        body: `${payload.service_title} is coming up in ~30 minutes`,
        url: "https://helpward.com/provider/active",
      }),
    ]);

    reminded += 1;
  }

  return NextResponse.json({
    ok: failures.length === 0,
    checked: due.length,
    reminded,
    failures: failures.length > 0 ? failures : undefined,
  });
}
