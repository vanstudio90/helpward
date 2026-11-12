import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/*
  WHAT THE SAFETY QUEUE PROMISES.

  A safety console is believed. That is its whole value and its whole
  risk: somebody reads "resolved" and stops worrying, or reads "3
  overdue" and reorganises their morning. So the promises it makes on
  screen are tested here, one test per sentence the operator can see.
*/

const schema = readFileSync("supabase/migrations/0104_safety_cases.sql", "utf8");
const reads = readFileSync("supabase/migrations/0105_safety_case_functions.sql", "utf8");
const writes = readFileSync("supabase/migrations/0106_safety_case_writes.sql", "utf8");
const meaning = readFileSync("supabase/migrations/0107_case_meaning.sql", "utf8");
const page = readFileSync("app/(admin)/admin/disputes/page.tsx", "utf8");
const panel = readFileSync("components/admin/CasePanel.tsx", "utf8");
const actions = readFileSync("app/(admin)/admin/disputes/actions.ts", "utf8");
const exportRoute = readFileSync("app/api/admin/disputes/export/route.ts", "utf8");

/** The body of one plpgsql function, comments stripped. */
function fn(sql: string, name: string, until: string): string {
  const start = sql.indexOf(`function public.${name}`);
  assert.ok(start > -1, `${name} is missing`);
  const end = sql.indexOf(until, start);
  return sql.slice(start, end === -1 ? undefined : end)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/--[^\n]*/g, "");
}

test("closing a case moves no money and touches no account", () => {
  /*
    The single most dangerous thing a console like this could do is
    make "resolve" mean "refund" — or worse, "suspend". It writes an
    outcome, a reason, a resolution row and a timeline entry.
  */
  const resolve = fn(writes, "admin_dispute_resolve", "function public.admin_dispute_reopen");
  for (const forbidden of ["refunds", "restricted_at", "payment_intent", "stripe", "provider_profiles"]) {
    assert.doesNotMatch(resolve, new RegExp(forbidden, "i"),
      `resolving a case reaches ${forbidden}`);
  }
  // Proven in the migration, not only asserted here.
  assert.match(writes, /resolving a case created a refund/);
  assert.match(writes, /resolving a case restricted somebody/);
  // And the screen says it where the button is.
  assert.match(panel, /does not refund anybody and it\s*\n?\s*does not restrict an account/);
  assert.match(page, /Resolving a case records a finding and nothing else/);
});

test("a stale copy cannot overwrite a colleague", () => {
  assert.match(reads, /function public\.dispute_guard/);
  assert.match(reads, /errcode = 'HW080'/);
  // Compared at millisecond precision, or every JavaScript client would
  // be refused for holding a token it could not represent.
  assert.match(reads, /date_trunc\('milliseconds', v_d\.updated_at\) <> date_trunc\('milliseconds', p_expected\)/);
  // Every function that CHANGES the case takes the token.
  for (const name of ["admin_dispute_update", "admin_dispute_resolve", "admin_dispute_reopen", "admin_dispute_escalate"]) {
    assert.match(writes, new RegExp(`${name}\\(\\s*\\n?\\s*p_id uuid,\\s*\\n?\\s*p_expected timestamptz`),
      `${name} does not carry the concurrency token`);
  }
  assert.match(writes, /a stale copy of the case was allowed to write over it/);
  // The console answers a clash with a reload rather than a retype.
  assert.match(actions, /conflict: error\?\.code === "HW080"/);
  assert.match(panel, /message\.conflict &&/);
});

test("the allegation, the evidence and the finding are kept apart", () => {
  const detail = fn(reads, "admin_dispute_detail", "revoke execute on function public.admin_dispute_detail");
  assert.match(detail, /'report', jsonb_build_object/);
  assert.match(detail, /'evidence', coalesce/);
  assert.match(detail, /'resolutions', coalesce/);
  // Nothing in the write functions edits the original report.
  assert.doesNotMatch(writes.replace(/\/\*[\s\S]*?\*\//g, ""), /update disputes set[^;]*description/,
    "a function edits the original report");
  assert.match(panel, /this is the allegation, not a finding/);
});

test("a finding survives the case being reopened", () => {
  const reopen = fn(writes, "admin_dispute_reopen", "-- 5. Escalation");
  assert.match(reopen, /update dispute_resolutions set\s*\n?\s*reopened_at = now\(\)/);
  assert.doesNotMatch(reopen, /delete from dispute_resolutions/);
  assert.match(writes, /the previous finding was not kept when the case was reopened/);
  assert.match(panel, /The finding above is kept, marked as reopened/);
});

test("a deadline is only ever one somebody set", () => {
  // No default on the column, and nothing writes one on creation.
  assert.doesNotMatch(schema, /next_review_at timestamptz\s+(not null\s+)?default/);
  const queue = fn(reads, "admin_dispute_queue", "revoke execute on function public.admin_dispute_queue");
  assert.match(queue, /'overdue_reviews', count\(\*\) filter \(where review_overdue\)/);
  assert.match(queue, /next_review_at is not null and d\.next_review_at < now\(\)/);
  assert.match(page, /Only cases with a review time somebody set/);
});

test("evidence access is recorded before the file is handed over", () => {
  const open = fn(writes, "admin_dispute_evidence_open", "-- 4. The finding");
  assert.ok(
    open.indexOf("insert into dispute_evidence_access") < open.indexOf("return jsonb_build_object"),
    "the file is returned before the access is logged",
  );
  const route = readFileSync("app/api/admin/disputes/evidence/[id]/route.ts", "utf8");
  assert.ok(
    route.indexOf("admin_dispute_evidence_open") < route.indexOf("createSignedUrl"),
    "the route signs a URL before recording the access",
  );
  // The bucket is private and no browser token reaches it.
  assert.match(schema, /values \('dispute-evidence', 'dispute-evidence', false, 26214400\)/);
  assert.match(schema, /for select using \(bucket_id <> 'dispute-evidence'\)/);
  assert.match(panel, /Access is logged/);
});

test("ticking a step records a step and messages nobody", () => {
  const task = fn(writes, "admin_dispute_task_set", "-- 3. Evidence");
  assert.doesNotMatch(task, /notifications|support_messages|sendEmail/i);
  assert.match(panel, /Ticking a step records it\. It does not message anybody/);
  const actionsBody = actions.replace(/\/\*[\s\S]*?\*\//g, "");
  const setTask = actionsBody.slice(actionsBody.indexOf("setCaseTaskAction"), actionsBody.indexOf("resolveCaseAction"));
  assert.doesNotMatch(setTask, /notifications|sendEmail/);
});

test("a failed query is never drawn as an empty queue", () => {
  assert.match(page, /if \(!queue\.ok\)/);
  assert.match(page, /\{queue\.error\}/);
  assert.match(page, /This is a failed query, not an empty queue/);
  // The empty state needs the counts to be genuinely zero AND no filters.
  assert.match(page, /const nothingAtAll = data\.counts\.open === 0/);
});

test("a Stripe chargeback stays distinct from a service dispute", () => {
  assert.match(schema, /stripe_dispute_id text/);
  /*
    The webhook opens a case so somebody answers the bank, and that is
    all it does: it must not rewrite the booking's payment_status,
    because Stripe decides that one on its own timetable and the money
    screen would start disagreeing with the processor.
  */
  const webhook = readFileSync("app/api/webhooks/stripe/route.ts", "utf8");
  const branch = webhook.slice(
    webhook.indexOf('case "charge.dispute.created"'),
    webhook.indexOf("// Other event types ignored"),
  );
  assert.match(branch, /stripe_dispute_id: dispute\.id/);
  assert.doesNotMatch(branch, /payment_status/, "the chargeback branch rewrites the payment status");
  // One case per chargeback, however often Stripe retries.
  assert.match(branch, /\.eq\("stripe_dispute_id", dispute\.id\)/);
  const chargebacks = readFileSync("supabase/migrations/0108_chargeback_cases.sql", "utf8");
  assert.match(chargebacks, /create unique index if not exists disputes_stripe_dispute_uniq/);
  assert.match(chargebacks, /the same chargeback opened a second case/);
  // It is a link, never a status: nothing derives one from the other.
  const queue = fn(reads, "admin_dispute_queue", "revoke execute on function public.admin_dispute_queue");
  assert.doesNotMatch(queue, /status\s*=\s*'chargeback'/);
  assert.match(panel, /Stripe decides that one; this case is ours/);
});

test("the export carries the management view, not the case", () => {
  for (const forbidden of ["description", "reason", "customer_name", "helper_name", "report"]) {
    assert.doesNotMatch(exportRoute.slice(exportRoute.indexOf("const header")), new RegExp(`"${forbidden}"`, "i"),
      `the export includes ${forbidden}`);
  }
  assert.match(exportRoute, /dispute\.exported/);
  assert.ok(
    exportRoute.indexOf("auditError") < exportRoute.indexOf("content-disposition"),
    "the file is produced before the export is recorded",
  );
});

test("an open case means the same thing everywhere", () => {
  // 0104 added two statuses; anything still asking for three named ones
  // would quietly stop counting cases that are very much open.
  assert.match(meaning, /function public\.customer_open_cases/);
  assert.match(meaning, /where d\.status <> 'resolved'/);
  assert.doesNotMatch(meaning.replace(/\/\*[\s\S]*?\*\//g, ""),
    /status in \('open', 'investigating', 'escalated'\)/);
  assert.match(meaning, /a booking-less case in awaiting_response did not reach the customer record/);
});
