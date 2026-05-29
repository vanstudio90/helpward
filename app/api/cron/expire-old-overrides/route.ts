import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { isAuthorizedCron } from "@/lib/cron-auth";

// Hard-delete provider_availability_overrides whose date is in the past.
// Keeping past overrides doesn't help anyone — the editor only shows future
// ones, the public profile only shows future ones, and the matching engine
// (eventually) only cares about current+future. Running this daily keeps
// the table small even if every helper schedules 50 vacations a year.
//
// Also clears vacation_mode automatically when vacation_returns_on has
// passed, so helpers don't have to remember to flip the toggle back.

export async function GET(req: NextRequest) {
  if (!isAuthorizedCron(req.headers.get("authorization"))) {
    return NextResponse.json({ ok: false, reason: "unauthorized" }, { status: 401 });
  }

  const today = new Date().toISOString().slice(0, 10);
  const admin = createSupabaseServiceClient();

  // Past overrides — delete and count for the response body.
  const { data: deleted, error: delErr } = await admin
    .from("provider_availability_overrides")
    .delete()
    .lt("date", today)
    .select("id");
  if (delErr) return NextResponse.json({ ok: false, error: delErr.message }, { status: 500 });

  // Past vacation returns — flip the toggle off.
  const { data: returned, error: vacErr } = await admin
    .from("provider_profiles")
    .update({ vacation_mode: false, vacation_returns_on: null })
    .lt("vacation_returns_on", today)
    .eq("vacation_mode", true)
    .select("user_id");
  if (vacErr) return NextResponse.json({ ok: false, error: vacErr.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    deleted_overrides: deleted?.length ?? 0,
    vacations_ended: returned?.length ?? 0,
  });
}
