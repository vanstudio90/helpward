import { withBearerAuth } from "@/lib/api/bearer";
import { voidBookingAuthorization } from "@/lib/payments";
import { stripeConfigured } from "@/lib/stripe";

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
      .select("id, status, payment_status, total_cents, currency")
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
      THERE IS NO CANCELLATION FEE, because nothing implements one.

      cancel_booking() charges nothing, and the void releases the whole
      hold. So zero is not a placeholder here — it is what will actually
      happen to this customer's money.

      It is returned by the SERVER rather than assumed by the app, so the
      day a fee policy does exist there is exactly one place to put it and
      the app cannot keep promising zero.

      NOTE: the help article "cancel-or-reschedule-a-booking" says "a small
      cancellation fee may apply close to the scheduled time". No code
      charges one. The article and the system disagree, and the system is
      what the customer's card will follow.
    */
    const feeCents = 0;
    const holdReleaseCents =
      booking.payment_status === "authorized" ? booking.total_cents : 0;

    return Response.json({
      cancellationFeeCents: feeCents,
      chargeCents: feeCents,
      holdReleaseCents,
      currency: booking.currency,
      holdExists: booking.payment_status === "authorized",
      // Honest about the part Helpward does not control.
      note: holdReleaseCents > 0
        ? "We release the hold immediately. How quickly it disappears from your statement is up to your bank."
        : "No money is being held for this booking, so there is nothing to release.",
    });
  })(request);
}

/** Actually cancel. */
export async function POST(request: Request, context: Context) {
  const { id } = await context.params;
  return withBearerAuth(async ({ supabase }) => {
    let reason: string | null = null;
    try {
      const body = await request.json();
      const raw = typeof body?.reason === "string" ? body.reason.trim() : "";
      reason = raw ? raw.slice(0, 200) : null;
    } catch {
      // A cancellation with no body is a cancellation with no reason.
    }

    // Run as the CALLER: cancel_booking checks auth.uid() against the
    // booking's customer, provider or an admin role itself.
    const { error } = await supabase.rpc("cancel_booking", {
      p_booking_id: id,
      p_reason: reason,
    });
    if (error) {
      return Response.json({ error: error.message }, { status: 400 });
    }

    // Release the hold rather than refunding it.
    let released = false;
    let releaseProblem: string | null = null;
    if (stripeConfigured()) {
      const result = await voidBookingAuthorization(id);
      released = result.ok;
      if (!result.ok && result.code !== "already_captured") {
        console.error("could not void authorization on cancel", id, result);
        releaseProblem = result.message || "The hold could not be released automatically.";
      }
    } else {
      releaseProblem = null; // Nothing was ever held.
    }

    /*
      The booking IS cancelled even when the void failed, and the response
      says so separately. Reporting a failed release as a failed
      cancellation would invite someone to cancel twice; hiding it would
      leave money held with nobody aware.
    */
    return Response.json({ cancelled: true, holdReleased: released, releaseProblem });
  })(request);
}
