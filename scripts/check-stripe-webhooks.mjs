#!/usr/bin/env node
/*
 * WHAT STRIPE IS ACTUALLY CONFIGURED TO SEND US.
 *
 * The handler gained refund.created / refund.updated / refund.failed,
 * and nothing was subscribed to them — so a refund that completes
 * after the response would never be recorded as completed. Code that
 * handles an event it is never sent is not handling it.
 *
 * This reads the endpoints in one mode and reports what is missing.
 * Read-only: it prints no key, and it changes nothing without --apply.
 *
 *   node scripts/check-stripe-webhooks.mjs            (test mode)
 *   node scripts/check-stripe-webhooks.mjs --live     (live mode)
 *   node scripts/check-stripe-webhooks.mjs --apply    (add missing events)
 */
import fs from "node:fs";
import path from "node:path";

for (const f of [".env.rehearsal", ".env.local"]) {
  const p = path.resolve(f);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
}

const LIVE = process.argv.includes("--live");
const APPLY = process.argv.includes("--apply");

/*
  THE KEY'S OWN PREFIX DECIDES THE MODE, not the variable it came from.
  .env.rehearsal's STRIPE_SECRET_KEY is a TEST key; .env.local's is
  live. Trusting the name would have read one and reported the other.
*/
const candidates = [
  process.env.STRIPE_TEST_SECRET_KEY,
  process.env.STRIPE_SECRET_KEY_TEST,
  process.env.STRIPE_SECRET_KEY,
].filter(Boolean);
const key = candidates.find((k) => (LIVE ? k.startsWith("sk_live") : k.startsWith("sk_test")));
if (!key) {
  console.error(
    `No ${LIVE ? "live" : "test"} Stripe key in the environment.` +
    (LIVE ? "" : " .env.rehearsal should hold one."),
  );
  process.exit(1);
}

/*
  WHAT EACH HANDLER ACTUALLY IMPLEMENTS, by the route it lives at.
  Holding one list for every endpoint reports the Connect endpoint as
  missing payment events it was never meant to receive.
*/
const HANDLERS = {
  "/api/webhooks/stripe": [
    "payment_intent.amount_capturable_updated",
    "payment_intent.succeeded",
    "payment_intent.payment_failed",
    "payment_intent.canceled",
    "charge.refunded",
    "charge.dispute.created",
    "refund.created",
    "refund.updated",
    "refund.failed",
  ],
  "/api/webhooks/stripe-connect": [
    "account.updated",
    "payout.paid",
    "payout.failed",
  ],
  "/api/webhooks/stripe-identity": [
    "identity.verification_session.verified",
    "identity.verification_session.requires_input",
  ],
};

const requiredFor = (url) => {
  const pathname = (() => { try { return new URL(url).pathname; } catch { return url; } })();
  return HANDLERS[pathname] ?? null;
};

const api = async (p, init) => {
  const res = await fetch(`https://api.stripe.com/v1/${p}`, {
    ...init,
    headers: { Authorization: `Bearer ${key}`, ...(init?.headers ?? {}) },
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
  return body;
};

const { data: endpoints } = await api("webhook_endpoints?limit=100");
console.log(`\n  ${LIVE ? "LIVE" : "TEST"} mode · ${endpoints.length} endpoint(s)\n`);

let problems = 0;
for (const e of endpoints) {
  const required = requiredFor(e.url);
  const subscribed = new Set(e.enabled_events);
  const missing = !required ? [] : subscribed.has("*") ? [] : required.filter((x) => !subscribed.has(x));
  const pointsAtProduction = /helpward\.com/.test(e.url);

  console.log(`  ${e.url}`);
  console.log(`    status ${e.status} · ${e.enabled_events.length} event(s)`);
  if (!required) {
    console.log(`    no handler in this repo serves that path — not checked`);
    console.log("");
    continue;
  }

  /*
    A TEST-MODE ENDPOINT AIMED AT PRODUCTION IS NOT A REHEARSAL
    TARGET. Test events would be delivered to the live deployment and
    acted on against the live database — which is why rehearsal uses
    `stripe listen` and its own signing secret instead.
  */
  if (!LIVE && pointsAtProduction) {
    console.log(`    NOTE: this test endpoint delivers to production. It is not a rehearsal target —`);
    console.log(`          use: stripe listen --forward-to localhost:3000/api/webhooks/stripe`);
  }
  if (missing.length) {
    problems++;
    console.log(`    MISSING: ${missing.join(", ")}`);
    if (APPLY) {
      const form = new URLSearchParams();
      for (const ev of [...new Set([...e.enabled_events, ...required])]) {
        form.append("enabled_events[]", ev);
      }
      await api(`webhook_endpoints/${e.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form,
      });
      console.log(`    ADDED the missing events.`);
    }
  } else {
    console.log(`    all required events subscribed`);
  }
  console.log("");
}

if (problems && !APPLY) {
  console.log(`  ${problems} endpoint(s) are missing events. Re-run with --apply to subscribe them.\n`);
  process.exit(1);
}
console.log(problems ? "  Updated.\n" : "  Nothing missing.\n");
