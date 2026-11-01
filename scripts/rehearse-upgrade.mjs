#!/usr/bin/env node
/*
  Rehearse the production cutover on a throwaway database.

  WHY A FRESH DATABASE AND NOT THE EXISTING REHEARSAL ONE. Rehearsal is
  already at 0087. Running the upgrade there proves nothing, because the
  upgrade has already happened: the interesting failures are the ones
  that only occur going FROM production's exact 0080 state. So this
  builds 0080 from scratch, seeds enough data for the 0081-0087 changes
  to have something to act on, and only then runs the upgrade.

    REHEARSAL_DATABASE_URL=postgres://… node scripts/rehearse-upgrade.mjs

  It refuses to touch a database that already has rows in `bookings`, so
  it cannot be pointed at production or at the real rehearsal project by
  accident.
*/
import { execSync } from "node:child_process";
import pg from "pg";

const URL = process.env.REHEARSAL_DATABASE_URL;
const DECLARED = process.env.REHEARSAL_PROJECT_REF;

if (!URL || !DECLARED) {
  console.error("Both are required:");
  console.error("  REHEARSAL_DATABASE_URL  connection string for a THROWAWAY project");
  console.error("  REHEARSAL_PROJECT_REF   that project's ref, declared separately");
  console.error("\nThe ref is declared on purpose: it must be stated, and then proved.");
  console.error("See docs/deploy/rehearsal-environment.md.");
  process.exit(1);
}

/*
  KNOWING WHICH DATABASE THIS IS, BEFORE WRITING TO IT.

  The first version of this guard refused any database holding bookings.
  That protected nothing: production has never had a booking, so it would
  have sailed straight past the one database it most needed to stop at.
  A guard has to assert the target's IDENTITY, not a property the target
  happens to share with every other database here.

  So: the ref is declared in the environment, parsed back out of the
  connection string, and the two must agree — a typo in either is a
  refusal rather than a migration. The known production and rehearsal
  refs are refused outright whatever is declared. The emptiness checks
  stay as a last line, now correctly described as corroboration rather
  than protection.
*/
const FORBIDDEN = new Map([
  ["xhmgmegraieouudyjjlv", "PRODUCTION"],
  ["ximiprtvddqdadbvfyjn", "the existing rehearsal project (already at 0087; must not be downgraded)"],
]);

/** Supabase puts the ref in the host (db.<ref>.supabase.co) or in the pooler username (postgres.<ref>). */
function refFromConnectionString(conn) {
  const host = /@([^/:]+)/.exec(conn)?.[1] ?? "";
  const fromHost = /^db\.([a-z0-9]{20})\.supabase\./.exec(host)?.[1];
  if (fromHost) return fromHost;
  const fromUser = /\/\/postgres\.([a-z0-9]{20})[:@]/.exec(conn)?.[1];
  if (fromUser) return fromUser;
  return null;
}

const parsed = refFromConnectionString(URL);

for (const [ref, what] of FORBIDDEN) {
  if (DECLARED === ref || parsed === ref || URL.includes(ref)) {
    console.error(`REFUSING: this points at ${what}.`);
    console.error("This script builds a schema from scratch. It must only ever");
    console.error("run against a project created for the purpose.");
    process.exit(1);
  }
}

if (parsed && parsed !== DECLARED) {
  console.error(`REFUSING: REHEARSAL_PROJECT_REF is "${DECLARED}" but the connection string`);
  console.error(`names "${parsed}". One of them is wrong, and guessing which is not safe.`);
  process.exit(1);
}
if (!parsed) {
  console.error("Could not read a Supabase project ref from the connection string.");
  console.error("If this is a LOCAL postgres, set REHEARSAL_PROJECT_REF=local and");
  console.error("make sure the host is 127.0.0.1 or localhost.");
  const localish = /@(127\.0\.0\.1|localhost)[:/]/.test(URL);
  if (!(DECLARED === "local" && localish)) process.exit(1);
}

const client = new pg.Client({ connectionString: URL });
await client.connect();

/* ------------------------------------------------- identity, from inside */
/*
  The connection string said which project this is. Now the database
  itself has to agree it is a blank one — a scratch project has no auth
  users and no migration ledger. If either is populated, something is
  being reused and this is not a clean 0080 rehearsal.
*/
const { rows: idRows } = await client.query(
  "select current_database() as db, current_user as usr, inet_server_addr()::text as addr",
);
console.log(`target: db=${idRows[0].db} user=${idRows[0].usr} addr=${idRows[0].addr ?? "local"}`);
console.log(`declared ref: ${DECLARED}`);

const ledger = await client
  .query("select count(*)::int as n from schema_migrations")
  .then((r) => r.rows[0].n)
  .catch(() => 0);
const users = await client
  .query("select count(*)::int as n from auth.users")
  .then((r) => r.rows[0].n)
  .catch(() => 0);

if (ledger > 0 || users > 0) {
  console.error(`REFUSING: this database is not blank — ${ledger} migrations applied, ${users} auth users.`);
  console.error("A rehearsal from 0080 needs a project created for it, not a reused one.");
  process.exit(1);
}

/* ---------------------------------- corroboration, not protection ------- */
const hasBookings = await client
  .query("select to_regclass('public.bookings') is not null as ok")
  .then((r) => r.rows[0].ok)
  .catch(() => false);
if (hasBookings) {
  const { rows } = await client.query("select count(*)::int as n from bookings");
  if (rows[0].n > 0) {
    console.error(`REFUSING: ${rows[0].n} bookings here. This is somebody's real data.`);
    process.exit(1);
  }
}

const run = (args) =>
  execSync(`node scripts/migrate.mjs ${args}`, {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: URL },
  });

const applied = async () => {
  const r = await client
    .query("select filename from schema_migrations order by filename")
    .catch(() => ({ rows: [] }));
  return r.rows.map((x) => x.filename);
};

/* ------------------------------------------------- 1. build through 0080 */
console.log("\n=== 1. building production's state: everything up to 0080 ===");
const all = execSync("ls supabase/migrations/*.sql").toString().trim().split("\n");
const upTo0080 = all.filter((f) => /\/00(?:[0-7]\d|80)_/.test(f));
for (const f of upTo0080) run(`--only ${f.split("/").pop().slice(0, 4)}`);

let now = await applied();
console.log(`applied: ${now.length}, latest ${now[now.length - 1]}`);
if (!now[now.length - 1]?.startsWith("0080")) {
  console.error("Did not land on 0080. Stopping before the upgrade.");
  process.exit(1);
}

/* ------------------------------------------------------ 2. seed fixtures */
console.log("\n=== 2. seeding synthetic fixtures ===");
await client.query(`
  insert into profiles (id, role, full_name)
  values (gen_random_uuid(), 'customer', 'Rehearsal Customer')
  on conflict do nothing;
`).catch((e) => console.log("  (profiles seed skipped:", e.message.slice(0, 60), ")"));
const { rows: svc } = await client.query("select count(*)::int as n from services");
console.log(`  services present from the catalogue migration: ${svc[0].n}`);

/* ------------------------------------------------------- 3. the upgrade */
console.log("\n=== 3. the upgrade under rehearsal: 0081 -> 0089 ===");
for (const n of ["0081", "0082", "0083", "0084", "0085", "0086", "0087", "0088", "0089"]) {
  console.log(`\n--- ${n}`);
  run(`--only ${n}`);
}

now = await applied();
console.log(`\napplied after upgrade: ${now.length}, latest ${now[now.length - 1]}`);

/* ------------------------------------------- 4. the coupled 0085 check */
console.log("\n=== 4. 0085 is deploy-coupled — verify the policy actually changed ===");
const { rows: pol } = await client.query(`
  select polname from pg_policy
   where polrelid = 'public.requests'::regclass and polname = 'req_read'
`);
console.log(`  req_read policy present: ${pol.length === 1}`);
const { rows: offer } = await client.query(
  "select to_regclass('public.offer_summary') is not null as ok",
);
console.log(`  offer_summary exists (the code deployed with 0085 reads it): ${offer[0].ok}`);

/* ------------------------------------------- 5. what 0088 must leave behind */
console.log("\n=== 5. review-account isolation (0088) ===");
const { rows: fnp } = await client.query(`
  select prosrc from pg_proc where proname = 'find_nearby_providers' and pronargs = 5
`);
const src = fnp[0]?.prosrc ?? "";
console.log(`  matching function takes the review parameter: ${fnp.length === 1}`);
console.log(`  municipality filter from 0072 survived:       ${src.includes("provider_cities")}`);
console.log(`  isolation is symmetric:                       ${src.includes("is_review_helper, false) = coalesce(p_review")}`);
const { rows: trg } = await client.query(`
  select count(*)::int as n from pg_trigger
   where tgname in ('profiles_review_flag_guard','helper_review_flag_guard')
`);
console.log(`  self-promotion guards present:                ${trg[0].n === 2}`);

/* --------------------------------------- 6. request privacy, end to end */
console.log("\n=== 6. request privacy (0085) ===");
const { rows: pol2 } = await client.query(`
  select pg_get_expr(polqual, polrelid) as qual
    from pg_policy
   where polrelid = 'public.requests'::regclass and polname = 'req_read'
`);
const qual = pol2[0]?.qual ?? "";
console.log(`  merely-offered helper clause removed: ${!qual.includes("match_attempts")}`);
console.log(`  booked helper can still read:         ${qual.includes("is_booked_helper_for_request")}`);

await client.end();
console.log("\nRehearsal complete. Record the output with the release candidate.");
