#!/usr/bin/env node
// Brings the refunds ledger back in line with Stripe.
//
// A $10 refund succeeded at Stripe and was never recorded: refunds.status
// is NOT NULL and the insert omitted it, so the ledger write failed while
// the money had already moved. The customer's spending total went on
// showing an amount that was back on their card.
//
// READS Stripe, WRITES only the ledger. It never creates a refund — a
// repair script that could move money is a repair script that will.
// Upserts by Stripe refund id, so running it twice changes nothing.
//
// Usage:  node scripts/reconcile-refunds.mjs [--apply]
//         (default is a dry run)
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(".env.rehearsal", "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]));

const APPLY = process.argv.includes("--apply");
const SK = env.STRIPE_SECRET_KEY;
if (!SK) { console.error("STRIPE_SECRET_KEY missing."); process.exit(1); }

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } });

const stripe = async (path) => (await fetch(`https://api.stripe.com/v1/${path}`, {
  headers: { Authorization: `Basic ${Buffer.from(SK + ":").toString("base64")}` },
})).json();

console.log(`\nRefund reconciliation ${APPLY ? "(APPLYING)" : "(dry run — pass --apply to write)"}\n`);

// Every booking that has ever been charged, and its tip charge too: the
// tip is a separate PaymentIntent and its refunds live on that one.
const { data: bookings, error } = await admin
  .from("bookings")
  .select("id, stripe_payment_intent_id, tip_payment_intent_id")
  .or("stripe_payment_intent_id.not.is.null,tip_payment_intent_id.not.is.null");
if (error) { console.error(error.message); process.exit(1); }

const { data: existing } = await admin.from("refunds").select("stripe_refund_id");
const known = new Set((existing ?? []).map((r) => r.stripe_refund_id).filter(Boolean));

let found = 0, missing = 0, written = 0;

for (const b of bookings ?? []) {
  for (const [kind, pi] of [["job", b.stripe_payment_intent_id], ["tip", b.tip_payment_intent_id]]) {
    if (!pi) continue;
    const list = await stripe(`refunds?payment_intent=${pi}&limit=100`);
    if (list.error) { console.error(`  ${pi}: ${list.error.message}`); continue; }

    for (const r of list.data ?? []) {
      found++;
      if (known.has(r.id)) continue;
      missing++;
      console.log(`  MISSING  booking ${b.id.slice(0, 8)}  ${kind}  ${r.id}  $${(r.amount / 100).toFixed(2)}  ${r.status}`);
      if (!APPLY) continue;

      const { error: insErr } = await admin.from("refunds").upsert({
        booking_id: b.id,
        stripe_refund_id: r.id,
        amount_cents: r.amount,
        reason: r.reason ?? "requested_by_customer",
        status: r.status ?? "succeeded",
      }, { onConflict: "stripe_refund_id" });
      if (insErr) console.error(`    could not write: ${insErr.message}`);
      else written++;
    }
  }
}

// A booking's payment_status must agree with what Stripe says is left.
if (APPLY) {
  for (const b of bookings ?? []) {
    if (!b.stripe_payment_intent_id) continue;
    const { data: rows } = await admin.from("refunds")
      .select("amount_cents").eq("booking_id", b.id);
    const refundedHere = (rows ?? []).reduce((n, r) => n + r.amount_cents, 0);
    if (refundedHere === 0) continue;

    const { data: booking } = await admin.from("bookings")
      .select("total_cents, payment_status").eq("id", b.id).single();
    if (!booking || !["captured", "partial_refund", "refunded"].includes(booking.payment_status)) continue;

    const want = refundedHere >= booking.total_cents ? "refunded" : "partial_refund";
    if (booking.payment_status !== want) {
      await admin.from("bookings").update({ payment_status: want }).eq("id", b.id);
      console.log(`  STATUS   booking ${b.id.slice(0, 8)}  ${booking.payment_status} -> ${want}`);
    }
  }
}

console.log(`\n  ${found} refunds at Stripe · ${missing} missing from the ledger · ${written} written`);
if (missing > 0 && !APPLY) console.log(`  Re-run with --apply to record them.\n`);
else console.log("");
