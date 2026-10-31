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
if (!URL) {
  console.error("Set REHEARSAL_DATABASE_URL to a THROWAWAY database.");
  console.error("See docs/deploy/rehearsal-environment.md for how to get one.");
  process.exit(1);
}

const client = new pg.Client({ connectionString: URL });
await client.connect();

/* ---------------------------------------------------------------- guard */
const safe = await client
  .query("select to_regclass('public.bookings') is not null as has_bookings")
  .then((r) => r.rows[0].has_bookings)
  .catch(() => false);
if (safe) {
  const { rows } = await client.query("select count(*)::int as n from bookings");
  if (rows[0].n > 0) {
    console.error(`REFUSING: this database has ${rows[0].n} bookings. Point me at a throwaway.`);
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
console.log("\n=== 3. the upgrade under rehearsal: 0081 -> 0087 ===");
for (const n of ["0081", "0082", "0083", "0084", "0085", "0086", "0087"]) {
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

await client.end();
console.log("\nRehearsal complete. Record the output with the release candidate.");
