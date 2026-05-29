import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { materialiseNextOccurrence } from "@/app/(app)/bookings/series/actions";

// Daily cron: walks every active series and materialises the next occurrence
// if its scheduled date is within the next 48 hours and no request has been
// created for that date yet (the unique partial index on requests guarantees
// idempotency).
//
// We rely on the action's own logic to detect end-date / max-occurrences
// boundaries and flip the series to 'completed' when appropriate.

const HORIZON_HOURS = 48;

export async function GET(req: NextRequest) {
  if (!isAuthorizedCron(req.headers.get("authorization"))) {
    return NextResponse.json({ ok: false, reason: "unauthorized" }, { status: 401 });
  }

  const admin = createSupabaseServiceClient();
  const { data: series, error } = await admin
    .from("booking_series")
    .select("id")
    .eq("status", "active")
    .limit(1000);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  let materialised = 0;
  let skipped = 0;
  const errors: string[] = [];
  for (const s of series ?? []) {
    try {
      // materialiseNextOccurrence is internally guarded — it only creates a
      // request if the next occurrence falls in the future window AND no
      // duplicate exists (unique index enforces).
      const reqId = await materialiseNextOccurrence(s.id);
      if (reqId) materialised += 1;
      else skipped += 1;
    } catch (e) {
      errors.push(`${s.id}: ${(e as Error).message}`);
    }
  }

  return NextResponse.json({
    ok: true,
    horizon_hours: HORIZON_HOURS,
    series_processed: series?.length ?? 0,
    materialised,
    skipped,
    errors: errors.slice(0, 10),
  });
}
