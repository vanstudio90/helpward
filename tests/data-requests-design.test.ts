import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { exportState, deletionState } from "../lib/data/admin-data-requests.ts";

/* The reader now talks to the database, so the rules it enforces are
   asserted against its source rather than by calling it — a unit test
   that needs a service key is a unit test that stops running. */
const reader = readFileSync("lib/data/admin-data-requests.ts", "utf8");

/*
  DATA REQUESTS.

  The first test here is not about the design at all: it is about the
  defect that prompted it. An export read READY beside an expiry date
  already in the past, because the page printed the stored column. That
  is fixed on the working queue and made structurally impossible in the
  design, and both are guarded.
*/

const page = readFileSync("app/(admin)/admin/data-requests/page.tsx", "utf8");
const classic = readFileSync("app/(admin)/admin/data-requests/classic/page.tsx", "utf8");
const panel = readFileSync("components/admin/DataRequestPanel.tsx", "utf8");

test("an expired link is never shown as available", () => {
  const hour = 3600_000;
  const now = Date.parse("2026-11-20T00:00:00Z");
  // Stored "ready", expired yesterday.
  assert.equal(exportState("ready", "2026-11-19T00:00:00Z", now), "expired");
  // Stored "ready", valid for another week.
  assert.equal(exportState("ready", "2026-11-27T00:00:00Z", now), "available");
  // A failure stays a failure whatever the clock says.
  assert.equal(exportState("failed", "2026-11-19T00:00:00Z", now), "failed");
  assert.equal(exportState("processing", null, now + hour), "processing");

  // The working queue computes it too, rather than printing the column.
  assert.match(classic, /function effectiveExportStatus/);
  assert.match(classic, /const expired = Boolean\(expiresAt && new Date\(expiresAt\)\.getTime\(\) < Date\.now\(\)\)/);
  // Neither list prints the stored column unconditionally any more.
  assert.doesNotMatch(classic, /\{r\.status\.toUpperCase\(\)\}\s*\n/);
  assert.match(classic, /\{past \? "ELIGIBLE" : r\.status\.toUpperCase\(\)\}/);
});

test("scheduled, eligible and deleted are three different states", () => {
  const now = Date.parse("2026-12-11T00:00:00Z");
  const steps = (states: ("done" | "pending" | "failed" | "not_run")[]) =>
    states.map((state) => ({ state }));

  // Grace still running: scheduled, and nothing has been removed.
  assert.equal(deletionState([], "pending", "2026-12-20T00:00:00Z", now), "scheduled");
  // Grace passed, work not run: eligible is NOT deleted.
  assert.equal(deletionState([], "pending", "2026-12-01T00:00:00Z", now), "eligible");
  // Every step done: deleted.
  assert.equal(deletionState(steps(["done", "done"]), "pending", "2026-12-01T00:00:00Z", now), "deleted");
  // One step failed after others succeeded: partly completed, which is
  // its own state because somebody believes they are gone.
  assert.equal(deletionState(steps(["done", "failed"]), "pending", "2026-12-01T00:00:00Z", now), "partial");
  // Nothing succeeded: failed.
  assert.equal(deletionState(steps(["failed"]), "pending", "2026-12-01T00:00:00Z", now), "failed");

  assert.match(page, /Three states, not one/);
  assert.match(panel, /Removing the login account does not by itself prove/);
});

test("a generated file is not a delivered one", () => {
  // The file is evidenced by completed_at. Neither the notice nor the
  // download is written down anywhere, so neither is ever claimed.
  assert.match(reader, /file_generated: exportRow\.completed_at \? "yes" : "no"/);
  assert.match(reader, /notice_sent: "not_recorded"/);
  assert.match(reader, /downloaded: "not_recorded"/);
  assert.match(panel, /THREE FACTS, NOT ONE/);
  assert.match(page, /not proof\s*\n?\s*that anybody received or opened it/);
});

test("the client IP is never in the list", () => {
  // The row builders never put it in a row; it is only ever assembled
  // into the panel's restricted technical block.
  const rowBuilders = reader.slice(reader.indexOf("const exportRows"), reader.indexOf("const tab ="));
  assert.doesNotMatch(rowBuilders, /\bip\b/, "a row carries the requester's IP");
  assert.match(reader, /label: "Client IP at request", value: row\.ip/);
  assert.match(panel, /THE IP LIVES HERE AND NOWHERE ELSE/);
  // And the working queue no longer prints it inline either.
  assert.doesNotMatch(classic, /\{r\.ip && ` · \$\{r\.ip\}`\}/);
  assert.match(classic, /Technical details/);
});

test("the heading claims a workflow, not compliance", () => {
  /* Source comments quote the old wording to explain why it went, so
     the assertion is about what renders, not what is written down. */
  const strip = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  assert.doesNotMatch(strip(page), /GDPR|CCPA|PIPEDA/);
  assert.doesNotMatch(strip(classic), /GDPR|CCPA|PIPEDA/);
  assert.doesNotMatch(strip(classic), /compliance queue/);
  assert.match(page, /It does not certify compliance with anything/);
  assert.match(classic, /does not\s*\n?\s*by itself certify compliance/);
});

test("destructive actions are never one click from a row", () => {
  // No row renders a delete control; the irreversible ones sit behind a
  // menu that asks for a reason.
  assert.doesNotMatch(page, /function Row[\s\S]*?(Delete|Erase|Remove) /);
  assert.match(panel, /NO DESTRUCTIVE ACTION SITS ON A ROW OR A SINGLE CLICK/);
  assert.match(panel, /Each of these asks for a reason and records who did it/);
});

test("retention is described rather than promised away", async () => {
  const { RETENTION_CATEGORIES } = await import("../lib/admin-data-request-states.ts");
  assert.ok(RETENTION_CATEGORIES.length >= 3);
  for (const category of RETENTION_CATEGORIES) {
    assert.ok(category.treatment && category.why, `${category.label} does not say how it is treated`);
  }
  assert.match(panel, /Promising that everything disappears is a promise a marketplace cannot keep/);
});

test("times carry their zone, and failures are not emptiness", () => {
  // Every displayed time is formatted in a named zone, and the zone
  // travels with the view.
  assert.match(reader, /const TZ = "America\/Vancouver"/);
  assert.match(reader, /timeZone: TZ/);
  assert.match(reader, /timezone: `\$\{TZ\}/);
  // A failed read is carried, not swallowed into an empty queue.
  assert.match(reader, /const loadError = exportsRes\.error\?\.message/);
  assert.match(page, /times in \{view\.timezone\}/);
  assert.match(page, /The request queue could not be loaded/);
  assert.match(page, /a failed query, not an empty queue/);
  assert.match(page, /No data requests to show/);
});

/* ------------------------------------------------------------------ */
/* THE WORKER-STATUS QUESTION THIS DATABASE COULD NOT ANSWER           */
/* ------------------------------------------------------------------ */

const runsSql = readFileSync("supabase/migrations/0112_worker_runs.sql", "utf8");
const recorder = readFileSync("lib/worker-runs.ts", "utf8");
const deletionWorker = readFileSync("app/api/cron/execute-account-deletions/route.ts", "utf8");
const exportWorker = readFileSync("app/api/cron/process-data-exports/route.ts", "utf8");

test("an empty successful run is recorded, and is not a silence", () => {
  /*
    "Deletion worker — never run" was an inference: with no deletion
    ever requested, a worker running cleanly every night and a cron
    that was never registered produced the identical screen.
  */
  assert.match(runsSql, /create table if not exists public\.worker_runs/);
  assert.match(runsSql, /items_considered integer not null default 0/);
  assert.match(runsSql, /items_processed  integer not null default 0/);
  // Both workers record the empty case explicitly.
  assert.match(deletionWorker, /Ran and found no deletion whose grace period had passed/);
  assert.match(exportWorker, /Ran and found no export waiting to be built/);
  // And the reader calls that idle, not healthy and not failing.
  assert.match(reader, /state: run\.items_processed > 0 \? "healthy" : "idle"/);
  assert.match(reader, /That is this worker's normal state, not a silence/);
});

test("a refused secret is its own state, because it looks like never running", () => {
  assert.match(deletionWorker, /outcome: "unauthorized"/);
  assert.match(exportWorker, /outcome: "unauthorized"/);
  assert.match(reader, /state: "unauthorized"/);
  assert.match(reader, /the secret does not match, so no work is being done/);
  // Missing configuration is a third thing again.
  assert.match(deletionWorker, /outcome: "misconfigured"/);
  // A public URL cannot be used to fill the table.
  assert.match(recorder, /AN UNAUTHORIZED PING IS RATE-LIMITED/);
  assert.match(recorder, /\.eq\("outcome", "unauthorized"\)/);
});

test("no recorded run is reported as no record, not as never having run", () => {
  assert.match(reader, /No run has been recorded/);
  assert.match(reader, /a worker that last ran before then shows nothing here/);
  assert.match(page, /No run recorded/);
});

test("a failed log never fails the job", () => {
  // The account still gets deleted if the bookkeeping row cannot be written.
  assert.match(recorder, /A FAILED LOG NEVER FAILS THE JOB/);
  assert.match(recorder, /return \{ ok: false, error: /);
  assert.doesNotMatch(recorder, /throw new Error/);
});

test("the run log is readable by admins and writable by nobody with a browser", () => {
  assert.match(runsSql, /create policy worker_runs_admin_read on public\.worker_runs\s+for select using \(public\.is_admin\(\)\)/);
  assert.match(runsSql, /revoke all on public\.worker_runs from anon, authenticated/);
  assert.match(runsSql, /grant select on public\.worker_runs to authenticated/);
  // No insert policy exists, so a signed-in session cannot forge a run.
  assert.doesNotMatch(runsSql, /for insert/);
  // And it is not the audit log.
  assert.match(runsSql, /WHAT THIS TABLE IS NOT/);
});
