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
// Approved JURISDICTIONS, not display names.
//
// North Vancouver and Langley are each TWO separate legal municipalities
// (City + District, City + Township). Normalisation strips the status word
// for display and geocoder matching, which collapses 17 jurisdictions to 15
// names — so a completeness check on normalised names passed a file that
// was missing the District of North Vancouver and the Township of Langley
// entirely, silently omitting supported territory.
//
// `match` is matched after normalisation (what the source file is likely to
// say); `requireStatus` additionally demands that the source feature's raw
// name carries that status word, so the two halves of each pair cannot
// satisfy each other.
const APPROVED = {
  "lower-mainland-bc": [
    { id: "bc-vancouver",          match: "Vancouver" },
    { id: "bc-burnaby",            match: "Burnaby" },
    { id: "bc-richmond",           match: "Richmond" },
    { id: "bc-new-westminster",    match: "New Westminster" },
    { id: "bc-surrey",             match: "Surrey" },
    { id: "bc-delta",              match: "Delta" },
    { id: "bc-white-rock",         match: "White Rock" },
    { id: "bc-coquitlam",          match: "Coquitlam" },
    { id: "bc-port-coquitlam",     match: "Port Coquitlam" },
    { id: "bc-port-moody",         match: "Port Moody" },
    { id: "bc-pitt-meadows",       match: "Pitt Meadows" },
    { id: "bc-maple-ridge",        match: "Maple Ridge" },
    { id: "bc-north-vancouver-city",     match: "North Vancouver", requireStatus: "city" },
    { id: "bc-north-vancouver-district", match: "North Vancouver", requireStatus: "district" },
    { id: "bc-west-vancouver",     match: "West Vancouver" },
    { id: "bc-langley-city",       match: "Langley", requireStatus: "city" },
    { id: "bc-langley-township",   match: "Langley", requireStatus: "township" },
  ],
  "los-angeles-ca": [{ id: "ca-los-angeles", match: "Los Angeles" }],
  "san-diego-ca":   [{ id: "ca-san-diego",   match: "San Diego" }],
};

/** Status words present in a raw source name, lowercased. */
function statusWordsIn(raw) {
  const words = String(raw ?? "").toLowerCase().split(/[^a-z]+/).filter(Boolean);
  return new Set(words.filter((w) => STATUS_WORDS.has(w)));
}

const STATUS_WORDS = new Set([
  "city", "district", "township", "municipality", "town", "village",
  "borough", "of", "the", "corporation",
]);
const norm = (v) => String(v ?? "")
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
  .replace(/[^a-z0-9\s]/g, " ").split(/\s+/)
  .filter((w) => w && !STATUS_WORDS.has(w)).join(" ");

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

const jurisdictions = APPROVED[area];
const matched = [];
const satisfied = new Set();   // jurisdiction ids covered by the file

for (const f of gj.features) {
  const srcName = f.properties?.[prop];
  const key = norm(srcName);
  const status = statusWordsIn(srcName);

  // A feature satisfies a jurisdiction when the normalised name matches AND,
  // for paired jurisdictions, the raw name carries the right status word.
  const j = jurisdictions.find((x) =>
    norm(x.match) === key &&
    (!x.requireStatus || status.has(x.requireStatus)));
  if (!j) continue;

  const g = f.geometry;
  if (!g || (g.type !== "Polygon" && g.type !== "MultiPolygon")) {
    console.warn(`  skipping ${srcName}: geometry is ${g?.type ?? "null"}`);
    continue;
  }
  matched.push({ canonical: j.match, jurisdictionId: j.id, srcName: String(srcName), geometry: g });
  satisfied.add(j.id);
}

console.log(`\nFile:        ${file}`);
console.log(`sha256:      ${sha256}`);
console.log(`Name field:  ${prop}`);
console.log(`Features:    ${gj.features.length} in file, ${matched.length} matched for ${area}`);

// Completeness is checked per JURISDICTION id, so City of North Vancouver
// cannot stand in for the District, nor City of Langley for the Township.
const missing = jurisdictions.filter((j) => !satisfied.has(j.id));
if (missing.length) {
  console.error(`\nMISSING jurisdictions (${missing.length} of ${jurisdictions.length}):`);
  for (const j of missing) {
    console.error(`  ${j.id}  — expected a feature named "${j.match}"` +
      (j.requireStatus ? ` carrying the word "${j.requireStatus}"` : ""));
  }
  console.error("Refusing to load an incomplete boundary set.");
  process.exit(1);
}
console.log(`Jurisdictions: ${satisfied.size}/${jurisdictions.length} satisfied`);

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
