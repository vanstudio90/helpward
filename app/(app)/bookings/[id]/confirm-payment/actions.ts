"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { pendingAuthorizationSecret, confirmPendingAuthorization } from "@/lib/payments";

/** Hand the customer the secret for THEIR pending payment. */
export async function startPaymentConfirmationAction(bookingId: string) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not logged in." };

  const pending = await pendingAuthorizationSecret(bookingId, user.id);
  if (!pending.ok) return { error: pending.message, code: pending.code };
  return {
    clientSecret: pending.clientSecret,
    amountCents: pending.amountCents,
    currency: pending.currency,
  };
}

/**
 * Record the outcome after the challenge.
 *
 * The browser says "I finished", never "it worked": the status is re-read
 * from Stripe server-side. A page that could assert its own authorization
 * would be the same hole the whole payment design exists to close.
 */
export async function finishPaymentConfirmationAction(bookingId: string) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not logged in." };

  // Ownership first — confirmPendingAuthorization runs as the service role
  // and cannot see who asked.
  const { data: booking } = await supabase
    .from("bookings")
    .select("id, customer_id")
    .eq("id", bookingId)
    .maybeSingle();
  if (!booking || booking.customer_id !== user.id) return { error: "Booking not found." };

  const confirmed = await confirmPendingAuthorization(bookingId);
  if (!confirmed.ok) return { error: confirmed.message };

  revalidatePath(`/bookings/${bookingId}`);
  revalidatePath("/bookings");
  revalidatePath("/provider/active");

  return confirmed.authorized
    ? { success: "Payment confirmed. Your helper can get started." }
    : { error: "Your bank didn't approve that. Try again, or use a different card." };
}
