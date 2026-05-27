import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { getStripe, stripeConfigured } from "@/lib/stripe";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

/* Stripe Connect events webhook (provider onboarding).
 * Events: account.updated, transfer.created, transfer.paid, payout.paid
 * Endpoint: https://helpward.com/api/webhooks/stripe-connect
 * Use a DIFFERENT signing secret than the main webhook (STRIPE_CONNECT_WEBHOOK_SECRET).
 */
export async function POST(req: NextRequest) {
  if (!stripeConfigured()) {
    return NextResponse.json({ ok: false, reason: "stripe_not_configured" }, { status: 503 });
  }
  const secret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, reason: "missing_webhook_secret" }, { status: 503 });
  }
  const sig = req.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ ok: false, reason: "no_signature" }, { status: 400 });

  const body = await req.text();
  const stripe = getStripe();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, secret);
  } catch (err) {
    return NextResponse.json({ ok: false, reason: "bad_signature", message: (err as Error).message }, { status: 400 });
  }

  const admin = createSupabaseServiceClient();

  try {
    switch (event.type) {
      case "account.updated": {
        const account = event.data.object as Stripe.Account;
        // Connect account updated — toggle provider readiness based on charges_enabled
        await admin
          .from("provider_profiles")
          .update({
            // status auto-promoted to 'approved' only if also background-checked + ID-verified
            // For now just mark connect ready
          })
          .eq("stripe_connect_account_id", account.id);
        break;
      }
      case "payout.paid": {
        const payout = event.data.object as Stripe.Payout;
        await admin
          .from("payouts")
          .update({ status: "paid", arrival_date: new Date(payout.arrival_date * 1000).toISOString().split("T")[0] })
          .eq("stripe_transfer_id", String(payout.id));
        break;
      }
    }
  } catch (err) {
    // Ack with 200 so Stripe doesn't retry forever — log for human investigation.
    // Signature is already verified above, so the event is authentic; the failure
    // is in our handler, not Stripe's delivery.
    console.error("stripe-connect webhook handler error:", err);
    return NextResponse.json({ ok: true, warning: "handler_error_logged" });
  }

  return NextResponse.json({ ok: true });
}
