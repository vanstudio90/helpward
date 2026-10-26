#!/usr/bin/env node
// Finds bookings where Stripe holds the money and Helpward does not know.
//
// The gap: the bank approves, the connection drops before the app
// records it, and from then on the customer is told the payment is
// already confirmed while the helper's Start button stays disabled.
// Three things now close it — the confirmation page repairs on load, the
// amount_capturable_updated webhook arrives independently, and this, for
// anything both of those missed.
//
// READS Stripe, writes only the booking's payment state. Creates no
// charge and no hold.
//
// Usage:  node scripts/reconcile-holds.mjs [--apply]
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(".env.rehearsal", "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]));

const APPLY = process.argv.includes("--apply");
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } });

const stripe = async (path) => (await fetch(`https://api.stripe.com/v1/${path}`, {
  headers: { Authorization: `Basic ${Buffer.from(env.STRIPE_SECRET_KEY + ":").toString("base64")}` },
})).json();

console.log(`\nHold reconciliation ${APPLY ? "(APPLYING)" : "(dry run — pass --apply to write)"}\n`);

// Only bookings that think they are unpaid but carry an intent. A booking
// with no intent never reached Stripe and has nothing to reconcile.
const { data: suspects, error } = await admin
  .from("bookings")
  .select("id, status, payment_status, stripe_payment_intent_id, total_cents, currency")
  .in("payment_status", ["pending", "failed"])
  .not("stripe_payment_intent_id", "is", null);
if (error) { console.error(error.message); process.exit(1); }

let stranded = 0, repaired = 0;

for (const b of suspects ?? []) {
  const pi = await stripe(`payment_intents/${b.stripe_payment_intent_id}`);
  if (pi.error) { console.error(`  ${b.id.slice(0, 8)}: ${pi.error.message}`); continue; }

  if (pi.status !== "requires_capture" && pi.status !== "succeeded") continue;

  stranded++;
  console.log(`  STRANDED  booking ${b.id.slice(0, 8)}  ${b.payment_status} -> authorized` +
              `  (Stripe: ${pi.status}, ${(pi.amount / 100).toFixed(2)} ${b.currency})`);
  if (!APPLY) continue;

  const { error: upErr } = await admin
    .from("bookings")
    .update({
      payment_status: pi.status === "succeeded" ? "captured" : "authorized",
      authorized_at: new Date().toISOString(),
      payment_error: null,
    })
    .eq("id", b.id);
  if (upErr) console.error(`    could not repair: ${upErr.message}`);
  else repaired++;
}

console.log(`\n  ${suspects?.length ?? 0} unpaid bookings with an intent · ${stranded} stranded · ${repaired} repaired`);
console.log(stranded && !APPLY ? "  Re-run with --apply to repair them.\n" : "\n");
