#!/usr/bin/env node
/*
 * Put the paused services back.
 *
 * The other half of migration 0087. That one recorded what
 * `services.active` was for EVERY service before the app-launch scope
 * cut; this reads `service_scope_restore` and sets each row back to
 * exactly that — not to "true for everything", which would quietly
 * re-enable a service that had been paused for its own reasons.
 *
 * A script rather than a migration because the timing is a business
 * decision — the day the app is approved — not a deploy step.
 *
 * USAGE
 *   node scripts/restore-service-scope.mjs --dry-run
 *   node scripts/restore-service-scope.mjs
 *
 * After running it, rebuild the site so the sitemap and the
 * city × service pages are generated again.
 */

import fs from "node:fs";
import pg from "pg";

const DRY = process.argv.includes("--dry-run");

const env = Object.fromEntries(fs.readFileSync(".env.rehearsal", "utf8").split("\n")
  .map((l) => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean)
  .map((m) => [m[1], m[2].replace(/^["']|["']$/g, "").trim()]));
const url = process.env.DATABASE_URL || env.REHEARSAL_DATABASE_URL || env.DATABASE_URL;
if (!url) {
  console.error("No database URL. Set DATABASE_URL, or run from a repo with .env.rehearsal.");
  process.exit(1);
}

const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();

const { rows } = await c.query(`
  select r.service_id, r.was_active, s.active as now_active, s.title
    from service_scope_restore r
    join services s on s.id = r.service_id
   where s.active is distinct from r.was_active
   order by s.title`);

if (!rows.length) {
  console.log("Nothing to restore — every service already matches its recorded state.");
  await c.end();
  process.exit(0);
}

console.log(`${rows.length} service(s) to restore:`);
for (const r of rows) {
  console.log(`  ${r.title.padEnd(26)} ${r.now_active} -> ${r.was_active}`);
}

if (DRY) {
  console.log("\nDry run — nothing written.");
  await c.end();
  process.exit(0);
}

try {
  await c.query("begin");
  const result = await c.query(`
    update services s
       set active = r.was_active
      from service_scope_restore r
     where r.service_id = s.id
       and s.active is distinct from r.was_active`);
  await c.query("commit");
  console.log(`\n${result.rowCount} restored. Rebuild the site so the sitemap and city pages return.`);
} catch (e) {
  await c.query("rollback");
  console.error("rolled back:", e.message);
  process.exitCode = 1;
} finally {
  await c.end();
}
