import { withBearerAuth } from "@/lib/api/bearer";
import { completeBookingForHelper } from "@/lib/helper-jobs";

/*
  Finish a job, from the helper app.

  Same shape as accepting, and here for the same reason: complete_booking
  decides whether the hold is CAPTURED or RELEASED, and acting on that
  decision — plus paying the rest of the crew, who are not on the
  destination charge — needs the Stripe secret key.

  An app that called only the RPC would mark jobs complete and never
  take the money.
*/

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  const { id } = await context.params;

  /*
    The outcome is a service-specific ending, not free text — "the venue
    refused a stand-in" is the one that releases the hold instead of
    capturing it. complete_booking validates it against the service, so
    this only has to refuse a body that isn't a string.
  */
  let outcome: string | null = null;
  try {
    const body = await request.json();
    const raw = (body as { outcome?: unknown } | null)?.outcome;
    if (typeof raw === "string" && raw.trim()) outcome = raw.trim();
  } catch {
    // No body is the ordinary case: most jobs just finish.
  }

  return withBearerAuth(async ({ supabase }) => {
    const result = await completeBookingForHelper(supabase, id, outcome);

    if (!result.ok) {
      return Response.json({ error: result.error }, { status: 409 });
    }

    /*
      `warning` means the job IS complete and the money is not settled
      yet. It must not read as a failure: the helper has already worked,
      and a capture problem is a collections problem rather than
      anything they can act on.
    */
    return Response.json({
      settlement: result.settlement,
      message: result.message,
      warning: result.warning ?? null,
    });
  })(request);
}
