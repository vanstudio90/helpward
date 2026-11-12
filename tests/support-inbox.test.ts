import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/*
  WHAT THE SUPPORT INBOX PROMISES.

  A support console earns its keep by being believable about two
  things: whether the customer got the message, and how long they have
  been waiting. Both are claims this code makes on screen, so both are
  tested here — along with the quieter promise that an internal note
  stays internal.
*/

const migration = readFileSync("supabase/migrations/0102_support_inbox.sql", "utf8");
const controls = readFileSync("supabase/migrations/0103_support_inbox_controls.sql", "utf8");
const actions = readFileSync("app/(admin)/admin/inbox/actions.ts", "utf8");
const thread = readFileSync("components/admin/CaseThread.tsx", "utf8");
const page = readFileSync("app/(admin)/admin/inbox/page.tsx", "utf8");
const webhook = readFileSync("app/api/webhooks/email-inbound/route.ts", "utf8");

test("an outbound message is never born sent", () => {
  // The column defaults to 'recorded' and admin_support_reply does not
  // set it, so the only way to 'sent' is through the function that is
  // called after the provider has actually taken it.
  assert.match(migration, /delivery_status\s+text not null default 'recorded'/);
  const reply = migration
    .slice(
      migration.indexOf("function public.admin_support_reply"),
      migration.indexOf("function public.admin_support_mark_delivery"),
    )
    // The comment above the insert explains the rule; the code must not
    // break it, so only the code is examined.
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/--[^\n]*/g, "");
  assert.doesNotMatch(reply, /delivery_status/, "the reply function sets a delivery state itself");
  assert.match(actions, /admin_support_mark_delivery/);
  // And the thread renders the server's column rather than a local guess.
  assert.match(thread, /DELIVERY_LABEL\[m\.delivery_status\]/);
});

test("a send that did not happen is reported as not sent", () => {
  // Three ways it can fail, three honest answers — none of them ok: true.
  assert.match(actions, /if \(!isEmailEnabled\(\)\)/);
  assert.match(actions, /await mark\("not_configured"/);
  assert.match(actions, /await mark\("failed", null, result\.error\)/);
  const notSent = actions.match(/NOT sent/g) ?? [];
  assert.ok(notSent.length >= 2, "the failure paths do not say the message was not sent");
  // Resend's skip (no API key) must not be mistaken for a success: the
  // library returns { ok: true, skipped: true } in that case.
  assert.ok(
    actions.indexOf("isEmailEnabled") < actions.indexOf("sendEmail({"),
    "the key is checked after the send, so a skip would read as sent",
  );
});

test("a failed send keeps the operator's words", () => {
  // The draft is cleared only on success. Retyping a reply because the
  // mail key was missing is how people stop using a console.
  const send = thread.slice(thread.indexOf("const send = () =>"), thread.indexOf("const overdue"));
  assert.match(send, /if \(result\.ok\) \{[\s\S]*?setBody\(""\)/);
  assert.doesNotMatch(send.replace(/if \(result\.ok\)[\s\S]*/, ""), /setBody\(""\)/);
});

test("the reply clock is kept by the database, not by a screen", () => {
  assert.match(migration, /create trigger trg_support_message_rolls_case\s+after insert on public\.support_messages/);
  const fn = migration.slice(
    migration.indexOf("function public.support_message_rolls_case"),
    migration.indexOf("drop trigger if exists trg_support_message_rolls_case"),
  );
  // Inbound starts it, outbound clears it, a resolved case reopens.
  assert.match(fn, /due_at\s+= new\.created_at \+ interval '4 hours'/);
  assert.match(fn, /due_at\s+= null/);
  assert.match(fn, /status\s+= 'open'/);
  // Proven in the migration rather than asserted in prose.
  assert.match(migration, /an inbound message did not start the clock/);
  assert.match(migration, /a reply did not stop the clock/);
  // And every screen that shows the clock says what it means.
  assert.match(page, /REPLY_TARGET_HOURS/);
  assert.match(thread, /from their last message/);
});

test("an internal note stays internal", () => {
  assert.match(migration, /create policy support_messages_own on public\.support_messages\s+for select using \(\s*kind <> 'note'/);
  // The migration counts what the customer can actually see.
  assert.match(migration, /the customer saw % of their thread; expected the 2 messages and not the note/);
});

test("the customer can read and answer an in-app case", () => {
  // Otherwise "in-app" is a notification with no conversation behind it.
  assert.match(migration, /function public\.support_customer_reply/);
  assert.match(migration, /create policy support_cases_own on public\.support_cases/);
  const bell = readFileSync("components/NotificationBell.tsx", "utf8");
  assert.match(bell, /case "support_reply":/);
  assert.match(bell, /`\/support\/\$\{caseId\}`/);
  const customerPage = readFileSync("app/(app)/support/[id]/page.tsx", "utf8");
  assert.match(customerPage, /SupportReplyBox/);
  // The reply the console sends carries the words, not just a label.
  assert.match(actions, /preview: body\.slice\(0, 160\)/);
});

test("an alert is a count of rows that exist", () => {
  const alerts = migration.slice(
    migration.indexOf("function public.admin_operational_alerts"),
    migration.indexOf("revoke execute on function public.admin_operational_alerts"),
  );
  // Every branch is guarded, so a check with nothing in it is not drawn.
  const branches = (alerts.match(/\bhaving\b/g) ?? []).length;
  assert.ok(branches >= 9, `only ${branches} alert branches suppress their zero state`);
  assert.doesNotMatch(alerts, /avg\(|round\(|score/i, "an alert is being averaged or scored");
  assert.match(page, /Nothing here is predicted, scored\s*\n?\s*or averaged/);
});

test("inbound email is shut until somebody configures it", () => {
  assert.match(webhook, /if \(!secret\) \{/);
  assert.match(webhook, /inbound_not_configured/);
  assert.match(webhook, /timingSafeEqual/);
  // And the console does not pretend inbound is wired up.
  assert.match(page, /inbound is not connected yet/);
});

test("review and test activity is excluded unless asked for", () => {
  assert.match(migration, /p_include_review or not coalesce\(p\.is_review_account, false\)/);
  assert.match(page, /Review & test activity excluded/);
});


/* ---- 0103: the controls a shared inbox needs ------------------------- */

test("\"Reply due\" appears only when somebody configured a target", () => {
  /*
    0102 hardcoded four hours, so every case was measured against a
    promise nobody had made and "3 overdue" was a number the console
    had invented about itself. The target is now a setting with no
    default.
  */
  assert.match(controls, /function public\.support_reply_target_minutes/);
  const trigger = controls.slice(
    controls.indexOf("function public.support_message_rolls_case"),
    controls.indexOf("-- 4. Unread, per staff member"),
  );
  assert.match(trigger, /v_target int := support_reply_target_minutes\(\)/);
  assert.match(trigger, /case when v_target is null then null/);
  // The list refuses to report a stale deadline either.
  assert.match(controls, /case when v_target is null then null else c\.due_at end as effective_due_at/);
  assert.match(controls, /a stale deadline was reported as overdue with no target configured/);
  // And both screens gate the words on the setting.
  assert.match(thread, /detail\.reply_target_minutes !== null && detail\.due_at/);
  assert.match(page, /data\.reply_target_minutes !== null \?/);
  const strip = readFileSync("components/admin/ReplyTargetStrip.tsx", "utf8");
  assert.match(strip, /No response target is configured/);
});

test("a snooze cannot hide somebody who is waiting", () => {
  const trigger = controls.slice(
    controls.indexOf("function public.support_message_rolls_case"),
    controls.indexOf("-- 4. Unread, per staff member"),
  );
  // An inbound message clears the snooze in the same statement that
  // reopens the case — not in a job that might not run.
  assert.match(trigger, /snoozed_until\s+= null/);
  assert.match(controls, /a customer wrote in and the case stayed snoozed/);
});

test("unread is per staff member, not per inbox", () => {
  assert.match(controls, /primary key \(case_id, admin_id\)/);
  assert.match(controls, /create policy support_case_reads_own[\s\S]*?admin_id = auth\.uid\(\)/);
  assert.match(controls, /where r\.case_id = c\.id and r\.admin_id = auth\.uid\(\)/);
});

test("attachments sit in a private bucket behind short-lived signed URLs", () => {
  assert.match(controls, /values \('support-attachments', 'support-attachments', false, 10485760\)/);
  // No storage policy grants this bucket to a browser token.
  assert.match(controls, /for select using \(bucket_id <> 'support-attachments'\)/);
  const adminDownload = readFileSync("app/api/admin/support/attachments/[id]/route.ts", "utf8");
  const customerDownload = readFileSync("app/api/support/attachments/[id]/route.ts", "utf8");
  for (const route of [adminDownload, customerDownload]) {
    assert.match(route, /createSignedUrl\(row\.storage_path, 60/);
  }
  // The customer's route reads the row through THEIR client, so RLS
  // decides whether the attachment exists for them.
  assert.match(customerDownload, /const supabase = await createSupabaseServerClient\(\);[\s\S]*?from\("support_attachments"\)/);
  const upload = readFileSync("app/api/admin/support/attachments/route.ts", "utf8");
  assert.match(upload, /requireAdmin/);
  assert.match(upload, /MAX_BYTES/);
});

test("who else is looking is live, and is not written down", () => {
  const presence = readFileSync("components/admin/useCasePresence.ts", "utf8");
  assert.match(presence, /channel\.track/);
  assert.doesNotMatch(presence, /\.from\(|insert|rpc\(/, "presence is being persisted");
  assert.match(thread, /is typing a reply/);
});
