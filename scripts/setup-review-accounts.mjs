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

/*
  THE DATABASE FIRST, BEFORE A SINGLE ACCOUNT IS CREATED.

  A run with the wrong password got as far as creating all three
  accounts over the auth API — which uses the service key, not this
  connection — and then died on db.connect(). That left three accounts
  in production that nothing had configured and whose generated
  passwords had gone with the process, because they are written at the
  END of a successful run. They had to be deleted by hand.

  Connecting up front costs one round trip and makes the failure happen
  before anything exists to clean up.
*/
const db = new pg.Client({ connectionString: DB, ssl: { rejectUnauthorized: false } });
try {
  await db.connect();
  const { rows } = await db.query("select current_database() as db");
  console.log(`  database reachable (${rows[0].db})`);
} catch (e) {
  console.error("\n  REFUSING: could not connect to PRODUCTION_DATABASE_URL.");
  console.error(`  ${e.message}`);
  console.error("\n  Supabase dashboard -> Project Settings -> Database -> Connection string");
  console.error("  -> Session pooler (port 5432). Paste the URI with the REAL password in it:");
  console.error("  the placeholder <password> is not a password, and nothing was created.\n");
  process.exit(1);
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

console.log(`  customer ${CUSTOMER_EMAIL}  ${customer.created ? "created" : "already existed"}`);
for (const [i, h] of helpers.entries()) {
  console.log(`  helper   ${HELPER_EMAILS[i]}  ${h.created ? "created" : "already existed"}`);
}

/*
  WRITTEN DOWN THE MOMENT THEY EXIST.

  A generated password lives in this process and nowhere else until the
  file is written, and the write used to be the last thing a successful
  run did — so any failure after creation destroyed the only copy and
  left an account nobody could sign into. Saving here means the worst
  case is credentials for an account that still needs configuring,
  which is recoverable; the other way round is not.
*/
saveCredentials(customer, helpers);

/*
  THE AVATAR FILE ITSELF, uploaded before the transaction.

  Storage is a REST API rather than a table, so it cannot take part in
  the transaction below. Uploading first means a failure here stops the
  run before anything is written; an orphaned object in a bucket is the
  cheap end of that trade.

  upsert: true because this script is meant to be re-runnable, and a
  second run must not fail on a file it wrote itself.
*/
const avatarBytes = readFileSync("public/logo-512.png");
const avatarUrls = [];
for (const h of helpers) {
  const path = `${h.id.toLowerCase()}/review-helper.png`;
  const res = await fetch(`${SUPA}/storage/v1/object/avatars/${path}`, {
    method: "POST",
    headers: {
      apikey: KEY,
      authorization: `Bearer ${KEY}`,
      "content-type": "image/png",
      "x-upsert": "true",
    },
    body: avatarBytes,
  });
  if (!res.ok && res.status !== 409) {
    console.error(`  FAILED to upload the review helper's photo: ${res.status} ${await res.text()}`);
    process.exit(1);
  }
  avatarUrls.push(`${SUPA}/storage/v1/object/public/avatars/${path}`);
}

try {
  await db.query("begin");
  // The admin claim the 0088 guard requires. Scoped to this transaction.
  await db.query(`set local request.jwt.claims = '{"role":"admin"}'`);

  await db.query(`update public.profiles set is_review_account = true where id = $1`, [customer.id]);

  /*
    A PHOTO BEFORE AN APPROVAL, because 0095 now requires one.

    require_helper_photo_for_approval refuses the transition into
    'approved' for a helper with no profiles.avatar_url — including for
    the service role, which is the point of it being a trigger. Without
    this the UPDATE below raises HW020 and the whole run rolls back.

    THE IMAGE IS THE HELPWARD MARK, not a face and not a stock
    photograph of a person. These are controlled accounts that exist to
    demonstrate the app; dressing one in a stranger's portrait would be
    inventing a person, and the bio directly underneath says what the
    account actually is. The file is uploaded above, into each account's
    own folder of the avatars bucket, by the same path a real helper's
    photo takes.
  */
  for (const [i, h] of helpers.entries()) {
    await db.query(
      `update public.profiles set avatar_url = $2 where id = $1 and coalesce(avatar_url, '') = ''`,
      [h.id, avatarUrls[i]],
    );
  }

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
    -- 0095 makes this a condition of being approved at all, so it is
    -- read back rather than assumed: an approved helper with no photo
    -- would mean the trigger is not there.
    coalesce((select nullif(btrim(coalesce(p2.avatar_url, '')), '')
                from public.profiles p2 where p2.id = pp.user_id), '(none)') as photo,
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

console.log("\n  Credentials were written when the accounts were created; see above.");

/*
  THE PASSWORDS, WRITTEN DOWN AS SOON AS THEY EXIST.

  Called immediately after the accounts are created rather than at the
  end of a successful run — see the note at the call site. Supabase will
  not read a password back, so a copy that lives only in this process is
  a copy that one exception destroys.
*/
function saveCredentials(customer, helpers) {
  const creds = [];
  if (customer.password) creds.push(`customer\t${CUSTOMER_EMAIL}\t${customer.password}`);
  /*
    EVERY helper, not helpers[0].

    This line read `${HELPER_EMAIL}` — a name that does not exist in this
    file; the constant is HELPER_EMAILS, an array. So the moment a helper
    was newly created the script threw a ReferenceError HERE, after the
    transaction had already committed: the accounts were correct in the
    database and the generated password was gone, unrecoverable, because
    Supabase will not read one back.

    That is exactly what happened to demo-helper-2 on 1 November. The
    credentials file holds one helper line, written by the single-helper
    version of this script, and the run that added the second crashed
    before it could record it.
  */
  for (const [i, h] of helpers.entries()) {
    if (h.password) creds.push(`helper\t${HELPER_EMAILS[i]}\t${h.password}`);
  }
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
}
