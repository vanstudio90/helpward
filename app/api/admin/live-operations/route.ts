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
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json(result.data, {
    headers: { "cache-control": "no-store" },
  });
}
