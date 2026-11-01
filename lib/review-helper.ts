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

/** The controlled helper, resolved from the flag rather than configured. */
async function reviewHelperId(): Promise<string | null> {
  const admin = createSupabaseServiceClient();
  const { data } = await admin
    .from("provider_profiles")
    .select("user_id")
    .eq("is_review_helper", true)
    .eq("status", "approved")
    .limit(1)
    .maybeSingle();
  return data?.user_id ?? null;
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
  const helper = await reviewHelperId();
  // The booking must belong to the controlled helper too. A review
  // customer who somehow matched a real helper must not be advanced from
  // here — that helper is a person with their own schedule.
  if (!helper || row.provider_id !== helper) return { ok: false };
  return { ok: true, providerId: row.provider_id };
}

export type ReviewStep = { ok: true; note: string } | { ok: false; error: string };

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
export async function prepareReviewHelper(requestId: string): Promise<ReviewStep> {
  if (!(await isReviewRequest(requestId))) {
    return { ok: false, error: "Not a review request." };
  }
  const helper = await reviewHelperId();
  if (!helper) {
    return { ok: false, error: "No approved review helper exists. Create one and flag it." };
  }

  const admin = createSupabaseServiceClient();

  const { data: req } = await admin
    .from("requests")
    .select("pickup_address_id")
    .eq("id", requestId)
    .maybeSingle();
  const addressId = (req as { pickup_address_id?: string } | null)?.pickup_address_id;
  if (!addressId) return { ok: false, error: "Request has no pickup address." };

  const { data: addr } = await admin
    .from("addresses")
    .select("location")
    .eq("id", addressId)
    .maybeSingle();
  const location = (addr as { location?: string } | null)?.location;
  if (!location) return { ok: false, error: "Pickup address has no geocoded location." };

  const { error } = await admin
    .from("provider_profiles")
    .update({
      is_online: true,
      vacation_mode: false,
      current_location: location,
      location_updated_at: new Date().toISOString(),
    })
    .eq("user_id", helper)
    .eq("is_review_helper", true);

  if (error) return { ok: false, error: error.message };
  return { ok: true, note: "Controlled helper is online at the pickup point." };
}

/**
 * Accept a review request as the controlled helper.
 *
 * Called inline when a review account creates a request, so acceptance
 * is immediate rather than a thing somebody has to do.
 */
export async function acceptAsReviewHelper(requestId: string): Promise<ReviewStep> {
  if (!(await isReviewRequest(requestId))) {
    return { ok: false, error: "Not a review request." };
  }
  const helper = await reviewHelperId();
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
