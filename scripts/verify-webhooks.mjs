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

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
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

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
