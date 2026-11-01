import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { withBearerAuth } from "@/lib/api/bearer";
import { advanceReviewBooking } from "@/lib/review-helper";

/*
  Let App Review move a demonstration booking along without waiting.

  Acceptance happens by itself when a review account creates a request.
  The two steps after it — the helper starting the job, and marking it
  complete — are things a helper does over hours, and a reviewer has
  minutes. So a review account can ask for the next step to happen now.

  WHAT IT IS NOT: a way to set a status. It calls start_booking() and
  complete_booking() exactly as the helper's app does, and the capture
  or release that follows is decided by complete_booking's own
  settlement rule, not here. A reviewer sees the real transitions.

  GATED TWICE. The caller must be a review account, and the booking must
  belong to the controlled review helper. An ordinary account calling
  this gets 403 and nothing happens — there is no booking of theirs it
  could reach.
*/
export const POST = withBearerAuth(async ({ user }, request) => {
  const admin = createSupabaseServiceClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("is_review_account")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.is_review_account) {
    // Deliberately the same answer whether or not the booking exists.
    return Response.json({ error: "Not available on this account." }, { status: 403 });
  }

  let body: { bookingId?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Expected a JSON body." }, { status: 400 });
  }
  const bookingId = String(body.bookingId ?? "");
  if (!bookingId) {
    return Response.json({ error: "bookingId is required." }, { status: 400 });
  }

  // And the booking must be the review customer's own.
  const { data: owned } = await admin
    .from("bookings")
    .select("id")
    .eq("id", bookingId)
    .eq("customer_id", user.id)
    .maybeSingle();
  if (!owned) {
    return Response.json({ error: "Not available on this account." }, { status: 403 });
  }

  const result = await advanceReviewBooking(bookingId);
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 409 });
  }
  return Response.json({ advanced: true, note: result.note });
});
