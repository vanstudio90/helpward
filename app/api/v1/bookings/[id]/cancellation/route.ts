import { withBearerAuth } from "@/lib/api/bearer";
import { cancellationFeeFor } from "@/lib/cancellation";
import { performCancellation } from "@/lib/cancel-booking";

/*
  Cancelling a booking from the native app.

  Mirrors `cancelBookingAction`, and the reason it is a route rather than a
  direct RPC call from the app is the second half of that action:

    1. cancel_booking()        — sets the status, notifies the other party
    2. voidBookingAuthorization() — RELEASES THE STRIPE HOLD

  Step 2 is not in the function. An app that called only the RPC would
  cancel the booking and leave the money authorised against the customer's
  card, with nothing left to release it. Stripe is server-side only, so the
  pair has to happen here.

  A VOID, not a refund: a void never reaches the customer's statement,
  while a refund appears as a charge and then a credit days later — which
  reads as being charged for a job that never happened.
*/

type Context = { params: Promise<{ id: string }> };

/** What cancelling would do, before anyone commits to it. */
export async function GET(request: Request, context: Context) {
  const { id } = await context.params;
  return withBearerAuth(async ({ supabase }) => {
    const { data: booking } = await supabase
      .from("bookings")
      .select("id, status, payment_status, total_cents, currency, captured_at, created_at")
      .eq("id", id)
      .maybeSingle();

    if (!booking) {
      return Response.json({ error: "Booking not found." }, { status: 404 });
    }
    if (!["scheduled", "in_progress"].includes(booking.status)) {
      return Response.json(
        { error: `This booking can't be cancelled — it is ${booking.status}.` },
        { status: 409 },
      );
    }

    /*
      THERE IS A CANCELLATION FEE NOW, and this is where the app learns
      what it is.

      This used to return a hard zero, with a note that the help
      article already promised "a small cancellation fee may apply".
      The article and the system disagreed and the system won, because
      the system is what the customer's card follows. They agree now:
      a helper who has taken the job is owed something for the slot,
      and it is 10% of the booking.

      The figure comes from the same function the website uses. The app
      must show it before cancelling and send it back on the POST,
      which refuses anything that does not match.
    */
    const fee = cancellationFeeFor(booking, booking.currency ?? "CAD");
    const holdReleaseCents =
      booking.payment_status === "authorized"
        ? Math.max(0, (booking.total_cents ?? 0) - fee.cents)
        : 0;

    return Response.json({
      cancellationFeeCents: fee.cents,
      cancellationFeeRate: fee.rate,
      chargeCents: fee.cents,
      /** Show this to the customer verbatim; it is already in money. */
      explanation: fee.explanation,
      because: fee.because,
      /** True when the money is already taken and this is a refund. */
      alreadyCharged: fee.alreadyCharged,
      holdReleaseCents,
      currency: booking.currency,
      holdExists: booking.payment_status === "authorized",
      // Honest about the part Helpward does not control.
      note: holdReleaseCents > 0
        ? "We release the rest of the hold immediately. How quickly it disappears from your statement is up to your bank."
        : fee.alreadyCharged
          ? "This booking has already been charged. The balance is returned to your card."
          : "No money is being held for this booking, so there is nothing to release.",
    });
  })(request);
}

/** Actually cancel. */
export async function POST(request: Request, context: Context) {
  const { id } = await context.params;
  return withBearerAuth(async ({ supabase, user }) => {
    let reason: string | null = null;
    let acceptedFeeCents: number | undefined;
    try {
      const body = await request.json();
      const raw = typeof body?.reason === "string" ? body.reason.trim() : "";
      reason = raw ? raw.slice(0, 200) : null;
      /*
        THE APP HAS TO SEND BACK WHAT IT SHOWED. The server checks it
        against the fee as it stands right now, so a screen left open
        while the job started cannot authorise yesterday's figure.
      */
      if (typeof body?.acceptedFeeCents === "number") {
        acceptedFeeCents = Math.round(body.acceptedFeeCents);
      }
    } catch {
      // A cancellation with no body is a cancellation with no reason.
    }

    const outcome = await performCancellation({
      supabase, bookingId: id, actorId: user.id, reason, acceptedFeeCents,
    });

    if (outcome.needsAcceptance) {
      /*
        409, not 400: nothing is wrong with the request, the customer
        simply has not agreed to this amount yet. The fee goes back so
        the app can show it and ask.
      */
      return Response.json({
        error: outcome.error
          ?? "This cancellation has a fee. Show it to the customer and send back acceptedFeeCents to confirm.",
        cancellationFeeCents: outcome.fee.cents,
        explanation: outcome.fee.explanation,
        because: outcome.fee.because,
      }, { status: 409 });
    }
    if (outcome.error) {
      return Response.json({ error: outcome.error }, { status: 400 });
    }

    /*
      The booking IS cancelled even when the money step had a problem,
      and the response says so separately. Reporting a failed release
      as a failed cancellation would invite someone to cancel twice;
      hiding it would leave money moved with nobody aware.
    */
    return Response.json({
      cancelled: true,
      cancellationFeeChargedCents: outcome.chargedCents,
      holdReleasedCents: outcome.holdReleasedCents,
      holdReleased: outcome.holdReleasedCents > 0,
      note: outcome.note ?? null,
    });
  })(request);
}
