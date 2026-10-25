#!/usr/bin/env node
/*
 * Load official municipal boundary polygons into service_area_boundaries.
 *
 * Provenance is mandatory and not inferred: source name, URL, version,
 * licence and the file's own sha256 are all recorded, because "which
 * boundary version did we launch on" must be answerable later.
 *
 * Loads INACTIVE by default. Activation is a separate, explicit step after
 * the probes in docs/BOUNDARY-DATASETS.md pass — so a half-checked dataset
 * can never start gating real bookings.
 *
 * USAGE
 *   node scripts/load-boundaries.mjs --area lower-mainland-bc \
 *     --file ./data/bc-municipalities.geojson \
 *     --source-name "BC Data Catalogue — Legally Defined Administrative Areas" \
 *     --source-url "https://..." --source-version "2026-09" \
 *     --license "Open Government Licence – British Columbia" \
 *     --name-property ADMIN_AREA_NAME --dry-run
 *
 *   # then, once probes pass:
 *   node scripts/load-boundaries.mjs --activate <dataset-id>
 *
 * Input must be GeoJSON (FeatureCollection) in EPSG:4326.
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

// Approved municipalities per area. Mirrors lib/service-areas.ts; the loader
// filters the source file to these and refuses on a mismatch.
const APPROVED = {
  "lower-mainland-bc": [
    "Vancouver", "Burnaby", "Richmond", "New Westminster", "Surrey", "Delta",
    "White Rock", "Coquitlam", "Port Coquitlam", "Port Moody", "Pitt Meadows",
    "Maple Ridge", "North Vancouver", "West Vancouver", "Langley",
  ],
  "los-angeles-ca": ["Los Angeles"],
  "san-diego-ca": ["San Diego"],
};

const STATUS_WORDS = new Set([
  "city", "district", "township", "municipality", "town", "village",
  "borough", "of", "the", "corporation",
]);
const norm = (v) => String(v ?? "")
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
  .replace(/[^a-z0-9\s]/g, " ").split(/\s+/)
  .filter((w) => w && !STATUS_WORDS.has(w)).join(" ");

function loadEnvLocal() {
  const f = path.resolve(".env.local");
  if (!fs.existsSync(f)) return;
  for (const line of fs.readFileSync(f, "utf8").split("\n")) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
}
loadEnvLocal();

const argv = process.argv.slice(2);
const flag = (f) => argv.includes(f);
const val = (f, d = null) => { const i = argv.indexOf(f); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };

const URL_ = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SERVICE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !KEY) { console.error("Need NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY"); process.exit(1); }
const H = { apikey: KEY, authorization: `Bearer ${KEY}`, "content-type": "application/json" };

async function sb(q, init = {}) {
  const r = await fetch(`${URL_}/rest/v1/${q}`, { ...init, headers: { ...H, ...(init.headers ?? {}) } });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.status === 204 ? null : r.json().catch(() => null);
}

// --activate <id>
const activateId = val("--activate");
if (activateId) {
  const ds = await sb(`service_area_datasets?id=eq.${activateId}&select=id,area_id,feature_count`);
  if (!ds?.length) { console.error(`No dataset ${activateId}`); process.exit(1); }
  const { area_id } = ds[0];
  // One active dataset per area — deactivate siblings first so the unique
  // partial index never rejects the swap.
  await sb(`service_area_datasets?area_id=eq.${area_id}&is_active=is.true`, {
    method: "PATCH", headers: { prefer: "return=minimal" }, body: JSON.stringify({ is_active: false }),
  });
  await sb(`service_area_datasets?id=eq.${activateId}`, {
    method: "PATCH", headers: { prefer: "return=minimal" }, body: JSON.stringify({ is_active: true }),
  });
  console.log(`Activated ${activateId} for ${area_id}.`);
  console.log("Re-run scripts/verify-migration-state.mjs and the boundary probes.");
  process.exit(0);
}

const area = val("--area");
const file = val("--file");
const nameProp = val("--name-property");
const DRY = flag("--dry-run");
const required = { "--area": area, "--file": file, "--source-name": val("--source-name"),
  "--source-url": val("--source-url"), "--source-version": val("--source-version"),
  "--license": val("--license") };
for (const [k, v] of Object.entries(required)) {
  if (!v) { console.error(`Missing ${k}`); process.exit(1); }
}
if (!APPROVED[area]) {
  console.error(`Unknown area "${area}". Known: ${Object.keys(APPROVED).join(", ")}`);
  process.exit(1);
}

const raw = fs.readFileSync(file);
const sha256 = crypto.createHash("sha256").update(raw).digest("hex");
const gj = JSON.parse(raw.toString("utf8"));
if (gj.type !== "FeatureCollection" || !Array.isArray(gj.features)) {
  console.error("Expected a GeoJSON FeatureCollection"); process.exit(1);
}

// Find the property holding the municipality name.
function pickNameProp(features) {
  if (nameProp) return nameProp;
  const candidates = ["NAME", "name", "ADMIN_AREA_NAME", "MUNICIPALITY", "CITY", "PLACENAME", "NAMELSAD"];
  const keys = Object.keys(features[0]?.properties ?? {});
  for (const c of candidates) if (keys.includes(c)) return c;
  console.error(`Could not infer the name property. Pass --name-property. Available: ${keys.join(", ")}`);
  process.exit(1);
}
const prop = pickNameProp(gj.features);

const wanted = new Map(APPROVED[area].map((m) => [norm(m), m]));
const matched = [];
const seen = new Map();
for (const f of gj.features) {
  const srcName = f.properties?.[prop];
  const key = norm(srcName);
  if (!wanted.has(key)) continue;
  const g = f.geometry;
  if (!g || (g.type !== "Polygon" && g.type !== "MultiPolygon")) {
    console.warn(`  skipping ${srcName}: geometry is ${g?.type ?? "null"}`);
    continue;
  }
  matched.push({ canonical: wanted.get(key), srcName: String(srcName), geometry: g });
  seen.set(key, (seen.get(key) ?? 0) + 1);
}

console.log(`\nFile:        ${file}`);
console.log(`sha256:      ${sha256}`);
console.log(`Name field:  ${prop}`);
console.log(`Features:    ${gj.features.length} in file, ${matched.length} matched for ${area}`);

// Expect every approved municipality to be present. Both halves of the
// North Vancouver and Langley pairs are separate source features, so a
// canonical name legitimately matching twice is fine — zero matches is not.
const missing = [...wanted.values()].filter((m) => !seen.has(norm(m)));
if (missing.length) {
  console.error(`\nMISSING from the source file: ${missing.join(", ")}`);
  console.error("Refusing to load an incomplete boundary set.");
  process.exit(1);
}
for (const [k, n] of seen) if (n > 1) console.log(`  note: "${wanted.get(k)}" matched ${n} source features (expected for City+District / City+Township pairs)`);

const parts = matched.filter((m) => m.geometry.type === "MultiPolygon");
console.log(`MultiPolygon features: ${parts.length} (city exclaves must survive the load — see docs/BOUNDARY-DATASETS.md)`);

if (DRY) {
  console.log("\nDRY RUN — nothing written. Re-run without --dry-run to load (inactive).");
  process.exit(0);
}

const datasetId = `${area}-${val("--source-version")}-${sha256.slice(0, 8)}`;
await sb("service_area_datasets", {
  method: "POST", headers: { prefer: "resolution=merge-duplicates,return=minimal" },
  body: JSON.stringify({
    id: datasetId, area_id: area,
    source_name: val("--source-name"), source_url: val("--source-url"),
    source_version: val("--source-version"),
    source_retrieved_at: new Date(fs.statSync(file).mtime).toISOString(),
    license: val("--license"), source_sha256: sha256,
    feature_count: matched.length, is_active: false,
    notes: `loaded from ${path.basename(file)}; name property ${prop}`,
  }),
});
await sb(`service_area_boundaries?dataset_id=eq.${datasetId}`, { method: "DELETE", headers: { prefer: "return=minimal" } });

// GeoJSON -> PostGIS via ST_GeomFromGeoJSON, forced to MultiPolygon so a
// single-ring city and a multi-ring one store identically.
for (const m of matched) {
  await sb("rpc/insert_service_area_boundary", {
    method: "POST",
    body: JSON.stringify({
      p_dataset_id: datasetId, p_area_id: area,
      p_municipality: m.canonical, p_geojson: JSON.stringify(m.geometry),
    }),
  });
}

console.log(`\nLoaded ${matched.length} boundaries as dataset ${datasetId} (INACTIVE).`);
console.log("Next: run the probes in docs/BOUNDARY-DATASETS.md and supabase/tests/boundary_containment.sql,");
console.log(`then: node scripts/load-boundaries.mjs --activate ${datasetId}`);
