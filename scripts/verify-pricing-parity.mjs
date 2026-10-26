#!/usr/bin/env node
// The TypeScript quote and the SQL quote must agree, exactly, always.
//
// There are two implementations because there have to be: the form needs
// a live price as the customer answers, and acceptance must recompute
// server-side from data it trusts — a price the browser sent is a price
// the browser chose. Two implementations of one sum drift, so this runs
// both over a grid of inputs and fails on any disagreement.
//
// A difference of one cent here is a booking where the customer was shown
// one number and charged another.
import { readFileSync } from "node:fs";
import pg from "pg";

const env = Object.fromEntries(
  readFileSync(".env.rehearsal", "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]));

const { priceService, ruleFromRow } = await import("../lib/service-pricing.ts");

const db = new pg.Client({ connectionString: env.REHEARSAL_DATABASE_URL, ssl: { rejectUnauthorized: false } });
await db.connect();

const { rows: services } = await db.query(
  `select s.id, s.base_price_cents, p.*
     from services s left join service_pricing p on p.service_id = s.id
    where s.active order by s.id`);

// Values chosen to land on and around every boundary the rule has:
// exactly the included amount, one minute past it, a whole number of
// blocks, and one past that.
const DURATIONS = [null, "", "15", "30", "31", "45", "59", "60", "61", "90", "120", "121", "240", "480"];
const COUNTS    = [null, "", "0", "1", "2", "3", "5", "10"];

let checked = 0, mismatches = 0;

for (const row of services) {
  const rule = row.service_id ? ruleFromRow(row) : null;
  const base = row.base_price_cents;

  const durationKey = rule?.durationField ?? "duration_min";
  const unitKey = rule?.unitField;
  const crewKey = rule?.crewField;

  // Every combination for this service, then ONE round trip. Doing it
  // per-combination meant ~5,000 queries and the check never finished.
  const combos = [];
  for (const d of DURATIONS) {
    for (const u of COUNTS) {
      for (const c of crewKey ? COUNTS : [null]) {
        const intake = {};
        if (d !== null) intake[durationKey] = d;
        if (u !== null && unitKey) intake[unitKey] = u;
        if (c !== null && crewKey) intake[crewKey] = c;
        combos.push(intake);
      }
    }
  }

  const { rows: priced } = await db.query(
    `select i.ord, price_service_cents($1, i.intake) as cents
       from unnest($2::jsonb[]) with ordinality as i(intake, ord)
      order by i.ord`,
    [row.id, combos.map((c) => JSON.stringify(c))]);

  for (let i = 0; i < combos.length; i++) {
    const ts = priceService(base, rule, combos[i]).subtotalCents;
    const sql = priced[i].cents;
    checked++;
    if (ts !== sql) {
      mismatches++;
      if (mismatches <= 12) {
        console.log(`  \x1b[31mMISMATCH\x1b[0m ${row.id}  ${JSON.stringify(combos[i])}`);
        console.log(`           TypeScript ${ts}  ·  SQL ${sql}`);
      }
    }
  }
}

// A grid that silently covered nothing would pass.
if (checked < 1000) {
  console.error(`\n  Only ${checked} combinations checked — the grid is not exercising anything.\n`);
  await db.end();
  process.exit(1);
}

// And the rules must actually change prices, or parity is trivially true.
const { rows: [spread] } = await db.query(`
  select count(*) filter (where included_minutes is not null) timed,
         count(*) filter (where unit_field is not null) counted,
         count(*) filter (where crew_field is not null) crewed,
         count(*) total
    from service_pricing`);

console.log(`\n  ${checked} combinations across ${services.length} services`);
console.log(`  rules: ${spread.total} (${spread.timed} time-priced, ${spread.counted} counted, ${spread.crewed} crew)`);

// Show what a real difference looks like, so the numbers are visible
// rather than merely asserted equal to each other.
const { rows: samples } = await db.query(`
  select price_service_cents('dog-walking', '{"duration_min":"30","dog_count":"1"}'::jsonb) a,
         price_service_cents('dog-walking', '{"duration_min":"480","dog_count":"1"}'::jsonb) b,
         price_service_cents('dog-walking', '{"duration_min":"30","dog_count":"3"}'::jsonb) c,
         price_service_cents('moving-help', '{"crew_size":"1"}'::jsonb) d,
         price_service_cents('moving-help', '{"crew_size":"4"}'::jsonb) e`);
const s = samples[0];
console.log(`\n  dog walking  30 min, 1 dog : $${(s.a / 100).toFixed(2)}`);
console.log(`  dog walking   8 hr, 1 dog : $${(s.b / 100).toFixed(2)}`);
console.log(`  dog walking  30 min, 3 dogs: $${(s.c / 100).toFixed(2)}`);
console.log(`  moving help      1 helper : $${(s.d / 100).toFixed(2)}`);
console.log(`  moving help     4 helpers : $${(s.e / 100).toFixed(2)}`);

if (s.a === s.b) {
  console.error("\n  \x1b[31mFAIL\x1b[0m 30 minutes and 8 hours still cost the same.\n");
  await db.end();
  process.exit(1);
}

await db.end();
console.log(mismatches === 0
  ? `\n  \x1b[32m${checked} passed, 0 mismatches\x1b[0m\n`
  : `\n  \x1b[31m${mismatches} mismatches\x1b[0m\n`);
process.exit(mismatches ? 1 : 0);
