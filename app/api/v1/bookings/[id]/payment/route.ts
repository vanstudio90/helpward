import { withBearerAuth } from "@/lib/api/bearer";
import { pendingAuthorizationSecret, confirmPendingAuthorization } from "@/lib/payments";

/*
  THE CUSTOMER'S HALF OF A BANK CONFIRMATION, FROM THE APP.

  When a card needs 3-D Secure, accepting a request authorises nothing:
  the route returns needsCustomerConfirmation, the booking sits on
  `pending`, and the helper's Start button is correctly disabled until the
  customer answers their bank. The website has had that answer since
  `confirm-payment` existed. The app had nowhere to give it — the booking
  simply read "Awaiting payment" with no way to act, which is a job that
  can never start and money that is never held.

  This is the same pair of server helpers the web Server Actions call, so
  there is one implementation of what a confirmation means:

    GET   pendingAuthorizationSecret  — the secret for THIS customer's
                                        pending intent, plus the card to
                                        confirm it with. The card is
                                        resolved server-side from their
                                        own saved cards and is never
                                        taken from the caller: a client
                                        that could name the card would be
                                        choosing what gets charged.

    POST  confirmPendingAuthorization — re-reads the intent FROM STRIPE
                                        and writes the result down.

  THE APP NEVER SAYS "IT WORKED". It says "I finished"; the server asks
  Stripe. A client that could assert its own authorization is the hole the
  whole payment design exists to close.
*/

type Context = { params: Promise<{ id: string }> };

/** Hand the customer the secret for their own pending payment. */
export async function GET(request: Request, context: Context) {
  const { id } = await context.params;
  return withBearerAuth(async ({ user }) => {
    const pending = await pendingAuthorizationSecret(id, user.id);

    if (!pending.ok) {
      /*
        `already_authorized` is not an error to the app.

        pendingAuthorizationSecret RECONCILES as it reads: if Stripe is
        holding the money and the booking never heard, it repairs the row
        and reports this code. The screen that asked should stop asking
        and show a confirmed booking, so it gets a 200 saying exactly
        that rather than a failure to render.
      */
      if (pending.code === "already_authorized") {
        return Response.json({ confirmed: true, message: pending.message });
      }
      const status =
        pending.code === "no_booking" || pending.code === "not_yours" ? 404
        : pending.code === "nothing_pending" ? 409
        : 400;
      return Response.json({ error: pending.message, code: pending.code }, { status });
    }

    return Response.json({
      confirmed: false,
      clientSecret: pending.clientSecret,
      paymentMethodId: pending.paymentMethodId,
      amountCents: pending.amountCents,
      currency: pending.currency,
    });
  })(request);
}

/** Record what the bank actually decided. */
export async function POST(request: Request, context: Context) {
  const { id } = await context.params;
  return withBearerAuth(async ({ user, supabase }) => {
    /*
      Ownership first. confirmPendingAuthorization runs as the service
      role and cannot see who asked — the same reason the web action
      checks here rather than inside it.
    */
    const { data: booking } = await supabase
      .from("bookings")
      .select("id, customer_id")
      .eq("id", id)
      .maybeSingle();
    if (!booking || booking.customer_id !== user.id) {
      return Response.json({ error: "Booking not found." }, { status: 404 });
    }

    const confirmed = await confirmPendingAuthorization(id);
    if (!confirmed.ok) {
      return Response.json({ error: confirmed.message, code: confirmed.code }, { status: 400 });
    }

    /*
      A bank that said no is a 200 with authorized:false, not an HTTP
      error. Nothing went wrong with the request; the answer was no, and
      the app needs to show that difference — one is "try again", the
      other is "something broke".
    */
    return Response.json({
      authorized: confirmed.authorized,
      message: confirmed.authorized
        ? "Payment confirmed. Your helper can get started."
        : "Your bank didn't approve that. Try again, or use a different card.",
    });
  })(request);
}
