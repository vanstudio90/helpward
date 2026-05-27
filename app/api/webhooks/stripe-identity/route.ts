import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { getStripe, stripeConfigured } from "@/lib/stripe";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

/* Stripe Identity webhook — fires when a provider's ID verification completes.
 * Events: identity.verification_session.verified, identity.verification_session.requires_input
 * Endpoint: https://helpward.com/api/webhooks/stripe-identity
 * Signing secret: STRIPE_IDENTITY_WEBHOOK_SECRET
 */
export async function POST(req: NextRequest) {
  if (!stripeConfigured()) {
    return NextResponse.json({ ok: false, reason: "stripe_not_configured" }, { status: 503 });
  }
  const secret = process.env.STRIPE_IDENTITY_WEBHOOK_SECRET;
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

  if (event.type === "identity.verification_session.verified") {
    const session = event.data.object as Stripe.Identity.VerificationSession;
    await admin
      .from("provider_profiles")
      .update({
        id_verified_at: new Date().toISOString(),
        stripe_identity_verification_id: session.id,
      })
      .eq("stripe_identity_verification_id", session.id);
  }

  return NextResponse.json({ ok: true });
}
