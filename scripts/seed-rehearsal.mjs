#!/usr/bin/env node
/*
 * Seed the ISOLATED rehearsal database with the accounts every later phase
 * needs: one customer, and one fully eligible helper per launch region.
 *
 * REFUSES TO RUN against production. The guard is on the project ref, not
 * on a flag someone can forget.
 *
 * "Eligible" is five separate things, and missing any one makes a helper
 * silently invisible to matching:
 *     approved status · rows in provider_services · a service radius
 *     a current_location · location_updated_at inside max_location_age()
 *
 * Production today has 30 helper profiles and zero that satisfy all five,
 * which is why matching has never produced a match.
 *
 * USAGE
 *   node scripts/seed-rehearsal.mjs            # create
 *   node scripts/seed-rehearsal.mjs --report   # show what exists
 */

import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const PRODUCTION_REF = "xhmgmegraieouudyjjlv";

function loadEnv() {
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
loadEnv();

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DB = process.env.REHEARSAL_DATABASE_URL || process.env.DATABASE_URL;
if (!URL_ || !KEY || !DB) {
  console.error("Need NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and REHEARSAL_DATABASE_URL.");
  process.exit(1);
}
if (URL_.includes(PRODUCTION_REF) || DB.includes(PRODUCTION_REF)) {
  console.error(`\nREFUSING TO RUN: this points at production (${PRODUCTION_REF}).`);
  console.error("This script creates accounts and approves helpers. Point it at the");
  console.error("rehearsal project.\n");
  process.exit(1);
}

const REGIONS = [
  { key: "vancouver",   label: "Vancouver, BC",   lng: -123.1207, lat: 49.2827 },
  { key: "los-angeles", label: "Los Angeles, CA", lng: -118.2437, lat: 34.0522 },
  { key: "san-diego",   label: "San Diego, CA",   lng: -117.1611, lat: 32.7157 },
];

const PASSWORD = "RehearsalOnly!2026";

const H = { apikey: KEY, authorization: `Bearer ${KEY}`, "content-type": "application/json" };

async function createUser(email, fullName, role) {
  const res = await fetch(`${URL_}/auth/v1/admin/users`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({
      email,
      password: PASSWORD,
      email_confirm: true,
      // handle_new_user() reads these to build profiles + the role-specific
      // row, so the role MUST be set here rather than patched afterwards.
      user_metadata: { role, full_name: fullName },
    }),
  });
  const body = await res.json();
  if (!res.ok) {
    if (/already been registered|already exists/i.test(body.msg || body.message || "")) {
      const list = await fetch(
        `${URL_}/auth/v1/admin/users?page=1&per_page=200`, { headers: H },
      ).then((r) => r.json());
      const found = (list.users || []).find((u) => u.email === email);
      if (found) return { id: found.id, existed: true };
    }
    throw new Error(`${email}: ${body.msg || body.message || JSON.stringify(body)}`);
  }
  return { id: body.id, existed: false };
}

const client = new pg.Client({ connectionString: DB, ssl: { rejectUnauthorized: false } });
await client.connect();

if (process.argv.includes("--report")) {
  const { rows } = await client.query(`
    select p.id, p.role, p.full_name,
           pp.status, pp.is_online, pp.service_radius_km,
           pp.location_updated_at is not null as has_loc_stamp,
           pp.current_location is not null    as has_loc,
           (select count(*) from provider_services s where s.provider_id = p.id) as services
    from profiles p
    left join provider_profiles pp on pp.user_id = p.id
    order by p.role, p.full_name
  `);
  console.log(`\n${rows.length} profile(s)\n`);
  for (const r of rows) {
    const extra = r.role === "provider"
      ? `  ${r.status} · ${r.is_online ? "online" : "offline"} · ${r.services} services · ${r.service_radius_km}km · loc ${r.has_loc ? "yes" : "NO"} · stamp ${r.has_loc_stamp ? "yes" : "NO"}`
      : "";
    console.log(`  ${r.role.padEnd(9)} ${String(r.full_name).padEnd(26)}${extra}`);
  }
  console.log("");
  await client.end();
  process.exit(0);
}

console.log(`\nSeeding ${URL_}\n`);

// ---- customer -------------------------------------------------------------
const customer = await createUser("qa-customer@helpward.test", "QA Customer", "customer");
console.log(`  customer   qa-customer@helpward.test   ${customer.existed ? "already existed" : "created"}`);

// ---- one eligible helper per region ---------------------------------------
const { rows: services } = await client.query("select id from services where active order by id");

for (const r of REGIONS) {
  const email = `qa-helper-${r.key}@helpward.test`;
  const helper = await createUser(email, `QA Helper ${r.label}`, "provider");

  // Everything matching requires, in one statement so a helper is never
  // left half-eligible.
  await client.query(
    `update provider_profiles
        set status = 'approved',
            is_online = true,
            vacation_mode = false,
            service_radius_km = 25,
            current_location = st_setsrid(st_makepoint($2, $3), 4326)::geography,
            location_updated_at = now()
      where user_id = $1`,
    [helper.id, r.lng, r.lat],
  );

  await client.query(
    `insert into provider_services (provider_id, service_id)
     select $1, unnest($2::text[])
     on conflict do nothing`,
    [helper.id, services.map((s) => s.id)],
  );

  console.log(`  helper     ${email.padEnd(38)} ${helper.existed ? "existed" : "created"} · approved · online · ${services.length} services · 25km · ${r.label}`);
}

// ---- prove eligibility rather than assuming it ----------------------------
console.log("\nEligibility check — find_nearby_providers per region:\n");
let allGood = true;
for (const r of REGIONS) {
  const { rows } = await client.query(
    `select provider_id, distance_km
       from find_nearby_providers($1, st_setsrid(st_makepoint($2,$3),4326)::geography, 20, 5)`,
    [services[0].id, r.lng, r.lat],
  );
  const ok = rows.length > 0;
  if (!ok) allGood = false;
  console.log(`  ${r.label.padEnd(18)} ${ok ? `${rows.length} eligible helper(s)` : "NO ELIGIBLE HELPER"}`);
}

await client.end();
console.log(`\nAll accounts share the password: ${PASSWORD}\n`);
if (!allGood) {
  console.log("At least one region has no eligible helper. Matching cannot work there.\n");
  process.exit(1);
}
