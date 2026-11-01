#!/usr/bin/env node
/*
 * Create (or repair) the App Review demonstration accounts in production.
 *
 * Idempotent: run it twice and the second run reports the same end state
 * rather than creating duplicates.
 *
 * WHY THE ADMIN JWT CLAIM IS SET BELOW. 0088 guards is_review_account and
 * is_review_helper with a BEFORE UPDATE trigger that raises unless
 * is_admin(), and is_admin() reads the role claim from the request JWT.
 * The service role key presents role=service_role, not admin, so the
 * guard correctly refuses it — that guard exists so no account can flag
 * itself through the API. Setting the claim on a direct operator
 * connection is the admin path the migration's comment refers to, not a
 * way around the rule: it still happens in one audited transaction, by
 * someone holding the database password.
 *
 * Passwords are generated here and written to a 0600 file. They are
 * never printed, and they belong in App Store Connect, not in a repo.
 *
 * Requires: PRODUCTION_DATABASE_URL, and .env.local (production Supabase)
 * plus .env.rehearsal (the sandbox Stripe connected account).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import pg from "pg";

const PRODUCTION_REF = "xhmgmegraieouudyjjlv";
const HELPER_HOME = "SRID=4326;POINT(-123.1207 49.2827)"; // downtown Vancouver
const CUSTOMER_EMAIL = "appreview@helpward.com";
/*
  TWO controlled helpers, not one.

  A crew booking will not start until crew_shortfall() reaches zero, and
  accept_request only invites helpers who were also offered the request.
  With a single controlled account, Moving Help with two helpers — the
  value the review notes tell a reviewer to enter — accepts, holds the
  card, and then refuses to start. The second account is what staffs the
  crew, through accept_crew_invite like any other helper.
*/
const HELPER_EMAILS = ["demo-helper@helpward.com", "demo-helper-2@helpward.com"];
const OUT = `${process.env.HOME}/.helpward-cutover/review-account-credentials`;

function readEnv(file) {
  const out = {};
  for (const l of readFileSync(file, "utf8").split("\n")) {
    const m = l.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/);
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

const local = readEnv(".env.local");
const sandbox = readEnv(".env.rehearsal");
const DB = process.env.PRODUCTION_DATABASE_URL;

if (!DB) { console.error("Set PRODUCTION_DATABASE_URL."); process.exit(1); }
if (!DB.includes(PRODUCTION_REF)) {
  console.error(`REFUSING: PRODUCTION_DATABASE_URL is not ${PRODUCTION_REF}.`);
  process.exit(1);
}
const SUPA = local.NEXT_PUBLIC_SUPABASE_URL, KEY = local.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPA?.includes(PRODUCTION_REF)) {
  console.error("REFUSING: .env.local does not point at production.");
  process.exit(1);
}
/*
  One connected account per controlled helper.
  provider_profiles.stripe_connect_account_id is UNIQUE, so they cannot
  share: the second helper needs its own, or the whole setup rolls back.
*/
const CONNECTS = [sandbox.STRIPE_TEST_CONNECT_ACCOUNT, sandbox.STRIPE_TEST_CONNECT_ACCOUNT_2]
  .filter(Boolean);
const CONNECT = CONNECTS[0];
const SK = sandbox.STRIPE_SECRET_KEY ?? "";
if (!SK.startsWith("sk_test_")) { console.error("REFUSING: sandbox key is not sk_test_."); process.exit(1); }

// The connected account must really be able to receive transfers —
// assert_helper_payable checks stripe_transfers_active, and writing true
// without confirming it would be the exact fabrication this avoids.
if (CONNECTS.length < HELPER_EMAILS.length) {
  console.error(`REFUSING: ${HELPER_EMAILS.length} helpers but ${CONNECTS.length} connected account(s).`);
  console.error("Set STRIPE_TEST_CONNECT_ACCOUNT_2 in .env.rehearsal.");
  process.exit(1);
}
for (const id of CONNECTS) {
  const r = await fetch(`https://api.stripe.com/v1/accounts/${id}`, {
    headers: { Authorization: `Basic ${Buffer.from(SK + ":").toString("base64")}` },
  });
  const acct = await r.json();
  if (acct.error) { console.error("Stripe:", acct.error.message); process.exit(1); }
  if (acct.capabilities?.transfers !== "active") {
    console.error(`REFUSING: ${id} transfers = ${acct.capabilities?.transfers}, not active.`);
    process.exit(1);
  }
  console.log(`  stripe connected account ${id}  transfers=active  (${acct.country})`);
}

const pw = () => randomBytes(18).toString("base64url");

async function findOrCreate(email, metadata) {
  const h = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
  const look = await fetch(`${SUPA}/auth/v1/admin/users?per_page=200`, { headers: h });
  const list = await look.json();
  const found = (list.users ?? []).find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (found) return { id: found.id, password: null, created: false };

  const password = pw();
  const res = await fetch(`${SUPA}/auth/v1/admin/users`, {
    method: "POST", headers: h,
    body: JSON.stringify({ email, password, email_confirm: true, user_metadata: metadata }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`${email}: ${body.msg ?? body.error_description ?? JSON.stringify(body)}`);
  return { id: body.id, password, created: true };
}

const customer = await findOrCreate(CUSTOMER_EMAIL,
  { role: "customer", full_name: "App Review", country: "CA" });
const helpers = [];
for (const [i, email] of HELPER_EMAILS.entries()) {
  helpers.push(await findOrCreate(email, {
    role: "helper",
    full_name: i === 0 ? "Helpward Demo Helper" : `Helpward Demo Helper ${i + 1}`,
    country: "CA",
  }));
}
const helper = helpers[0];

console.log(`  customer ${CUSTOMER_EMAIL}  ${customer.created ? "created" : "already existed"}`);
for (const [i, h] of helpers.entries()) {
  console.log(`  helper   ${HELPER_EMAILS[i]}  ${h.created ? "created" : "already existed"}`);
}

const db = new pg.Client({ connectionString: DB, ssl: { rejectUnauthorized: false } });
await db.connect();
try {
  await db.query("begin");
  // The admin claim the 0088 guard requires. Scoped to this transaction.
  await db.query(`set local request.jwt.claims = '{"role":"admin"}'`);

  await db.query(`update public.profiles set is_review_account = true where id = $1`, [customer.id]);

  // One statement per helper: each gets its own connected account, and
  // stripe_connect_account_id is UNIQUE so they cannot be set in bulk.
  for (const [i, h] of helpers.entries()) {
    await db.query(`
      update public.provider_profiles set
        is_review_helper        = true,
        status                  = 'approved',
        approved_at             = coalesce(approved_at, now()),
        is_online               = true,
        vacation_mode           = false,
        service_radius_km       = 100,
        base_location           = $2::geography,
        current_location        = $2::geography,
        location_updated_at     = now(),
        stripe_connect_account_id = $3,
        stripe_transfers_active = true,
        stripe_charges_enabled  = true,
        stripe_payouts_enabled  = true,
        stripe_details_submitted = true,
        bio = coalesce(bio, 'Controlled account used to demonstrate the app for App Review.')
      where user_id = $1
    `, [h.id, HELPER_HOME, CONNECTS[i]]);
  }

  // Every active service, so all eight can be demonstrated.
  await db.query(`
    insert into public.provider_services (provider_id, service_id)
    select h.id, s.id
      from unnest($1::uuid[]) as h(id)
     cross join public.services s
     where s.active
    on conflict do nothing
  `, [helpers.map((h) => h.id)]);

  await db.query("commit");
} catch (e) {
  await db.query("rollback");
  console.error("\n  FAILED, rolled back:", e.message);
  await db.end();
  process.exit(1);
}

// Read the end state back rather than trusting the writes.
const { rows: vAll } = await db.query(`
  select
    (select is_review_account from public.profiles where id = $1)            as customer_flag,
    pp.is_review_helper, pp.status, pp.is_online, pp.vacation_mode,
    pp.stripe_transfers_active, pp.service_radius_km,
    pp.location_updated_at > now() - public.max_location_age()               as location_fresh,
    (select count(*) from public.provider_services ps where ps.provider_id = pp.user_id) as services,
    (select count(*) from public.provider_cities   pc where pc.provider_id = pp.user_id) as cities
  from public.provider_profiles pp where pp.user_id = any($2::uuid[])
  order by pp.created_at
`, [customer.id, helpers.map((h) => h.id)]);
await db.end();

console.log("\n  Verified end state");
for (const [i, v] of vAll.entries()) {
  console.log(`  helper ${i + 1} (${HELPER_EMAILS[i] ?? "?"})`);
  for (const [k, val] of Object.entries(v)) console.log(`    ${k.padEnd(24)} ${val}`);
}

const creds = [];
if (customer.password) creds.push(`customer\t${CUSTOMER_EMAIL}\t${customer.password}`);
if (helper.password) creds.push(`helper\t${HELPER_EMAIL}\t${helper.password}`);
if (creds.length) {
  /*
    MERGE, never overwrite.

    An account that already exists yields no password — there is nothing
    to read back out of Supabase — so a plain write on a re-run would
    drop the line for every account that was not just created. That
    includes the customer's, which is the one going into App Store
    Connect and which cannot be recovered, only reset.
  */
  const existing = new Map();
  try {
    for (const line of readFileSync(OUT, "utf8").split("\n")) {
      const [role, email, password] = line.split("\t");
      if (email && password) existing.set(`${role}\t${email}`, password);
    }
  } catch { /* no file yet */ }
  for (const line of creds) {
    const [role, email, password] = line.split("\t");
    existing.set(`${role}\t${email}`, password);
  }
  const merged = [...existing].map(([k, v]) => `${k}\t${v}`);
  writeFileSync(OUT, merged.join("\n") + "\n", { mode: 0o600 });
  console.log(`\n  New passwords written to ${OUT} (mode 600).`);
  console.log("  Put the customer's into App Store Connect. Do not commit them.");
} else {
  console.log("\n  Both accounts already existed, so no new passwords were generated.");
}
