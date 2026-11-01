#!/usr/bin/env node
/*
 * Re-apply named migrations whose ledger row exists but whose effects do not.
 *
 * WHY --redo IS NOT ENOUGH. --redo re-applies files whose CHECKSUM has
 * changed since they were applied. The problem this solves is different:
 * the checksum matches perfectly and the file still never ran, because an
 * earlier ledger backfill inserted rows for work it did not perform. The
 * runner is right to skip them; nothing about the file is wrong.
 *
 * scripts/audit-migration-effects.mjs is what finds them. As of
 * 2026-11-01 it reported 0044, 0049, 0058 and 0063 — all stamped
 * 2026-10-28, all with absent effects.
 *
 *   PRODUCTION_DATABASE_URL=... node scripts/reapply-migrations.mjs \
 *     0049_refund_ledger_identity.sql 0058_crew_on_acceptance.sql
 *
 * Add --dry-run to see what would run and nothing else.
 *
 * Each file runs in its own transaction and applied_at is refreshed. The
 * checksum is left alone, since the file has not changed. These
 * migrations are written idempotently — create or replace, if not
 * exists, drop ... if exists — so re-running one that DID apply is a
 * no-op rather than a hazard. Run the audit again afterwards; this
 * script reports what it executed, not what it achieved.
 */
import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import { createHash } from "node:crypto";

const DIR = "supabase/migrations";
const PRODUCTION_REF = "xhmgmegraieouudyjjlv";
const DRY = process.argv.includes("--dry-run");
const names = process.argv.slice(2).filter((a) => !a.startsWith("--"));

const url = process.env.PRODUCTION_DATABASE_URL;
if (!url) { console.error("Set PRODUCTION_DATABASE_URL."); process.exit(1); }
if (!url.includes(PRODUCTION_REF)) {
  console.error(`REFUSING: PRODUCTION_DATABASE_URL is not ${PRODUCTION_REF}.`);
  process.exit(1);
}
if (!names.length) {
  console.error("Name the migration files to re-apply, exactly as they appear in");
  console.error(`${DIR}. Nothing is selected implicitly — this is a repair tool.`);
  process.exit(1);
}
for (const n of names) {
  if (!fs.existsSync(path.join(DIR, n))) { console.error(`No such migration: ${n}`); process.exit(1); }
}

const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false },
                           statement_timeout: 600_000 });
await db.connect();

console.log(`\n  ${url.replace(/:[^:@/]+@/, ":****@")}`);
console.log(`  ${DRY ? "DRY RUN — nothing will be written" : "re-applying"} ${names.length} migration(s)\n`);

let failed = 0;
for (const name of names) {
  const sql = fs.readFileSync(path.join(DIR, name), "utf8");
  const { rows } = await db.query(
    `select applied_at from schema_migrations where filename = $1`, [name]);
  const stamp = rows[0]?.applied_at?.toISOString?.().slice(0, 10) ?? "not in ledger";
  process.stdout.write(`  ${name.padEnd(44)} ledger ${stamp}  `);
  if (DRY) { console.log("would run"); continue; }

  const t0 = Date.now();
  try {
    await db.query("begin");
    await db.query(sql);
    await db.query(
      `insert into schema_migrations (filename, sha256, applied_at, duration_ms)
       values ($1, $2, now(), $3)
       on conflict (filename) do update set applied_at = now(), duration_ms = $3`,
      [name, createHash("sha256").update(sql).digest("hex"), Date.now() - t0]);
    await db.query("commit");
    console.log(`ok  ${Date.now() - t0}ms`);
  } catch (e) {
    await db.query("rollback");
    console.log(`FAILED  ${e.message}`);
    failed++;
  }
}

await db.end();
console.log(`\n  ${failed ? `${failed} failed. ` : ""}Now re-run:`);
console.log("    node scripts/audit-migration-effects.mjs\n");
process.exit(failed ? 1 : 0);
