import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { actionLabel, OUTCOME_MEANING } from "../lib/admin-audit-states.ts";

/*
  THE AUDIT LOG.

  The first test is the one that matters: the page may only call this
  history read-only if the database refuses to change it. That was
  false here until migration 0109 — an admin session could UPDATE and
  DELETE audit_log through PostgREST — so the claim and the control
  are tested together.

  THESE ARE SOURCE ASSERTIONS, NOT A LIVE READ. getAuditView() now
  talks to the database, and a test that needs a service key is a test
  that gets skipped in CI and then quietly rots. What is checked here
  is the shape of the query and the rules it encodes; the numbers it
  returns are checked against production by hand.
*/

const page = readFileSync("app/(admin)/admin/audit-log/page.tsx", "utf8");
const panel = readFileSync("components/admin/AuditEventPanel.tsx", "utf8");
const data = readFileSync("lib/data/admin-audit.ts", "utf8");
const lock = readFileSync("supabase/migrations/0109_audit_log_append_only.sql", "utf8");
const check = readFileSync("supabase/migrations/0111_audit_log_append_only_check.sql", "utf8");
const detail = readFileSync("supabase/migrations/0110_audit_log_detail.sql", "utf8");

test("read-only is enforced by the database, not by hiding buttons", () => {
  assert.match(lock, /revoke update, delete, truncate on public\.audit_log from anon, authenticated/);
  assert.match(lock, /drop policy if exists al_admin on public\.audit_log/);
  assert.match(lock, /create policy al_admin_read on public\.audit_log\s+for select/);
  assert.match(lock, /create policy al_admin_append on public\.audit_log\s+for insert/);
  assert.match(lock, /an admin session could still amend the audit log/);
  assert.match(lock, /locking the log also hid it from admins/);
});

test("the claim is established from the catalogue, not assumed", () => {
  // The function asks about grants AND about policies — either alone is a hole.
  assert.match(check, /information_schema\.role_table_grants/);
  assert.match(check, /privilege_type in \('UPDATE', 'DELETE', 'TRUNCATE'\)/);
  assert.match(check, /from pg_policies/);
  assert.match(check, /cmd in \('UPDATE', 'DELETE', 'ALL'\)/);
  // It is security definer for a stated reason, and it proves itself.
  assert.match(check, /security definer/);
  assert.match(check, /the check did not notice an UPDATE grant on audit_log/);
  // The view calls it, and refuses the claim when the answer is not a boolean.
  assert.match(data, /rpc\("audit_log_is_append_only"\)/);
  assert.match(data, /could not establish whether the database refuses changes/);
});

test("the page states the claim only when it is true", () => {
  assert.match(page, /view\.append_only_enforced \?/);
  assert.match(page, /Append-only history — a correction is a new event/);
  assert.match(page, /This log is editable/);
  assert.match(page, /no claim to be tamper-proof or complete/);
  assert.doesNotMatch(page.replace(/\/\*[\s\S]*?\*\//g, ""), /complete history/i);
});

test("an attempt is not an outcome", () => {
  // The database constrains the vocabulary, and defaults nothing it was told.
  assert.match(detail, /outcome in \('succeeded', 'submitted', 'denied', 'failed'\)/);
  assert.match(detail, /if new\.outcome is null then\s*\n\s*new\.outcome := 'succeeded';/);
  assert.match(OUTCOME_MEANING.submitted, /not yet confirmed/);
  assert.match(data, /outcome: \(e\.outcome \?\? "succeeded"\)/);
});

test("the role is the role at the time", () => {
  // Captured from the verified claim at insert, never looked up later.
  assert.match(detail, /request\.jwt\.claims/);
  assert.match(detail, /'app_metadata' ->> 'role'/);
  assert.match(data, /THE ACTOR'S KIND, from what they WERE/);
  assert.match(data, /role_at_event/);
  assert.match(panel, /Role at event/);
  const states = readFileSync("lib/admin-audit-states.ts", "utf8");
  assert.match(states, /admin claim in this product lives in[\s\S]{0,40}JWT/);
  assert.match(states, /not in\s*\n?\s*profiles\.role/);
});

test("an event with no role recorded says so rather than guessing", () => {
  // Nothing was backfilled, because a backfill would be an invention.
  assert.doesNotMatch(detail, /update public\.audit_log set role_at_event/);
  assert.match(data, /"Not recorded"/);
  assert.match(data, /predate the change that records an actor's role/);
  // An unsigned event is the system — that one is not a guess.
  assert.match(data, /e\.actor_id === null \? "System"/);
});

test("only changed fields appear in the comparison", () => {
  // Saved with the event, never recomputed against today's row.
  assert.match(detail, /changes jsonb/);
  assert.match(data, /Saved with the event\. Never a comparison against today's row/);
  assert.match(panel, /Only the fields that moved are listed/);
  assert.match(panel, /not a comparison against whatever the record says today/);
});

test("a correction is visible where the mistake is", () => {
  // Corrections are fetched outside the window, or the window hides them.
  assert.match(data, /CORRECTIONS ARE FETCHED SEPARATELY/);
  assert.match(data, /\.eq\("action", "audit\.correction"\)/);
  // The row carries it, not just the panel.
  assert.match(data, /correction: \{ id: string; label: string \} \| null;/);
  assert.match(page, /THE CORRECTION BELONGS BESIDE THE NAME IT GETS WRONG/);
  assert.match(page, /\{row\.correction\.label\}/);
  assert.match(page, /Corrected by \{row\.correction\.id\}/);
  // A self-test's borrowed actor is named as exactly that.
  assert.match(data, /Self-test event — incorrect actor attribution/);
  // The corrected rows stay. Removing them would be the tampering.
  assert.match(panel, /this entry stays\s*\n?\s*exactly as it was written/);
});

test("the actor is named the same in the row and the panel", () => {
  // One builder makes both, so they cannot drift.
  assert.match(data, /const row = toRow\(e\);/);
  assert.match(data, /actor: row\.actor,/);
  assert.match(page, /THE SAME NAME AS THE PANEL/);
});

test("ordering is deterministic when events share an instant", () => {
  assert.match(data, /\.order\("created_at", \{ ascending: false \}\)\s*\n\s*\.order\("id", \{ ascending: false \}\)/);
  assert.match(detail, /audit_log_recent_idx\s*\n\s*on public\.audit_log \(created_at desc, id desc\)/);
  assert.match(page, /ties broken by\s*\n?\s*sequence/);
});

test("action codes become sentences", () => {
  assert.equal(actionLabel("provider.approve"), "Helper approved");
  assert.equal(actionLabel("dispute.reopened"), "Safety case reopened");
  assert.equal(actionLabel("some.new_thing"), "Some new thing");
});

test("filtering test activity hides nothing permanently", () => {
  assert.match(page, /Excluded events stay recorded and remain searchable/);
  assert.match(page, /the filter hides them, nothing\s*\n?\s*removes them/);
  assert.match(data, /if \(!opts\.includeReview\) rows = rows\.filter/);
});

test("the filters actually filter", () => {
  // A control that looks like a filter and does nothing is a lie about
  // what is in the log.
  assert.match(page, /<form method="get" action="\/admin\/audit-log"/);
  assert.match(page, /<Select name="window"/);
  assert.match(page, /<Select name="actor"/);
  assert.match(page, /<Select name="outcome"/);
  assert.match(data, /if \(since\) query = query\.gte\("created_at", since\)/);
});

test("controls nobody has built stay switched off after wiring", () => {
  // `sample` going false must not switch Export on by itself.
  assert.match(data, /writable: boolean;/);
  assert.doesNotMatch(data, /writable: true/);
  assert.doesNotMatch(page, /disabled=\{view\.sample\}/);
  assert.match(page, /disabled=\{!view\.writable\}/);
});

test("a logging gap is surfaced rather than read as silence", () => {
  assert.match(data, /logging_gap/);
  // And it describes the RIGHT gap: unrecorded roles, not absent events.
  assert.match(page, /Some entries cannot say what the actor was/);
  assert.match(page, /an unknown role is not the same as nothing having happened/);
  // Checked on the rendered copy, not the comment that quotes the old wording.
  assert.doesNotMatch(page.replace(/\/\*[\s\S]*?\*\//g, ""), /Events are known to be missing/);
  assert.match(page, /a failed query, not an empty history/);
});

test("a failed query is not an empty history", () => {
  assert.match(data, /load_error: error\.message/);
  assert.match(page, /The trail could not be loaded/);
});

test("secrets never reach the table, and the note travels with the event", () => {
  assert.match(data, /no passwords, tokens, card numbers or entry codes/);
  assert.match(panel, /\{detail\.redaction_note\}/);
});
