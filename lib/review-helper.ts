import "server-only";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { authorizeBookingPayment, captureBookingPayment, voidBookingAuthorization } from "@/lib/payments";
import { stripeConfigured } from "@/lib/stripe";

/*
  THE CONTROLLED HELPER, DRIVEN BY THE SAME ACTIONS A PERSON WOULD USE.

  App Review has to be able to complete a booking without waiting on
  anybody. "Email us and we'll bring the helper online" makes the
  journey depend on staff availability, which is not a journey a
  reviewer can rely on at 2am in another timezone.

  So the controlled helper acts automatically — but it does not
  FABRICATE anything. Every step here is the identical call the helper's
  own app makes:

      accept    accept_request(), then authorizeBookingPayment()
      start     start_booking()
      complete  complete_booking(), then capture or release

  No booking status is written directly, no payment state is set by
  hand, and capture is never skipped. A reviewer sees the real
  transitions in the real order, with test money.

  EVERY ENTRY POINT CHECKS THE REQUEST BELONGS TO A REVIEW ACCOUNT, and
  that the helper being driven is the review helper. Both, every time —
  not because one is insufficient on its own, but because this is the
  one piece of code that acts without a human behind it, and it should
  be impossible to aim at a real booking by changing one argument.
*/

/*
  THE CONTROLLED HELPERS, IN A FIXED ORDER.

  WHY THIS IS A LIST AND WHY IT IS ORDERED.

  This was `limit(1)` with no ORDER BY, called once by
  prepareReviewHelper and then AGAIN by acceptAsReviewHelper. There is
  more than one controlled account — a crew job cannot be staffed by one
  — so "the review helper" was never a single row, and an unordered
  limit returns whatever the plan happens to reach first.

  Worse than arbitrary: prepare UPDATES the row it picked, and an updated
  tuple takes a new position in the heap. A sequential scan then reports
  the OTHER account first. So the two calls did not merely risk
  disagreeing, they reliably DID: prepare brought helper A online and the
  broadcast offered the request to A, and accept_request was then aimed
  at B, which refuses with "Request was not offered to this provider".

  Reproduced against production by running prepare's own UPDATE inside a
  transaction and asking twice: demo-helper-2 at ctid (0,48) before,
  demo-helper at (0,49) after.

  It looked intermittent because a second request inside the 30-minute
  location window found BOTH accounts already online and nearby, so
  either pick worked — until the window lapsed or the city changed. The
  first request of a session was the one that failed.
*/
async function reviewHelperIds(): Promise<string[]> {
  const admin = createSupabaseServiceClient();
  const { data } = await admin
    .from("provider_profiles")
    .select("user_id")
    .eq("is_review_helper", true)
    .eq("status", "approved")
    .order("user_id");
  return (data ?? []).map((row) => (row as { user_id: string }).user_id);
}

async function isReviewRequest(requestId: string): Promise<boolean> {
  const admin = createSupabaseServiceClient();
  const { data } = await admin
    .from("requests")
    .select("customer_id, profiles!requests_customer_id_fkey(is_review_account)")
    .eq("id", requestId)
    .maybeSingle();
  const profile = (data as { profiles?: { is_review_account?: boolean } } | null)?.profiles;
  return Boolean(profile?.is_review_account);
}

async function isReviewBooking(bookingId: string): Promise<{ ok: boolean; providerId?: string }> {
  const admin = createSupabaseServiceClient();
  const { data } = await admin
    .from("bookings")
    .select("provider_id, customer_id, profiles!bookings_customer_id_fkey(is_review_account)")
    .eq("id", bookingId)
    .maybeSingle();
  const row = data as {
    provider_id?: string;
    profiles?: { is_review_account?: boolean };
  } | null;
  if (!row?.profiles?.is_review_account) return { ok: false };
  /*
    The booking must be led by a CONTROLLED helper too. A review customer
    who somehow matched a real helper must not be advanced from here —
    that helper is a person with their own schedule.

    Checked against the whole set rather than one id. There is more than
    one controlled helper now, because a crew job cannot be staffed by a
    single account, and asking "is it THE review helper?" would refuse
    every booking the other one happened to lead.
  */
  if (!row.provider_id || !(await isReviewHelper(row.provider_id))) return { ok: false };
  return { ok: true, providerId: row.provider_id };
}

/** Is this provider one of the controlled accounts? */
async function isReviewHelper(providerId: string): Promise<boolean> {
  const admin = createSupabaseServiceClient();
  const { data } = await admin
    .from("provider_profiles")
    .select("user_id")
    .eq("user_id", providerId)
    .eq("is_review_helper", true)
    .maybeSingle();
  return Boolean(data);
}

export type ReviewStep = { ok: true; note: string } | { ok: false; error: string };

export type ReviewPrepared =
  | { ok: true; note: string; helperId: string }
  /**
   * `applies` is false ONLY when this is an ordinary customer's request,
   * which is not a failure. Anything else is a review request that could
   * not be set up, and the caller has to be able to tell the two apart —
   * conflating them is what hid the acceptance bug.
   */
  | { ok: false; error: string; applies: boolean };

/**
 * Staff the rest of a crew booking with the other controlled helpers.
 *
 * WHY. A crew job refuses to start until crew_shortfall() reaches zero,
 * and accept_request only invites the helpers who were ALSO offered the
 * request. One controlled helper means an empty invite list, so Moving
 * Help with two helpers — the value the review notes tell a reviewer to
 * enter — would accept, hold the card, and then never start:
 * "This job needs 1 more helper(s) before it can start."
 *
 * Nothing is fabricated. Each place is taken through accept_crew_invite,
 * the same call a helper's own app makes, and only by an account flagged
 * as a controlled helper. A real helper's invitation is never touched, so
 * this cannot quietly conscript somebody into a job.
 */
async function seatReviewCrew(bookingId: string): Promise<void> {
  const admin = createSupabaseServiceClient();

  const { data: shortfall } = await admin.rpc("crew_shortfall", { p_booking_id: bookingId });
  if (!Number(shortfall ?? 0)) return;

  const { data: invited } = await admin
    .from("booking_crew")
    .select("provider_id")
    .eq("booking_id", bookingId)
    .eq("status", "invited");
  const ids = (invited ?? []).map((r) => (r as { provider_id: string }).provider_id);
  if (!ids.length) return;

  const { data: controlled } = await admin
    .from("provider_profiles")
    .select("user_id")
    .eq("is_review_helper", true)
    .in("user_id", ids);

  for (const row of controlled ?? []) {
    const left = await admin.rpc("crew_shortfall", { p_booking_id: bookingId });
    if (!Number(left.data ?? 0)) break;
    await admin.rpc("accept_crew_invite", {
      p_booking_id: bookingId,
      p_provider_id: (row as { user_id: string }).user_id,
    });
  }
}

/**
 * Make the controlled helper matchable for THIS request, immediately
 * before the request is dispatched.
 *
 * WHY THIS EXISTS, because it is not obvious and removing it breaks App
 * Review silently.
 *
 * accept_request refuses a provider that has no match_attempts row:
 * "Request was not offered to this provider". That row is written only
 * if find_nearby_providers matched the helper, and that requires
 * is_online = true and a location newer than max_location_age(), which
 * is 30 minutes. A controlled helper has nobody carrying a phone, so its
 * location goes stale within half an hour and mark_stale_helpers_offline()
 * then sets is_online = false and notifies it that it went offline.
 *
 * App Review happens days after submission, at an hour nobody chooses.
 * Without this, the reviewer's request would broadcast to nobody,
 * acceptAsReviewHelper would throw, and the journey would stop dead at
 * "waiting for a helper" — exactly the failure the requests route's own
 * comment warns about for real helpers.
 *
 * Doing it from the request itself takes the clock out of the problem:
 * the precondition is established by the same call that depends on it,
 * so there is no cron to fail and no window to miss.
 *
 * The helper is placed at the request's own pickup point, copied as the
 * stored geography rather than re-derived, so the match does not depend
 * on which supported city the reviewer chose. This is disclosed in the
 * review notes: the controlled helper is operated, not organic.
 *
 * A no-op for every real request — the review flag is checked first.
 */
export async function prepareReviewHelper(requestId: string): Promise<ReviewPrepared> {
  if (!(await isReviewRequest(requestId))) {
    return { ok: false, error: "Not a review request.", applies: false };
  }
  const helpers = await reviewHelperIds();
  if (!helpers.length) {
    return {
      ok: false,
      applies: true,
      error: "No approved review helper exists. Create one and flag it.",
    };
  }

  const admin = createSupabaseServiceClient();

  const { data: req } = await admin
    .from("requests")
    .select("pickup_address_id")
    .eq("id", requestId)
    .maybeSingle();
  const addressId = (req as { pickup_address_id?: string } | null)?.pickup_address_id;
  if (!addressId) {
    return { ok: false, applies: true, error: "Request has no pickup address." };
  }

  const { data: addr } = await admin
    .from("addresses")
    .select("location")
    .eq("id", addressId)
    .maybeSingle();
  const location = (addr as { location?: string } | null)?.location;
  if (!location) {
    return { ok: false, applies: true, error: "Pickup address has no geocoded location." };
  }

  /*
    EVERY controlled account, not only the lead.

    accept_request invites just the helpers the request was ALSO offered
    to, and crew_shortfall() refuses to let a crew job start until those
    places are filled. Preparing one account left the invite list empty,
    so Moving Help with two helpers — the figure the review notes tell a
    reviewer to enter — would accept, hold the card, and then refuse to
    start. It passed in testing only because an earlier request had
    happened to leave the second account online nearby, which is not
    something App Review will reproduce for us.
  */
  const { error } = await admin
    .from("provider_profiles")
    .update({
      is_online: true,
      vacation_mode: false,
      current_location: location,
      location_updated_at: new Date().toISOString(),
    })
    .in("user_id", helpers)
    .eq("is_review_helper", true);

  if (error) return { ok: false, applies: true, error: error.message };
  return {
    ok: true,
    /*
      The lead is NAMED, and accepted by that id, so the account the
      request was offered to is the account that answers it. Resolving it
      a second time is the bug.
    */
    helperId: helpers[0],
    note: `${helpers.length} controlled helper(s) online at the pickup point.`,
  };
}

/**
 * Accept a review request as the controlled helper.
 *
 * Called inline when a review account creates a request, so acceptance
 * is immediate rather than a thing somebody has to do.
 */
export async function acceptAsReviewHelper(
  requestId: string,
  /*
    The account prepareReviewHelper actually brought online and had the
    request offered to. PASSED IN rather than looked up again — looking
    it up a second time is precisely the defect this parameter removes.
  */
  preparedHelperId?: string,
): Promise<ReviewStep> {
  if (!(await isReviewRequest(requestId))) {
    return { ok: false, error: "Not a review request." };
  }
  /*
    Still checked here. This module's rule is that every entry point
    verifies for itself, so passing a real helper's id cannot aim the
    automatic acceptance at a person with their own schedule.
  */
  const helper =
    preparedHelperId && (await isReviewHelper(preparedHelperId))
      ? preparedHelperId
      : (await reviewHelperIds())[0];
  if (!helper) {
    return { ok: false, error: "No approved review helper exists. Create one and flag it." };
  }

  const admin = createSupabaseServiceClient();
  const { data: bookingId, error } = await admin.rpc("accept_request", {
    p_request_id: requestId,
    p_provider_id: helper,
  });
  if (error) return { ok: false, error: error.message };
  if (!bookingId) return { ok: false, error: "accept_request returned no booking." };

  // Exactly what the helper's app does next: hold the card before anyone
  // is sent anywhere. In test mode for a review account, by stripeForUser.
  if (stripeConfigured()) {
    const payment = await authorizeBookingPayment(bookingId as string);
    if (!payment.ok) {
      return { ok: false, error: `Accepted, but the hold failed: ${payment.message}` };
    }
    if (payment.requiresAction) {
      return {
        ok: true,
        note: "Accepted. Your bank wants you to confirm the hold — the booking will show you how.",
      };
    }
  }
  return { ok: true, note: "Accepted, and your card is held." };
}

/**
 * Move a review booking to its next state, as the controlled helper
 * would. Start, then complete.
 */
export async function advanceReviewBooking(bookingId: string): Promise<ReviewStep> {
  const belongs = await isReviewBooking(bookingId);
  if (!belongs.ok) return { ok: false, error: "Not a review booking." };

  const admin = createSupabaseServiceClient();
  const { data: booking } = await admin
    .from("bookings")
    .select("status")
    .eq("id", bookingId)
    .maybeSingle();
  const status = (booking as { status?: string } | null)?.status;

  if (status === "scheduled") {
    // A crew job will not start until every place is filled.
    await seatReviewCrew(bookingId);
    const { error } = await admin.rpc("start_booking", { p_booking_id: bookingId });
    if (error) return { ok: false, error: error.message };
    return { ok: true, note: "The helper has started the job." };
  }

  if (status === "in_progress") {
    const { data: settlement, error } = await admin.rpc("complete_booking", {
      p_booking_id: bookingId,
      p_outcome: null,
    });
    if (error) return { ok: false, error: error.message };

    // The settlement the outcome requires — captured or released. Same
    // rule as the helper's app, read from complete_booking rather than
    // decided here.
    if (stripeConfigured()) {
      if (settlement === "release") {
        const voided = await voidBookingAuthorization(bookingId);
        if (!voided.ok) return { ok: false, error: "Completed, but the hold could not be released." };
        return { ok: true, note: "Completed. The hold was released, so nothing was charged." };
      }
      const captured = await captureBookingPayment(bookingId);
      if (!captured.ok) return { ok: false, error: `Completed, but capture failed: ${captured.message}` };
      return { ok: true, note: "Completed, and the card was charged." };
    }
    return { ok: true, note: "Completed." };
  }

  return { ok: false, error: `Nothing to advance — the booking is ${status ?? "unknown"}.` };
}
