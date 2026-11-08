import "server-only";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { sendPushToUser } from "@/lib/push";

/*
  TELL THE HELPERS A JOB IS WAITING.

  Without this the Offers tab is a page you have to remember to check,
  and offers expire — which is the same as not having them. A job offer
  is the one notification this product genuinely cannot do without.

  Called straight after broadcast_request, which is what creates the
  match_attempts rows. Best-effort in the same way the broadcast is: the
  request already exists, and failing to notify must not fail the
  customer's booking.
*/
export async function notifyOfferedHelpers(
  requestId: string,
  opts: { label?: string } = {},
): Promise<{ notified: number }> {
  try {
    const admin = createSupabaseServiceClient();

    const { data: attempts } = await admin
      .from("match_attempts")
      .select("provider_id")
      .eq("request_id", requestId)
      .is("responded_at", null);

    const helpers = [...new Set((attempts ?? []).map((a) => a.provider_id as string))];
    if (helpers.length === 0) return { notified: 0 };

    /*
      The same narrow description the inbox shows: the service, and the
      approximate area. Never the address — a candidate who has not
      accepted has no business with it, which is the whole reason
      my_offers exists rather than reading the request row.
    */
    const { data: request } = await admin
      .from("requests")
      .select("pickup_city, estimated_price_cents, services(title)")
      .eq("id", requestId)
      .maybeSingle();

    /*
      PostgREST answers an embed as an object or an array depending on
      how it reads the foreign keys, and the generated types do not
      reliably say which. Same shape as `one()` elsewhere in this repo.
    */
    const embedded = request?.services as
      | { title?: string }
      | { title?: string }[]
      | null
      | undefined;
    const service = Array.isArray(embedded) ? embedded[0]?.title : embedded?.title;
    const where = request?.pickup_city ? ` in ${request.pickup_city}` : "";

    let notified = 0;
    for (const helper of helpers) {
      const result = await sendPushToUser(
        helper,
        {
          title: "New job offer",
          body: `${service ?? "A job"}${where}. Open to accept before someone else does.`,
          url: "/helper/inbox",
        },
        {
          pref: "push_booking",
          // An offer expires, so it is allowed through Focus and a
          // locked screen the way a ride request is.
          timeSensitive: true,
          // One offer, one notification: a re-broadcast replaces the
          // earlier alert rather than stacking a second copy.
          collapseId: `offer-${requestId}`,
        },
      );
      if (result.ok && result.sentTo) notified += 1;
    }
    return { notified };
  } catch (e) {
    console.error(`notifyOfferedHelpers${opts.label ? ` (${opts.label})` : ""} threw:`, e);
    return { notified: 0 };
  }
}
