/*
  Build the archive of withdrawn services.

  Inactive database rows are not an archive. If somebody later drops a
  column, rewrites a copy module or loses a photograph URL, the rows
  alone will not tell you what the service used to be. This writes one
  self-contained file that holds everything needed to put a service back
  exactly as it was published, and ties it to a dated code revision.

  Run from the repo root:
    node --experimental-strip-types --import ./tests/register.mjs \
      scripts/build-service-archive.mjs
*/
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execSync } from "node:child_process";

import { SERVICE_PAGE_COPY, SERVICE_SCOPE } from "../lib/public-service-pages.ts";
import { PUBLIC_SERVICE_COPY, RELATED_PROMPT } from "../lib/public-service-copy.ts";
import { SERVICE_PREP } from "../lib/public-service-prep.ts";
import { SERVICE_INTAKE } from "../lib/service-intake.ts";
import { WITHDRAWN_COMPARISONS, COMPETITORS } from "../lib/competitors.ts";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    }),
);
const U = env.NEXT_PUBLIC_SUPABASE_URL;
const K = env.SUPABASE_SERVICE_ROLE_KEY;
const headers = { apikey: K, Authorization: `Bearer ${K}` };
const get = async (p) => {
  const r = await fetch(`${U}/rest/v1/${p}`, { headers });
  if (!r.ok) throw new Error(`${p}: ${r.status}`);
  return r.json();
};

const [services, pricing, completion, categories] = await Promise.all([
  get("services?select=*&order=id"),
  get("service_pricing?select=*"),
  get("service_completion_requirements?select=*"),
  get("service_categories?select=*"),
]);

const sha = execSync("git rev-parse HEAD").toString().trim();
const shortSha = sha.slice(0, 10);
const describe = execSync("git log -1 --format=%cI").toString().trim();

const withdrawn = services.filter((s) => !s.active).map((s) => s.id);
const active = services.filter((s) => s.active).map((s) => s.id);

const entry = (s) => ({
  id: s.id,
  active: s.active,
  database: {
    row: s,
    pricingRule: pricing.find((p) => p.service_id === s.id) ?? null,
    completionRequirements: completion.find((c) => c.service_id === s.id) ?? null,
    category: categories.find((c) => c.id === s.category_id) ?? null,
  },
  publicCopy: {
    page: SERVICE_PAGE_COPY[s.id] ?? null,
    scope: SERVICE_SCOPE[s.id] ?? null,
    nameAndLinks: PUBLIC_SERVICE_COPY[s.id] ?? null,
    relatedPrompt: RELATED_PROMPT[s.id] ?? null,
    preparation: SERVICE_PREP[s.id] ?? null,
  },
  intake: SERVICE_INTAKE[s.id] ?? null,
  photograph: s.image_url ?? null,
});

const archive = {
  takenAt: new Date().toISOString(),
  purpose:
    "Everything needed to restore a withdrawn Helpward service exactly as it was published. "
    + "Withdrawn for the iOS first submission; see docs/service-scope/README.md.",
  codeRevision: { sha, shortSha, committedAt: describe },
  counts: { total: services.length, active: active.length, withdrawn: withdrawn.length },
  activeServices: active,
  withdrawnServices: withdrawn,
  withdrawnComparisons: [...WITHDRAWN_COMPARISONS].map((slug) => ({
    slug,
    entry: COMPETITORS.find((c) => c.slug === slug) ?? null,
  })),
  services: services.map(entry),
};

mkdirSync(new URL("../docs/service-scope/", import.meta.url), { recursive: true });
const out = new URL("../docs/service-scope/archive-2026-10-31.json", import.meta.url);
writeFileSync(out, JSON.stringify(archive, null, 1));

// Completeness is the whole point, so check it rather than assume it.
/*
  professional-cuddler was never published — it was switched off by an
  earlier owner decision before any public page existed for it, so it has
  no page copy, scope block or preparation list to archive. That is a
  correct absence, not a gap, and saying so keeps the check meaningful.
*/
const NEVER_PUBLISHED = new Set(["professional-cuddler"]);
const gaps = [];
for (const s of archive.services) {
  if (NEVER_PUBLISHED.has(s.id)) continue;
  if (!s.database.row) gaps.push(`${s.id}: no database row`);
  if (!s.publicCopy.page) gaps.push(`${s.id}: no page copy`);
  if (!s.publicCopy.scope) gaps.push(`${s.id}: no scope block`);
  if (!s.publicCopy.preparation) gaps.push(`${s.id}: no preparation list`);
  if (!s.photograph) gaps.push(`${s.id}: no photograph`);
}
console.log(`archive written: ${archive.services.length} services`);
console.log(`  active ${archive.counts.active} / withdrawn ${archive.counts.withdrawn}`);
console.log(`  code revision ${shortSha} (${describe})`);
console.log(`  withdrawn comparisons: ${archive.withdrawnComparisons.map((c) => c.slug).join(", ")}`);
console.log(gaps.length ? `  GAPS:\n   - ${gaps.join("\n   - ")}` : "  no gaps: every service carries row, copy, scope, preparation and photograph");
