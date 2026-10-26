import "server-only";
import type Stripe from "stripe";
import {
  getStripe,
  stripeConfigured,
  CONNECTED_ACCOUNT_CONTROLLER,
  CONNECTED_ACCOUNT_CAPABILITIES,
  canReceiveTransfers,
  readConnectReadiness,
} from "@/lib/stripe";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

/* How money moves through Helpward.
 *
 *   1. The customer saves a card. Stripe holds it against a Customer; we
 *      store only the payment-method id.
 *   2. A helper accepts. We authorize — not charge — the full total as a
 *      DESTINATION charge: Stripe will move the helper's share to their
 *      connected account and Helpward's share to the platform, but nothing
 *      settles until capture.
 *   3. The job completes. We capture. The helper's balance is credited and
 *      Stripe pays it out on its own schedule.
 *   4. A tip, if any, is a SEPARATE charge. A capture can only be for at
 *      most the authorized amount, and the tip is decided after completion,
 *      so it cannot ride on the original authorization.
 *
 * Authorizing at acceptance rather than charging is what makes "you only
 * pay when the job is done" true: a cancelled booking is a void, which
 * never appears on the customer's statement, rather than a refund, which
 * does and takes days to clear.
 */

export type PaymentFailure = { ok: false; code: string; message: string };
export type PaymentOk<T> = { ok: true } & T;
// Defaults to `unknown` so a function with nothing to report can return a
// bare { ok: true }: intersecting with unknown is the identity.
export type PaymentResult<T = unknown> = PaymentOk<T> | PaymentFailure;

function fail(code: string, message: string): PaymentFailure {
  return { ok: false, code, message };
}

/** Stripe errors carry the message a customer should see; everything else
 *  gets a generic one so an internal detail never reaches the UI. */
function fromStripeError(err: unknown): PaymentFailure {
  const e = err as Stripe.errors.StripeError;
  if (e?.type === "StripeCardError") {
    return fail("card_declined", e.message ?? "That card was declined.");
  }
  if (e?.type === "StripeInvalidRequestError") {
    console.error("stripe invalid request:", e.message);
    return fail("invalid_request", "Payment could not be set up. Support has been notified.");
  }
  console.error("stripe error:", err);
  return fail("stripe_error", "Payment failed. Please try again.");
}

/* =========================================================================
   Helper onboarding
   ========================================================================= */

/**
 * Create the helper's connected account if they don't have one, and return
 * a Stripe-hosted onboarding URL.
 *
 * The account is created with Stripe-managed risk (see
 * CONNECTED_ACCOUNT_CONTROLLER) because this platform is provisioned that
 * way and the classic Express shape is rejected outright.
 */
export async function startHelperOnboarding(
  providerId: string,
  returnTo: string,
): Promise<PaymentResult<{ url: string; accountId: string }>> {
  if (!stripeConfigured()) return fail("not_configured", "Payouts are not available yet.");
  const stripe = getStripe();
  const admin = createSupabaseServiceClient();

  const { data: profile } = await admin
    .from("provider_profiles")
    .select("user_id, stripe_connect_account_id")
    .eq("user_id", providerId)
    .single();
  if (!profile) return fail("no_profile", "Helper profile not found.");

  let accountId = profile.stripe_connect_account_id as string | null;

  try {
    if (!accountId) {
      const { data: person } = await admin
        .from("profiles")
        .select("email, country")
        .eq("id", providerId)
        .single();

      const account = await stripe.accounts.create({
        country: person?.country === "CA" ? "CA" : "US",
        email: person?.email ?? undefined,
        controller: CONNECTED_ACCOUNT_CONTROLLER,
        capabilities: CONNECTED_ACCOUNT_CAPABILITIES,
        business_profile: {
          product_description: "Independent helper providing on-demand local services via Helpward",
          url: "https://helpward.com",
        },
        // Lets us find the helper from a webhook without a lookup table.
        metadata: { helpward_provider_id: providerId },
      });
      accountId = account.id;

      const { error } = await admin
        .from("provider_profiles")
        .update({ stripe_connect_account_id: accountId })
        .eq("user_id", providerId);
      // If we cannot record the account we must not hand out its link:
      // the next attempt would create a second account for the same
      // helper and strand whatever they entered in the first.
      if (error) {
        console.error("could not persist connect account", accountId, error);
        return fail("persist_failed", "Could not start payout setup. Please try again.");
      }
    }

    const link = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${returnTo}?payouts=refresh`,
      return_url: `${returnTo}?payouts=done`,
      type: "account_onboarding",
    });
    return { ok: true, url: link.url, accountId };
  } catch (err) {
    return fromStripeError(err);
  }
}

/**
 * Pull the account's current state from Stripe and mirror it onto the
 * helper's profile. Called by the account.updated webhook and whenever a
 * helper returns from onboarding — webhooks can be delayed, and a helper
 * who has just finished should not be told they haven't.
 */
export async function refreshHelperPayoutState(
  accountId: string,
): Promise<PaymentResult<{ payable: boolean }>> {
  if (!stripeConfigured()) return fail("not_configured", "Payouts are not available yet.");
  const stripe = getStripe();
  const admin = createSupabaseServiceClient();

  try {
    const account = await stripe.accounts.retrieve(accountId);
    const readiness = readConnectReadiness(account);
    const payable = canReceiveTransfers(account);

    const { error } = await admin
      .from("provider_profiles")
      .update({
        stripe_charges_enabled: readiness.chargesEnabled,
        stripe_payouts_enabled: readiness.payoutsEnabled,
        stripe_details_submitted: readiness.detailsSubmitted,
        stripe_transfers_active: payable,
        stripe_requirements_due: readiness.currentlyDue,
        stripe_disabled_reason: readiness.disabledReason,
        ...(payable ? { stripe_onboarded_at: new Date().toISOString() } : {}),
      })
      .eq("stripe_connect_account_id", accountId);
    if (error) return fail("persist_failed", error.message);

    return { ok: true, payable };
  } catch (err) {
    return fromStripeError(err);
  }
}

/* =========================================================================
   Customer cards
   ========================================================================= */

/** Find or create the Stripe Customer for a Helpward account. */
export async function ensureStripeCustomer(userId: string): Promise<PaymentResult<{ customerId: string }>> {
  if (!stripeConfigured()) return fail("not_configured", "Payments are not available yet.");
  const stripe = getStripe();
  const admin = createSupabaseServiceClient();

  const { data: profile } = await admin
    .from("profiles")
    .select("id, email, full_name, stripe_customer_id")
    .eq("id", userId)
    .single();
  if (!profile) return fail("no_profile", "Account not found.");
  if (profile.stripe_customer_id) return { ok: true, customerId: profile.stripe_customer_id };

  try {
    const customer = await stripe.customers.create({
      email: profile.email ?? undefined,
      name: profile.full_name ?? undefined,
      metadata: { helpward_user_id: userId },
    });
    const { error } = await admin
      .from("profiles")
      .update({ stripe_customer_id: customer.id })
      .eq("id", userId);
    if (error) {
      console.error("could not persist stripe customer", customer.id, error);
      return fail("persist_failed", "Could not set up payment. Please try again.");
    }
    return { ok: true, customerId: customer.id };
  } catch (err) {
    return fromStripeError(err);
  }
}

/**
 * Client secret for the card-entry form. A SetupIntent rather than a
 * PaymentIntent: the card is saved now and charged later, when a helper
 * actually accepts.
 */
export async function createCardSetupIntent(
  userId: string,
): Promise<PaymentResult<{ clientSecret: string; customerId: string }>> {
  const customer = await ensureStripeCustomer(userId);
  if (!customer.ok) return customer;

  try {
    const intent = await getStripe().setupIntents.create({
      customer: customer.customerId,
      payment_method_types: ["card"],
      // The customer will not be present when we authorize at acceptance.
      usage: "off_session",
      metadata: { helpward_user_id: userId },
    });
    if (!intent.client_secret) return fail("no_secret", "Could not start card setup.");
    return { ok: true, clientSecret: intent.client_secret, customerId: customer.customerId };
  } catch (err) {
    return fromStripeError(err);
  }
}

/* =========================================================================
   Booking authorization and capture
   ========================================================================= */

type BookingRow = {
  id: string;
  customer_id: string;
  provider_id: string;
  status: string;
  payment_status: string;
  total_cents: number;
  platform_fee_cents: number;
  payout_cents: number;
  currency: string;
  stripe_payment_intent_id: string | null;
};

async function loadBooking(bookingId: string) {
  const admin = createSupabaseServiceClient();
  const { data } = await admin
    .from("bookings")
    .select(
      "id, customer_id, provider_id, status, payment_status, total_cents," +
        " platform_fee_cents, payout_cents, currency, stripe_payment_intent_id",
    )
    .eq("id", bookingId)
    .single();
  return data as BookingRow | null;
}

/**
 * Place a hold on the customer's card for the full booking total, routed so
 * that capture splits it without a second API call.
 *
 * Called when a helper accepts. If this fails the booking must not proceed:
 * dispatching a helper to a job that cannot be paid for is worse than
 * telling the customer their card was declined.
 */
export async function authorizeBookingPayment(
  bookingId: string,
): Promise<PaymentResult<{ paymentIntentId: string; requiresAction: boolean }>> {
  if (!stripeConfigured()) return fail("not_configured", "Payments are not available yet.");
  const stripe = getStripe();
  const admin = createSupabaseServiceClient();

  const booking = await loadBooking(bookingId);
  if (!booking) return fail("no_booking", "Booking not found.");

  // Idempotent: a retried acceptance must not place a second hold.
  if (booking.stripe_payment_intent_id) {
    return { ok: true, paymentIntentId: booking.stripe_payment_intent_id, requiresAction: false };
  }

  const { data: helper } = await admin
    .from("provider_profiles")
    .select("stripe_connect_account_id, stripe_transfers_active")
    .eq("user_id", booking.provider_id)
    .single();

  if (!helper?.stripe_connect_account_id || !helper.stripe_transfers_active) {
    // Checked here as well as in dispatch because readiness can lapse
    // between a helper being offered a job and accepting it.
    return fail(
      "helper_not_payable",
      "This helper has not finished setting up payouts yet.",
    );
  }

  const { data: customer } = await admin
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", booking.customer_id)
    .single();
  if (!customer?.stripe_customer_id) {
    return fail("no_payment_method", "Add a payment method before booking.");
  }

  const { data: card } = await admin
    .from("payment_methods")
    .select("stripe_payment_method_id")
    .eq("customer_id", booking.customer_id)
    .order("is_default", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!card?.stripe_payment_method_id) {
    return fail("no_payment_method", "Add a payment method before booking.");
  }

  try {
    const intent = await stripe.paymentIntents.create(
      {
        amount: booking.total_cents,
        currency: booking.currency.toLowerCase(),
        customer: customer.stripe_customer_id,
        payment_method: card.stripe_payment_method_id,
        // Hold now, settle at completion.
        capture_method: "manual",
        confirm: true,
        off_session: true,
        // Helpward's share stays on the platform; the rest lands on the
        // helper's connected account at capture. total - platform_fee is
        // exactly payout_cents, by construction in accept_request.
        application_fee_amount: booking.platform_fee_cents,
        transfer_data: { destination: helper.stripe_connect_account_id },
        description: `Helpward booking ${booking.id}`,
        metadata: {
          helpward_booking_id: booking.id,
          helpward_customer_id: booking.customer_id,
          helpward_provider_id: booking.provider_id,
        },
      },
      // Survives a retried server action without double-authorizing.
      { idempotencyKey: `hw-auth-${booking.id}` },
    );

    await admin
      .from("bookings")
      .update({
        stripe_payment_intent_id: intent.id,
        payment_status: intent.status === "requires_capture" ? "authorized" : "pending",
        authorized_at: intent.status === "requires_capture" ? new Date().toISOString() : null,
        payment_error: null,
      })
      .eq("id", booking.id);

    return {
      ok: true,
      paymentIntentId: intent.id,
      requiresAction: intent.status === "requires_action",
    };
  } catch (err) {
    const problem = fromStripeError(err);
    await admin
      .from("bookings")
      .update({ payment_status: "failed", payment_error: problem.message })
      .eq("id", booking.id);
    return problem;
  }
}

/**
 * Settle the hold when the job is done. Capturing for less than the
 * authorized amount is allowed, which is how a partially completed job is
 * charged fairly rather than refunded after the fact.
 */
export async function captureBookingPayment(
  bookingId: string,
  captureCents?: number,
): Promise<PaymentResult<{ capturedCents: number }>> {
  if (!stripeConfigured()) return fail("not_configured", "Payments are not available yet.");
  const stripe = getStripe();
  const admin = createSupabaseServiceClient();

  const booking = await loadBooking(bookingId);
  if (!booking) return fail("no_booking", "Booking not found.");
  if (!booking.stripe_payment_intent_id) {
    return fail("not_authorized", "This booking has no payment hold to capture.");
  }
  if (booking.payment_status === "captured") {
    return { ok: true, capturedCents: booking.total_cents };
  }

  const amount = captureCents ?? booking.total_cents;
  if (amount <= 0 || amount > booking.total_cents) {
    return fail("bad_amount", "Capture amount is outside the authorized hold.");
  }

  try {
    // Capturing less means the helper's share must shrink too, or Helpward
    // would absorb the whole reduction. The fee is rescaled in the same
    // proportion so the agreed 80/20 split still holds.
    const fee =
      amount === booking.total_cents
        ? booking.platform_fee_cents
        : Math.round(booking.platform_fee_cents * (amount / booking.total_cents));

    const intent = await stripe.paymentIntents.capture(
      booking.stripe_payment_intent_id,
      { amount_to_capture: amount, application_fee_amount: fee },
      { idempotencyKey: `hw-capture-${booking.id}-${amount}` },
    );

    await admin
      .from("bookings")
      .update({
        payment_status: "captured",
        captured_at: new Date().toISOString(),
        stripe_charge_id: typeof intent.latest_charge === "string" ? intent.latest_charge : null,
        payment_error: null,
      })
      .eq("id", booking.id);

    return { ok: true, capturedCents: amount };
  } catch (err) {
    const problem = fromStripeError(err);
    await admin
      .from("bookings")
      .update({ payment_error: problem.message })
      .eq("id", booking.id);
    return problem;
  }
}

/**
 * Release the hold without charging. Used when a booking is cancelled
 * before the work happens — the customer never sees a charge appear and
 * disappear, which a refund would have shown them.
 */
export async function voidBookingAuthorization(
  bookingId: string,
): Promise<PaymentResult> {
  if (!stripeConfigured()) return fail("not_configured", "Payments are not available yet.");
  const booking = await loadBooking(bookingId);
  if (!booking) return fail("no_booking", "Booking not found.");
  if (!booking.stripe_payment_intent_id) return { ok: true };
  if (booking.payment_status === "captured") {
    return fail("already_captured", "This booking has already been charged; refund it instead.");
  }

  try {
    await getStripe().paymentIntents.cancel(booking.stripe_payment_intent_id);
    await createSupabaseServiceClient()
      .from("bookings")
      .update({ payment_status: "pending", authorized_at: null })
      .eq("id", booking.id);
    return { ok: true };
  } catch (err) {
    return fromStripeError(err);
  }
}

/**
 * Charge a tip after completion.
 *
 * A separate PaymentIntent, not a larger capture: the original hold was
 * authorized before the tip existed, and a capture can never exceed what
 * was authorized. The whole amount goes to the helper, so no application
 * fee is taken.
 */
export async function chargeTip(
  bookingId: string,
  tipCents: number,
): Promise<PaymentResult<{ paymentIntentId: string }>> {
  if (!stripeConfigured()) return fail("not_configured", "Payments are not available yet.");
  if (tipCents <= 0) return fail("bad_amount", "Tip must be greater than zero.");
  const stripe = getStripe();
  const admin = createSupabaseServiceClient();

  const booking = await loadBooking(bookingId);
  if (!booking) return fail("no_booking", "Booking not found.");
  if (booking.payment_status !== "captured") {
    return fail("not_captured", "You can only tip a booking that has been paid for.");
  }

  const { data: helper } = await admin
    .from("provider_profiles")
    .select("stripe_connect_account_id")
    .eq("user_id", booking.provider_id)
    .single();
  const { data: customer } = await admin
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", booking.customer_id)
    .single();
  const { data: card } = await admin
    .from("payment_methods")
    .select("stripe_payment_method_id")
    .eq("customer_id", booking.customer_id)
    .order("is_default", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!helper?.stripe_connect_account_id) return fail("helper_not_payable", "Helper cannot receive payouts.");
  if (!customer?.stripe_customer_id || !card?.stripe_payment_method_id) {
    return fail("no_payment_method", "No saved card to charge the tip to.");
  }

  try {
    const intent = await stripe.paymentIntents.create(
      {
        amount: tipCents,
        currency: booking.currency.toLowerCase(),
        customer: customer.stripe_customer_id,
        payment_method: card.stripe_payment_method_id,
        confirm: true,
        off_session: true,
        // No application_fee_amount: Helpward takes no cut of a tip.
        transfer_data: { destination: helper.stripe_connect_account_id },
        description: `Helpward tip for booking ${booking.id}`,
        metadata: { helpward_booking_id: booking.id, helpward_kind: "tip" },
      },
      { idempotencyKey: `hw-tip-${booking.id}-${tipCents}` },
    );
    return { ok: true, paymentIntentId: intent.id };
  } catch (err) {
    return fromStripeError(err);
  }
}
