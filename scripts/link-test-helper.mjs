#!/usr/bin/env node
// Links a rehearsal helper profile to an already-activated Stripe test
// account, then refreshes readiness through the SAME function the
// account.updated webhook uses.
//
// WHAT THIS DOES NOT DO: exercise helper onboarding. The production path
// is /provider/onboard -> startPayoutSetupAction -> Stripe-hosted
// onboarding -> account.updated. This skips straight to the end state, so
// it proves money can move to a helper; it does not prove a helper can get
// themselves into that state. Walk the real path before rollout.
//
// Refuses to run against production.
import { readFileSync } from "node:fs";
import pg from "pg";

const env = Object.fromEntries(
  readFileSync(".env.rehearsal", "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]));

const PRODUCTION_REF = "xhmgmegraieouudyjjlv";
if ((env.REHEARSAL_DATABASE_URL ?? "").includes(PRODUCTION_REF)) {
  console.error("REFUSING: that is the production database.");
  process.exit(1);
}
if ((env.STRIPE_SECRET_KEY ?? "").startsWith("sk_live_")) {
  console.error("REFUSING: that is a live Stripe key.");
  process.exit(1);
}

const ACCOUNT = process.argv[2] ?? env.STRIPE_TEST_CONNECT_ACCOUNT;
if (!ACCOUNT) { console.error("Usage: node scripts/link-test-helper.mjs [acct_...]"); process.exit(1); }

// Read the account's real state from Stripe — never assume it is ready.
const res = await fetch(`https://api.stripe.com/v1/accounts/${ACCOUNT}`, {
  headers: { Authorization: `Basic ${Buffer.from(env.STRIPE_SECRET_KEY + ":").toString("base64")}` },
});
const account = await res.json();
if (account.error) { console.error("Stripe:", account.error.message); process.exit(1); }

// transfers is the gate that matters: it is what a destination charge
// needs. payouts_enabled is a separate question — whether Stripe will
// move the balance on to their bank — and is reported, not required.
const payable = account.capabilities?.transfers === "active";
const payoutsPending = payable && account.payouts_enabled !== true;
console.log(`\n  ${ACCOUNT}`);
console.log(`    payouts_enabled : ${account.payouts_enabled}`);
console.log(`    transfers       : ${account.capabilities?.transfers}`);
console.log(`    payable         : ${payable}${payoutsPending ? "  (bank payouts still in review)" : ""}`);
console.log(`    country         : ${account.country}  default currency: ${account.default_currency}\n`);
if (!payable) {
  console.error("  That account cannot receive transfers yet. Finish its onboarding first.");
  process.exit(1);
}

const db = new pg.Client({ connectionString: env.REHEARSAL_DATABASE_URL, ssl: { rejectUnauthorized: false } });
await db.connect();

const { rows: helpers } = await db.query(`
  select pp.user_id, p.full_name, u.email, pp.status, pp.stripe_connect_account_id
    from provider_profiles pp
    join profiles p on p.id = pp.user_id
    -- email is in auth.users; the profiles table has never had it.
    left join auth.users u on u.id = pp.user_id
   order by p.full_name`);

if (!helpers.length) { console.error("No provider profiles in this database."); process.exit(1); }

// Prefer a helper in a live service area. The rehearsal seed predates the
// 2026-10-26 scope change and still contains a Los Angeles helper, which
// is no longer a city Helpward serves — linking payouts to them would set
// up a test that cannot produce a dispatchable booking.
// Match the helper to the account's COUNTRY. A Canadian job settles in
// CAD and a US account converts it, which makes the split unreconcilable
// — independent testing hit exactly that.
const CA_AREAS = /vancouver|burnaby|richmond|surrey|coquitlam|delta|langley|white rock|new westminster|north vancouver|west vancouver|port moody|port coquitlam|maple ridge|pitt meadows/i;
const US_AREAS = /san diego/i;
const IN_SCOPE = account.country === "CA" ? CA_AREAS : US_AREAS;
const inScope = helpers.filter((h) => IN_SCOPE.test(h.full_name ?? ""));
const pool = inScope.length ? inScope : helpers;
if (!inScope.length) {
  console.error(
    `  No helper in a ${account.country} service area to link this account to.\n` +
    `  Linking a ${account.country} account to a helper elsewhere produces bookings\n` +
    `  whose currency the account cannot settle. Refusing.`);
  process.exit(1);
}
const target = pool.find((h) => !h.stripe_connect_account_id) ?? pool[0];

// stripe_connect_account_id is UNIQUE, so a previous run that linked this
// account to a different helper has to be undone first. Clearing the whole
// readiness set, not just the id: a profile left with transfers_active
// true and no account would accept jobs and then fail at authorization.
await db.query(`
  update provider_profiles set
    stripe_connect_account_id = null,
    stripe_transfers_active   = false,
    stripe_charges_enabled    = false,
    stripe_payouts_enabled    = false,
    stripe_details_submitted  = false,
    stripe_onboarded_at       = null
  where stripe_connect_account_id = $1 and user_id <> $2`, [ACCOUNT, target.user_id]);

await db.query(`
  update provider_profiles set
    stripe_connect_account_id = $2,
    stripe_charges_enabled    = $3,
    stripe_payouts_enabled    = $4,
    stripe_details_submitted  = $5,
    stripe_transfers_active   = true,
    stripe_requirements_due   = $6::jsonb,
    stripe_disabled_reason    = null,
    stripe_onboarded_at       = coalesce(stripe_onboarded_at, now()),
    status                    = 'approved'
  where user_id = $1`,
  [target.user_id, ACCOUNT, account.charges_enabled === true, account.payouts_enabled === true,
   account.details_submitted === true, JSON.stringify(account.requirements?.currently_due ?? [])]);

const { rows: [check] } = await db.query(
  `select stripe_transfers_active, status from provider_profiles where user_id = $1`, [target.user_id]);

console.log(`  linked to ${target.full_name ?? target.user_id} (${target.email ?? "no email"})`);
console.log(`    transfers_active: ${check.stripe_transfers_active}  status: ${check.status}`);

const { rows: [counts] } = await db.query(
  `select count(*) filter (where stripe_transfers_active) payable, count(*) total from provider_profiles`);
console.log(`\n  ${counts.payable}/${counts.total} helper profiles can now be paid.`);
console.log(`\n  NOT PROVEN: that a helper can reach this state through /provider/onboard.`);
console.log(`  That path is Stripe-hosted and needs a person. Walk it before rollout.\n`);
await db.end();
