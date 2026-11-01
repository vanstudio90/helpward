import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { getStripe, stripeConfigured } from "@/lib/stripe";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

/* Stripe payment events webhook.
 * Add the endpoint to Stripe dashboard → Developers → Webhooks:
 *   URL: https://helpward.com/api/webhooks/stripe
 *   Events: payment_intent.succeeded, payment_intent.payment_failed,
 *           charge.refunded, charge.dispute.created
 * Copy the signing secret into STRIPE_WEBHOOK_SECRET on Vercel.
 */
export async function POST(req: NextRequest) {
  if (!stripeConfigured()) {
    return NextResponse.json({ ok: false, reason: "stripe_not_configured" }, { status: 503 });
  }

  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, reason: "missing_webhook_secret" }, { status: 503 });
  }

  const sig = req.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ ok: false, reason: "no_signature" }, { status: 400 });

  const body = await req.text();
  const stripe = getStripe();

  /*
    TWO SIGNING SECRETS, because there are two Stripe modes.

    App Review bookings transact in test mode, and Stripe signs a
    test-mode event with the TEST endpoint's secret. Verifying only
    against the live secret would reject every review event as a bad
    signature — so a review booking would never see its hold confirmed
    or its capture reconciled, and the reviewer would be stuck on a
    payment that silently never settled.

    Live is tried first, so the ordinary path is unchanged and costs
    nothing. The test secret is only consulted when the live one
    rejects, and only if it is configured at all.

    This is NOT a loosening: each event still has to carry a valid
    signature for one of the two endpoints we own. An unsigned or
    wrongly-signed event is refused exactly as before.
  */
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, secret);
  } catch (liveErr) {
    const testSecret = process.env.STRIPE_TEST_WEBHOOK_SECRET;
    if (!testSecret) {
      return NextResponse.json(
        { ok: false, reason: "bad_signature", message: (liveErr as Error).message },
        { status: 400 },
      );
    }
    try {
      event = stripe.webhooks.constructEvent(body, sig, testSecret);
    } catch {
      return NextResponse.json(
        { ok: false, reason: "bad_signature", message: (liveErr as Error).message },
        { status: 400 },
      );
    }
    // A live-mode event must never arrive signed by the test endpoint.
    if (event.livemode) {
      return NextResponse.json({ ok: false, reason: "mode_mismatch" }, { status: 400 });
    }
  }

  const admin = createSupabaseServiceClient();

  try {
    switch (event.type) {
      // Stripe telling us a hold is in place. This is the durable half of
      // the recovery: if the browser dies between bank approval and the
      // app recording it, this arrives anyway and unblocks the booking
      // without anyone having to press retry.
      case "payment_intent.amount_capturable_updated": {
        const pi = event.data.object as Stripe.PaymentIntent;
        const { error } = await admin
          .from("bookings")
          .update({
            payment_status: "authorized",
            authorized_at: new Date().toISOString(),
            payment_error: null,
          })
          .eq("stripe_payment_intent_id", pi.id)
          .in("payment_status", ["pending", "failed"]);
        if (error) throw error;
        break;
      }

      case "payment_intent.canceled": {
        const pi = event.data.object as Stripe.PaymentIntent;
        await admin
          .from("bookings")
          .update({ payment_status: "pending", authorized_at: null })
          .eq("stripe_payment_intent_id", pi.id)
          .neq("payment_status", "captured");
        break;
      }

      case "payment_intent.succeeded": {
        const pi = event.data.object as Stripe.PaymentIntent;
        await admin
          .from("bookings")
          .update({ payment_status: "captured" })
          .eq("stripe_payment_intent_id", pi.id);
        break;
      }
      case "payment_intent.payment_failed": {
        const pi = event.data.object as Stripe.PaymentIntent;
        await admin
          .from("bookings")
          .update({ payment_status: "failed" })
          .eq("stripe_payment_intent_id", pi.id);
        break;
      }
      case "charge.refunded": {
        const charge = event.data.object as Stripe.Charge;
        if (charge.payment_intent) {
          await admin
            .from("bookings")
            .update({ payment_status: "refunded" })
            .eq("stripe_payment_intent_id", String(charge.payment_intent));
        }
        break;
      }
      // Other event types ignored for now
    }
  } catch (err) {
    // Ack with 200 to prevent Stripe retry storms — signature is verified above,
    // so the event is authentic; any failure here is on our side.
    console.error("stripe webhook handler error:", err);
    return NextResponse.json({ ok: true, warning: "handler_error_logged" });
  }

  return NextResponse.json({ ok: true });
}
