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

  /*
    THE EVENT IS RECORDED BEFORE IT IS ACTED ON.

    Everything below used to ignore its own errors and the catch
    returned 200, so an event that could not be written was told to
    Stripe as handled and never came back. Now the verified event is
    stored first, keyed by Stripe's own id, and `processed_at` is only
    stamped once the work succeeded. A failure returns 500, which is
    Stripe's signal to retry — and the retry is safe precisely because
    this row makes repeated delivery idempotent.
  */
  const { error: recordError } = await admin
    .from("stripe_webhook_events")
    .upsert({
      id: event.id,
      type: event.type,
      livemode: event.livemode,
      payload: event.data.object as unknown as Record<string, unknown>,
    }, { onConflict: "id" });
  if (recordError) {
    console.error("STRIPE EVENT NOT RECORDED", { id: event.id, type: event.type, recordError });
    return NextResponse.json(
      { ok: false, reason: "not_recorded", retry: true },
      { status: 500 },
    );
  }
  await admin.rpc("bump_webhook_attempt", { p_event: event.id });

  /*
    REFUND EVENTS GO THROUGH ONE PATH.

    `charge.refunded` fires for a PARTIAL refund as readily as a full
    one, which is how CA$5.00 back on a CA$224.50 charge came to mark
    the whole booking refunded. Nothing here decides a booking's state
    from one event any more: the refund is recorded as the processor
    describes it and the booking is recomputed from the ledger, across
    both the service charge and the tip.
  */
  const ingestRefund = async (refund: Stripe.Refund) => {
    const intentId = typeof refund.payment_intent === "string"
      ? refund.payment_intent
      : refund.payment_intent?.id ?? null;
    if (!intentId) return { skipped: "no_intent" as const };

    const { data: booking, error: lookupError } = await admin
      .from("bookings")
      .select("id, stripe_payment_intent_id, tip_payment_intent_id")
      .or(`stripe_payment_intent_id.eq.${intentId},tip_payment_intent_id.eq.${intentId}`)
      .maybeSingle();
    if (lookupError) throw lookupError;
    if (!booking) return { skipped: "no_booking" as const };

    const row = booking as unknown as {
      id: string; stripe_payment_intent_id: string | null; tip_payment_intent_id: string | null;
    };
    /* WHICH CHARGE IT WAS, from the intent it names — not from a
       metadata field a dashboard refund would not carry. */
    const leg = row.tip_payment_intent_id === intentId ? "tip" : "service";

    const { error: ingestError } = await admin.rpc("ingest_refund_event", {
      p_processor_id: refund.id,
      p_booking: row.id,
      p_leg: leg,
      p_amount_cents: refund.amount,
      p_status: refund.status ?? "pending",
      p_operation: (refund.metadata?.helpward_operation as string | undefined) ?? null,
      p_reason: null,
    });
    if (ingestError) throw ingestError;
    return { ingested: true as const };
  };

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
      /*
        A CHARGE EVENT CARRIES EVERY REFUND ON THAT CHARGE, so each one
        is ingested and the booking is recomputed from the ledger. The
        charge's own `refunded` flag is deliberately not used to set a
        booking's status: it describes ONE charge, and a booking has
        two.
      */
      case "charge.refunded": {
        const charge = event.data.object as Stripe.Charge;
        for (const refund of charge.refunds?.data ?? []) {
          await ingestRefund(refund);
        }
        /* An older charge payload can arrive without the expanded
           refunds list. Recomputing from the ledger is still correct;
           inventing "refunded" from the flag is not. */
        if (!charge.refunds?.data?.length && charge.payment_intent) {
          const intentId = String(charge.payment_intent);
          const { data: booking, error } = await admin
            .from("bookings")
            .select("id")
            .or(`stripe_payment_intent_id.eq.${intentId},tip_payment_intent_id.eq.${intentId}`)
            .maybeSingle();
          if (error) throw error;
          if (booking) {
            const { error: recomputeError } = await admin.rpc(
              "recompute_booking_payment_status",
              { p_booking: (booking as { id: string }).id },
            );
            if (recomputeError) throw recomputeError;
          }
        }
        break;
      }

      /*
        THE LIFECYCLE THAT WAS MISSING ENTIRELY. A refund Stripe is
        still working on finishes here — or fails here — and before
        this there was no branch at all: the event was acknowledged
        with 200 and nothing was written, so a pending refund stayed
        pending for ever.
      */
      case "refund.created":
      case "refund.updated":
      case "refund.failed": {
        await ingestRefund(event.data.object as Stripe.Refund);
        break;
      }

      /* Stripe's older name for the same thing. */
      case "charge.refund.updated": {
        await ingestRefund(event.data.object as Stripe.Refund);
        break;
      }
      /*
        A CHARGEBACK IS THE BANK'S DISPUTE, NOT OURS.

        The header of this file has claimed to handle this event since
        it was written, and nothing did. It now opens a case in the
        safety console so somebody is accountable for answering it —
        but as its own thing: the case carries stripe_dispute_id, the
        console badges it a chargeback, and nothing here changes the
        booking's payment_status. Stripe decides that one on its own
        timetable, and overwriting it from here would make the money
        screen disagree with the processor.
      */
      case "charge.dispute.created": {
        const dispute = event.data.object as Stripe.Dispute;
        const paymentIntent = dispute.payment_intent ? String(dispute.payment_intent) : null;

        const { data: booking } = paymentIntent
          ? await admin
              .from("bookings")
              .select("id, customer_id, provider_id")
              .eq("stripe_payment_intent_id", paymentIntent)
              .maybeSingle()
          : { data: null };

        // One case per chargeback, however many times Stripe retries.
        const { data: already } = await admin
          .from("disputes")
          .select("id")
          .eq("stripe_dispute_id", dispute.id)
          .maybeSingle();

        if (!already) {
          await admin.from("disputes").insert({
            booking_id: booking?.id ?? null,
            customer_id: booking?.customer_id ?? null,
            helper_id: booking?.provider_id ?? null,
            opened_by: booking?.customer_id ?? null,
            kind: "service",
            category: "billing",
            priority: "urgent",
            source: "other",
            status: "open",
            stripe_dispute_id: dispute.id,
            reported_by_name: "Stripe (card issuer)",
            description:
              `The card issuer opened a chargeback for ${(dispute.amount / 100).toFixed(2)} ` +
              `${dispute.currency.toUpperCase()}. Stripe's reason: ${dispute.reason}. ` +
              `Evidence is due to Stripe by their deadline, which is set on their side, not ours.`,
          });
        }
        break;
      }
      // Other event types ignored for now
    }
  } catch (err) {
    /*
      A FAILURE IS NOT AN ACKNOWLEDGEMENT.

      This used to return 200 on any error, to avoid retry storms. The
      cost of that was silence: an event that could not be recorded was
      gone, and the money screen simply never learned what the
      processor had done. The event row above is stored and
      unprocessed, so Stripe's retry re-runs it safely, and anything
      that never succeeds is visible rather than lost.
    */
    const message = err instanceof Error ? err.message : String(err);
    console.error("stripe webhook handler error:", { id: event.id, type: event.type, err });
    await admin
      .from("stripe_webhook_events")
      .update({ last_error: message.slice(0, 500) })
      .eq("id", event.id);
    return NextResponse.json(
      { ok: false, reason: "handler_failed", retry: true },
      { status: 500 },
    );
  }

  /* Only now is it handled. */
  const { error: doneError } = await admin
    .from("stripe_webhook_events")
    .update({ processed_at: new Date().toISOString(), last_error: null })
    .eq("id", event.id);
  if (doneError) {
    console.error("STRIPE EVENT PROCESSED BUT NOT MARKED", { id: event.id, doneError });
    /* The work succeeded; saying otherwise would make Stripe repeat
       it. It is idempotent, but a loud log beats a silent lie. */
  }

  return NextResponse.json({ ok: true });
}
