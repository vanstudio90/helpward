/*
  HOW LONG THE ADMIN READS ACTUALLY TAKE, ON REAL DATA.

  The earlier timings were taken while five of these pages returned
  invented arrays from a module-level constant, so they measured React
  and nothing else. These call the same functions the deployed pages
  call, against the production database, and report the real figures —
  median of several runs, because a single cold round trip says more
  about the network than the query.

  It writes nothing.

  USAGE
    node --experimental-strip-types --import ./tests/register.mjs \
      scripts/time-admin-reads.ts
*/
import fs from "node:fs";
import path from "node:path";

for (const line of fs.readFileSync(path.resolve(".env.local"), "utf8").split("\n")) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
  if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}

const RUNS = 7;

async function time(label: string, fn: () => Promise<unknown>) {
  const ms: number[] = [];
  for (let i = 0; i < RUNS; i++) {
    const t = performance.now();
    await fn();
    ms.push(performance.now() - t);
  }
  const sorted = [...ms].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  console.log(
    `  ${label.padEnd(30)} median ${median.toFixed(0).padStart(5)}ms` +
    `   best ${sorted[0].toFixed(0).padStart(5)}ms   worst ${sorted.at(-1)!.toFixed(0).padStart(5)}ms` +
    `   cold ${ms[0].toFixed(0).padStart(5)}ms`,
  );
  return median;
}

const { getCatalogueView } = await import("../lib/data/admin-services.ts");
const { getDataRequestsView } = await import("../lib/data/admin-data-requests.ts");
const { getVenuesView } = await import("../lib/data/admin-venues.ts");
const { getAuditView } = await import("../lib/data/admin-audit.ts");

console.log(`\n=== admin read timings, ${RUNS} runs each, production data ===\n`);
const totals: Record<string, number> = {};
totals["services (list)"] = await time("services (list)", () => getCatalogueView({}));
totals["services (detail)"] = await time("services (detail)", () => getCatalogueView({ open: "maid-service" }));
totals["data requests"] = await time("data requests", () => getDataRequestsView({}));
totals["venues"] = await time("venues", () => getVenuesView({}));
totals["audit log"] = await time("audit log", () => getAuditView({ window: "Last 7 days" }));
totals["audit log (everything)"] = await time("audit log (everything)", () => getAuditView({ window: "Everything" }));

console.log("\n  slowest first:");
for (const [k, v] of Object.entries(totals).sort((a, b) => b[1] - a[1])) {
  console.log(`    ${v.toFixed(0).padStart(5)}ms  ${k}`);
}
console.log();
