import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getStripe, stripeConfigured } from "@/lib/stripe";
import type Stripe from "stripe";

/* Receipt for a paid booking.
 *
 * Redirects to the Stripe-hosted receipt rather than rendering one here.
 * It is the authoritative record of what was charged, it already reflects
 * refunds, and it needs no template to drift out of date.
 *
 * The "Download receipt" button on /payments was previously inert — it
 * rendered, it was clickable, and it did nothing.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ bookingId: string }> },
) {
  const { bookingId } = await params;
  if (!stripeConfigured()) {
    return NextResponse.json({ error: "Receipts are not available yet." }, { status: 503 });
  }

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL(`/login?next=/payments`, req.url));

  // RLS limits this to bookings the viewer is a party to; the explicit
  // customer check keeps a helper from pulling their customer's receipt.
  const { data: booking } = await supabase
    .from("bookings")
    .select("id, customer_id, stripe_charge_id, stripe_payment_intent_id, payment_status")
    .eq("id", bookingId)
    .maybeSingle();

  if (!booking || booking.customer_id !== user.id) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  if (!["captured", "refunded", "partial_refund"].includes(booking.payment_status)) {
    return NextResponse.json(
      { error: "This booking has not been charged, so there is no receipt." },
      { status: 409 },
    );
  }

  try {
    const stripe = getStripe();
    let receiptUrl: string | null = null;

    if (booking.stripe_charge_id) {
      const charge = await stripe.charges.retrieve(booking.stripe_charge_id);
      receiptUrl = charge.receipt_url ?? null;
    } else if (booking.stripe_payment_intent_id) {
      // Older bookings captured before stripe_charge_id was recorded.
      const intent = await stripe.paymentIntents.retrieve(
        booking.stripe_payment_intent_id, { expand: ["latest_charge"] });
      const charge = intent.latest_charge as Stripe.Charge | string | null;
      receiptUrl = charge && typeof charge !== "string" ? charge.receipt_url ?? null : null;
    }

    if (!receiptUrl) {
      return NextResponse.json(
        { error: "Stripe has not issued a receipt for this charge yet." },
        { status: 404 },
      );
    }
    return NextResponse.redirect(receiptUrl);
  } catch (err) {
    console.error("receipt lookup failed", bookingId, err);
    return NextResponse.json({ error: "Could not fetch that receipt." }, { status: 502 });
  }
}
