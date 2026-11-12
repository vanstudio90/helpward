import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { buildAndUploadArchive, exportExpiresAt } from "@/lib/data-export";
import { recordWorkerRun } from "@/lib/worker-runs";

// Vercel Cron pings this every 30 minutes (see vercel.json).
// Walks data_export_requests.status='pending', archives + uploads each,
// stamps archive_url / archive_size_bytes / expires_at / completed_at on
// the row. Per-row failures captured in failure_reason so admins can see
// what tripped without one bad export blocking the queue.
//
// Batch cap protects us from a runaway day where many users hit the button
// at once — if there's a backlog, the next tick picks it up. Plenty fast
// for v1 traffic levels.

const BATCH_LIMIT = 25;

/*
  EVERY INVOCATION IS RECORDED — see 0112. "Last export completed" is a
  fact about a request, not about this worker, and the two stop
  agreeing the moment nobody asks for an export.
*/
const WORKER = "exports";

export async function GET(req: NextRequest) {
  const startedAt = new Date();

  if (!isAuthorizedCron(req.headers.get("authorization"))) {
    await recordWorkerRun({
      worker: WORKER, outcome: "unauthorized", startedAt,
      detail: "A request reached this route without a valid cron secret. If the schedule is firing, CRON_SECRET does not match.",
    });
    return NextResponse.json({ ok: false, reason: "unauthorized" }, { status: 401 });
  }

  const admin = createSupabaseServiceClient();

  const { data: pending, error: selErr } = await admin
    .from("data_export_requests")
    .select("id, user_id")
    .eq("status", "pending")
    .order("requested_at", { ascending: true })
    .limit(BATCH_LIMIT);

  if (selErr) {
    await recordWorkerRun({
      worker: WORKER, outcome: "failed", startedAt,
      detail: `The queue could not be read: ${selErr.message}`,
    });
    return NextResponse.json({ ok: false, error: selErr.message }, { status: 500 });
  }
  if (!pending || pending.length === 0) {
    /* Ran, looked, found nothing. Not the same as not running. */
    await recordWorkerRun({
      worker: WORKER, outcome: "succeeded", startedAt,
      itemsConsidered: 0, itemsProcessed: 0,
      detail: "Ran and found no export waiting to be built.",
    });
    return NextResponse.json({ ok: true, processed: 0 });
  }

  let processed = 0;
  const failures: { id: string; error: string }[] = [];

  for (const row of pending) {
    // Two-step status update so a re-entrant cron tick can't double-process.
    // If another instance got here first the eq("status","pending") guard
    // misses and we skip.
    const { data: claim } = await admin
      .from("data_export_requests")
      .update({ status: "processing" })
      .eq("id", row.id)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();
    if (!claim) continue;

    try {
      const { storagePath, bytes } = await buildAndUploadArchive(row.user_id, row.id);
      const { error: upErr } = await admin
        .from("data_export_requests")
        .update({
          status: "ready",
          archive_url: storagePath,
          archive_size_bytes: bytes,
          expires_at: exportExpiresAt(),
          completed_at: new Date().toISOString(),
          failure_reason: null,
        })
        .eq("id", row.id);
      if (upErr) throw new Error(upErr.message);

      await admin.from("notifications").insert({
        user_id: row.user_id,
        type: "data_export_ready",
        payload: { export_request_id: row.id },
      });

      processed += 1;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      failures.push({ id: row.id, error: msg });
      await admin
        .from("data_export_requests")
        .update({ status: "failed", failure_reason: msg.slice(0, 500) })
        .eq("id", row.id);
    }
  }

  await recordWorkerRun({
    worker: WORKER,
    outcome: failures.length === 0 ? "succeeded" : "failed",
    startedAt,
    itemsConsidered: pending.length,
    itemsProcessed: processed,
    itemsFailed: failures.length,
    detail: failures.length === 0
      ? `Built ${processed} of ${pending.length} waiting export${pending.length === 1 ? "" : "s"}.`
      : `${failures.length} of ${pending.length} failed: ${failures.map((f) => f.error).join("; ").slice(0, 400)}`,
  });

  return NextResponse.json({
    ok: failures.length === 0,
    checked: pending.length,
    processed,
    failures: failures.length > 0 ? failures : undefined,
  });
}
