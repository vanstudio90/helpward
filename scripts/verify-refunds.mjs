#!/usr/bin/env node
// Reproduces the two refund failures found in browser testing, against the
// real payment library, a real rehearsal booking and the Stripe sandbox.
//
//   U03  a $24.50 job with a separate $5 tip: refundBooking tried $29.50
//        against the $24.50 intent, Stripe refused, and the message said
//        payment setup had failed.
//   U04  after one partial refund the booking read partial_refund, and
//        every later refund was refused as "not captured" — with money
//        still sitting captured.
//
// Builds its own booking so it never depends on leftover state, and
// deletes it afterwards.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(".env.rehearsal", "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]));

if ((env.STRIPE_SECRET_KEY ?? "").startsWith("sk_live_")) {
  console.error("REFUSING: live Stripe key."); process.exit(1);
}
for (const [k, v] of Object.entries(env)) process.env[k] ??= v;

const { refundBooking } = await import("../lib/payments.ts");
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } });

const AUTH = { Authorization: `Basic ${Buffer.from(env.STRIPE_SECRET_KEY + ":").toString("base64")}` };
const stripe = async (path, body) => (await fetch(`https://api.stripe.com/v1/${path}`, {
  method: body ? "POST" : "GET",
  headers: { ...AUTH, "Content-Type": "application/x-www-form-urlencoded" },
  body: body ? new URLSearchParams(body).toString() : undefined,
})).json();

let pass = 0, fail = 0;
const ok = (label, cond, detail = "") => {
  if (cond) { console.log(`  \x1b[32mPASS\x1b[0m ${label}`); pass++; }
  else { console.log(`  \x1b[31mFAIL\x1b[0m ${label} ${detail}`); fail++; }
};

const ACCT = env.STRIPE_TEST_CONNECT_ACCOUNT;
const JOB = 2450, TIP = 500, PLATFORM = 850;

console.log("\nRefund behaviour — real library, real booking, sandbox Stripe\n");

// ---- fixture -------------------------------------------------------------
const { data: cust } = await admin.from("profiles").select("id").eq("role", "customer").limit(1).single();
const { data: helper } = await admin.from("provider_profiles")
  .select("user_id").eq("stripe_transfers_active", true).limit(1).single();
const { data: svc } = await admin.from("services").select("id").eq("active", true).limit(1).single();
if (!cust || !helper || !svc) { console.error("  Fixture needs a customer, a payable helper and a service."); process.exit(1); }

const jobPi = await stripe("payment_intents", {
  amount: String(JOB), currency: "usd", confirm: "true", payment_method: "pm_card_visa",
  "automatic_payment_methods[enabled]": "true", "automatic_payment_methods[allow_redirects]": "never",
  application_fee_amount: String(PLATFORM), "transfer_data[destination]": ACCT,
  description: "Helpward refund verification: job",
});
const tipPi = await stripe("payment_intents", {
  amount: String(TIP), currency: "usd", confirm: "true", payment_method: "pm_card_visa",
  "automatic_payment_methods[enabled]": "true", "automatic_payment_methods[allow_redirects]": "never",
  "transfer_data[destination]": ACCT,
  description: "Helpward refund verification: tip",
});
if (jobPi.error || tipPi.error) {
  console.error("  Stripe:", (jobPi.error ?? tipPi.error).message); process.exit(1);
}

const { data: booking, error: insErr } = await admin.from("bookings").insert({
  customer_id: cust.id, provider_id: helper.user_id, service_id: svc.id,
  status: "completed", completed_at: new Date().toISOString(),
  base_price_cents: 2000, service_fee_cents: 450, tip_cents: TIP,
  total_cents: JOB + TIP, platform_fee_cents: PLATFORM, payout_cents: 1600 + TIP,
  currency: "USD", payment_status: "captured",
  stripe_payment_intent_id: jobPi.id, tip_payment_intent_id: tipPi.id,
  tip_charged_at: new Date().toISOString(),
}).select("id").single();
if (insErr) { console.error("  fixture insert:", insErr.message); process.exit(1); }

console.log(`  booking ${booking.id}: job ${JOB}c (${jobPi.id}) + tip ${TIP}c (${tipPi.id})\n`);

const refunded = async (pi) => {
  const d = await stripe(`payment_intents/${pi}?expand[]=latest_charge`);
  return d.latest_charge?.amount_refunded ?? 0;
};

try {
  // ---- U04: cumulative partial refunds ----------------------------------
  const first = await refundBooking(booking.id, { amountCents: 1000 });
  ok("a first partial refund succeeds", first.ok, JSON.stringify(first));

  const { data: afterFirst } = await admin.from("bookings")
    .select("payment_status").eq("id", booking.id).single();
  ok("it marks the booking partial_refund", afterFirst?.payment_status === "partial_refund",
     afterFirst?.payment_status);

  // The exact failure: this used to be refused as "not captured".
  const second = await refundBooking(booking.id, { amountCents: 500, operationId: "second" });
  ok("U04 a SECOND partial refund is allowed while money remains captured",
     second.ok, JSON.stringify(second));
  ok("the two refunds total 1500c on the job charge",
     (await refunded(jobPi.id)) === 1500, `refunded ${await refunded(jobPi.id)}`);

  // ---- over-refunding is still refused, for the right reason ------------
  const tooMuch = await refundBooking(booking.id, { amountCents: 9999, operationId: "toomuch" });
  ok("refunding more than remains is refused",
     !tooMuch.ok && tooMuch.code === "exceeds_refundable", JSON.stringify(tooMuch));
  ok("... and says so, rather than blaming payment setup",
     !tooMuch.ok && /left to refund/i.test(tooMuch.message), tooMuch.message);

  // ---- U03: the rest of the job, then the tip ---------------------------
  const rest = await refundBooking(booking.id, { operationId: "rest" });
  ok("U03 refunding the remainder works with a separate tip outstanding",
     rest.ok, JSON.stringify(rest));
  ok("it refunded only what was left on the JOB charge (950c)",
     rest.ok && rest.totalRefundedCents === 950, JSON.stringify(rest.legs ?? []));
  ok("the tip was NOT refunded by default",
     (await refunded(tipPi.id)) === 0, `tip refunded ${await refunded(tipPi.id)}`);

  // Still partial: the JOB is spent but the TIP has not been touched, and
  // "refunded" has to mean the customer got everything back. Asserting
  // "refunded" here would have been asserting that an outstanding $5
  // charge does not exist.
  const { data: afterFull } = await admin.from("bookings")
    .select("payment_status").eq("id", booking.id).single();
  ok("a fully refunded job with a tip outstanding stays partial_refund",
     afterFull?.payment_status === "partial_refund", afterFull?.payment_status);

  // ---- the tip, when explicitly asked for -------------------------------
  const withTip = await refundBooking(booking.id, { includeTip: true, operationId: "tip" });
  ok("the tip refunds only on explicit request",
     withTip.ok && withTip.legs.some((l) => l.kind === "tip"), JSON.stringify(withTip));
  ok("the whole tip comes back", (await refunded(tipPi.id)) === TIP,
     `tip refunded ${await refunded(tipPi.id)}`);

  const { data: afterTip } = await admin.from("bookings")
    .select("payment_status").eq("id", booking.id).single();
  ok("only once BOTH charges are spent is the booking refunded",
     afterTip?.payment_status === "refunded", afterTip?.payment_status);

  // ---- ledger ------------------------------------------------------------
  const { data: rows } = await admin.from("refunds")
    .select("stripe_refund_id, amount_cents").eq("booking_id", booking.id);
  ok("every refund leg is recorded with its own Stripe id",
     (rows?.length ?? 0) === 4 && new Set(rows.map((r) => r.stripe_refund_id)).size === 4,
     `${rows?.length} rows`);

  // ---- nothing left -------------------------------------------------------
  const empty = await refundBooking(booking.id, { operationId: "empty" });
  ok("a refund with nothing left is refused clearly",
     !empty.ok && /already been fully refunded|Nothing is left/i.test(empty.message),
     JSON.stringify(empty));
} finally {
  await admin.from("refunds").delete().eq("booking_id", booking.id);
  await admin.from("bookings").delete().eq("id", booking.id);
  console.log(`\n  fixture booking ${booking.id} removed`);
}

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
