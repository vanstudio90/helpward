#!/usr/bin/env node
/*
 * Bring the controlled App Review helper back online with a fresh location.
 *
 * A STOPGAP, and worth being clear about why. The controlled helper has
 * nobody carrying a phone, so its location passes max_location_age() —
 * 30 minutes — and mark_stale_helpers_offline() then sets is_online to
 * false. find_nearby_providers stops matching it, no match_attempts row
 * is written, and accept_request refuses: a reviewer's request reaches
 * nobody and sits at "waiting for a helper".
 *
 * The real fix is prepareReviewHelper(), which does this inline on every
 * review request so there is no window at all. Until that is deployed,
 * run this within 30 minutes of a demonstration.
 *
 *   PRODUCTION_DATABASE_URL=... node scripts/refresh-review-helper.mjs
 *
 * Sets the admin JWT claim because 0088 guards is_review_helper behind
 * is_admin(); it only ever touches rows already flagged as the review
 * helper.
 */
import pg from "pg";

const url = process.env.PRODUCTION_DATABASE_URL || process.env.DATABASE_URL;
if (!url) { console.error("Set PRODUCTION_DATABASE_URL."); process.exit(1); }

const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();
try {
  await c.query("begin");
  await c.query(`set local request.jwt.claims = '{"role":"admin"}'`);
  const { rowCount } = await c.query(`
    update public.provider_profiles set
      is_online           = true,
      vacation_mode       = false,
      location_updated_at = now(),
      went_offline_at     = null,
      offline_reason      = null
    where is_review_helper = true
  `);
  await c.query("commit");
  if (rowCount === 0) {
    console.log("  No review helper exists. Run scripts/setup-review-accounts.mjs first.");
  }
} catch (e) {
  await c.query("rollback");
  console.error("  failed, rolled back:", e.message);
  await c.end();
  process.exit(1);
}

const { rows } = await c.query(`
  select pp.status, pp.is_online, pp.vacation_mode,
         pp.location_updated_at > now() - public.max_location_age() as location_fresh,
         pp.stripe_transfers_active,
         (select count(*) from public.provider_services ps where ps.provider_id = pp.user_id) as services
  from public.provider_profiles pp where pp.is_review_helper = true
`);
await c.end();
for (const r of rows) {
  console.log("  review helper:");
  for (const [k, v] of Object.entries(r)) console.log(`    ${k.padEnd(24)} ${v}`);
}
