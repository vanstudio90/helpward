/*
 * Tell PostgREST to reload its schema cache.
 *
 * Migration 0069 issues this notify itself, but a cache that was already
 * warm when the migration ran can keep serving the old schema — so new
 * functions return "function not found" through the REST API while being
 * perfectly callable over SQL. Preflight reports it as a missing
 * whoami_role and blocks rather than skipping the authorisation check.
 *
 * Reads PRODUCTION_DATABASE_URL (or DATABASE_URL). Sends one notify and
 * nothing else — it writes no rows and alters no schema.
 */
import pg from "pg";

const url = process.env.PRODUCTION_DATABASE_URL || process.env.DATABASE_URL;
if (!url) {
  console.error("Set PRODUCTION_DATABASE_URL (or DATABASE_URL).");
  process.exit(1);
}

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  await client.query("notify pgrst, 'reload schema'");
  const { rows } = await client.query("select current_database() as db");
  console.log(`  schema cache reload sent to ${rows[0].db}`);
} finally {
  await client.end();
}
