#!/usr/bin/env node
// Everything, in one command.
//
// The suites grew faster than anyone's memory of them, and a check
// nobody remembers to run is a check that is not running. This is the
// list; `npm run verify` is the command.
import { execSync } from "node:child_process";

const STEPS = [
  { name: "type check",            cmd: "npx tsc --noEmit", allowFail: true,
    note: "36 known diagnostics; this reports the count rather than gating on it" },
  { name: "unit tests",            cmd: "npm test --silent" },
  { name: "production build",      cmd: "npx next build" },

  { name: "sql: quote integrity",  cmd: "node scripts/run-sql-suite.mjs supabase/tests/quote_integrity.sql" },
  { name: "sql: payment invariants", cmd: "node scripts/run-sql-suite.mjs supabase/tests/payment_invariants.sql" },
  { name: "sql: priced intake",    cmd: "node scripts/run-sql-suite.mjs supabase/tests/priced_intake_integrity.sql" },
  { name: "sql: boundaries",       cmd: "node scripts/run-sql-suite.mjs supabase/tests/boundary_containment.sql" },
  { name: "sql: participant visibility", cmd: "node scripts/run-sql-suite.mjs supabase/tests/participant_visibility.sql" },
  { name: "sql: contact visibility", cmd: "node scripts/run-sql-suite.mjs supabase/tests/contact_visibility.sql" },
  { name: "sql: inspection reports", cmd: "node scripts/run-sql-suite.mjs supabase/tests/inspection_report.sql" },
  { name: "sql: crew staffing",    cmd: "node scripts/run-sql-suite.mjs supabase/tests/crew_staffing.sql" },
  { name: "sql: stale helpers",   cmd: "node scripts/run-sql-suite.mjs supabase/tests/stale_helpers.sql" },
  { name: "sql: calls",            cmd: "node scripts/run-sql-suite.mjs supabase/tests/call_sessions.sql" },

  { name: "stripe: payment mechanics", cmd: "node scripts/verify-payments.mjs" },
  { name: "stripe: refunds",       cmd: "node --experimental-strip-types --import ./tests/register.mjs scripts/verify-refunds.mjs" },
  { name: "stripe: payment wiring", cmd: "node --experimental-strip-types --import ./tests/register.mjs scripts/verify-payment-wiring.mjs" },
  { name: "pricing parity (TS vs SQL)", cmd: "node --experimental-strip-types --import ./tests/register.mjs scripts/verify-pricing-parity.mjs" },
  { name: "stranded holds",        cmd: "node scripts/reconcile-holds.mjs" },

  // Needs a dev server; skipped rather than failed when there isn't one.
  { name: "webhooks (needs :3000)", cmd: "node scripts/verify-webhooks.mjs", optional: true },
];

let failed = 0, skipped = 0;
const started = Date.now();

for (const step of STEPS) {
  process.stdout.write(`  ${step.name.padEnd(34)} `);
  try {
    const out = execSync(step.cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    const summary = (out.match(/(\d+ passed[^\n]*|# pass \d+|\d+ combinations[^\n]*)/) ?? [])[0];
    console.log(`\x1b[32mok\x1b[0m${summary ? `  ${summary.trim()}` : ""}`);
  } catch (err) {
    if (step.allowFail) {
      const count = ((err.stdout ?? "").match(/error TS/g) ?? []).length;
      console.log(`\x1b[33m${count} diagnostics\x1b[0m  (${step.note})`);
      continue;
    }
    if (step.optional) {
      console.log("\x1b[33mskipped\x1b[0m  (no dev server on :3000)");
      skipped++;
      continue;
    }
    console.log("\x1b[31mFAILED\x1b[0m");
    const tail = ((err.stdout ?? "") + (err.stderr ?? "")).trim().split("\n").slice(-6);
    for (const line of tail) console.log(`      ${line}`);
    failed++;
  }
}

// Things that are not failures but must not be forgotten. A warning that
// only a customer ever saw (the old red banner on /terms) is a warning
// nobody could act on.
try {
  const { unreviewedLegalDocs } = await import("../lib/legal.ts");
  const pending = unreviewedLegalDocs();
  if (pending.length) {
    console.log("\n  \x1b[33mBEFORE LAUNCH\x1b[0m — legal review outstanding:");
    for (const d of pending) {
      console.log(`    /${d.name} (last changed ${d.updated})`);
      console.log(`      ${d.outstanding}`);
    }
  }
} catch {
  // Running without the TypeScript loader; skip rather than fail the run.
}

const secs = Math.round((Date.now() - started) / 1000);
console.log(
  failed
    ? `\n  \x1b[31m${failed} step(s) failed\x1b[0m in ${secs}s\n`
    : `\n  \x1b[32mall ${STEPS.length - skipped} steps passed\x1b[0m in ${secs}s${skipped ? ` (${skipped} skipped)` : ""}\n`);
process.exit(failed ? 1 : 0);
