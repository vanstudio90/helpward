#!/usr/bin/env node
/*
 * Migration runner for the rehearsal and, later, the production cutover.
 *
 * There is no supabase CLI on this machine, and PostgREST cannot execute
 * DDL, so migrations go over a direct Postgres connection.
 *
 * WHY A RUNNER AND NOT "paste it all into the SQL editor": the order is
 * load-bearing. Two migrations are deliberately NOT backward compatible and
 * must land AFTER the application deploys; everything else must land
 * before. This enforces that split instead of relying on someone
 * remembering it at 2am.
 *
 *   PRE-DEPLOY   0001-0035, 0037   additive; the old release keeps working
 *   DEPLOY-COUPLED   0036, 0038    restrictive; they reject what old code writes
 *
 * Applied migrations are recorded in schema_migrations, so a re-run is a
 * no-op and an interrupted run resumes where it stopped.
 *
 * USAGE
 *   node scripts/migrate.mjs --status
 *   node scripts/migrate.mjs --pre-deploy            # everything safe before the deploy
 *   node scripts/migrate.mjs --deploy-coupled        # 0036 and 0038, after the deploy
 *   node scripts/migrate.mjs --only 0033             # one file
 *   node scripts/migrate.mjs --pre-deploy --dry-run  # list without applying
 *
 * Requires DATABASE_URL (or REHEARSAL_DATABASE_URL) in the environment or
 * in .env.rehearsal / .env.local.
 */

import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const DIR = path.resolve("supabase/migrations");

// Deploy-coupled by filename prefix. Everything else is pre-deploy safe.
const DEPLOY_COUPLED = ["0036", "0038"];

function loadEnv() {
  for (const f of [".env.rehearsal", ".env.local"]) {
    const p = path.resolve(f);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf8").split("\n")) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
      if (m && !(m[1] in process.env)) {
        process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
      }
    }
  }
}
loadEnv();

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };

const DRY = has("--dry-run");
const url = process.env.REHEARSAL_DATABASE_URL || process.env.DATABASE_URL;

if (!url) {
  console.error("Missing DATABASE_URL (or REHEARSAL_DATABASE_URL).");
  console.error("Supabase dashboard -> Project Settings -> Database -> Connection string (URI).");
  process.exit(1);
}

const files = fs.readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();
const isCoupled = (f) => DEPLOY_COUPLED.some((p) => f.startsWith(p));

function selectFiles() {
  if (val("--only")) {
    const pick = files.filter((f) => f.startsWith(val("--only")));
    if (!pick.length) { console.error(`No migration matching "${val("--only")}"`); process.exit(1); }
    return pick;
  }
  if (has("--deploy-coupled")) return files.filter(isCoupled);
  if (has("--pre-deploy")) return files.filter((f) => !isCoupled(f));
  if (has("--all")) return files;
  return null;
}


async function connectOrExplain(client, url) {
  try {
    await client.connect();
  } catch (e) {
    const shown = url.replace(/:[^:@/]+@/, ":****@");
    console.error(`\nCould not connect to ${shown}\n`);
    const m = e.message || String(e);
    if (/password authentication failed/i.test(m)) {
      console.error("  The password in the connection string is wrong.");
      console.error("  Supabase dashboard -> Project Settings -> Database -> Reset database password,");
      console.error("  then copy the URI connection string again.");
    } else if (/ENOTFOUND|EAI_AGAIN/.test(m)) {
      console.error("  Host not found. Check the project ref in the host name.");
    } else if (/ECONNREFUSED|ETIMEDOUT/.test(m)) {
      console.error("  Nothing answered. If the project was just created it may still be");
      console.error("  provisioning; wait a minute and retry. Also check the port (5432 direct,");
      console.error("  6543 pooler) — migrations need the DIRECT connection, not the pooler,");
      console.error("  because the pooler does not support every DDL statement.");
    } else if (/self.signed|certificate/i.test(m)) {
      console.error("  TLS problem. This script already relaxes certificate verification,");
      console.error("  so check for a proxy intercepting the connection.");
    } else {
      console.error(`  ${m}`);
    }
    console.error("");
    process.exit(1);
  }
}

const client = new pg.Client({
  connectionString: url,
  // Supabase terminates non-TLS connections; its cert chain is not in the
  // node trust store, so verification is relaxed for this admin connection.
  ssl: { rejectUnauthorized: false },
  // A few migrations build GIST indexes over boundary polygons.
  statement_timeout: 600_000,
});

await connectOrExplain(client, url);

await client.query(`
  create table if not exists schema_migrations (
    filename    text primary key,
    sha256      text not null,
    applied_at  timestamptz not null default now(),
    duration_ms int
  )
`);

const { rows: applied } = await client.query(
  "select filename, sha256 from schema_migrations order by filename",
);
const appliedMap = new Map(applied.map((r) => [r.filename, r.sha256]));

const { createHash } = await import("node:crypto");
const hash = (s) => createHash("sha256").update(s).digest("hex");

// ---- status ----------------------------------------------------------------
if (has("--status") || !selectFiles()) {
  console.log(`\n${url.replace(/:[^:@/]+@/, ":****@")}\n`);
  let pre = 0, coupled = 0, done = 0, drift = 0;
  for (const f of files) {
    const body = fs.readFileSync(path.join(DIR, f), "utf8");
    const h = hash(body);
    const was = appliedMap.get(f);
    const state = !was ? "pending" : was === h ? "applied" : "CHANGED SINCE APPLIED";
    if (was) done++;
    if (was && was !== h) drift++;
    isCoupled(f) ? coupled++ : pre++;
    console.log(
      `  ${state === "applied" ? "·" : state === "pending" ? " " : "!"} ` +
      `${f.padEnd(42)} ${isCoupled(f) ? "deploy-coupled" : "pre-deploy    "}  ${state}`,
    );
  }
  console.log(`\n  ${done}/${files.length} applied · ${pre} pre-deploy · ${coupled} deploy-coupled` +
              (drift ? ` · ${drift} CHANGED SINCE APPLIED` : ""));
  if (!has("--status")) {
    console.log("\n  Pick one: --pre-deploy | --deploy-coupled | --only <prefix> | --all\n");
  } else {
    console.log("");
  }
  await client.end();
  process.exit(0);
}

// ---- apply -----------------------------------------------------------------
const todo = selectFiles().filter((f) => !appliedMap.has(f));
const skipped = selectFiles().filter((f) => appliedMap.has(f));

console.log(`\n${url.replace(/:[^:@/]+@/, ":****@")}`);
console.log(`${todo.length} to apply, ${skipped.length} already applied.${DRY ? "  DRY RUN." : ""}\n`);

if (has("--deploy-coupled")) {
  console.log("  NOTE: 0036 and 0038 are NOT backward compatible. The new");
  console.log("        application must already be deployed before these land.\n");
}

let failed = null;
for (const f of todo) {
  const body = fs.readFileSync(path.join(DIR, f), "utf8");
  process.stdout.write(`  ${f.padEnd(42)} `);
  if (DRY) { console.log("would apply"); continue; }

  const t0 = Date.now();
  try {
    // Each migration runs in its own transaction: a failure leaves the
    // database on the last good migration rather than half-way through one.
    await client.query("begin");
    await client.query(body);
    await client.query(
      "insert into schema_migrations (filename, sha256, duration_ms) values ($1,$2,$3)",
      [f, hash(body), Date.now() - t0],
    );
    await client.query("commit");
    console.log(`ok  ${Date.now() - t0}ms`);
  } catch (e) {
    await client.query("rollback").catch(() => {});
    console.log("FAILED");
    console.log(`\n  ${e.message}`);
    if (e.position) {
      const upto = body.slice(0, Number(e.position));
      console.log(`  at line ${upto.split("\n").length}`);
    }
    if (e.hint) console.log(`  hint: ${e.hint}`);
    failed = f;
    break;
  }
}

await client.end();

if (failed) {
  console.log(`\nStopped at ${failed}. Nothing after it was applied; fix and re-run.\n`);
  process.exit(1);
}
console.log(DRY ? "\nNothing written.\n" : "\nDone.\n");
