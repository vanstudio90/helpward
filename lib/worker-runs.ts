import "server-only";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

/*
  RECORDING THAT A WORKER RAN.

  The admin console reported "Deletion worker — never run" because it
  had nothing better: with no deletions ever carried out, a worker
  running cleanly every night and a cron that was never registered look
  identical from the outside. This writes the one row that tells them
  apart.

  TWO RULES.

  A FAILED LOG NEVER FAILS THE JOB. If this insert cannot be written,
  the work still happened and the route still answers; the loss is a
  blind spot in the console, not a deleted account left undeleted. So
  the error is returned rather than thrown, and the caller may say so.

  AN UNAUTHORIZED PING IS RATE-LIMITED. A rejected secret is exactly
  the failure worth seeing — the schedule is firing and we are refusing
  it — but the route is a public URL, so anything on the internet can
  make one. At most one unauthorized row per worker per hour is kept,
  which is enough to notice a misconfigured secret and not enough for a
  prober to fill the table with.
*/

export type WorkerOutcome = "succeeded" | "failed" | "unauthorized" | "misconfigured";

export type WorkerRun = {
  worker: string;
  outcome: WorkerOutcome;
  startedAt?: Date;
  /** What the run looked at. Zero means the queue was empty. */
  itemsConsidered?: number;
  /** What it actually completed. Considered-but-not-processed is a signal. */
  itemsProcessed?: number;
  itemsFailed?: number;
  detail?: string | null;
};

export async function recordWorkerRun(run: WorkerRun): Promise<{ ok: boolean; error?: string }> {
  try {
    const db = createSupabaseServiceClient();

    if (run.outcome === "unauthorized") {
      const hourAgo = new Date(Date.now() - 3600_000).toISOString();
      const { count } = await db
        .from("worker_runs")
        .select("id", { count: "exact", head: true })
        .eq("worker", run.worker)
        .eq("outcome", "unauthorized")
        .gte("finished_at", hourAgo);
      if ((count ?? 0) > 0) return { ok: true };
    }

    const { error } = await db.from("worker_runs").insert({
      worker: run.worker,
      outcome: run.outcome,
      started_at: (run.startedAt ?? new Date()).toISOString(),
      finished_at: new Date().toISOString(),
      items_considered: run.itemsConsidered ?? 0,
      items_processed: run.itemsProcessed ?? 0,
      items_failed: run.itemsFailed ?? 0,
      detail: run.detail ?? null,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
