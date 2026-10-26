#!/usr/bin/env node
// Exercises the real money mechanics against the Stripe SANDBOX.
//
// Refuses to run against a live key: every step here authorizes and
// captures real charges if pointed at one.
//
// What this cannot prove: the destination split. Helpward's platform is
// provisioned with Stripe-managed risk, which means Stripe — not the
// platform — collects the connected account's KYC. There is no API to
// activate a connected account, so a human must walk the hosted onboarding
// once before a destination charge can be tested. Until then the charge is
// correctly REFUSED, which this script asserts.

import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.rehearsal", "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);

const SK = env.STRIPE_SECRET_KEY;
if (!SK) { console.error("STRIPE_SECRET_KEY missing from .env.rehearsal"); process.exit(1); }
if (SK.startsWith("sk_live_")) {
  console.error("REFUSING: that is a LIVE key. This script authorizes and captures charges.");
  process.exit(1);
}

let pass = 0, fail = 0;
const ok = (label, cond, detail = "") => {
  if (cond) { console.log(`  \x1b[32mPASS\x1b[0m ${label}`); pass++; }
  else { console.log(`  \x1b[31mFAIL\x1b[0m ${label} ${detail}`); fail++; }
};

async function api(path, body, extraHeaders = {}) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Basic ${Buffer.from(SK + ":").toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
      ...extraHeaders,
    },
    body: body ? new URLSearchParams(body).toString() : undefined,
  });
  return res.json();
}

// The amounts a real $50 job produces, from lib/pricing.ts.
const SUBTOTAL = 5000, FEE = 450, TOTAL = SUBTOTAL + FEE;
const PAYOUT = Math.round(SUBTOTAL * 0.8);          // 4000
const PLATFORM = (SUBTOTAL - PAYOUT) + FEE;          // 1450

console.log("\nStripe sandbox — payment mechanics\n");
console.log(`  $50.00 job: total ${TOTAL}c, helper ${PAYOUT}c, Helpward ${PLATFORM}c\n`);

ok("the split identity holds (total - platform = payout)", TOTAL - PLATFORM === PAYOUT);

// --- 1. Authorize, then capture ------------------------------------------
const auth = await api("payment_intents", {
  amount: String(TOTAL), currency: "usd", capture_method: "manual",
  confirm: "true", payment_method: "pm_card_visa",
  "automatic_payment_methods[enabled]": "true",
  "automatic_payment_methods[allow_redirects]": "never",
  description: "Helpward verify: authorize+capture",
});
ok("hold placed, not charged", auth.status === "requires_capture", `status=${auth.status} ${auth.error?.message ?? ""}`);

const captured = await api(`payment_intents/${auth.id}/capture`, { amount_to_capture: String(TOTAL) });
ok("capture settles the hold", captured.status === "succeeded", `status=${captured.status}`);
ok("captured amount equals the quoted total", captured.amount_received === TOTAL, `got ${captured.amount_received}`);

// --- 2. Authorize, then void ---------------------------------------------
const toVoid = await api("payment_intents", {
  amount: String(TOTAL), currency: "usd", capture_method: "manual",
  confirm: "true", payment_method: "pm_card_visa",
  "automatic_payment_methods[enabled]": "true",
  "automatic_payment_methods[allow_redirects]": "never",
  description: "Helpward verify: cancelled booking",
});
const voided = await api(`payment_intents/${toVoid.id}/cancel`, {});
ok("a cancelled booking voids rather than refunds", voided.status === "canceled", `status=${voided.status}`);
ok("a void moves no money", (voided.amount_received ?? 0) === 0);

// --- 3. Idempotency -------------------------------------------------------
const key = `hw-verify-${auth.id}`;
const first = await api("payment_intents", {
  amount: String(TOTAL), currency: "usd", capture_method: "manual",
  description: "Helpward verify: idempotency",
}, { "Idempotency-Key": key });
const second = await api("payment_intents", {
  amount: String(TOTAL), currency: "usd", capture_method: "manual",
  description: "Helpward verify: idempotency",
}, { "Idempotency-Key": key });
ok("a retried authorization does not double-charge", first.id === second.id, `${first.id} vs ${second.id}`);
await api(`payment_intents/${first.id}/cancel`, {});

// --- 4. A declined card fails the booking, it does not half-succeed -------
const declined = await api("payment_intents", {
  amount: String(TOTAL), currency: "usd", capture_method: "manual",
  confirm: "true", payment_method: "pm_card_chargeDeclined",
  "automatic_payment_methods[enabled]": "true",
  "automatic_payment_methods[allow_redirects]": "never",
  description: "Helpward verify: declined",
});
ok("a declined card returns a card_error", declined.error?.type === "card_error", JSON.stringify(declined.error?.code ?? declined.status));

// --- 5. Partial capture rescales the fee ---------------------------------
const partialAuth = await api("payment_intents", {
  amount: String(TOTAL), currency: "usd", capture_method: "manual",
  confirm: "true", payment_method: "pm_card_visa",
  "automatic_payment_methods[enabled]": "true",
  "automatic_payment_methods[allow_redirects]": "never",
  description: "Helpward verify: partial capture",
});
const half = Math.round(TOTAL / 2);
const partial = await api(`payment_intents/${partialAuth.id}/capture`, { amount_to_capture: String(half) });
ok("capturing less than the hold is allowed", partial.status === "succeeded" && partial.amount_received === half,
   `status=${partial.status} received=${partial.amount_received}`);

// --- 6. The destination charge is refused until onboarding completes ------
const acct = env.STRIPE_TEST_CONNECT_ACCOUNT;
if (acct) {
  const dest = await api("payment_intents", {
    amount: String(TOTAL), currency: "usd", capture_method: "manual",
    application_fee_amount: String(PLATFORM),
    "transfer_data[destination]": acct,
    description: "Helpward verify: destination charge",
  });
  if (dest.error) {
    ok("an un-onboarded helper cannot be paid (correctly refused)",
       /capabilities enabled/.test(dest.error.message ?? ""), dest.error.message);
    console.log("\n  \x1b[33mBLOCKED\x1b[0m destination split unproven: the connected account has not");
    console.log("          finished Stripe-hosted onboarding. Walk it once, then re-run.");
  } else {
    ok("destination charge accepted", dest.status === "requires_capture", `status=${dest.status}`);
    ok("Helpward's fee is withheld exactly", dest.application_fee_amount === PLATFORM);
    const willTransfer = dest.amount - dest.application_fee_amount;
    ok(`the helper receives exactly their payout (${PAYOUT}c)`, willTransfer === PAYOUT, `would transfer ${willTransfer}`);
    await api(`payment_intents/${dest.id}/cancel`, {});
  }
} else {
  console.log("\n  \x1b[36mSKIP\x1b[0m  destination split: set STRIPE_TEST_CONNECT_ACCOUNT in .env.rehearsal");
}

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
