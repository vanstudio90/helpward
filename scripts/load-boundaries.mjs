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
import {
  refFromRestUrl, refFromKey, knownNonProductionRefs,
  assertProductionTarget, TargetError,
} from "./lib/target.mjs";
import path from "node:path";
import {
  APPROVED as APPROVED_SHARED, expectedJurisdictionIds,
} from "./lib/jurisdictions.mjs";
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
const APPROVED = APPROVED_SHARED;


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
  // Skipped for --production: reading .env.rehearsal and then loading
  // "production" boundaries is how the wrong project gets changed while
  // the run reports success.
  if (process.argv.includes("--production")) return;
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

const PROD = flag("--production");

const URL_ = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SERVICE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !KEY) { console.error("Need NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY"); process.exit(1); }

/*
 * A URL from one project with a key from another.
 *
 * It is the classic cutover slip, and the symptom is a bare 401 that
 * reads exactly like a revoked key — so the half-hour goes on rotating a
 * key that was fine. A legacy Supabase service key is a JWT carrying the
 * project ref, so when we have one we can say which project the KEY
 * belongs to and compare it to the project in the URL. Newer `sb_secret_`
 * keys are opaque; we say so rather than implying a check happened.
 */
{
  /*
   * The DECLARED project, checked with the same module migrate.mjs and
   * preflight use.
   *
   * This file had its own ad-hoc version of this logic: it rejected
   * rehearsal and rejected a URL/key pair from two different projects,
   * but it never asked whether the project was the one the operator
   * DECLARED. An audit set HELPWARD_PRODUCTION_REF to one project,
   * supplied a self-consistent URL and key for a DIFFERENT one, and the
   * loader went all the way to the activation RPC and reported success.
   *
   * Three near-identical copies of an identity check is how one of them
   * ends up missing a case. There is one now, and it runs before the
   * first HTTP request.
   */
  const urlRef = refFromRestUrl(URL_);
  const keyRef = refFromKey(KEY);

  // Always: a URL from one project with a key from another fails as a
  // bare 401, which reads like a revoked key and sends you rotating a
  // good one.
  if (urlRef && keyRef && urlRef !== keyRef) {
    console.error(`\n  REFUSING: the URL is project ${urlRef} but the service key belongs`);
    console.error(`  to project ${keyRef}. Mismatched pairs fail as a bare 401, which`);
    console.error("  reads like a revoked key and sends you rotating a good one.\n");
    process.exit(1);
  }

  const nonProd = knownNonProductionRefs();

  if (PROD) {
    try {
      const report = assertProductionTarget([
        { label: "Supabase URL", ref: urlRef },
        { label: "service-role key", ref: keyRef },
      ]);
      console.log(`\n  PRODUCTION target (declared ${report.expected})`);
      for (const line of report.verified) console.log(`    ${line}`);
      for (const label of report.unverified) {
        console.log(`    ${label}: opaque (sb_* format), project not verifiable from the value`);
      }
      console.log();
    } catch (err) {
      if (!(err instanceof TargetError)) throw err;
      console.error(`\n  ${err.message}\n`);
      process.exit(1);
    }
  } else if (urlRef && !nonProd.has(urlRef)) {
    // The mirror of the production guard: without --production, refuse a
    // target this machine does NOT know to be rehearsal. Loading
    // boundaries into production by forgetting a flag is the same
    // accident in the other direction.
    console.error(`\n  REFUSING: project ${urlRef} is not a known rehearsal project and`);
    console.error("  --production was not passed. Pass it deliberately, with");
    console.error("  HELPWARD_PRODUCTION_REF set, or point at the rehearsal project.\n");
    process.exit(1);
  }
}
const H = { apikey: KEY, authorization: `Bearer ${KEY}`, "content-type": "application/json" };

/** POST to a Postgres function. Throws with the database's own message. */
async function sbRpc(fn, args) {
  const r = await fetch(`${URL_}/rest/v1/rpc/${fn}`, {
    method: "POST", headers: H, body: JSON.stringify(args),
  });
  const text = await r.text();
  if (!r.ok) {
    let msg = text;
    try { msg = JSON.parse(text).message ?? text; } catch { /* keep raw */ }
    throw new Error(msg);
  }
  return text ? JSON.parse(text) : null;
}

async function sb(q, init = {}) {
  const r = await fetch(`${URL_}/rest/v1/${q}`, { ...init, headers: { ...H, ...(init.headers ?? {}) } });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.status === 204 ? null : r.json().catch(() => null);
}

// --activate <id>
/*
 * --dry-run has to be known HERE.
 *
 * It used to be declared below this block, so during activation it was
 * not an ignored flag — it was not yet a variable. An audit ran
 * `--activate X --dry-run` and counted two PATCH writes under a flag
 * whose entire purpose is to issue none.
 */
const DRY = flag("--dry-run");

const activateId = val("--activate");
if (activateId) {
  if (DRY) {
    // Refused rather than silently ignored. Activation is validated and
    // performed by one database function, so there is no partial form of
    // it to preview; "what would happen" is "the checks in
    // activate_boundary_dataset run, then the swap, or neither".
    console.error("\n  --activate cannot be combined with --dry-run.");
    console.error("  Activation is a single validated transaction: the dataset is checked");
    console.error("  for completeness, geometry validity and required municipalities, and");
    console.error("  swapped in only if all of that passes. Run it without --dry-run, or");
    console.error("  inspect the dataset first with --list.\n");
    process.exit(1);
  }

  const ds = await sb(`service_area_datasets?id=eq.${activateId}&select=id,area_id,feature_count`);
  if (!ds?.length) { console.error(`No dataset ${activateId}`); process.exit(1); }
  const { area_id } = ds[0];

  /*
   * ONE call, not two PATCHes.
   *
   * This used to deactivate the area's current dataset and then activate
   * the new one in two separate HTTP requests. Between them the area has
   * NO active dataset, and is_point_serviceable fail-closes to
   * 'no_dataset' — so every address in that market is refused. If the
   * second request failed it stayed that way: a boundary replacement
   * turning into a silent market outage. An audit injected exactly that
   * and the previous dataset remained deactivated.
   *
   * activate_boundary_dataset (migration 0066) validates and swaps inside
   * one transaction, so the outcome is complete or nothing. It also
   * refuses a dataset whose rows do not match its feature_count, whose
   * geometry is invalid or empty, or which is missing any municipality we
   * require for the area — replacing working coverage with coverage that
   * matches nothing is as bad as an outage and harder to spot.
   */
  const expected = expectedJurisdictionIds(area_id);
  if (expected.length === 0) {
    console.error(`\n  Unknown area "${area_id}" — cannot state the required jurisdictions.`);
    console.error("  Refusing: activating without a coverage check is how a partial");
    console.error("  dataset becomes live.\n");
    process.exit(1);
  }

  let result;
  try {
    result = await sbRpc("activate_boundary_dataset", {
      p_dataset_id: activateId,
      // IDs, not names: a dataset holding the City of North Vancouver
      // twice has 15 distinct names and passes a name check.
      p_expected_jurisdiction_ids: expected,
    });
  } catch (err) {
    console.error(`\n  ACTIVATION REFUSED: ${err.message}`);
    console.error("\n  Nothing changed — the previously active dataset is still active.\n");
    process.exit(1);
  }

  const r = Array.isArray(result) ? result[0] : result;
  console.log(`\nActivated ${activateId} for ${area_id}.`);
  console.log(`  ${r?.out_boundary_rows ?? "?"} boundary polygons`);
  console.log(`  distinct jurisdictions verified: ${r?.out_jurisdictions ?? "?"}`);
  if (r?.out_deactivated) console.log(`  deactivated: ${r.out_deactivated}`);
  console.log("\nRe-run `npm run preflight` — it probes is_point_serviceable directly.\n");
  process.exit(0);
}

const area = val("--area");
const file = val("--file");
const nameProp = val("--name-property");
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
      p_municipality: m.canonical,
      // The id, not just the display name. "North Vancouver" is two
      // municipalities and the name cannot tell them apart.
      p_jurisdiction_id: m.jurisdictionId,
      p_geojson: JSON.stringify(m.geometry),
    }),
  });
}

console.log(`\nLoaded ${matched.length} boundaries as dataset ${datasetId} (INACTIVE).`);
console.log("Next: run the probes in docs/BOUNDARY-DATASETS.md and supabase/tests/boundary_containment.sql,");
console.log(`then: node scripts/load-boundaries.mjs --activate ${datasetId}`);
