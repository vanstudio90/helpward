/*
 * TWO PEOPLE REFUNDING THE SAME CHARGE AT THE SAME TIME.
 *
 * The retest was right that a sequential self-test proves nothing about
 * this: admin_refund_request used to read the available balance and
 * insert without locking anything, so two transactions could both see
 * the whole charge and both reserve it. 0119 takes a lock on the
 * BOOKING first, which is the thing the money belongs to.
 *
 * This opens two real connections, holds both inside transactions, and
 * makes them race.
 *
 * WHAT IT ACTUALLY WRITES, because an earlier version of this comment
 * claimed "everything is rolled back" and that was not true: the race
 * needs committed state to contend over, so the fixture booking IS
 * committed, and the booking and its refund rows are deleted at the
 * end. The audit events those requests wrote are NOT deleted — 0109
 * made audit_log append-only and nothing here may remove from it. They
 * are left, correctly attributed to nobody, and that is the point of
 * an append-only log.
 *
 * So: rehearsal only. Do not point this at production.
 *
 *   node scripts/verify-refund-concurrency.mjs
 */
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

for (const f of [".env.rehearsal", ".env.local"]) {
  const p = path.resolve(f);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
}
/*
  REHEARSAL ONLY, AND IT REFUSES ANYTHING ELSE. This commits a fixture
  booking and leaves audit rows behind; neither belongs in production.
*/
if (process.argv.includes("--production")) {
  console.error("This writes a fixture booking and leaves audit rows. It is for rehearsal only.");
  process.exit(1);
}
const url = process.env.REHEARSAL_DATABASE_URL || process.env.DATABASE_URL;
if (!url) { console.error("no database url"); process.exit(1); }
if (/xhmgmegraieouudyjjlv/.test(url)) {
  console.error("That connection string is production. Refusing.");
  process.exit(1);
}

const ADMIN_CLAIM = `{"app_metadata":{"role":"admin"}}`;
const connect = async () => {
  const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await c.connect();
  return c;
};

const setup = await connect();
await setup.query("begin");
await setup.query(`select set_config('request.jwt.claims', $1, true)`, [ADMIN_CLAIM]);

// A booking of our own, so the test depends on no existing data.
const ids = await setup.query(`
  select (select id from profiles limit 1) as customer,
         (select user_id from provider_profiles limit 1) as helper,
         (select id from services limit 1) as service`);
const { customer, helper, service } = ids.rows[0];
const made = await setup.query(`
  insert into bookings (customer_id, provider_id, service_id, status, base_price_cents,
    total_cents, platform_fee_cents, payout_cents, currency, payment_status, captured_at,
    stripe_payment_intent_id)
  values ($1,$2,$3,'completed',9000,10000,2250,7200,'CAD','captured',now(),'pi_concurrency_test')
  returning id`, [customer, helper, service]);
const booking = made.rows[0].id;
await setup.query("commit");           // visible to the two racers
console.log(`\nbooking ${booking} — CA$100.00 captured, nothing refunded\n`);

const a = await connect();
const b = await connect();
let failures = 0;

async function race(label, amountA, amountB) {
  for (const c of [a, b]) {
    await c.query("begin");
    await c.query(`select set_config('request.jwt.claims', $1, true)`, [ADMIN_CLAIM]);
  }

  /*
   * A takes the lock. B asks for the same money while A still holds it,
   * and BLOCKS — which is the point. A then commits, B wakes up, and
   * the question is what B sees: the balance before A's reservation
   * (the bug) or after it (the fix).
   *
   * Holding both open until the end would only prove they serialise;
   * it would never let B reach the balance check, which is the thing
   * that has to be right.
   */
  await a.query(`select admin_refund_request($1,'service',$2,'goodwill')`, [booking, amountA]);
  const pb = b.query(`select admin_refund_request($1,'service',$2,'goodwill')`, [booking, amountB]);

  let blocked = false;
  await new Promise((r) => setTimeout(r, 300));
  blocked = await Promise.race([
    pb.then(() => false, () => false),
    new Promise((r) => setTimeout(() => r(true), 50)),
  ]);

  await a.query("commit");
  const result = await pb.then(
    (res) => ({ ok: true, res }),
    (err) => ({ ok: false, message: err.message.split("\n")[0] }),
  );
  try { await b.query("commit"); } catch { await b.query("rollback"); }

  console.log(`  ${label}`);
  console.log(`    the second request blocked while the first held the booking: ${blocked ? "yes" : "NO"}`);
  console.log(result.ok
    ? `    the second was ACCEPTED after the first committed`
    : `    the second was refused: ${result.message}`);
  return { blocked, accepted: result.ok, message: result.ok ? "" : result.message };
}

// 60 + 60 against a 100 balance: the second MUST be refused.
const overlap = await race("two requests of CA$60.00 against CA$100.00", 6000, 6000);
if (!overlap.blocked) {
  console.error("    FAIL: the second request did not wait for the first — nothing serialised them.");
  failures++;
}
if (overlap.accepted) {
  console.error("    FAIL: CA$120.00 was reserved against a CA$100.00 charge.");
  failures++;
}
if (!overlap.accepted && !/Only \d+ cents are left/.test(overlap.message)) {
  console.error(`    FAIL: refused, but not by the balance check: ${overlap.message}`);
  failures++;
}
if (failures === 0) console.log("    PASS: the second saw the first's reservation and was refused.\n");

// Clean up and report.
const cleanup = await connect();
/* The refunds and the fixture booking go. The audit events stay: the
   log is append-only and deleting from it is the one thing this
   project will not do, even for its own test rows. */
await cleanup.query("delete from refunds where booking_id = $1", [booking]);
await cleanup.query("delete from bookings where id = $1", [booking]);
await cleanup.end();
for (const c of [setup, a, b]) await c.end();

console.log(failures === 0
  ? "concurrency: the booking lock holds.\n"
  : `concurrency: ${failures} failure(s).\n`);
process.exit(failures === 0 ? 0 : 1);
