import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { voidBookingAuthorization } from "@/lib/payments";
import { stripeConfigured } from "@/lib/stripe";

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
    .select("id, customer_id, provider_id, scheduled_for, payment_status")
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
      cancel_reason: "Helper did not arrive — auto-cancelled by system",
    })
    .in("id", ids);
  if (updErr) return NextResponse.json({ ok: false, error: updErr.message }, { status: 500 });

  /*
    RELEASE THE HOLD. Cancelling without this leaves the customer's money
    authorised against their card with nothing left to release it — the
    booking reads "cancelled" while the bank still shows a pending charge,
    until Stripe's own authorisation expiry days later.

    This route used to write status: "cancelled" and stop there, so
    payment_status stayed "authorized" forever. The cancellation ROUTE
    already documents the pairing — cancel, then void — and says plainly
    that an actor calling only the first half strands the money. This
    cron was the actor doing exactly that.

    A void, not a refund: a void never reaches the customer's statement,
    while a refund shows a charge and then a credit days later, which
    reads as being billed for a job nobody turned up to.

    Done per booking and after the status write, so one Stripe failure
    cannot leave the rest uncancelled, and reported rather than swallowed
    — an unreleased hold is a customer's money and should be visible in
    the cron's own output.
  */
  let released = 0;
  const releaseFailures: { booking: string; reason: string }[] = [];
  if (stripeConfigured()) {
    for (const b of stale) {
      if (b.payment_status !== "authorized") continue;
      const result = await voidBookingAuthorization(b.id);
      if (result.ok) released++;
      else releaseFailures.push({ booking: b.id, reason: result.message ?? "unknown" });
    }
  }

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

  return NextResponse.json({
    ok: true,
    cancelled: ids.length,
    holdsReleased: released,
    releaseFailures,
  });
}
