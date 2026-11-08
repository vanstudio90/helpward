import { withBearerAuth } from "@/lib/api/bearer";
import { acceptRequestForHelper } from "@/lib/helper-jobs";

/*
  Take a job, from the helper app.

  The app could call accept_request itself — it is granted to
  `authenticated` — and that is exactly why this route exists. The RPC
  is only half of accepting: the other half is authorising the
  customer's card, and releasing the acceptance again if that fails.
  Both need the Stripe secret key, which is not on a phone.

  The handler is deliberately thin. Everything that decides anything is
  in lib/helper-jobs.ts, shared with the website's server action, so the
  two surfaces cannot drift on what accepting costs.
*/

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  const { id } = await context.params;
  return withBearerAuth(async ({ user, supabase }) => {
    const result = await acceptRequestForHelper(supabase, id, user.id);

    if (!result.ok) {
      /*
        409, not 500. Every failure that reaches here is a conflict with
        the world rather than a fault: somebody else took the job, the
        quote no longer matches, payouts are not finished, the card
        declined. The app shows `error` verbatim, so each one already
        reads as something a helper can act on.
      */
      return Response.json(
        { error: result.error, requeued: result.requeued ?? false },
        { status: 409 },
      );
    }

    // Accepted either way. A booking the customer's bank still has to
    // confirm is NOT an error — the job is theirs, they simply cannot
    // start it yet — so it carries the booking id like any other
    // success, with the reason alongside.
    const needsConfirmation = "needsCustomerConfirmation" in result;
    return Response.json({
      bookingId: result.bookingId,
      needsCustomerConfirmation: needsConfirmation,
      message: needsConfirmation ? result.message : null,
    });
  })(request);
}
