#!/usr/bin/env node
/*
 * Run a .sql test suite against the rehearsal database.
 *
 * The suites are written for psql and use a few meta-commands psql
 * understands but a driver does not (\set ON_ERROR_STOP, \i). Those are
 * stripped here; their effect is reproduced instead:
 *
 *   \set ON_ERROR_STOP on   the driver aborts on the first error anyway
 *   begin; ... rollback;    preserved exactly — these suites must not commit
 *
 * RAISE NOTICE output is what the suites report with, so it is captured and
 * printed. A failing assertion surfaces as an error with its message.
 *
 * USAGE
 *   node scripts/run-sql-suite.mjs supabase/tests/quote_integrity.sql
 *   node scripts/run-sql-suite.mjs supabase/tests/boundary_containment.sql
 */

import fs from "node:fs";
import path from "node:path";
import pg from "pg";

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

const file = process.argv[2];
if (!file) { console.error("Usage: node scripts/run-sql-suite.mjs <file.sql>"); process.exit(1); }

const url = process.env.REHEARSAL_DATABASE_URL || process.env.DATABASE_URL;
if (!url) { console.error("Missing DATABASE_URL."); process.exit(1); }

let sql = fs.readFileSync(path.resolve(file), "utf8");
// Strip psql meta-commands; everything they do is reproduced above.
sql = sql.split("\n").filter((l) => !/^\s*\\/.test(l)).join("\n");


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
  ssl: { rejectUnauthorized: false },
  statement_timeout: 300_000,
});

let pass = 0, fail = 0, skip = 0, info = 0;

client.on("notice", (n) => {
  const m = (n.message || "").trim();
  if (!m) return;
  if (m.startsWith("PASS")) { pass++; console.log(`  \x1b[32m${m}\x1b[0m`); }
  else if (m.startsWith("FAIL")) { fail++; console.log(`  \x1b[31m${m}\x1b[0m`); }
  else if (m.startsWith("SKIP")) { skip++; console.log(`  \x1b[33m${m}\x1b[0m`); }
  else if (m.startsWith("REVIEW") || m.startsWith("INFO") || m.startsWith("CONFIRMED")) {
    info++; console.log(`  \x1b[36m${m}\x1b[0m`);
  } else { console.log(`  ${m}`); }
});

await connectOrExplain(client, url);
console.log(`\n${path.basename(file)}  ->  ${url.replace(/:[^:@/]+@/, ":****@")}\n`);

let error = null;
try {
  await client.query(sql);
} catch (e) {
  error = e;
}

// The suites end in `rollback;`. If they aborted before reaching it, make
// sure nothing is left open or committed.
try { await client.query("rollback"); } catch { /* already rolled back */ }
await client.end();

console.log("");
if (error) {
  console.log(`\x1b[31mSUITE ABORTED\x1b[0m`);
  console.log(`  ${error.message}`);
  if (error.where) console.log(`  context: ${String(error.where).split("\n")[0]}`);
  if (error.hint) console.log(`  hint: ${error.hint}`);
  console.log(`\n  ${pass} passed before the abort, ${fail} explicit failures.\n`);
  process.exit(1);
}
console.log(`  \x1b[32m${pass} passed\x1b[0m` +
            (fail ? `, \x1b[31m${fail} failed\x1b[0m` : "") +
            (skip ? `, ${skip} skipped` : "") + "\n");
process.exit(fail ? 1 : 0);
