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
import {
  refFromPostgresUri, assertProductionTarget, TargetError,
} from "./lib/target.mjs";

const DIR = path.resolve("supabase/migrations");

// Deploy-coupled migrations are read from each file's own header:
//
//   -- CLASS: deploy-coupled      (or: pre-deploy safe)
//
// It used to be this hardcoded list of filename prefixes:
//
//   const DEPLOY_COUPLED = ["0036", "0038"];
//
// which meant a new migration could declare "CLASS: deploy-coupled" in its
// header, be believed by every human who read it, and still be applied by
// --pre-deploy against code that could not cope with it. The header is now
// the only source of truth, and a file that declares neither is rejected
// rather than quietly defaulted.
const CLASS_RE = /^\s*--\s*CLASS:\s*(deploy-coupled|pre-deploy)/im;

function classify(file) {
  const head = fs.readFileSync(path.join(DIR, file), "utf8").slice(0, 4000);
  const m = CLASS_RE.exec(head);
  if (m) return m[1] === "deploy-coupled";
  return false;
}

function loadEnv() {
  // Skipped entirely for a production run — see the target selection
  // below. Loading .env.rehearsal and then migrating "production" is how
  // you migrate the wrong database and are told it worked.
  if (process.argv.includes("--production")) return;
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

/*
 * WHICH DATABASE.
 *
 * REHEARSAL_DATABASE_URL takes precedence over DATABASE_URL, and loadEnv
 * reads it out of .env.rehearsal — which is correct and deliberate for
 * every day of development, and a trap on cutover day. Passing
 * PRODUCTION_DATABASE_URL on the command line without this would have
 * been silently ignored: the rehearsal variable wins, the rehearsal
 * database gets migrated, and the run reports success. You would discover
 * it when production took no bookings.
 *
 * So production is an EXPLICIT mode. It needs --production, it reads only
 * PRODUCTION_DATABASE_URL, it never loads a dotenv file, and it prints the
 * host it is about to change so a wrong target is visible before anything
 * runs.
 */
const PROD = has("--production");
const url = PROD
  ? process.env.PRODUCTION_DATABASE_URL
  : (process.env.REHEARSAL_DATABASE_URL || process.env.DATABASE_URL);

if (!url) {
  if (PROD) {
    console.error("--production requires PRODUCTION_DATABASE_URL in the environment.");
    console.error("It is read from the environment only — never from .env.rehearsal or .env.local.");
  } else {
    console.error("Missing DATABASE_URL (or REHEARSAL_DATABASE_URL).");
    console.error("Supabase dashboard -> Project Settings -> Database -> Connection string (URI).");
  }
  process.exit(1);
}

if (PROD) {
  /*
   * The identity check lives in scripts/lib/target.mjs and is shared with
   * preflight and the boundary loader.
   *
   * My first version of this compared the target against
   * REHEARSAL_DATABASE_URL — which --production deliberately does NOT
   * load, so in the mode that matters the comparison had nothing to
   * compare against and silently passed. An audit pointed --production at
   * the rehearsal URI with that variable unexported and reached the
   * connection attempt.
   *
   * Now the expected project is DECLARED (HELPWARD_PRODUCTION_REF) and
   * the rehearsal ref is read from the .env.rehearsal FILE, so it is
   * known whether or not anything was exported. A target is correct
   * because it matches what you declared.
   */
  const { ref, host, port } = refFromPostgresUri(url);

  if (!ref) {
    console.error("\n  REFUSING: could not read a project ref from PRODUCTION_DATABASE_URL.");
    console.error("  Expected a Supabase session-pooler URI whose user is postgres.<ref>.\n");
    process.exit(1);
  }
  if (port !== "5432") {
    console.error(`\n  REFUSING: port is ${port}, not 5432 (${host}).`);
    console.error("  Session mode is required; transaction mode cannot `set local role`,");
    console.error("  which these migrations and the SQL suites both use.\n");
    process.exit(1);
  }

  try {
    const report = assertProductionTarget([{ label: "SQL connection", ref }]);
    console.log(`\n  PRODUCTION target (declared ${report.expected})`);
    for (const line of report.verified) console.log(`    ${line}`);
    console.log(`    host: ${host}`);
    console.log("  No dotenv file was loaded.\n");
  } catch (err) {
    if (!(err instanceof TargetError)) throw err;
    console.error(`\n  ${err.message}\n`);
    process.exit(1);
  }
}

const files = fs.readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();
const isCoupled = (f) => classify(f);

// A migration that declares no class and is not one of the two
// pre-convention files is a mistake, not a default.
{
  const undeclared = files.filter(
    (f) => !CLASS_RE.test(fs.readFileSync(path.join(DIR, f), "utf8").slice(0, 4000)),
  );
  if (undeclared.length) {
    console.error("\nThese migrations declare no `-- CLASS:` header:\n");
    for (const f of undeclared) console.error(`  ${f}`);
    console.error("\nAdd `-- CLASS: pre-deploy` or `-- CLASS: deploy-coupled`.\n");
    process.exit(1);
  }
}

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

/*
 * The ledger is created only when we are actually going to write to it.
 *
 * This used to run unconditionally, so `--status` and `--dry-run` issued
 * a CREATE TABLE while printing "Nothing written" — a read-only command
 * that performed DDL, and on a fresh database one that left a table
 * behind after a run that claimed to change nothing.
 *
 * An absent ledger simply means nothing has been applied yet, which is
 * exactly what a fresh database should report.
 */
// READ_ONLY is no longer needed to gate the ledger — ensureLedger() is
// called immediately before the first write instead — but is kept for
// clarity in the status/plan path below.
const READ_ONLY = DRY || has("--status") || !selectFiles();

async function readLedger() {
  try {
    const { rows } = await client.query(
      "select filename, sha256 from schema_migrations order by filename",
    );
    return new Map(rows.map((r) => [r.filename, r.sha256]));
  } catch (err) {
    // 42P01 = undefined_table. Anything else is a real problem.
    if (err?.code === "42P01") return new Map();
    throw err;
  }
}

/*
 * Creating the ledger is deferred until every check has passed.
 *
 * It used to run here, before the ledger was read and before the drift
 * check — so an ordinary `--production --pre-deploy` against a database
 * with edited history issued a CREATE TABLE and only then refused. An
 * audit captured exactly that: one DDL statement before the exit.
 *
 * Nothing is read from the ledger that requires it to exist, so the
 * order is simply wrong: read, check, THEN create.
 */
const appliedMap = await readLedger();

async function ensureLedger() {
  await client.query(`
    create table if not exists schema_migrations (
      filename    text primary key,
      sha256      text not null,
      applied_at  timestamptz not null default now(),
      duration_ms int
    )
  `);
}

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
// --redo re-applies files whose contents changed since they were applied.
// Every migration here is written to be idempotent (create or replace,
// add column if not exists), so this is safe and is how a corrected
// function reaches an environment that already has the old one.
const REDO = has("--redo");
const changed = (f) => {
  const was = appliedMap.get(f);
  return was != null && was !== hash(fs.readFileSync(path.join(DIR, f), "utf8"));
};
/*
 * Drift is a refusal, not a skip.
 *
 * An applied migration whose file has since been edited means the
 * database does not match the file that built it. Without --redo those
 * files quietly landed in `skipped`, the run exited 0, and the operator
 * was told "N to apply, M already applied" with no hint that M included
 * history that no longer matches. docs/CUTOVER.md claimed the runner
 * refused drift; it did not, so the document was describing a guard that
 * was not there.
 *
 * Checked across EVERY migration, not just the selected subset: drift in
 * a pre-deploy file is just as wrong when you are applying the
 * deploy-coupled ones.
 */
{
  const drifted = files.filter((f) => changed(f));
  if (drifted.length > 0 && !REDO) {
    console.error(`\n  REFUSING: ${drifted.length} applied migration(s) have been edited`);
    console.error("  since they ran, so this database does not match the files that\n  built it:\n");
    for (const f of drifted) console.error(`    ${f}`);
    console.error("\n  Correct a mistake with a NEW migration. Editing applied history");
    console.error("  means two environments can share a version number and differ.");
    console.error("\n  --redo re-applies them instead (every migration here is written");
    console.error("  to be idempotent), but that is a deliberate choice, not a default.\n");
    await client.end();
    process.exit(1);
  }
}

const todo = selectFiles().filter((f) => !appliedMap.has(f) || (REDO && changed(f)));
const skipped = selectFiles().filter((f) => !todo.includes(f));

console.log(`\n${url.replace(/:[^:@/]+@/, ":****@")}`);
console.log(`${todo.length} to apply, ${skipped.length} already applied.${DRY ? "  DRY RUN." : ""}\n`);

if (has("--deploy-coupled")) {
  console.log("  NOTE: these are NOT backward compatible. The new application");
  console.log("        must already be deployed before they land.\n");
}

// Every safety check above has passed and we are about to write.
//
// `!DRY` matters and I left it out: moving the ledger creation here fixed
// the drift-ordering bug and reintroduced the DDL on a dry run with
// PENDING migrations. It stayed hidden because the rehearsal database has
// everything applied, so `todo` is empty there and the call never fires —
// the regression was invisible in exactly the environment used to test
// it. A missing-ledger fixture exposed it immediately.
if (!DRY && todo.length > 0) await ensureLedger();

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
      `insert into schema_migrations (filename, sha256, duration_ms)
         values ($1,$2,$3)
       on conflict (filename) do update
         set sha256 = excluded.sha256,
             applied_at = now(),
             duration_ms = excluded.duration_ms`,
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
