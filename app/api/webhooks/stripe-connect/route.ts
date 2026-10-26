import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { getStripe, stripeConfigured, canReceiveTransfers, readConnectReadiness } from "@/lib/stripe";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

/* Stripe Connect events — helper payout readiness.
 *
 * Endpoint: https://helpward.com/api/webhooks/stripe-connect
 * Secret:   STRIPE_CONNECT_WEBHOOK_SECRET  (a DIFFERENT secret from the
 *           payments webhook; Stripe issues one per endpoint)
 * Events:   account.updated, payout.paid, payout.failed
 *
 * account.updated is the event that tells Helpward a helper has finished
 * onboarding. Until migration 0040 there was nowhere to write it: the
 * handler called .update({}) with the intent left in a comment, so a helper
 * could complete Stripe's forms and still never become dispatchable.
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
    return NextResponse.json(
      { ok: false, reason: "bad_signature", message: (err as Error).message },
      { status: 400 },
    );
  }

  const admin = createSupabaseServiceClient();

  try {
    switch (event.type) {
      case "account.updated": {
        const account = event.data.object as Stripe.Account;
        const readiness = readConnectReadiness(account);
        const payable = canReceiveTransfers(account);

        // The event payload is used directly rather than re-fetching: it is
        // already the account's state at the moment Stripe sent it, and a
        // re-fetch would race other updates.
        const { data: updated, error } = await admin
          .from("provider_profiles")
          .update({
            stripe_charges_enabled: readiness.chargesEnabled,
            stripe_payouts_enabled: readiness.payoutsEnabled,
            stripe_details_submitted: readiness.detailsSubmitted,
            stripe_transfers_active: payable,
            stripe_requirements_due: readiness.currentlyDue,
            stripe_disabled_reason: readiness.disabledReason,
          })
          .eq("stripe_connect_account_id", account.id)
          .select("user_id, stripe_onboarded_at");

        if (error) throw error;
        if (!updated?.length) {
          // An account we have no helper for. Worth knowing about: it
          // means startHelperOnboarding created an account and failed to
          // persist it, which would strand whatever the helper entered.
          console.error("account.updated for unknown connect account", account.id);
          break;
        }

        const profile = updated[0];
        // Stamp the first time they became payable, and tell them — a
        // helper who finished onboarding yesterday should not have to
        // guess whether it went through.
        if (payable && !profile.stripe_onboarded_at) {
          await admin
            .from("provider_profiles")
            .update({ stripe_onboarded_at: new Date().toISOString() })
            .eq("user_id", profile.user_id);
          await admin.from("notifications").insert({
            user_id: profile.user_id,
            type: "payouts_ready",
            payload: { account_id: account.id },
          });
        }

        // Stripe disabling an account mid-flight is the case that silently
        // breaks dispatch, so it is recorded as an admin-visible event.
        if (readiness.disabledReason) {
          console.warn("connect account disabled", account.id, readiness.disabledReason);
        }
        break;
      }

      case "payout.paid":
      case "payout.failed": {
        const payout = event.data.object as Stripe.Payout;
        await admin
          .from("payouts")
          .update({
            status: event.type === "payout.paid" ? "paid" : "failed",
            arrival_date: new Date(payout.arrival_date * 1000).toISOString().slice(0, 10),
          })
          .eq("stripe_transfer_id", payout.id);
        break;
      }
    }
  } catch (err) {
    // Ack with 200 so Stripe doesn't retry forever — the signature is
    // verified above, so the event is authentic and the failure is ours.
    console.error("stripe-connect webhook handler error:", err);
    return NextResponse.json({ ok: true, warning: "handler_error_logged" });
  }

  return NextResponse.json({ ok: true });
}
