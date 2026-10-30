#!/usr/bin/env node
/*
 * Backfill `requests.offer_summary` for requests created before 0084.
 *
 * WHY THIS IS PART OF THE CUTOVER, not a tidy-up. 0085 stops a candidate
 * helper reading the request row, and the inbox starts reading
 * `offer_summary` instead. A request created before 0084 has none — so
 * every offer that is open at the moment of the cutover would render with
 * no work details at all, and a helper would be asked to accept a job
 * with nothing but a service name and an area.
 *
 * It is NOT a security step. The private answers stay in `intake`; what
 * protects them is 0085 refusing to serve the column. This only restores
 * the part a candidate is allowed to see.
 *
 * `describeIntake(..., { forOffer: true })` is the same function the
 * server now calls at creation, so a backfilled row and a new one carry
 * the same shape — and the sensitive answers it withholds are withheld
 * here too.
 *
 * USAGE
 *   node --experimental-strip-types --import ./tests/register.mjs \
 *     scripts/backfill-offer-summary.mjs [--dry-run] [--limit N]
 *
 * Safe to re-run: it only touches rows where offer_summary is null.
 */

import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { describeIntake } from "../lib/service-intake.ts";

const DRY = process.argv.includes("--dry-run");
const limitArg = process.argv.indexOf("--limit");
const LIMIT = limitArg > -1 ? Number(process.argv[limitArg + 1]) : 1000;

function loadEnv() {
  for (const file of [".env.rehearsal", ".env.local"]) {
    const p = path.resolve(file);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf8").split("\n")) {
      const m = line.match(/^([A-Z_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
    }
  }
}
loadEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
console.log(`target: ${url}${DRY ? "  (dry run)" : ""}`);

const db = createClient(url, key, { auth: { persistSession: false } });

const { data: rows, error } = await db
  .from("requests")
  .select("id, service_id, intake")
  .is("offer_summary", null)
  .order("created_at", { ascending: false })
  .limit(LIMIT);

if (error) {
  console.error("could not read requests:", error.message);
  process.exit(1);
}

console.log(`${rows.length} request(s) without an offer summary.`);

let written = 0;
let empty = 0;
for (const row of rows) {
  const summary = describeIntake(row.service_id ?? "", row.intake, { forOffer: true });
  if (!summary.length) {
    // A service with no intake spec, or a request with no answers. Left
    // null rather than written as [] so a later re-run can pick it up if
    // a spec is added.
    empty++;
    continue;
  }
  if (DRY) {
    console.log(`  ${row.id}  ${row.service_id}  ->  ${summary.length} line(s)`);
    written++;
    continue;
  }
  const { error: upErr } = await db
    .from("requests")
    .update({ offer_summary: summary })
    .eq("id", row.id);
  if (upErr) {
    console.error(`  ${row.id}: ${upErr.message}`);
    continue;
  }
  written++;
}

console.log(`${DRY ? "would write" : "wrote"} ${written}; skipped ${empty} with nothing to show.`);
