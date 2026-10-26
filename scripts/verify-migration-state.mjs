#!/usr/bin/env node
/*
 * Schema + behaviour probe for the migration rehearsal (ROLLBACK.md).
 *
 * Read-only. Reports what is applied, whether boundaries are loaded, and
 * whether dispatch is currently being refused — the three things the
 * rehearsal checklist needs to distinguish.
 *
 * USAGE
 *   node scripts/verify-migration-state.mjs
 *   SUPABASE_URL=... SERVICE_KEY=... node scripts/verify-migration-state.mjs
 *
 * Point it at the ISOLATED environment during rehearsal. It never writes.
 */

import fs from "node:fs";
import path from "node:path";

function loadEnvLocal() {
  // .env.rehearsal first so the isolated project wins over production
  // whenever both exist on this machine.
  for (const name of [".env.rehearsal", ".env.local"]) {
  const f = path.resolve(name);
  if (!fs.existsSync(f)) continue;
  for (const line of fs.readFileSync(f, "utf8").split("\n")) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (m && !(m[1] in process.env)) {
      process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  }
  }
}
loadEnvLocal();

const URL_ = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SERVICE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !KEY) {
  console.error("Need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const H = { apikey: KEY, authorization: `Bearer ${KEY}`, "content-type": "application/json" };

async function colExists(table, col) {
  const r = await fetch(`${URL_}/rest/v1/${table}?select=${col}&limit=1`, { headers: H });
  return r.status === 200;
}
async function rpcExists(fn, body) {
  const r = await fetch(`${URL_}/rest/v1/rpc/${fn}`, {
    method: "POST", headers: H, body: JSON.stringify(body ?? {}),
  });
  // 404 = missing function. Anything else means it resolved (even a 400 on
  // argument types tells us it is there).
  return { present: r.status !== 404, status: r.status, body: await r.text() };
}
async function rows(q) {
  const r = await fetch(`${URL_}/rest/v1/${q}`, { headers: H });
  return r.status === 200 ? r.json() : null;
}

const line = (label, ok, note = "") =>
  console.log(`  ${ok ? "yes" : " NO"}  ${label}${note ? `  — ${note}` : ""}`);

console.log(`\nTarget: ${URL_}\n`);

console.log("MIGRATIONS (by schema signature)");
const checks = [
  ["0029 addresses.geocode_verified",          () => colExists("addresses", "geocode_verified")],
  ["0029 addresses.needs_reconfirmation",      () => colExists("addresses", "needs_reconfirmation")],
  ["0029 saved_addresses.geocode_verified",    () => colExists("saved_addresses", "geocode_verified")],
  ["0030 provider_profiles.location_updated_at", () => colExists("provider_profiles", "location_updated_at")],
  ["0033 service_area_datasets",               () => colExists("service_area_datasets", "source_version")],
  ["0033 service_area_boundaries",             () => colExists("service_area_boundaries", "municipality")],
  ["0034 dispatch_refusals",                   () => colExists("dispatch_refusals", "reason")],
];
for (const [label, fn] of checks) line(label, await fn());

console.log("\nFUNCTIONS");
for (const [label, fn, args] of [
  ["0030 max_location_age()", "max_location_age", {}],
  ["0033 is_point_serviceable(geography)", "is_point_serviceable", { p_point: "POINT(-123.1207 49.2827)" }],
  ["0034 dispatch_health(interval)", "dispatch_health", { p_since: "01:00:00" }],
]) {
  const r = await rpcExists(fn, args);
  line(label, r.present, r.present ? `http ${r.status}` : "not found");
}

console.log("\nBOUNDARY DATASETS");
const ds = await rows("service_area_datasets?select=id,area_id,source_name,source_version,source_retrieved_at,feature_count,is_active&order=area_id");
if (!ds) {
  line("service_area_datasets readable", false, "table missing — apply 0033");
} else if (ds.length === 0) {
  line("any dataset loaded", false, "none — is_point_serviceable() returns 'no_dataset' and NOTHING is dispatchable (fail-closed, by design)");
} else {
  for (const d of ds) {
    console.log(`  ${d.is_active ? "ACTIVE  " : "inactive"} ${d.area_id.padEnd(20)} ${d.source_name} v${d.source_version} (${d.feature_count} features, retrieved ${String(d.source_retrieved_at).slice(0, 10)})`);
  }
  const areas = new Set(ds.filter((d) => d.is_active).map((d) => d.area_id));
  for (const a of ["lower-mainland-bc", "san-diego-ca"]) {
    line(`active boundaries for ${a}`, areas.has(a));
  }
}

console.log("\nBOUNDARY PROBE (is_point_serviceable)");
const probes = [
  ["downtown Vancouver (legacy placeholder point)", "POINT(-123.1207 49.2827)"],
  ["downtown San Diego",                            "POINT(-117.1611 32.7157)"],
  ["Abbotsford BC (outside launch area)",           "POINT(-122.3045 49.0504)"],
];
for (const [label, wkt] of probes) {
  const r = await fetch(`${URL_}/rest/v1/rpc/is_point_serviceable`, {
    method: "POST", headers: H, body: JSON.stringify({ p_point: wkt }),
  });
  const raw = (await r.text()).replace(/"/g, "");
  const v = r.status === 404 || raw.includes("PGRST202")
    ? "fn-missing"
    : raw.slice(0, 20);
  console.log(`  ${String(v).padEnd(18)} ${label}`);
}

console.log("\nDISPATCH HEALTH (last 24h)");
const dh = await fetch(`${URL_}/rest/v1/rpc/dispatch_health`, {
  method: "POST", headers: H, body: JSON.stringify({ p_since: "24:00:00" }),
});
if (dh.status === 404) {
  console.log("  dispatch_health() not present — apply 0034");
} else {
  const data = await dh.json().catch(() => null);
  if (!Array.isArray(data) || data.length === 0) {
    console.log("  no refusals recorded");
  } else {
    for (const r of data) {
      const flag = r.is_configuration_fault ? "CONFIG FAULT" : "supply";
      console.log(`  ${flag.padEnd(13)} ${String(r.reason).padEnd(22)} ${r.occurrences} occurrence(s), ${r.distinct_requests} request(s), last ${r.last_seen}`);
    }
    if (data.some((r) => r.is_configuration_fault)) {
      console.log("\n  ** A configuration fault is in effect. If the application was just");
      console.log("     rolled back, this is the expected and intended signal: see");
      console.log("     supabase/rollback/ROLLBACK.md. Recover by rolling FORWARD. **");
    }
  }
}

console.log("\nADDRESS REMEDIATION");
const unver = await rows("addresses?select=id&geocode_verified=is.false&limit=1000");
const recon = await rows("addresses?select=id&needs_reconfirmation=is.true&limit=1000");
if (unver) {
  line("addresses still unverified", unver.length === 0, `${unver.length} row(s) — these cannot be dispatched`);
  line("addresses needing customer reconfirmation", (recon?.length ?? 0) === 0, `${recon?.length ?? 0} row(s)`);
}

console.log("");
