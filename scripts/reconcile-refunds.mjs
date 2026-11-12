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

/*
  KNOWING THE ID IS NOT THE SAME AS BEING UP TO DATE.

  This used to skip every refund whose processor id it had already
  seen — which is exactly the id of a PENDING row waiting to be
  advanced, and of an UNKNOWN one waiting to be identified. So the one
  script that could have rescued them walked straight past them, and a
  refund that completed hours after it was sent stayed "processing"
  for ever.

  Now a known id is still compared: if the processor's status differs
  from ours, or the row is flagged for reconciliation, it is ingested
  through the same function the webhook uses — which matches by id or
  by the operation id in the refund's metadata, updates the original
  request rather than inserting a stranger, preserves its leg and
  reason, clears the flag only when it actually identified the refund,
  and recomputes the booking from the ledger.
*/
const { data: existing } = await admin
  .from("refunds")
  .select("id, stripe_refund_id, status, processor_status, needs_reconciliation");
const known = new Map(
  (existing ?? []).filter((r) => r.stripe_refund_id).map((r) => [r.stripe_refund_id, r]),
);

let found = 0, missing = 0, written = 0, advanced = 0, agreed = 0;

for (const b of bookings ?? []) {
  for (const [kind, pi] of [["job", b.stripe_payment_intent_id], ["tip", b.tip_payment_intent_id]]) {
    if (!pi) continue;
    const list = await stripe(`refunds?payment_intent=${pi}&limit=100`);
    if (list.error) { console.error(`  ${pi}: ${list.error.message}`); continue; }

    for (const r of list.data ?? []) {
      found++;
      const leg = kind === "tip" ? "tip" : "service";
      const mine = known.get(r.id);

      if (mine) {
        /* Already recorded. Does it still say the same thing? */
        const stale = (mine.processor_status ?? null) !== (r.status ?? null)
          || mine.needs_reconciliation === true;
        if (!stale) { agreed++; continue; }
        console.log(`  STALE    booking ${b.id.slice(0, 8)}  ${leg}  ${r.id}  ours=${mine.processor_status ?? mine.status}  theirs=${r.status}${mine.needs_reconciliation ? "  (flagged)" : ""}`);
        if (!APPLY) continue;
        const { error: advErr } = await admin.rpc("ingest_refund_event", {
          p_processor_id: r.id,
          p_booking: b.id,
          p_leg: leg,
          p_amount_cents: r.amount,
          p_status: r.status ?? "pending",
          p_operation: r.metadata?.helpward_operation ?? null,
          p_reason: null,
        });
        if (advErr) console.error(`    could not advance: ${advErr.message}`);
        else advanced++;
        continue;
      }

      missing++;
      console.log(`  MISSING  booking ${b.id.slice(0, 8)}  ${kind}  ${r.id}  $${(r.amount / 100).toFixed(2)}  ${r.status}`);
      if (!APPLY) continue;

      /*
        THROUGH THE SAME DOOR AS THE WEBHOOK. Upserting directly here
        would bypass the matching that lets a refund find the request
        it belongs to — and would set a booking's status from one
        charge, which is the bug 0120 exists to stop.
      */
      const { error: insErr } = await admin.rpc("ingest_refund_event", {
        p_processor_id: r.id,
        p_booking: b.id,
        p_leg: leg,
        p_amount_cents: r.amount,
        p_status: r.status ?? "succeeded",
        p_operation: r.metadata?.helpward_operation ?? null,
        p_reason: r.reason ?? null,
      });
      if (insErr) console.error(`    could not write: ${insErr.message}`);
      else written++;
    }
  }
}

/*
  THE BOOKING FOLLOWS THE LEDGER, through the same function everything
  else uses.

  What was here carried two of the bugs this pass is removing: it
  compared the refunded total against `total_cents` ALONE, so a
  booking whose service charge was fully refunded was marked
  "refunded" while its tip was untouched; and it summed EVERY refund
  row regardless of status, so a request still awaiting review — or
  one that failed — counted as money returned.
*/
if (APPLY) {
  for (const b of bookings ?? []) {
    const { data: rows } = await admin.from("refunds")
      .select("id").eq("booking_id", b.id).limit(1);
    if (!rows?.length) continue;
    const { error: recErr } = await admin.rpc("recompute_booking_payment_status", {
      p_booking: b.id,
    });
    if (recErr) console.error(`  could not recompute booking ${b.id.slice(0, 8)}: ${recErr.message}`);
  }
}

console.log(
  `\n  ${found} refunds at Stripe · ${agreed} already agree · ` +
  `${missing} missing from the ledger · ${written} written · ${advanced} advanced`,
);
if ((missing > 0 || advanced === 0) && !APPLY && (missing > 0 || found > agreed)) {
  console.log("  Re-run with --apply to record and advance them.\n");
} else {
  console.log("");
}
