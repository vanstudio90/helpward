#!/usr/bin/env node
// Posts REAL Stripe-signed events at the local webhook routes.
//
// Independent testing found both endpoints returning 503
// missing_webhook_secret, which proves only that they were unconfigured.
// This signs payloads with the configured secret the way Stripe does, so a
// pass means the route verified a signature and acted on the event — and a
// deliberately mis-signed payload must still be rejected.
//
// Usage: next dev running on :3000, then
//   node scripts/verify-webhooks.mjs
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.rehearsal", "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]));

/*
 * THIS IS A SANDBOX MECHANICS TEST, AND IT MUST STAY ONE.
 *
 * It FORGES Stripe events — signs synthetic payloads with the local
 * webhook secret and posts them at the app — to prove signature
 * verification, replay rejection and idempotency work. That is exactly
 * the right way to test the mechanics and exactly the wrong thing to aim
 * at a live site: it would inject invented payment events into a system
 * holding real customers' money.
 *
 * The runbook used to list this under production verification, with the
 * env read from .env.rehearsal and BASE defaulting to localhost — so it
 * reported on rehearsal while appearing to verify production. It is
 * refused against anything non-local now, and the runbook sends a real
 * test event from the Stripe dashboard instead, then reads the delivery
 * record. That proves the production endpoint without forging anything.
 */
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
{
  let host;
  try { host = new URL(BASE).hostname; } catch { host = null; }
  const local = host === "localhost" || host === "127.0.0.1" || host === "[::1]";
  if (!local) {
    console.error(`\n  REFUSING: BASE_URL is ${BASE}.`);
    console.error("  This test posts FORGED Stripe events. Running it against a deployed");
    console.error("  site would inject invented payment events into real data.\n");
    console.error("  To verify a deployed webhook endpoint: send a test event from the");
    console.error("  Stripe dashboard (Developers -> Webhooks -> your endpoint -> Send");
    console.error("  test webhook) and confirm a 200 in that endpoint's delivery log.\n");
    process.exit(1);
  }
}
let pass = 0, fail = 0;
const ok = (label, cond, detail = "") => {
  if (cond) { console.log(`  \x1b[32mPASS\x1b[0m ${label}`); pass++; }
  else { console.log(`  \x1b[31mFAIL\x1b[0m ${label} ${detail}`); fail++; }
};

function sign(payload, secret, timestamp = Math.floor(Date.now() / 1000)) {
  const sig = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
  return `t=${timestamp},v1=${sig}`;
}

async function post(path, body, header) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "stripe-signature": header },
    body,
  });
  return { status: res.status, body: await res.text() };
}

const cases = [
  { path: "/api/webhooks/stripe", secret: env.STRIPE_WEBHOOK_SECRET, name: "payments",
    event: { id: "evt_test_pi", type: "payment_intent.succeeded",
             data: { object: { id: "pi_does_not_exist", object: "payment_intent" } } } },
  { path: "/api/webhooks/stripe-connect", secret: env.STRIPE_CONNECT_WEBHOOK_SECRET, name: "connect",
    event: { id: "evt_test_acct", type: "account.updated",
             data: { object: { id: "acct_does_not_exist", object: "account",
                               charges_enabled: true, payouts_enabled: true,
                               details_submitted: true, capabilities: { transfers: "active" },
                               requirements: { currently_due: [], disabled_reason: null } } } } },
];

console.log(`\nWebhook signature verification against ${BASE}\n`);

for (const c of cases) {
  if (!c.secret) { ok(`${c.name}: secret configured`, false, "missing from .env.rehearsal"); continue; }
  const payload = JSON.stringify(c.event);

  const good = await post(c.path, payload, sign(payload, c.secret));
  ok(`${c.name}: a correctly signed event is accepted`,
     good.status === 200, `HTTP ${good.status} ${good.body.slice(0, 120)}`);
  ok(`${c.name}: no longer 503 missing_webhook_secret`,
     !good.body.includes("missing_webhook_secret"), good.body.slice(0, 80));

  const forged = await post(c.path, payload, sign(payload, "whsec_wrong_secret_entirely"));
  ok(`${c.name}: a forged signature is rejected`,
     forged.status === 400, `HTTP ${forged.status}`);

  const stale = await post(c.path, payload, sign(payload, c.secret, Math.floor(Date.now() / 1000) - 3600));
  ok(`${c.name}: a replayed hour-old event is rejected`,
     stale.status === 400, `HTTP ${stale.status} — Stripe's tolerance is 5 minutes`);

  const naked = await fetch(`${BASE}${c.path}`, { method: "POST", body: payload });
  ok(`${c.name}: an unsigned request is rejected`,
     naked.status === 400, `HTTP ${naked.status}`);
}

// ---------------------------------------------------------------------
// The durable half of interrupted-approval recovery
// ---------------------------------------------------------------------
// A signed amount_capturable_updated must unblock a booking on its own,
// without anyone pressing retry: that is the path that survives a closed
// tab between bank approval and the app recording it.
{
  const { createClient } = await import("@supabase/supabase-js");
  const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } });

  const [{ data: c }, { data: h }, { data: sv }] = await Promise.all([
    admin.from("profiles").select("id").eq("role", "customer").limit(1).single(),
    admin.from("provider_profiles").select("user_id").limit(1).single(),
    admin.from("services").select("id").eq("active", true).limit(1).single(),
  ]);

  const fakeIntent = `pi_webhook_fixture_${Date.now()}`;
  const { data: bk } = await admin.from("bookings").insert({
    customer_id: c.id, provider_id: h.user_id, service_id: sv.id, status: "scheduled",
    base_price_cents: 2000, service_fee_cents: 450, total_cents: 2450,
    platform_fee_cents: 850, payout_cents: 1600, currency: "USD",
    payment_status: "pending", stripe_payment_intent_id: fakeIntent,
  }).select("id").single();

  const event = {
    id: "evt_capturable", type: "payment_intent.amount_capturable_updated",
    data: { object: { id: fakeIntent, object: "payment_intent", amount_capturable: 2450 } },
  };
  const payload = JSON.stringify(event);
  const res = await post("/api/webhooks/stripe", payload,
    sign(payload, env.STRIPE_WEBHOOK_SECRET));

  const { data: after } = await admin.from("bookings")
    .select("payment_status, authorized_at").eq("id", bk.id).single();

  ok("a signed amount_capturable_updated unblocks the booking",
     res.status === 200 && after?.payment_status === "authorized",
     `HTTP ${res.status}, booking ${after?.payment_status}`);
  ok("... and stamps when the hold landed", !!after?.authorized_at);

  // A repeat must not disturb a booking that has since been captured.
  await admin.from("bookings").update({ payment_status: "captured" }).eq("id", bk.id);
  await post("/api/webhooks/stripe", payload, sign(payload, env.STRIPE_WEBHOOK_SECRET));
  const { data: again } = await admin.from("bookings")
    .select("payment_status").eq("id", bk.id).single();
  ok("a replayed event does not drag a captured booking backwards",
     again?.payment_status === "captured", again?.payment_status);

  await admin.from("bookings").delete().eq("id", bk.id);
}

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
