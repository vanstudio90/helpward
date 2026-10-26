import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { isAuthorizedCron } from "@/lib/cron-auth";

// Flag bookings stuck 'in_progress' for >MAX_HOURS so a human can look.
//
// This used to mark them 'completed'. Two things were wrong with that:
//
//   It manufactured a fact. Nobody had confirmed the work was done — the
//   only evidence was that six hours had passed — and a completed booking
//   is what prompts the customer for a review and credits the helper's
//   task count.
//
//   With payments wired it also split the two states apart: the direct
//   UPDATE bypassed complete_booking(), so it skipped both the payment
//   invariant added in 0043 and the capture that completion triggers. A
//   booking would read 'completed' while the customer's card still held an
//   uncaptured authorization that expires after seven days — at which
//   point the helper has worked and nobody is ever charged.
//
// So: flag, notify, escalate. Completion stays something a person does.

const MAX_HOURS = 6;

export async function GET(req: NextRequest) {
  if (!isAuthorizedCron(req.headers.get("authorization"))) {
    return NextResponse.json({ ok: false, reason: "unauthorized" }, { status: 401 });
  }

  const cutoff = new Date(Date.now() - MAX_HOURS * 3600_000).toISOString();
  const admin = createSupabaseServiceClient();

  const { data: stale, error: selErr } = await admin
    .from("bookings")
    .select("id, customer_id, provider_id, payment_status, overdue_flagged_at")
    .eq("status", "in_progress")
    .lt("started_at", cutoff);

  if (selErr) return NextResponse.json({ ok: false, error: selErr.message }, { status: 500 });

  // Only the ones not already flagged, so a booking stuck for days does not
  // notify everyone once an hour forever.
  const fresh = (stale ?? []).filter((b) => !b.overdue_flagged_at);
  if (fresh.length === 0) {
    return NextResponse.json({ ok: true, stale: stale?.length ?? 0, newly_flagged: 0 });
  }

  const now = new Date().toISOString();
  const { error: updErr } = await admin
    .from("bookings")
    .update({ overdue_flagged_at: now })
    .in("id", fresh.map((b) => b.id));
  if (updErr) return NextResponse.json({ ok: false, error: updErr.message }, { status: 500 });

  const { data: admins } = await admin
    .from("profiles")
    .select("id")
    .eq("role", "admin");

  const notifications = fresh.flatMap((b) => [
    {
      user_id: b.customer_id,
      type: "booking_overdue",
      payload: {
        booking_id: b.id,
        reason: `Still in progress after ${MAX_HOURS}h`,
        // The customer is told what to do, not told it finished.
        action: "If the job is done, ask your helper to mark it complete. If something went wrong, contact support.",
      },
    },
    {
      user_id: b.provider_id,
      type: "booking_overdue",
      payload: { booking_id: b.id, reason: `You started this ${MAX_HOURS}h ago and have not marked it complete.` },
    },
    ...(admins ?? []).map((a) => ({
      user_id: a.id,
      type: "booking_overdue_admin",
      payload: {
        booking_id: b.id,
        payment_status: b.payment_status,
        // An uncaptured authorization expires after about seven days, so
        // this is the number that decides how urgent the escalation is.
        note: b.payment_status === "authorized"
          ? "Hold placed but not captured — resolve before the authorization expires."
          : `Payment status: ${b.payment_status}`,
      },
    })),
  ]);

  await admin.from("notifications").insert(notifications);

  return NextResponse.json({
    ok: true,
    stale: stale?.length ?? 0,
    newly_flagged: fresh.length,
    completed: 0,
  });
}
