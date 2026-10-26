"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient, createSupabaseServiceClient } from "@/lib/supabase/server";
import { authorizeBookingPayment } from "@/lib/payments";
import { stripeConfigured } from "@/lib/stripe";

export async function acceptRequestAction(requestId: string) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not logged in." };

  const { data: bookingId, error } = await supabase.rpc("accept_request", {
    p_request_id: requestId,
    p_provider_id: user.id,
  });

  if (error) {
    return { error: error.message };
  }

  // Place the hold before the helper is sent anywhere.
  //
  // accept_request has to run first — the total and the helper are not
  // known until the booking row exists — so there is a window where the job
  // is accepted but unpaid. If authorization fails the acceptance comes
  // back out, because dispatching a helper to a job that cannot be paid for
  // is worse than telling someone their card was declined.
  if (stripeConfigured() && bookingId) {
    const payment = await authorizeBookingPayment(bookingId as string);

    // ok but not held. The bank wants the customer present for a 3DS
    // challenge, so no money is reserved yet. This used to be ignored:
    // requiresAction came back true and the helper was sent straight to
    // the job, which start_booking would then refuse with no explanation
    // of why. The booking is kept — the customer can still authenticate —
    // but the helper is told plainly.
    if (payment.ok && payment.requiresAction) {
      const admin = createSupabaseServiceClient();
      await admin.from("notifications").insert({
        user_id: (await admin.from("bookings").select("customer_id")
          .eq("id", bookingId).single()).data?.customer_id,
        type: "payment_needs_confirmation",
        payload: { booking_id: bookingId },
      });
      revalidatePath("/provider/inbox");
      revalidatePath("/provider/active");
      return {
        error:
          "Accepted, but the customer's bank needs them to confirm the payment. " +
          "You'll be able to start once they do — we've asked them.",
      };
    }

    if (!payment.ok) {
      // A helper-side problem (payouts not set up) is fixable by a
      // different helper, so the job goes back out. A card problem is not
      // — every helper would hit the same decline — so the request is
      // cancelled and the customer is told.
      const requeue = payment.code === "helper_not_payable";
      const admin = createSupabaseServiceClient();
      const { error: releaseError } = await admin.rpc("release_unpaid_booking", {
        p_booking_id: bookingId,
        p_reason: `Payment could not be authorized: ${payment.message}`,
        p_requeue: requeue,
      });
      if (releaseError) {
        // The booking is accepted and unpayable and we could not undo it.
        // Loud, because it needs a human: the helper may be on their way.
        console.error(
          "STRANDED BOOKING: authorization failed and release failed",
          { bookingId, payment, releaseError },
        );
      }
      revalidatePath("/provider/inbox");
      return {
        error: requeue
          ? "Finish setting up payouts before accepting jobs. This one has gone back out to other helpers."
          : `This job could not be paid for: ${payment.message}`,
      };
    }
  }

  revalidatePath("/provider/inbox");
  revalidatePath("/provider/active");
  redirect(`/provider/active`);
}

export async function declineRequestAction(requestId: string) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not logged in." };

  const { error } = await supabase.rpc("decline_request", {
    p_request_id: requestId,
    p_provider_id: user.id,
  });

  if (error) return { error: error.message };
  revalidatePath("/provider/inbox");
  return { success: "Declined." };
}
