import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { isAuthorizedCron } from "@/lib/cron-auth";

/* Tidies up after calls.
 *
 * Two jobs, neither of which had anywhere to run from:
 *
 *   expire_stale_calls() was only invoked by start_call, for that one
 *   booking. A session abandoned on a booking nobody calls again sat
 *   'ringing' forever — and a ringing session is auto-joined by whoever
 *   opens the page next, so they would join a corpse instead of starting
 *   a call.
 *
 *   sweep_call_signals() was written and never called at all. Signalling
 *   is chatter, not a record: offers, answers and ICE candidates
 *   describing network paths that stopped existing minutes later. Left
 *   alone it accumulates without limit.
 */
export async function GET(req: NextRequest) {
  if (!isAuthorizedCron(req.headers.get("authorization"))) {
    return NextResponse.json({ ok: false, reason: "unauthorized" }, { status: 401 });
  }

  const admin = createSupabaseServiceClient();

  // Null booking id = every booking.
  const { data: expired, error: expireError } = await admin
    .rpc("expire_stale_calls", { p_booking_id: null });
  if (expireError) {
    return NextResponse.json({ ok: false, error: expireError.message }, { status: 500 });
  }

  const { data: swept, error: sweepError } = await admin.rpc("sweep_call_signals");
  if (sweepError) {
    // The expiry already succeeded, so report partial success rather than
    // failing the whole run and retrying the half that worked.
    console.error("call signal sweep failed", sweepError);
    return NextResponse.json({
      ok: true, expired: expired ?? 0, swept: 0, warning: "signal sweep failed",
    });
  }

  return NextResponse.json({ ok: true, expired: expired ?? 0, swept: swept ?? 0 });
}
