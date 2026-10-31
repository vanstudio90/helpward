#!/usr/bin/env node
/*
  Cut the public catalogue to the app's launch set, or put it back.

  WHY THIS EXISTS. The iOS first submission ships eight services. A
  reviewer opening the website and finding twenty-six, most of which the
  app cannot book, is looking at an inconsistency that invites questions
  we do not need on a first submission. So the site is cut to match, and
  the rest come back once the app is approved.

  NOTHING IS DELETED. This flips `services.active`. Every row, pricing
  rule, completion requirement, intake spec, page copy, preparation list
  and photograph stays exactly where it is. Restoring is this same
  script with `restore`.

    node scripts/service-scope.mjs status
    node scripts/service-scope.mjs cut --apply
    node scripts/service-scope.mjs restore <service-id> [<service-id>…] --apply

  Without --apply it prints what it would do and changes nothing.

  RESTORE IS DELIBERATELY ONE SERVICE AT A TIME. There is no "put
  everything back" button, because approval is not the same as
  readiness: each service needs its own check that it still works end to
  end, that its public copy is accurate, and that nothing about it
  raises an App Store question — the call services, for instance, are
  withheld for a guideline reason that approval of this build does not
  resolve. A single sweeping restore would quietly undo that reasoning.

  While a submission is in review, do not restore anything. The scope
  Apple is looking at is the scope that should be live.

  The launch set is duplicated from the iOS app's AppStorePolicy.swift
  on purpose: this repo cannot import Swift, and a wrong list here is
  worse than a duplicated one. If you change it there, change it here.
*/

import { readFileSync } from "node:fs";

const LAUNCH = new Set([
  "maid-service",
  "wait-in-line",
  "errand-runner",
  "furniture-assembly",
  "grocery-pickup",
  "package-delivery",
  "package-return",
  "moving-help",
]);

/* professional-cuddler was already inactive before this cut, by an
   earlier owner decision. `restore` must not switch it on. */
const KEEP_INACTIVE = new Set(["professional-cuddler"]);

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    }),
);

const URL_BASE = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_BASE || !KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}
const headers = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  "Content-Type": "application/json",
  Prefer: "return=representation",
};

async function allServices() {
  const r = await fetch(`${URL_BASE}/rest/v1/services?select=id,title,active&order=id`, { headers });
  if (!r.ok) throw new Error(`read failed: ${r.status} ${await r.text()}`);
  return r.json();
}

async function setActive(id, active) {
  const r = await fetch(`${URL_BASE}/rest/v1/services?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ active }),
  });
  if (!r.ok) throw new Error(`${id}: ${r.status} ${await r.text()}`);
  const [row] = await r.json();
  if (!row || row.active !== active) throw new Error(`${id}: write did not take`);
  return row;
}

const mode = process.argv[2];
const apply = process.argv.includes("--apply");
const rows = await allServices();

if (mode === "status" || !mode) {
  const active = rows.filter((r) => r.active).map((r) => r.id);
  console.log(`services: ${rows.length}  active: ${active.length}`);
  console.log(`launch set all active: ${[...LAUNCH].every((id) => active.includes(id))}`);
  console.log(`active outside the launch set: ${active.filter((id) => !LAUNCH.has(id)).length}`);
  for (const r of rows) {
    const tag = r.active ? "ON " : "off";
    const set = LAUNCH.has(r.id) ? "launch" : KEEP_INACTIVE.has(r.id) ? "held" : "later";
    console.log(`  ${tag}  ${set.padEnd(6)}  ${r.id}`);
  }
  process.exit(0);
}

let targets;
if (mode === "cut") {
  targets = rows.filter((r) => r.active && !LAUNCH.has(r.id)).map((r) => [r.id, false]);
} else if (mode === "restore") {
  const asked = process.argv.slice(3).filter((a) => !a.startsWith("--"));
  if (asked.length === 0) {
    const off = rows.filter((r) => !r.active && !KEEP_INACTIVE.has(r.id)).map((r) => r.id);
    console.error("Name the service(s) to restore. There is no restore-everything.\n");
    console.error("Before restoring one, confirm:");
    console.error("  1. it works end to end in the app and on the site");
    console.error("  2. its public copy is accurate and its photograph shows the service");
    console.error("  3. no App Store guideline blocks it (the call services are held for");
    console.error("     a 3.1.1 reason that approving this build does not resolve)");
    console.error("  4. no submission is currently in review\n");
    console.error(`currently withdrawn:\n  ${off.join("\n  ")}`);
    process.exit(1);
  }
  const known = new Set(rows.map((r) => r.id));
  const unknown = asked.filter((id) => !known.has(id));
  if (unknown.length) {
    console.error(`unknown service id(s): ${unknown.join(", ")}`);
    process.exit(1);
  }
  const blocked = asked.filter((id) => KEEP_INACTIVE.has(id));
  if (blocked.length) {
    console.error(`refusing: ${blocked.join(", ")} is held inactive by an earlier decision`);
    process.exit(1);
  }
  const already = asked.filter((id) => rows.find((r) => r.id === id)?.active);
  if (already.length) console.log(`already active, skipping: ${already.join(", ")}`);
  targets = asked.filter((id) => !already.includes(id)).map((id) => [id, true]);
} else {
  console.error("usage: service-scope.mjs status | cut --apply | restore <id…> --apply");
  process.exit(1);
}

if (targets.length === 0) {
  console.log(`nothing to do — already ${mode === "cut" ? "cut" : "restored"}`);
  process.exit(0);
}
console.log(`${mode}: ${targets.length} service(s)`);
for (const [id] of targets) console.log(`   ${id}`);
if (!apply) {
  console.log("\ndry run — pass --apply to write");
  process.exit(0);
}
for (const [id, active] of targets) {
  await setActive(id, active);
  console.log(`   ${active ? "restored" : "withdrew"} ${id}`);
}
const after = (await allServices()).filter((r) => r.active).length;
console.log(`\ndone — ${after} services now active`);
console.log("Deploy to republish the static pages: vercel --prod --force");
