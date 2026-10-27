import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { isAuthorizedCron } from "@/lib/cron-auth";

/* Marks helpers offline once their location has gone stale.
 *
 * find_nearby_providers requires a position newer than
 * max_location_age(), and position comes from watchPosition in the
 * browser — which only runs while the tab is open. A helper who closes
 * it keeps an ONLINE toggle, stops being offered work, and is told
 * nothing. The first they know is that a quiet shift was quiet because
 * they were invisible.
 *
 * Being told you are offline is recoverable. Believing you are online
 * when you are not is not.
 */
export async function GET(req: NextRequest) {
  if (!isAuthorizedCron(req.headers.get("authorization"))) {
    return NextResponse.json({ ok: false, reason: "unauthorized" }, { status: 401 });
  }

  const { data, error } = await createSupabaseServiceClient()
    .rpc("mark_stale_helpers_offline");

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, marked_offline: data ?? 0 });
}
