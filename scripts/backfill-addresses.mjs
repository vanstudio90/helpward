#!/usr/bin/env node
/*
 * Legacy address remediation.
 *
 * WHY: MAPBOX_TOKEN was never set in production, so every address insert
 * fell back to a hardcoded "downtown Vancouver" point. 53 of 57 rows in
 * `addresses` carry that exact coordinate, including addresses in Montreal,
 * Brooklyn and Chicago. All 13 `saved_addresses` rows have NULL coordinates.
 * Those rows must never qualify an address for dispatch.
 *
 * WHAT THIS DOES: re-geocodes every unverified row and classifies it.
 *   verified          -> real coords + a municipality inside a launch area
 *   out_of_area       -> geocoded fine, but we do not serve there
 *   needs_reconfirm   -> ambiguous, low confidence, or no municipality
 *   failed            -> Mapbox error / no match; safe to retry later
 *
 * Only `verified` rows get geocode_verified = true. Everything else is left
 * unverified and flagged, so the owning customer has to reconfirm before the
 * address can be used. Nothing is deleted.
 *
 * RESUMABLE: rows already carrying geocoded_at are skipped unless --redo.
 * Progress is appended to a JSONL ledger after every row, so an interrupted
 * run resumes exactly where it stopped and every decision is inspectable.
 *
 * USAGE
 *   node scripts/backfill-addresses.mjs --dry-run            # classify only
 *   node scripts/backfill-addresses.mjs --limit 25           # small batch
 *   node scripts/backfill-addresses.mjs --apply              # write changes
 *   node scripts/backfill-addresses.mjs --apply --redo       # re-run done rows
 *   node scripts/backfill-addresses.mjs --report             # read the ledger
 *
 * Requires in the environment (or .env.local):
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, MAPBOX_TOKEN
 */

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";

const LEDGER = process.env.BACKFILL_LEDGER ?? "backfill-addresses.jsonl";
const PLACEHOLDER = { lng: -123.1207, lat: 49.2827 };

import {
  classify, resolveArea, normalizeMunicipality, SERVICE_AREAS,
} from "./lib/geocode-classify.mjs";

// ---------------------------------------------------------------------------
// env + args
// ---------------------------------------------------------------------------
function loadEnvLocal() {
  // .env.rehearsal first, so the isolated project always wins over
  // production whenever both files exist on this machine.
  for (const name of [".env.rehearsal", ".env.local"]) {
    const f = path.resolve(name);
    if (!fs.existsSync(f)) continue;
    for (const line of fs.readFileSync(f, "utf8").split("\n")) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
      if (!m) continue;
      const key = m[1];
      // Trailing newlines and quotes in sibling env files have caused fake
      // 403s before; strip both.
      const val = m[2].trim().replace(/^["']|["']$/g, "");
      if (!(key in process.env)) process.env[key] = val;
    }
  }
}
loadEnvLocal();

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const num = (f, d) => {
  const i = argv.indexOf(f);
  return i >= 0 && argv[i + 1] ? Number(argv[i + 1]) : d;
};

const APPLY = has("--apply");
const DRY = !APPLY || has("--dry-run");
const REDO = has("--redo");
const LIMIT = num("--limit", Infinity);
const REPORT_ONLY = has("--report");

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const MAPBOX_TOKEN = process.env.MAPBOX_TOKEN;

// ---------------------------------------------------------------------------
// ledger
// ---------------------------------------------------------------------------
function appendLedger(entry) {
  fs.appendFileSync(LEDGER, JSON.stringify(entry) + "\n", "utf8");
}

function readLedger() {
  if (!fs.existsSync(LEDGER)) return [];
  return fs.readFileSync(LEDGER, "utf8").split("\n").filter(Boolean).map((l) => {
    try { return JSON.parse(l); } catch { return null; }
  }).filter(Boolean);
}

function report() {
  const rows = readLedger();
  if (rows.length === 0) {
    console.log(`No ledger at ${LEDGER} yet.`);
    return;
  }
  const byOutcome = {};
  const runs = new Set();
  for (const r of rows) {
    byOutcome[r.outcome] = (byOutcome[r.outcome] ?? 0) + 1;
    if (r.runId) runs.add(r.runId);
  }
  console.log(`Ledger: ${LEDGER}`);
  console.log(`Entries: ${rows.length} across ${runs.size} run(s)\n`);
  for (const [k, v] of Object.entries(byOutcome).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(k).padEnd(18)} ${v}`);
  }
  const attention = rows.filter((r) => r.outcome === "needs_reconfirm" || r.outcome === "out_of_area");
  if (attention.length) {
    console.log(`\nRows requiring customer reconfirmation (${attention.length}):`);
    for (const r of attention.slice(0, 40)) {
      console.log(`  [${r.table}] ${r.id}  ${JSON.stringify(r.before?.formatted ?? "")}  -> ${r.outcome}  ${r.note ?? ""}`);
    }
    if (attention.length > 40) console.log(`  ... and ${attention.length - 40} more (read ${LEDGER})`);
  }
}

if (REPORT_ONLY) { report(); process.exit(0); }

for (const [k, v] of Object.entries({ NEXT_PUBLIC_SUPABASE_URL: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY })) {
  if (!v) { console.error(`Missing ${k}`); process.exit(1); }
}
if (!MAPBOX_TOKEN) {
  console.error("Missing MAPBOX_TOKEN — this script cannot verify anything without it.");
  console.error("Provision it in Vercel and locally, then re-run. Nothing was changed.");
  process.exit(1);
}
if ((process.env.MAPBOX_PERMANENT ?? "true").toLowerCase() === "false") {
  console.error("MAPBOX_PERMANENT=false, but this script persists geocodes to the");
  console.error("database and to its ledger. Temporary results may not be stored.");
  console.error("Use a storage-permitted Mapbox configuration. Nothing was changed.");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// supabase REST
// ---------------------------------------------------------------------------
async function sb(pathAndQuery, init = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${pathAndQuery}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      authorization: `Bearer ${SERVICE_KEY}`,
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

// ---------------------------------------------------------------------------
// geocoding
// ---------------------------------------------------------------------------
async function geocode(text) {
  const url = new URL("https://api.mapbox.com/search/geocode/v6/forward");
  url.searchParams.set("q", text);
  url.searchParams.set("country", "us,ca");
  url.searchParams.set("limit", "2");
  url.searchParams.set("access_token", MAPBOX_TOKEN);
  // Results are written to the database AND to the ledger, so this must be
  // a storage-permitted lookup. Temporary geocoding's terms do not allow
  // retaining the result.
  url.searchParams.set("permanent", "true");

  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) return { error: `mapbox ${res.status}` };
  const body = await res.json();
  const features = body?.features ?? [];
  if (features.length === 0) return { error: "no_match" };

  const f = features[0];
  const ctx = f.properties?.context ?? {};
  const coords = f.geometry?.coordinates;
  if (!Array.isArray(coords) || coords.length !== 2) return { error: "no_geometry" };

  return {
    formatted: f.properties?.full_address ?? f.properties?.name ?? text,
    lng: coords[0],
    lat: coords[1],
    country: (ctx.country?.country_code_alpha_2 ?? ctx.country?.country_code ?? "").toUpperCase(),
    region: ctx.region?.name ?? null,
    place: ctx.place?.name ?? null,
    postal: ctx.postcode?.name ?? null,
    // Only address-type features carry match_code, which is why
    // feature_type has to be read too.
    featureType: f.properties?.feature_type ?? null,
    confidence: (f.properties?.match_code?.confidence ?? "").toLowerCase() || null,
    addressNumberMatch: f.properties?.match_code?.address_number ?? null,
    // More than one candidate means the query was ambiguous.
    candidateCount: features.length,
    hasRivalCandidate:
      features[1]?.properties?.feature_type === "address" &&
      ["exact", "high"].includes(
        (features[1]?.properties?.match_code?.confidence ?? "").toLowerCase()),
    secondChoice: features[1]?.properties?.full_address ?? null,
  };
}

// ---------------------------------------------------------------------------
// run
// ---------------------------------------------------------------------------
const RUN_ID = `run-${new Date().toISOString().replace(/[:.]/g, "-")}`;

function wkt(lng, lat) { return `POINT(${lng} ${lat})`; }

function isPlaceholderHex(hex) {
  if (typeof hex !== "string" || hex.length < 50) return false;
  try {
    const buf = Buffer.from(hex, "hex");
    const lng = buf.readDoubleLE(9);
    const lat = buf.readDoubleLE(17);
    return Math.abs(lng - PLACEHOLDER.lng) < 1e-6 && Math.abs(lat - PLACEHOLDER.lat) < 1e-6;
  } catch { return false; }
}

async function processTable(table) {
  const select = table === "addresses"
    ? "id,formatted,location,geocode_verified,geocoded_at"
    : "id,formatted,lat,lng,geocode_verified,geocoded_at";

  let query = `${table}?select=${select}&geocode_verified=is.false&order=id`;
  if (!REDO) query += "&geocoded_at=is.null";

  const rows = await sb(query);
  const todo = rows.slice(0, Number.isFinite(LIMIT) ? LIMIT : rows.length);

  console.log(`\n${table}: ${rows.length} unverified${REDO ? "" : " and not yet attempted"}, processing ${todo.length}`);

  const tally = {};
  for (const [i, row] of todo.entries()) {
    const g = await geocode(row.formatted);
    const { outcome, note } = classify(g);
    tally[outcome] = (tally[outcome] ?? 0) + 1;

    const wasPlaceholder = table === "addresses" ? isPlaceholderHex(row.location) : row.lat == null;

    const entry = {
      runId: RUN_ID,
      at: new Date().toISOString(),
      table,
      id: row.id,
      outcome,
      note,
      wasPlaceholder,
      before: { formatted: row.formatted },
      after: g.error ? null : {
        formatted: g.formatted, lat: g.lat, lng: g.lng,
        place: g.place, region: g.region, country: g.country,
      },
      applied: false,
    };

    if (!DRY) {
      const patch = {
        geocoded_at: new Date().toISOString(),
        geocode_note: `${outcome}: ${note}`,
        geocode_verified: outcome === "verified",
        needs_reconfirmation: outcome !== "verified",
      };
      // Only write coordinates when we accepted the result. A rejected row
      // keeps whatever it had and simply stays undispatchable.
      if (outcome === "verified") {
        if (table === "addresses") {
          patch.location = wkt(g.lng, g.lat);
          patch.formatted = g.formatted;
          patch.city = g.place;
          patch.region = g.region;
          patch.country = g.country;
          patch.postal_code = g.postal;
        } else {
          patch.lat = g.lat;
          patch.lng = g.lng;
          patch.formatted = g.formatted;
          patch.city = g.place;
          patch.region = g.region;
          patch.country = g.country;
        }
      }
      await sb(`${table}?id=eq.${row.id}`, {
        method: "PATCH",
        headers: { prefer: "return=minimal" },
        body: JSON.stringify(patch),
      });
      entry.applied = true;
    }

    // Append per row, so Ctrl-C loses at most the row in flight.
    appendLedger(entry);
    process.stdout.write(`\r  ${i + 1}/${todo.length}  ${outcome.padEnd(16)}`);
    // Courtesy pacing for the Mapbox temporary-geocoding rate limit.
    await new Promise((r) => setTimeout(r, 120));
  }
  process.stdout.write("\n");
  for (const [k, v] of Object.entries(tally)) console.log(`  ${k.padEnd(18)} ${v}`);
  return tally;
}

console.log(DRY
  ? "DRY RUN — classifying only, no writes. Re-run with --apply to persist."
  : "APPLYING changes.");
console.log(`Run id: ${RUN_ID}\nLedger: ${LEDGER}`);

await processTable("addresses");
await processTable("saved_addresses");

console.log(`\nDone. Inspect with:  node scripts/backfill-addresses.mjs --report`);
if (DRY) console.log("Nothing was written.");
