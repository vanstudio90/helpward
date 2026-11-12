/*
  WHAT THE DEPLOYED ADMIN PAGES ACTUALLY SHOW.

  The unit suite proves the rules are written down. It cannot prove
  that production has the rows those rules describe — a hermetic test
  and an empty table agree with each other perfectly.

  So this calls the REAL view functions the deployed pages call,
  against the PRODUCTION database, and prints the figures a person
  would read on the screen. It writes nothing.

  USAGE
    node --experimental-strip-types --import ./tests/register.mjs \
      scripts/verify-admin-reads.ts
*/
import fs from "node:fs";
import path from "node:path";

for (const line of fs.readFileSync(path.resolve(".env.local"), "utf8").split("\n")) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
  if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}

const ref = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").split("//")[1]?.split(".")[0];
console.log(`\n=== reading project ${ref} ===\n`);

const money = (c: number | null, cur = "CAD") =>
  c === null ? "not known" : `${cur === "CAD" ? "CA$" : "$"}${(c / 100).toFixed(2)}`;

/* ---------------------------------------------------------------- */
const { getCatalogueView } = await import("../lib/data/admin-services.ts");
const services = await getCatalogueView({});
console.log("SERVICES & PRICING");
console.log(`  sample=${services.sample} writable=${services.writable} as_of=${services.as_of}`);
console.log(`  counts: ${JSON.stringify(services.counts)}`);
for (const r of services.rows) {
  console.log(
    `  ${r.title.padEnd(28)} ${r.status.padEnd(9)} model=${String(r.model).padEnd(16)}` +
    ` CA=${money(r.ca_base_cents)}  US=${money(r.us_base_cents, "USD")}` +
    `${r.has_draft ? "  [draft]" : ""}`,
  );
}
console.log("  publication checks:");
for (const c of services.checks) console.log(`    ${c.state.padEnd(10)} ${c.label} — ${c.detail}`);

/* THE OVERRIDE / INHERITED / ZERO DISTINCTION, on a real service. */
for (const row of services.rows) {
 for (const mkt of ["CA", "US"] as const) {
  const draft = (await getCatalogueView({ open: row.id, market: mkt })).selected;
  if (draft) {
    console.log(`\n  --- ${draft.title} (${draft.market}, ${draft.currency}) ---`);
    for (const f of draft.price_fields) {
      console.log(
        `    ${f.label.padEnd(26)} override=${f.override_cents === null ? "inherited" : money(f.override_cents, draft.currency)}` +
        `  inherited=${money(f.inherited_cents, draft.currency)}  effective=${money(f.effective_cents, draft.currency)}`,
      );
    }
    for (const n of draft.number_fields) console.log(`    ${n.label.padEnd(26)} ${n.value}`);
    console.log(`    service fee ${money(draft.service_fee_cents, draft.currency)} across ${JSON.stringify(draft.service_fee_scope)}`);
    console.log(`    QUOTE PREVIEW — ${draft.quote.duration_minutes} min, ${draft.quote.helpers} helper(s)`);
    for (const l of draft.quote.lines) console.log(`      ${l.label.padEnd(30)} ${money(l.amount_cents, draft.currency)}`);
    console.log(`      ${"TOTAL".padEnd(30)} ${money(draft.quote.total_cents, draft.currency)}`);
    console.log(`      source: ${draft.quote.source}`);
    console.log(`    validation: ${draft.validation.state}`);
  }
 }
}

/* ---------------------------------------------------------------- */
const { getDataRequestsView } = await import("../lib/data/admin-data-requests.ts");
const dr = await getDataRequestsView();
console.log("\nDATA REQUESTS");
console.log(`  sample=${dr.sample} writable=${dr.writable}`);
console.log(`  counts: ${JSON.stringify(dr.counts)}`);
console.log(`  total_requests=${dr.total_requests} shown=${dr.rows.length} tz=${dr.timezone}`);
console.log(`  load_error: ${dr.load_error ?? "none"}`);
for (const r of dr.rows) {
  console.log(`  ${r.id.padEnd(10)} ${String(r.kind).padEnd(9)} ${String(r.state).padEnd(14)} ${r.account.name}`);
}
console.log("  worker health:");
for (const h of dr.health) {
  console.log(`    ${h.label.padEnd(26)} ${h.state.padEnd(11)} last_success=${h.last_success_at ?? "none"} — ${h.detail}`);
}
console.log(`  health_note: ${dr.health_note}`);

/* ---------------------------------------------------------------- */
const { getVenuesView } = await import("../lib/data/admin-venues.ts");
const venues = await getVenuesView();
console.log("\nCOVERAGE & VENUES");
console.log(`  sample=${venues.sample} writable=${venues.writable}`);
console.log(`  counts: ${JSON.stringify(venues.counts)}`);
console.log(`  total_rows=${venues.total_rows} load_error=${venues.load_error ?? "none"}`);
for (const v of venues.rows) {
  console.log(
    `  ${v.name.padEnd(30)} ${String(v.permission).padEnd(14)} review=${String(v.review_state).padEnd(12)}` +
    ` next=${v.next_review ?? "—"} checked=${v.last_checked ?? "never"} requests=${v.open_requests}`,
  );
}
console.log("  coverage:");
for (const c of venues.coverage) {
  console.log(`    ${c.area.padEnd(18)} ${c.country} helpers=${c.helpers_available} services=${c.services_live} venues=${c.venues_recorded} unchecked=${c.venues_unchecked}`);
}

/* ---------------------------------------------------------------- */
const { getAuditView } = await import("../lib/data/admin-audit.ts");
const audit = await getAuditView({ window: "Everything" });
console.log("\nAUDIT LOG");
console.log(`  sample=${audit.sample} writable=${audit.writable}`);
console.log(`  append_only_enforced=${audit.append_only_enforced}`);
console.log(`  ${audit.append_only_detail}`);
console.log(`  counts: ${JSON.stringify(audit.counts)} total=${audit.total_rows}`);
console.log(`  logging_gap: ${audit.logging_gap ?? "none"}`);
console.log(`  load_error: ${audit.load_error ?? "none"}`);
for (const r of audit.rows) {
  console.log(
    `  ${r.id} ${r.occurred_at.padEnd(26)} ${r.actor.name.padEnd(20)}` +
    ` [${r.actor.role_at_event}] ${r.action.padEnd(26)} ${r.outcome}` +
    (r.correction ? `  ⚠ ${r.correction.label} (${r.correction.id})` : ""),
  );
}
const corrected = audit.rows.filter((r) => r.correction);
console.log(`  corrected rows visible: ${corrected.map((r) => r.id).join(", ") || "none"}`);

console.log("\nmoney formatter check:", money(9450), money(null));
console.log();
