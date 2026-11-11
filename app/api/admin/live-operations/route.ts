import { NextResponse } from "next/server";
import { getLiveOperations } from "@/lib/data/admin-overview";

/*
  The map's heartbeat.

  Polled every few seconds by the overview, so it does the one read and
  nothing else — the heavier snapshot (money, coverage, queues) is a
  separate call on a slower cadence, and mixing them would mean
  re-running the expensive half every time a helper moves a block.

  The admin check lives in the database function; this route adds no
  permission of its own, so there is only one place to get it wrong.
*/

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const includeReview = new URL(request.url).searchParams.get("review") === "1";
  const result = await getLiveOperations({ includeReview });
  if (!result.ok) {
    /*
      The status says which kind of problem it is, because the map
      component treats them differently: a refusal stops polling, a
      missing migration is worth saying out loud, and anything else is
      worth retrying on the next tick.
    */
    const status = /not an admin|not permitted/i.test(result.error) ? 403
      : /migration/i.test(result.error) ? 501
      : 502;
    return NextResponse.json({ error: result.error }, { status });
  }
  return NextResponse.json(result.data, {
    headers: { "cache-control": "no-store" },
  });
}
