import "server-only";
import type Stripe from "stripe";
import {
  getStripe,
  getStripeFor,
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
 * pay when the job is done" true: a cancelled booking releases the hold,
 * so no money is ever taken, rather than capturing and refunding it.
 *
 * DO NOT tell a customer the hold "never appears on your statement". We
 * do not control the issuer, and a released authorization commonly keeps
 * showing as pending for a few days before it drops off. The honest
 * wording, used on /pricing, is that the hold is released and the bank
 * may show it as pending for a short time.
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
    // Distinguish the two reasons Stripe rejects a request, because they
    // need opposite advice.
    //
    // A PLATFORM configuration gap — the live Connect settings are
    // incomplete — fails identically on every attempt. Telling someone to
    // try again is telling them to do something that cannot work, and the
    // fault is not theirs. The real one here was: "You cannot create
    // livemode account sessions or account links until you have supplied
    // URLs at .../settings/connect/site-links", which no amount of
    // retrying resolves.
    const msg = e?.message ?? "";
    const platformSetup =
      /site-links|livemode account (sessions|links)|platform.*(profile|settings).*(incomplete|complete)/i.test(msg);

    if (platformSetup) {
      return fail("platform_not_configured",
        "We couldn't open your secure payout setup — this is a setup problem on our side, not "
        + "yours. Nothing you entered is lost. We've recorded it and will have it working shortly; "
        + "no need to keep trying.");
    }

    return fail("invalid_request",
      "Stripe refused that request. Try again — if it keeps happening, email support@helpward.com "
      + "and quote the time it occurred.");
  }
  console.error("stripe error:", err);
  return fail("stripe_error", "Payment failed. Please try again.");
}

/**
 * The Stripe customer id for a Helpward account.
 *
 * It lives on customer_profiles, NOT on profiles. Four functions here
 * originally read `profiles.stripe_customer_id`, a column that does not
 * exist — PostgREST returns an error for the whole select, so every one of
 * them failed at runtime with "no payment method". Types did not catch it
 * because the Supabase client returns `any` for an unmodelled select.
 */
async function readStripeCustomerId(userId: string): Promise<string | null> {
  const { data } = await createSupabaseServiceClient()
    .from("customer_profiles")
    .select("stripe_customer_id")
    .eq("user_id", userId)
    .maybeSingle();
  return (data?.stripe_customer_id as string | null) ?? null;
}

/** Email lives in auth.users, not in any public table. */
async function readAuthEmail(userId: string): Promise<string | undefined> {
  const { data } = await createSupabaseServiceClient().auth.admin.getUserById(userId);
  return data?.user?.email ?? undefined;
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

/**
 * Can THIS platform use the connected account we have stored?
 *
 * A Connect account belongs to the platform and mode that created it. An
 * account created under test keys cannot be read with a live key, and vice
 * versa — Stripe answers `resource_missing`, exactly as it would for an id
 * that never existed.
 *
 * That is not hypothetical here. Helper accounts were created in May under
 * test keys; the platform went live on 2026-10-28. Every one of those ids
 * is now unusable, and the code that found one simply handed it to
 * accountLinks.create, which failed, which showed "Payment could not be set
 * up" — on every attempt, for ever, with no way for the helper to get past
 * it.
 *
 * Only a missing-or-inaccessible answer counts. A rate limit or a network
 * blip must NOT be read as "this account is gone", or a transient failure
 * would throw away a working account.
 */
async function connectAccountIsUsable(
  stripe: Stripe,
  accountId: string,
): Promise<{ usable: boolean; account?: Stripe.Account }> {
  try {
    const account = await stripe.accounts.retrieve(accountId);
    return { usable: true, account };
  } catch (err) {
    const e = err as Stripe.errors.StripeError;
    const gone =
      e?.code === "resource_missing" ||
      e?.type === "StripePermissionError" ||
      (e?.type === "StripeInvalidRequestError" && /no such account/i.test(e?.message ?? ""));
    if (gone) return { usable: false };
    // Anything else: assume the account is fine and let the real call
    // report the real problem.
    console.error("could not verify connect account", accountId, e?.message);
    return { usable: true };
  }
}

/**
 * Which country this helper's Connect account must be created in.
 *
 * The cities they ticked outrank profiles.country. Someone who chose Lower
 * Mainland municipalities works in Canada, and that was a deliberate choice
 * about where they will physically go — whereas profiles.country took the
 * column default for every account created before migration 0078, which is
 * why 93 of 94 profiles said US.
 *
 * This matters more than most defaults because **a Connect account's
 * country cannot be changed afterwards**. Getting it wrong hands a
 * Canadian helper a form asking for a Social Security number, and the only
 * remedy is a different account.
 */
async function connectCountryFor(
  admin: ReturnType<typeof createSupabaseServiceClient>,
  providerId: string,
): Promise<"US" | "CA"> {
  const { data: cities } = await admin
    .from("provider_cities")
    .select("area_id")
    .eq("provider_id", providerId)
    .limit(1);

  const areaId = cities?.[0]?.area_id as string | undefined;
  if (areaId === "lower-mainland-bc") return "CA";
  if (areaId === "san-diego-ca") return "US";

  const { data: person } = await admin
    .from("profiles")
    .select("country")
    .eq("id", providerId)
    .single();
  return person?.country === "CA" ? "CA" : "US";
}

export async function startHelperOnboarding(
  providerId: string,
  returnTo: string,
): Promise<PaymentResult<{ url: string; accountId: string }>> {
  if (!stripeConfigured()) return fail("not_configured", "Payouts are not available yet.");
  const stripe = await stripeForHelper(providerId);
  const admin = createSupabaseServiceClient();

  const { data: profile } = await admin
    .from("provider_profiles")
    .select("user_id, stripe_connect_account_id")
    .eq("user_id", providerId)
    .single();
  if (!profile) return fail("no_profile", "Helper profile not found.");

  let accountId = profile.stripe_connect_account_id as string | null;

  try {
    // A stored id this platform cannot use is worse than no id at all: it
    // fails identically every time and there is no path forward. Discard it
    // and start again. Nothing of ours can be inside an account our own key
    // cannot read, so there is nothing to lose by replacing it — but the
    // derived flags must go too, or the dashboard keeps reporting the dead
    // account's requirements against the new one.
    const wantCountry = await connectCountryFor(admin, providerId);

    let replaceReason: string | null = null;
    if (accountId) {
      const check = await connectAccountIsUsable(stripe, accountId);
      if (!check.usable) {
        replaceReason = "unusable";
      } else if (
        check.account &&
        check.account.country !== wantCountry &&
        // Only when NOTHING has been entered. An account with submitted
        // details may hold verification documents and a bank account, and
        // throwing that away to fix a country is not ours to decide.
        check.account.details_submitted === false
      ) {
        replaceReason = `wrong country (${check.account.country}, needs ${wantCountry})`;
      }
    }

    if (replaceReason) {
      console.warn("replacing connect account", accountId, replaceReason, "for", providerId);
      const { error } = await admin
        .from("provider_profiles")
        .update({
          stripe_connect_account_id: null,
          stripe_details_submitted: false,
          stripe_transfers_active: false,
          stripe_charges_enabled: false,
          stripe_payouts_enabled: false,
          // NOT NULL jsonb. Setting it to null failed the whole update with
          // a 23502, so the account could never actually be cleared and the
          // helper saw "Could not restart payout setup" for ever. An empty
          // list is what "no outstanding requirements" means here.
          stripe_requirements_due: [],
          stripe_disabled_reason: null,
          stripe_onboarded_at: null,
        })
        .eq("user_id", providerId);
      if (error) {
        console.error("could not clear unusable connect account", accountId, error);
        return fail("persist_failed", "Could not restart payout setup. Please try again.");
      }
      accountId = null;
    }

    if (!accountId) {
      const account = await stripe.accounts.create({
        country: wantCountry,
        email: await readAuthEmail(providerId),
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
    // Record what Stripe actually said.
    //
    // fromStripeError deliberately replaces Stripe's text with something a
    // helper can read, and console.error only reaches a log nobody can
    // retrieve after the fact. That left "Stripe refused that request" as
    // the ONLY evidence of a failure that is blocking onboarding — not
    // enough to diagnose anything. The code, the param and the request id
    // are developer-facing but not secret, and without them the next
    // attempt is a guess.
    const e = err as Stripe.errors.StripeError;
    try {
      await admin.from("audit_log").insert({
        actor_id: providerId,
        action: "connect.onboarding_failed",
        target_table: "provider_profiles",
        target_id: providerId,
        payload: {
          account_id: accountId,
          type: e?.type ?? null,
          code: e?.code ?? null,
          param: (e as { param?: string })?.param ?? null,
          message: e?.message ?? String(err),
          request_id: (e as { requestId?: string })?.requestId ?? null,
          statusCode: (e as { statusCode?: number })?.statusCode ?? null,
        },
      });
    } catch (logErr) {
      console.error("could not record connect failure", logErr);
    }
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
  const admin = createSupabaseServiceClient();
  /*
    Only the account id is given, so the helper is looked up from it. A
    review helper's connected account lives in test Stripe and would not
    be found by the live client at all.
  */
  const { data: owner } = await admin
    .from("provider_profiles")
    .select("user_id")
    .eq("stripe_connect_account_id", accountId)
    .maybeSingle();
  /*
    No owner row for this account id, so there is no customer to resolve
    a mode from. Live is the safe default: an unknown account is far
    more likely to be a live one, and guessing test here would look for
    a live connected account in the test dashboard and report it
    unpayable.
  */
  const stripe = owner?.user_id
    ? await stripeForHelper(owner.user_id as string)
    : getStripe();

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
/*
  WHICH STRIPE A GIVEN CUSTOMER TRANSACTS AGAINST.

  An App Review account uses Stripe TEST mode, because live mode rejects
  a test card and a reviewer must not be charged real money. Everything
  else about their booking is real: a real SetupIntent, a real
  authorisation, a real capture. The alternative — skipping capture or
  writing the payment status by hand for review accounts — would show a
  reviewer a transition that never happened, and that is the one thing
  worth refusing to do.

  Resolved from the DATABASE, never from anything the caller passed, so
  a client cannot ask to be billed in test mode.
*/
/** Is this helper the controlled App Review helper? */
async function isReviewHelper(userId: string): Promise<boolean> {
  const admin = createSupabaseServiceClient();
  const { data } = await admin
    .from("provider_profiles")
    .select("is_review_helper")
    .eq("user_id", userId)
    .maybeSingle();
  return Boolean(data?.is_review_helper);
}

/*
  The connected account a helper is paid through must live in the same
  Stripe mode as the bookings they take. A test-mode destination charge
  cannot pay a live connected account, and a review helper onboarded
  against live Stripe would be a real payout account created for a
  demonstration.
*/
async function stripeForHelper(userId: string) {
  return getStripeFor(await isReviewHelper(userId));
}

async function isReviewCustomer(userId: string): Promise<boolean> {
  const admin = createSupabaseServiceClient();
  const { data } = await admin
    .from("profiles")
    .select("is_review_account")
    .eq("id", userId)
    .maybeSingle();
  return Boolean(data?.is_review_account);
}

/** The mode a booking transacts in, from its customer. */
async function stripeForBooking(bookingId: string) {
  const admin = createSupabaseServiceClient();
  const { data } = await admin
    .from("bookings")
    .select("customer_id")
    .eq("id", bookingId)
    .maybeSingle();
  /*
    Booking not found, so nobody to resolve a mode from. Live is the
    safe default in this direction: the failure it produces is a lookup
    that finds nothing, whereas defaulting to test could let an unknown
    booking transact against test money and become a free booking.
  */
  return data?.customer_id
    ? stripeForUser(data.customer_id as string)
    : getStripe();
}

async function stripeForUser(userId: string) {
  return getStripeFor(await isReviewCustomer(userId));
}

export async function ensureStripeCustomer(userId: string): Promise<PaymentResult<{ customerId: string }>> {
  if (!stripeConfigured()) return fail("not_configured", "Payments are not available yet.");
  const stripe = await stripeForUser(userId);
  const admin = createSupabaseServiceClient();

  const existing = await readStripeCustomerId(userId);
  if (existing) return { ok: true, customerId: existing };

  const { data: profile } = await admin
    .from("profiles")
    .select("id, full_name")
    .eq("id", userId)
    .single();
  if (!profile) return fail("no_profile", "Account not found.");

  try {
    const customer = await stripe.customers.create({
      email: await readAuthEmail(userId),
      name: profile.full_name ?? undefined,
      metadata: { helpward_user_id: userId },
    });
    // Upsert: a customer who has never had one has no customer_profiles
    // row yet, and an UPDATE would silently affect zero rows.
    const { error } = await admin
      .from("customer_profiles")
      .upsert({ user_id: userId, stripe_customer_id: customer.id }, { onConflict: "user_id" });
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
    const intent = await (await stripeForUser(userId)).setupIntents.create({
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
): Promise<PaymentResult<{
  paymentIntentId: string;
  /** The bank wants the customer present. Nothing is held until they are. */
  requiresAction: boolean;
  /** Only set when requiresAction — what Stripe.js needs to run the challenge. */
  clientSecret?: string | null;
}>> {
  if (!stripeConfigured()) return fail("not_configured", "Payments are not available yet.");
  const admin = createSupabaseServiceClient();

  const booking = await loadBooking(bookingId);
  if (!booking) return fail("no_booking", "Booking not found.");
  // Test mode for a review booking, live for everyone else.
  const stripe = await stripeForUser(booking.customer_id);

  // Idempotent: a retried acceptance must not place a second hold.
  //
  // The intent's CURRENT status is checked rather than assumed. An intent
  // id on the booking previously counted as success, so a booking whose
  // authorization had been cancelled, had expired, or was still waiting on
  // a 3DS challenge reported "already authorized" and went ahead unpaid.
  if (booking.stripe_payment_intent_id) {
    try {
      const existing = await stripe.paymentIntents.retrieve(booking.stripe_payment_intent_id);
      if (existing.status === "requires_capture" || existing.status === "succeeded") {
        return { ok: true, paymentIntentId: existing.id, requiresAction: false };
      }
      if (existing.status === "requires_action") {
        return {
          ok: true, paymentIntentId: existing.id,
          requiresAction: true, clientSecret: existing.client_secret,
        };
      }
      // canceled / requires_payment_method — the hold is gone. Fall
      // through and place a new one.
      console.warn("stale payment intent on booking", bookingId, existing.status);
    } catch (err) {
      console.error("could not read existing intent", booking.stripe_payment_intent_id, err);
      return fail("intent_unreadable", "Could not check the payment on this booking.");
    }
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

  const customerId = await readStripeCustomerId(booking.customer_id);
  if (!customerId) {
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
        customer: customerId,
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
      // Survives a retried server action without double-authorizing. The
      // amount is in the key so a re-quoted booking cannot silently reuse
      // a hold for a different total.
      { idempotencyKey: `hw-auth-${booking.id}-${booking.total_cents}` },
    );

    const held = intent.status === "requires_capture";
    const { error: writeError } = await admin
      .from("bookings")
      .update({
        stripe_payment_intent_id: intent.id,
        payment_status: held ? "authorized" : "pending",
        authorized_at: held ? new Date().toISOString() : null,
        payment_error: intent.status === "requires_action"
          ? "Waiting for the customer to confirm this payment with their bank."
          : null,
      })
      .eq("id", booking.id);

    // A hold exists at Stripe that we failed to record. Left unsaid, the
    // next acceptance attempt places a SECOND hold on the customer's card.
    if (writeError) {
      console.error("AUTHORIZED BUT NOT RECORDED", {
        bookingId: booking.id, intent: intent.id, error: writeError,
      });
      // Not "support has been notified": this writes a server log and
      // nothing else. Telling someone help is already coming, when the
      // hold is on THEIR card, is the worst place to be wrong about it.
      return fail(
        "persist_failed",
        "Your card was authorized but we could not record it, so this booking is not confirmed. "
        + "Do not try again — that would place a second hold. Email support@helpward.com with the "
        + "time this happened and we will release it.",
      );
    }

    return {
      ok: true,
      paymentIntentId: intent.id,
      requiresAction: intent.status === "requires_action",
      clientSecret: intent.status === "requires_action" ? intent.client_secret : null,
    };
  } catch (err) {
    // A card that always challenges does NOT come back as a
    // requires_action intent. Confirming off_session raises a
    // StripeCardError with code "authentication_required", and the intent
    // it carries sits at requires_payment_method. Treated as an ordinary
    // decline, that cancelled the booking outright — the customer had a
    // perfectly good card and no way to use it.
    const e = err as Stripe.errors.StripeCardError;
    const stranded = e?.code === "authentication_required" ? e.payment_intent : undefined;

    if (stranded?.id) {
      const { error: writeError } = await admin
        .from("bookings")
        .update({
          stripe_payment_intent_id: stranded.id,
          payment_status: "pending",
          authorized_at: null,
          payment_error: "Waiting for the customer to confirm this payment with their bank.",
        })
        .eq("id", booking.id);
      if (writeError) {
        console.error("AUTH-REQUIRED INTENT NOT RECORDED", {
          bookingId: booking.id, intent: stranded.id, error: writeError,
        });
        return fail("persist_failed", "Could not set up that payment. Please try again.");
      }
      return {
        ok: true,
        paymentIntentId: stranded.id,
        requiresAction: true,
        clientSecret: stranded.client_secret ?? null,
      };
    }

    const problem = fromStripeError(err);
    await admin
      .from("bookings")
      .update({ payment_status: "failed", payment_error: problem.message })
      .eq("id", booking.id);
    return problem;
  }
}

/**
 * Re-read an intent that needed a bank challenge and record the outcome.
 *
 * Called when the customer returns from authenticating. The status is read
 * from Stripe, never taken from the browser: the page that calls this can
 * only say "I finished", not "it worked".
 */
export async function confirmPendingAuthorization(
  bookingId: string,
): Promise<PaymentResult<{ authorized: boolean }>> {
  if (!stripeConfigured()) return fail("not_configured", "Payments are not available yet.");
  const admin = createSupabaseServiceClient();

  const booking = await loadBooking(bookingId);
  if (!booking) return fail("no_booking", "Booking not found.");
  if (!booking.stripe_payment_intent_id) return fail("not_authorized", "Nothing to confirm.");
  if (booking.payment_status === "authorized" || booking.payment_status === "captured") {
    return { ok: true, authorized: true };
  }

  try {
    const intent = await (await stripeForBooking(bookingId)).paymentIntents.retrieve(booking.stripe_payment_intent_id);
    const held = intent.status === "requires_capture" || intent.status === "succeeded";

    await admin
      .from("bookings")
      .update({
        payment_status: held ? "authorized" : "pending",
        authorized_at: held ? new Date().toISOString() : null,
        payment_error: held
          ? null
          : intent.last_payment_error?.message
            ?? "This payment still needs to be confirmed with your bank.",
      })
      .eq("id", booking.id);

    return { ok: true, authorized: held };
  } catch (err) {
    return fromStripeError(err);
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
  const admin = createSupabaseServiceClient();

  const booking = await loadBooking(bookingId);
  if (!booking) return fail("no_booking", "Booking not found.");
  // Test mode for a review booking, live for everyone else.
  const stripe = await stripeForUser(booking.customer_id);
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
    await (await stripeForBooking(bookingId)).paymentIntents.cancel(booking.stripe_payment_intent_id);
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
  const admin = createSupabaseServiceClient();

  const booking = await loadBooking(bookingId);
  if (!booking) return fail("no_booking", "Booking not found.");
  // Test mode for a review booking, live for everyone else.
  const stripe = await stripeForUser(booking.customer_id);
  if (booking.payment_status !== "captured") {
    return fail("not_captured", "You can only tip a booking that has been paid for.");
  }

  const { data: helper } = await admin
    .from("provider_profiles")
    .select("stripe_connect_account_id")
    .eq("user_id", booking.provider_id)
    .single();
  const tipCustomerId = await readStripeCustomerId(booking.customer_id);
  const { data: card } = await admin
    .from("payment_methods")
    .select("stripe_payment_method_id")
    .eq("customer_id", booking.customer_id)
    .order("is_default", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!helper?.stripe_connect_account_id) return fail("helper_not_payable", "Helper cannot receive payouts.");
  if (!tipCustomerId || !card?.stripe_payment_method_id) {
    return fail("no_payment_method", "No saved card to charge the tip to.");
  }

  try {
    const intent = await stripe.paymentIntents.create(
      {
        amount: tipCents,
        currency: booking.currency.toLowerCase(),
        customer: tipCustomerId,
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

/* =========================================================================
   Saving a card
   ========================================================================= */

export type SavedCard = {
  id: string;
  brand: string | null;
  last4: string | null;
  expMonth: number | null;
  expYear: number | null;
  isDefault: boolean;
};

/**
 * Persist a card the customer just entered, after confirming with Stripe
 * that it is real and theirs.
 *
 * The client sends only a SetupIntent id. Everything recorded is read back
 * from Stripe: the browser cannot assert a card it does not have, cannot
 * attach someone else's payment method, and cannot invent a brand or last4.
 */
export async function saveCardFromSetupIntent(
  userId: string,
  setupIntentId: string,
): Promise<PaymentResult<{ card: SavedCard }>> {
  if (!stripeConfigured()) return fail("not_configured", "Payments are not available yet.");
  if (!/^seti_[A-Za-z0-9_]+$/.test(setupIntentId ?? "")) {
    return fail("bad_intent", "That card could not be saved. Please try again.");
  }
  const stripe = await stripeForUser(userId);
  const admin = createSupabaseServiceClient();

  const savedForCustomer = await readStripeCustomerId(userId);
  if (!savedForCustomer) {
    return fail("no_customer", "That card could not be saved. Please try again.");
  }

  try {
    const intent = await stripe.setupIntents.retrieve(setupIntentId, {
      expand: ["payment_method"],
    });

    // Ownership, not just validity. Without this check any customer could
    // post another customer's SetupIntent id and attach their card.
    if (intent.customer !== savedForCustomer) {
      console.error("setup intent/customer mismatch", { setupIntentId, userId });
      return fail("not_yours", "That card could not be saved. Please try again.");
    }
    if (intent.status !== "succeeded") {
      return fail("not_complete", "That card was not confirmed. Please try again.");
    }

    const pm = intent.payment_method as Stripe.PaymentMethod | null;
    if (!pm || typeof pm === "string" || !pm.card) {
      return fail("no_card", "That card could not be read. Please try again.");
    }

    // First card becomes the default; later ones do not silently take over.
    const { count } = await admin
      .from("payment_methods")
      .select("id", { count: "exact", head: true })
      .eq("customer_id", userId);
    const isFirst = (count ?? 0) === 0;

    const { data: saved, error } = await admin
      .from("payment_methods")
      .upsert(
        {
          customer_id: userId,
          stripe_payment_method_id: pm.id,
          type: pm.type,
          brand: pm.card.brand,
          last4: pm.card.last4,
          exp_month: pm.card.exp_month,
          exp_year: pm.card.exp_year,
          is_default: isFirst,
        },
        { onConflict: "stripe_payment_method_id" },
      )
      .select("id, brand, last4, exp_month, exp_year, is_default")
      .single();
    if (error) return fail("persist_failed", error.message);

    return {
      ok: true,
      card: {
        id: saved.id,
        brand: saved.brand,
        last4: saved.last4,
        expMonth: saved.exp_month,
        expYear: saved.exp_year,
        isDefault: saved.is_default,
      },
    };
  } catch (err) {
    return fromStripeError(err);
  }
}

/** Detach a card from Stripe and forget it here. */
export async function removeCard(userId: string, cardId: string): Promise<PaymentResult> {
  if (!stripeConfigured()) return fail("not_configured", "Payments are not available yet.");
  const admin = createSupabaseServiceClient();

  const { data: card } = await admin
    .from("payment_methods")
    .select("id, stripe_payment_method_id, is_default, customer_id")
    .eq("id", cardId)
    .eq("customer_id", userId)   // ownership, enforced in the query
    .maybeSingle();
  if (!card) return fail("not_found", "Card not found.");

  try {
    await (await stripeForUser(userId)).paymentMethods.detach(card.stripe_payment_method_id);
  } catch (err) {
    // A card already detached at Stripe should still disappear from here.
    console.warn("detach failed, removing locally anyway", cardId, err);
  }

  await admin.from("payment_methods").delete().eq("id", cardId).eq("customer_id", userId);

  // Never leave a customer with cards but no default — authorization picks
  // the default, and a null default means every booking fails.
  if (card.is_default) {
    const { data: next } = await admin
      .from("payment_methods")
      .select("id")
      .eq("customer_id", userId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (next) {
      await admin.from("payment_methods").update({ is_default: true }).eq("id", next.id);
    }
  }
  return { ok: true };
}

/** Make one saved card the default, clearing the others. */
export async function setDefaultCard(userId: string, cardId: string): Promise<PaymentResult> {
  const admin = createSupabaseServiceClient();
  const { data: card } = await admin
    .from("payment_methods")
    .select("id")
    .eq("id", cardId)
    .eq("customer_id", userId)
    .maybeSingle();
  if (!card) return fail("not_found", "Card not found.");

  await admin.from("payment_methods").update({ is_default: false }).eq("customer_id", userId);
  await admin.from("payment_methods").update({ is_default: true }).eq("id", cardId);
  return { ok: true };
}

/** Does this customer have a card we can authorize against? */
export async function hasUsableCard(userId: string): Promise<boolean> {
  const admin = createSupabaseServiceClient();
  const { count } = await admin
    .from("payment_methods")
    .select("id", { count: "exact", head: true })
    .eq("customer_id", userId);
  return (count ?? 0) > 0;
}

/* =========================================================================
   Refunds
   ========================================================================= */

/**
 * How much of an intent is still refundable, according to Stripe.
 *
 * Derived rather than tracked. A local counter drifts the moment a refund
 * is issued from the Stripe dashboard, and the booking's payment_status is
 * a label, not an amount — treating "partial_refund" as "nothing left"
 * is what refused a legitimate second partial refund.
 */
/*
  Takes the client rather than choosing one. It only has an intent id,
  and an intent id does not say which Stripe mode it belongs to — so the
  caller, which knows the booking, passes the right client in. Guessing
  here would look at a test intent through the live client and report
  nothing refundable.
*/
async function remainingRefundable(stripe: Stripe, intentId: string): Promise<number> {
  const intent = await stripe.paymentIntents.retrieve(intentId, { expand: ["latest_charge"] });
  const charge = intent.latest_charge as Stripe.Charge | string | null;
  if (!charge || typeof charge === "string") return 0;
  return Math.max(0, (charge.amount_captured ?? 0) - (charge.amount_refunded ?? 0));
}

export type RefundLeg = {
  kind: "job" | "tip";
  paymentIntentId: string;
  refundId: string;
  amountCents: number;
  helperShareReversed: boolean;
};

/**
 * Refund a booking.
 *
 * A booking can hold TWO charges. The job is authorized at acceptance and
 * captured at completion; a tip is a separate PaymentIntent raised
 * afterwards, because a capture can never exceed the amount authorized.
 * They have to be refunded separately — the first version refunded
 * `total_cents` against the job's intent, and total_cents includes the
 * tip, so a $24.50 job with a $5 tip tried to refund $29.50 from a $24.50
 * charge and Stripe refused the whole thing.
 *
 * TIP POLICY: a tip is not refunded unless asked for. It is money the
 * customer chose to give for work that was done, and the common refund
 * case — a service problem — does not make the helper's tip undeserved.
 * `includeTip` is the explicit opt-in.
 *
 * `reverse_transfer` is what protects Helpward. A destination charge
 * belongs to the platform, so a plain refund comes entirely out of
 * Helpward's balance and the helper keeps their 80% of a job the customer
 * is no longer paying for. Measured: refunding $10 of a $54.50 job plainly
 * left the helper untouched; with reversal their balance fell $7.34.
 */
export async function refundBooking(
  bookingId: string,
  opts: {
    /**
     * Amount to refund from the JOB charge, in cents. Omit to refund
     * everything still refundable on it.
     */
    amountCents?: number;
    /** Also refund the tip, in full. Defaults to false — see TIP POLICY. */
    includeTip?: boolean;
    /**
     * Leave the helper paid and absorb the refund entirely. Only correct
     * when the work was done and this is goodwill.
     */
    absorbHelperShare?: boolean;
    reason?: "duplicate" | "fraudulent" | "requested_by_customer";
    /**
     * Distinguishes two legitimate refunds of the same size from one
     * retried refund. Without it, Stripe's idempotency replays the first.
     */
    operationId?: string;
  } = {},
): Promise<PaymentResult<{ legs: RefundLeg[]; totalRefundedCents: number }>> {
  if (!stripeConfigured()) return fail("not_configured", "Refunds are not available yet.");
  const stripe = await stripeForBooking(bookingId);
  const admin = createSupabaseServiceClient();

  const { data: bookingRow } = await admin
    .from("bookings")
    .select(
      "id, status, payment_status, total_cents, tip_cents," +
        " stripe_payment_intent_id, tip_payment_intent_id",
    )
    .eq("id", bookingId)
    .maybeSingle();

  const booking = bookingRow as unknown as {
    id: string;
    status: string;
    payment_status: string;
    total_cents: number;
    tip_cents: number | null;
    stripe_payment_intent_id: string | null;
    tip_payment_intent_id: string | null;
  } | null;

  if (!booking) return fail("no_booking", "Booking not found.");
  if (!booking.stripe_payment_intent_id) {
    return fail("nothing_to_refund", "This booking was never charged.");
  }

  // Only a booking that was never charged is categorically un-refundable.
  // Everything else is decided by how much money is actually left, read
  // from Stripe below — NOT by the payment_status label. The old check was
  // `payment_status !== "captured"`, so the first partial refund flipped
  // the label and locked out every later one with money still captured;
  // and a fully refunded JOB blocked refunding the tip, which is a
  // separate charge that had not been touched.
  if (["pending", "authorized", "failed"].includes(booking.payment_status)) {
    return fail(
      "not_captured",
      "This booking has not been charged — cancel it to release the hold instead.",
    );
  }

  const reverse = !opts.absorbHelperShare;
  const legs: RefundLeg[] = [];

  try {
    // ---- the job charge -------------------------------------------------
    const jobRefundable = await remainingRefundable(stripe, booking.stripe_payment_intent_id);
    const tipRefundableNow = opts.includeTip && booking.tip_payment_intent_id
      ? await remainingRefundable(stripe, booking.tip_payment_intent_id)
      : 0;

    // Asking for everything when the job is spent but the tip is not is a
    // valid tip-only refund, not an error.
    const jobAmount = opts.amountCents ?? jobRefundable;

    if (jobRefundable === 0 && tipRefundableNow === 0) {
      return fail("already_refunded", "This booking has already been fully refunded.");
    }

    if (jobAmount > jobRefundable) {
      return fail(
        "exceeds_refundable",
        jobRefundable === 0
          ? "Nothing is left to refund on this booking."
          : `Only ${(jobRefundable / 100).toFixed(2)} is left to refund on this booking.`,
      );
    }

    if (jobAmount > 0) {
      const refund = await stripe.refunds.create(
        {
          payment_intent: booking.stripe_payment_intent_id,
          amount: jobAmount,
          reverse_transfer: reverse,
          refund_application_fee: reverse,
          ...(opts.reason ? { reason: opts.reason } : {}),
          metadata: { helpward_booking_id: booking.id, helpward_leg: "job" },
        },
        {
          idempotencyKey:
            `hw-refund-${booking.id}-job-${jobAmount}-${reverse ? "rev" : "abs"}` +
            (opts.operationId ? `-${opts.operationId}` : ""),
        },
      );
      legs.push({
        kind: "job", paymentIntentId: booking.stripe_payment_intent_id,
        refundId: refund.id, amountCents: jobAmount, helperShareReversed: reverse,
      });
    }

    // ---- the tip charge, only if asked for ------------------------------
    if (opts.includeTip && booking.tip_payment_intent_id) {
      const tipRefundable = tipRefundableNow;
      if (tipRefundable > 0) {
        const tipRefund = await stripe.refunds.create(
          {
            payment_intent: booking.tip_payment_intent_id,
            amount: tipRefundable,
            // The tip carried no application fee — all of it went to the
            // helper — so reversing the transfer is the whole refund.
            reverse_transfer: reverse,
            ...(opts.reason ? { reason: opts.reason } : {}),
            metadata: { helpward_booking_id: booking.id, helpward_leg: "tip" },
          },
          {
            idempotencyKey:
              `hw-refund-${booking.id}-tip-${tipRefundable}-${reverse ? "rev" : "abs"}` +
              (opts.operationId ? `-${opts.operationId}` : ""),
          },
        );
        legs.push({
          kind: "tip", paymentIntentId: booking.tip_payment_intent_id,
          refundId: tipRefund.id, amountCents: tipRefundable, helperShareReversed: reverse,
        });
      }
    }

    if (legs.length === 0) {
      return fail("nothing_to_refund", "Nothing is left to refund on this booking.");
    }

    // ---- record ---------------------------------------------------------
    // Status from what Stripe says is LEFT, not from what we just asked
    // for: a refund issued elsewhere would otherwise be overwritten.
    const jobLeft = await remainingRefundable(stripe, booking.stripe_payment_intent_id);
    const tipLeft = booking.tip_payment_intent_id
      ? await remainingRefundable(stripe, booking.tip_payment_intent_id)
      : 0;
    // "Refunded" means nothing is left on either charge.
    const fullyRefunded = jobLeft === 0 && tipLeft === 0;

    const { error: statusError } = await admin
      .from("bookings")
      .update({
        payment_status: fullyRefunded ? "refunded" : "partial_refund",
        payment_error: null,
      })
      .eq("id", booking.id);
    if (statusError) {
      console.error("REFUND ISSUED BUT STATUS NOT RECORDED", { bookingId, legs, statusError });
    }

    // One row per leg, each carrying its own Stripe id, so the two charges
    // can be reconciled independently.
    const { error: ledgerError } = await admin.from("refunds").insert(
      legs.map((leg) => ({
        booking_id: booking.id,
        stripe_refund_id: leg.refundId,
        amount_cents: leg.amountCents,
        reason: opts.reason ?? "requested_by_customer",
        // NOT NULL on this table. Omitting it silently failed every ledger
        // insert while the refunds themselves succeeded at Stripe — money
        // moved and nothing recorded it.
        status: "succeeded",
      })),
    );
    if (ledgerError) {
      console.error("REFUND ISSUED BUT NOT LEDGERED", { bookingId, legs, ledgerError });
    }

    return {
      ok: true,
      legs,
      totalRefundedCents: legs.reduce((n, l) => n + l.amountCents, 0),
    };
  } catch (err) {
    // Refund-specific wording. fromStripeError's invalid-request branch
    // says "Payment could not be set up", which is what a failed refund
    // reported — a message about setting up a payment, for an operation
    // that returns money.
    const e = err as Stripe.errors.StripeError;
    if (e?.type === "StripeInvalidRequestError") {
      console.error("refund rejected by Stripe:", e.message);
      return fail("refund_rejected", e.message ?? "That refund could not be processed.");
    }
    return fromStripeError(err);
  }
}

/**
 * The client secret for a booking whose authorization is waiting on a bank
 * challenge, for the customer to complete it.
 *
 * Ownership is checked here rather than trusted from the page: a client
 * secret is enough to act on a PaymentIntent, so handing one to the wrong
 * person would be handing them someone else's payment.
 */
export async function pendingAuthorizationSecret(
  bookingId: string,
  userId: string,
): Promise<PaymentResult<{
  clientSecret: string;
  amountCents: number;
  currency: string;
  /**
   * The customer's saved card, resolved HERE from their own records.
   *
   * A failed off-session confirm leaves the PaymentIntent with no payment
   * method attached, so confirming again with only the client secret
   * fails: "PaymentIntent does not have a payment method and none was
   * provided." The card has to be supplied again.
   *
   * Resolved server-side and never taken from the caller: a client that
   * could name the card would be choosing what gets charged.
   */
  paymentMethodId: string;
}>> {
  if (!stripeConfigured()) return fail("not_configured", "Payments are not available yet.");

  const booking = await loadBooking(bookingId);
  if (!booking) return fail("no_booking", "Booking not found.");
  if (booking.customer_id !== userId) {
    return fail("not_yours", "Booking not found.");
  }
  if (!booking.stripe_payment_intent_id) {
    return fail("nothing_pending", "There is no payment waiting on this booking.");
  }

  try {
    const intent = await (await stripeForBooking(bookingId)).paymentIntents.retrieve(booking.stripe_payment_intent_id);

    // The hold EXISTS at Stripe but the booking never heard about it.
    //
    // This is the gap independent testing found: the bank approved, the
    // connection dropped before the app recorded it, and from then on the
    // customer was told "this payment is already confirmed" while the
    // helper's Start button stayed disabled and Stripe held the money.
    // Reporting the truth was not enough — the booking had to be repaired.
    //
    // Idempotent, and it creates no second hold: it only writes down what
    // Stripe already did.
    if (intent.status === "requires_capture" || intent.status === "succeeded") {
      if (booking.payment_status !== "authorized" && booking.payment_status !== "captured") {
        const { error: repairError } = await createSupabaseServiceClient()
          .from("bookings")
          .update({
            payment_status: "authorized",
            authorized_at: new Date().toISOString(),
            payment_error: null,
          })
          .eq("id", bookingId);
        if (repairError) {
          console.error("RECONCILE FAILED: Stripe holds the money, booking still blocked", {
            bookingId, intent: intent.id, repairError,
          });
          // Same correction: logged, not notified. The money is held at
          // Stripe and the booking is stuck, so the instruction has to be
          // "contact us", not "wait".
          return fail("reconcile_failed",
            "Your payment went through but we could not record it, so the booking is still blocked. "
            + "Do not retry. Email support@helpward.com with the time and we will sort it out.");
        }
        console.warn("reconciled a hold Stripe had and the booking did not", {
          bookingId, intent: intent.id,
        });
      }
      return fail("already_authorized", "This payment is confirmed — your helper can start.");
    }
    // requires_payment_method is normally a dead intent, EXCEPT when the
    // reason is authentication_required: that one is recoverable by
    // confirming again with the customer present, using the card already
    // attached to it.
    const recoverable =
      intent.status === "requires_action" ||
      intent.status === "requires_confirmation" ||
      (intent.status === "requires_payment_method" &&
        intent.last_payment_error?.code === "authentication_required");

    if (!recoverable) {
      return fail("not_confirmable", "This payment can't be confirmed — please contact support.");
    }
    if (!intent.client_secret) return fail("no_secret", "Could not start confirmation.");

    // Prefer whatever is still on the intent; otherwise fall back to the
    // customer's default saved card. The second case is the normal one
    // after an authentication_required failure.
    let paymentMethodId =
      typeof intent.payment_method === "string"
        ? intent.payment_method
        : intent.payment_method?.id ?? null;

    if (!paymentMethodId) {
      const { data: card } = await createSupabaseServiceClient()
        .from("payment_methods")
        .select("stripe_payment_method_id")
        .eq("customer_id", userId)
        .order("is_default", { ascending: false })
        .limit(1)
        .maybeSingle();
      paymentMethodId = (card?.stripe_payment_method_id as string | undefined) ?? null;
    }

    if (!paymentMethodId) {
      return fail("no_payment_method", "Add a payment method, then try again.");
    }

    // Put it back on the intent as well. The client passes it too, but the
    // intent being complete server-side is what makes the confirmation
    // independent of what the browser sends.
    if (intent.status === "requires_payment_method") {
      try {
        await (await stripeForBooking(bookingId)).paymentIntents.update(intent.id, { payment_method: paymentMethodId });
      } catch (err) {
        console.error("could not reattach payment method", intent.id, err);
      }
    }

    return {
      ok: true,
      clientSecret: intent.client_secret,
      amountCents: intent.amount,
      currency: intent.currency.toUpperCase(),
      paymentMethodId,
    };
  } catch (err) {
    return fromStripeError(err);
  }
}

/* =========================================================================
   Paying a crew
   ========================================================================= */

/**
 * Pay the helpers on a crewed job who are not the lead.
 *
 * A destination charge has exactly ONE destination, so capture sends the
 * whole payout to the lead's connected account. Everyone else is paid by
 * a separate transfer out of the platform balance, against the same
 * charge — which keeps them linked for reporting and for reversal if the
 * booking is later refunded.
 *
 * Each share was fixed when that helper accepted, so a rate change
 * afterwards cannot alter what an already-committed helper is owed.
 *
 * Called after capture. A failure here does not un-complete the job: the
 * helpers worked. It is recorded and left for support, which is a
 * collections problem rather than a dispatch one.
 */
export async function payCrew(
  bookingId: string,
): Promise<PaymentResult<{ paid: number; owedCents: number; failures: string[] }>> {
  if (!stripeConfigured()) return fail("not_configured", "Payouts are not available yet.");
  const stripe = await stripeForBooking(bookingId);
  const admin = createSupabaseServiceClient();

  const booking = await loadBooking(bookingId);
  if (!booking) return fail("no_booking", "Booking not found.");
  if (booking.payment_status !== "captured") {
    return fail("not_captured", "The job has not been paid for yet.");
  }

  const { data: charge } = await admin
    .from("bookings")
    .select("stripe_charge_id")
    .eq("id", bookingId)
    .single();

  const { data: crew } = await admin
    .from("booking_crew")
    .select("id, provider_id, is_lead, status, share_cents, paid_at")
    .eq("booking_id", bookingId)
    .in("status", ["accepted", "arrived"]);

  // The lead already has their share: capture sent the whole payout to
  // their account as the charge's destination.
  const owed = ((crew ?? []) as Array<{
    id: string; provider_id: string; is_lead: boolean;
    share_cents: number; paid_at: string | null;
  }>).filter((c) => !c.is_lead && !c.paid_at && c.share_cents > 0);

  if (owed.length === 0) return { ok: true, paid: 0, owedCents: 0, failures: [] };

  const failures: string[] = [];
  let paid = 0;

  for (const member of owed) {
    const { data: helper } = await admin
      .from("provider_profiles")
      .select("stripe_connect_account_id, stripe_transfers_active")
      .eq("user_id", member.provider_id)
      .single();

    if (!helper?.stripe_connect_account_id || !helper.stripe_transfers_active) {
      failures.push(`${member.provider_id}: cannot receive transfers`);
      continue;
    }

    try {
      const transfer = await stripe.transfers.create(
        {
          amount: member.share_cents,
          currency: booking.currency.toLowerCase(),
          destination: helper.stripe_connect_account_id,
          // Linking the transfer to the charge keeps the money traceable
          // to the job and lets a refund reverse it.
          ...(charge?.stripe_charge_id ? { source_transaction: charge.stripe_charge_id } : {}),
          metadata: {
            helpward_booking_id: bookingId,
            helpward_provider_id: member.provider_id,
            helpward_kind: "crew_share",
          },
        },
        { idempotencyKey: `hw-crew-${bookingId}-${member.provider_id}` },
      );

      const { error } = await admin
        .from("booking_crew")
        .update({ stripe_transfer_id: transfer.id, paid_at: new Date().toISOString() })
        .eq("id", member.id);
      if (error) {
        // Transferred but not recorded: a retry would pay twice were it
        // not for the idempotency key above, which is why it is there.
        console.error("CREW PAID BUT NOT RECORDED", { bookingId, member, transfer: transfer.id, error });
      }
      paid++;
    } catch (err) {
      const problem = fromStripeError(err);
      console.error("crew transfer failed", { bookingId, member: member.provider_id, problem });
      failures.push(`${member.provider_id}: ${problem.message}`);
    }
  }

  return {
    ok: true,
    paid,
    owedCents: owed.reduce((n, m) => n + m.share_cents, 0),
    failures,
  };
}
