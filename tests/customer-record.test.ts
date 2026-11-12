import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/*
  THE CUSTOMER RECORD'S PROMISES.

  The console tells its operator three things about this page: contact
  details are masked and revealing them is recorded, a restriction
  actually stops the account booking, and the money shown is per
  currency and per state. Each of those is a sentence on screen, so each
  gets a test — a claim the code stops honouring is worse than one it
  never made.
*/

const migration = readFileSync("supabase/migrations/0101_admin_customers.sql", "utf8");
const page = readFileSync("app/(admin)/admin/users/page.tsx", "utf8");
const panel = readFileSync("components/admin/CustomerPanel.tsx", "utf8");
const exportRoute = readFileSync("app/api/admin/customers/export/route.ts", "utf8");
const data = readFileSync("lib/data/admin-customers.ts", "utf8");

/** The `rows` array the list function returns, where a leak would live. */
const listRows = migration.slice(
  migration.indexOf("'rows', coalesce(("),
  migration.indexOf("revoke execute on function public.admin_customer_list"),
);

test("the customer list carries no contact details at all", () => {
  // Not masked ones either: a list of a thousand people is not the place
  // to decide who may read an address. The panel asks for one person's,
  // with a reason, through a function that records it.
  assert.doesNotMatch(listRows, /'email/, "the list row includes an email field");
  assert.doesNotMatch(listRows, /'phone/, "the list row includes a phone field");
  /*
    And the page cannot render what it never receives — the prose on it
    talks about email, so this looks for a value being read rather than
    the word.
  */
  assert.doesNotMatch(page, /\bemail\w*\s*[:}]|\.email|email_masked/,
    "the list page reads an email value");
  assert.doesNotMatch(page, /\.phone|phone_masked/, "the list page reads a phone value");
});

test("search matches the real email and phone without returning them", () => {
  // Looking somebody up is not a disclosure; reading their details is.
  // The match runs inside the function, against columns it does not emit.
  const search = migration.slice(
    migration.indexOf("and (v_search is null"),
    migration.indexOf("select jsonb_build_object(\n      'as_of'"),
  );
  assert.match(search, /email ilike/);
  assert.match(search, /regexp_replace\(coalesce\(phone, ''\)/);
});

test("revealing contact details needs a reason and is recorded first", () => {
  const reveal = migration.slice(
    migration.indexOf("function public.admin_reveal_customer_contact"),
    migration.indexOf("revoke execute on function public.admin_reveal_customer_contact"),
  );
  assert.match(reveal, /length\(btrim\(coalesce\(p_reason, ''\)\)\) < 8/);
  assert.match(reveal, /errcode = 'HW046'/);
  // The insert sits above the return: recorded before it is answered.
  assert.ok(
    reveal.indexOf("insert into audit_log") < reveal.indexOf("return jsonb_build_object('email'"),
    "the reveal answers before it records",
  );
  // The masked values are what the panel renders until somebody asks.
  assert.match(panel, /detail\.contact\.email_masked/);
  assert.match(panel, /revealCustomerContactAction/);
});

test("a restriction is enforced by the database, not drawn by the console", () => {
  assert.match(migration, /create trigger trg_refuse_restricted_customer\s+before insert on public\.requests/);
  assert.match(migration, /errcode = 'HW045'/);
  // Proven in the migration itself, with a positive control: the same
  // insert has to succeed before the restriction and fail after it.
  assert.match(migration, /v_allowed := true/);
  assert.match(migration, /restriction trigger is not enforcing/);
  // And the customer meets a neutral sentence, not our internal reason.
  assert.match(migration, /This account cannot place new requests\. Please contact support\./);
});

test("the reason for a restriction is not readable by the person it is about", () => {
  /*
    `authenticated` holds SELECT on every column of profiles and
    profiles_read lets anybody read their own row, so a reason stored
    there would be one `select *` from the customer it describes — and
    would ride along in their data export. The fact lives on profiles;
    the words live in a table only admins can read.
  */
  assert.match(migration, /alter table public\.profiles drop column if exists restriction_reason;/);
  assert.match(migration, /alter table public\.profiles drop column if exists restricted_by;/);
  assert.match(migration, /create table if not exists public\.customer_restrictions/);
  assert.match(migration, /create policy customer_restrictions_admin on public\.customer_restrictions\s+for all using \(is_admin\(\)\) with check \(is_admin\(\)\)/);
  // Proven in the migration: the customer reads zero rows of their own.
  assert.match(migration, /a customer read % row\(s\) of their own restriction reasons/);
  // And the words are never written to a table the customer can read.
  const write = migration.slice(
    migration.indexOf("function public.admin_set_customer_restriction"),
    migration.indexOf("function public.admin_add_customer_note"),
  );
  const updateStatement = write.slice(
    write.indexOf("update profiles set"),
    write.indexOf(";", write.indexOf("update profiles set")),
  );
  assert.match(updateStatement, /restricted_at/);
  assert.doesNotMatch(updateStatement, /reason/,
    "the reason is being written back onto profiles");
  // It goes to the admin-only table instead.
  assert.match(write, /insert into customer_restrictions \(user_id, reason, set_by\)/);
});

test("captured counts the capture, so a refund cannot unmake it", () => {
  // 0098 learned this the hard way: filtering on payment_status made a
  // day's takings shrink when a refund landed weeks later.
  const money = migration.slice(migration.indexOf("'money', coalesce(("), migration.indexOf("'notes', coalesce(("));
  assert.match(money, /b\.captured_at is not null and b\.payment_status <> 'failed'/);
  assert.match(money, /group by b\.currency/);
  // Refunds are their own number from their own table, never netted.
  assert.match(money, /from refunds r/);
  assert.doesNotMatch(money, /captured_cents\s*-\s*/, "captured and refunded are being netted");
  // And the panel says both of those things out loud.
  assert.match(panel, /never netted/);
  assert.match(panel, /currencies are never added together/);
});

test("the counters count every customer, not the filtered page", () => {
  // A counter that moves when a tab changes under it is a counter nobody
  // can act on. Both blocks read `base`, which is before the tab and the
  // filters are applied.
  const counts = migration.slice(migration.indexOf("'counts', ("), migration.indexOf("'regions', coalesce(("));
  assert.match(counts, /\) from base\s*\n\s*\),/);
  assert.doesNotMatch(counts, /from tabbed/);
});

test("the export carries no contact details and is recorded before it is served", () => {
  assert.doesNotMatch(exportRoute, /"Email"|"Phone"/);
  assert.match(exportRoute, /admin\.customers_exported/);
  assert.ok(
    exportRoute.indexOf("auditError") < exportRoute.indexOf("content-disposition"),
    "the file is produced before the export is recorded",
  );
  assert.match(exportRoute, /truncated: result\.data\.total > rows\.length/);
});

test("review and test accounts are excluded unless asked for", () => {
  assert.match(migration, /p_include_review or not coalesce\(p\.is_review_account, false\)/);
  assert.match(data, /p_include_review: opts\.includeReview \?\? false/);
  assert.match(page, /Review and test accounts are excluded/);
});
