import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { isAuthorizedCron } from "@/lib/cron-auth";

// Vercel Cron pings this daily (see vercel.json).
// Picks every account_deletion_requests row in 'pending' status whose
// grace_until has passed and executes the deletion via Supabase Auth Admin
// REST API. Cascade deletes via FK on profiles.id handle the rest of the
// user-owned rows (requests, bookings, addresses, favorites, etc.).
//
// We use the Auth Admin REST API directly rather than the supabase-js
// admin namespace because our service client is the SSR variant which
// doesn't expose auth.admin. The REST call is a single DELETE with the
// service-role key — clean and avoids dragging in another constructor.
//
// On per-row failure we set status='failed' + failure_reason so admin sees
// it on /admin/data-requests instead of one bad row blocking the queue.

const BATCH_LIMIT = 50;

export async function GET(req: NextRequest) {
  if (!isAuthorizedCron(req.headers.get("authorization"))) {
    return NextResponse.json({ ok: false, reason: "unauthorized" }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ ok: false, error: "Supabase env vars missing" }, { status: 500 });
  }

  const admin = createSupabaseServiceClient();

  const { data: due, error: selErr } = await admin
    .from("account_deletion_requests")
    .select("id, user_id, grace_until")
    .eq("status", "pending")
    .lte("grace_until", new Date().toISOString())
    .order("grace_until", { ascending: true })
    .limit(BATCH_LIMIT);

  if (selErr) {
    return NextResponse.json({ ok: false, error: selErr.message }, { status: 500 });
  }
  if (!due || due.length === 0) {
    return NextResponse.json({ ok: true, deleted: 0 });
  }

  let deleted = 0;
  const failures: { id: string; error: string }[] = [];

  for (const row of due) {
    // Claim the row so concurrent cron ticks don't double-delete.
    const { data: claim } = await admin
      .from("account_deletion_requests")
      .update({ status: "executing" })
      .eq("id", row.id)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();
    if (!claim) continue;

    try {
      const res = await fetch(`${supabaseUrl}/auth/v1/admin/users/${row.user_id}`, {
        method: "DELETE",
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
        },
      });
      if (!res.ok && res.status !== 404) {
        // 404 = user already gone, which is the desired terminal state —
        // happens when an admin manually deleted them while the row was
        // pending. We treat that as success and mark executed below.
        const body = await res.text();
        throw new Error(`Auth delete failed (${res.status}): ${body.slice(0, 200)}`);
      }

      // The cascading FK on profiles.id is on delete cascade for most of
      // the user's data. Audit log + a few legal-retention rows keep their
      // user_id null'd or preserved per the schema's on-delete clauses.
      await admin
        .from("account_deletion_requests")
        .update({
          status: "executed",
          executed_at: new Date().toISOString(),
          failure_reason: null,
        })
        .eq("id", row.id);

      await admin.from("audit_log").insert({
        actor_id: null,
        action: "cron.account_deleted",
        target_table: "account_deletion_requests",
        target_id: row.id,
        payload: { user_id: row.user_id, grace_until: row.grace_until },
      });

      deleted += 1;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      failures.push({ id: row.id, error: msg });
      await admin
        .from("account_deletion_requests")
        .update({ status: "failed", failure_reason: msg.slice(0, 500) })
        .eq("id", row.id);
    }
  }

  return NextResponse.json({
    ok: failures.length === 0,
    checked: due.length,
    deleted,
    failures: failures.length > 0 ? failures : undefined,
  });
}
