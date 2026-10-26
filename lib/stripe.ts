import "server-only";
import Stripe from "stripe";

/* Server-only Stripe client and the Connect account shape this platform
   is actually allowed to create.

   Throws if STRIPE_SECRET_KEY isn't set, so callers fail loudly rather
   than silently no-op'ing. */

let _client: Stripe | null = null;

export function getStripe(): Stripe {
  if (_client) return _client;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      "STRIPE_SECRET_KEY is not set — payments are unavailable until it is.",
    );
  }
  _client = new Stripe(key, {
    apiVersion: "2025-02-24.acacia",
    typescript: true,
    appInfo: { name: "Helpward", url: "https://helpward.com" },
  });
  return _client;
}

export function stripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

/** True when the configured key is a live key. Used to refuse destructive
 *  test-only operations against real money. */
export function stripeIsLive(): boolean {
  return (process.env.STRIPE_SECRET_KEY ?? "").startsWith("sk_live_");
}

/* -------------------------------------------------------------------------
   Connected account shape

   The obvious call — accounts.create({ type: "express" }) — is REJECTED on
   this platform:

     "You tried to create an Accounts v1 connected account using the legacy
      `type` field with your platform as the losses collector."

   Helpward's platform is provisioned with Stripe-managed risk, so Stripe,
   not Helpward, collects payment losses on connected accounts. That is the
   better arrangement for a marketplace this size — a helper who takes a
   chargeback cannot leave Helpward with a negative balance — but it is
   incompatible with the Express dashboard, which Stripe only offers when
   the platform controls losses:

     "With a dashboard type of `express`, the Connect application must
      control losses."

   So helpers get Stripe-hosted onboarding (same screens, same KYC, same
   1099 handling) and no Stripe-hosted dashboard. Helpward renders earnings
   itself at /provider/earnings, which it already did.

   UPDATE, later the same day: completing the Connect platform profile in
   the dashboard changed what the API allows. `type: "express"` now creates
   successfully, with controller.losses.payments = "application", and
   helpers would get a Stripe-hosted Express dashboard.

   We stay with managed risk — but NOT for the reason first written here.

   CORRECTION. The original note claimed this configuration means "a helper
   who takes a disputed job cannot leave Helpward with a negative balance".
   That is wrong, and it is the kind of wrong that would have justified
   skipping real dispute controls.

   controller.losses.payments governs the CONNECTED ACCOUNT's balance —
   who covers it when charges created ON that account go bad. Helpward
   does not create charges on helper accounts. It creates DESTINATION
   charges on the platform and transfers a share onward, so the charge
   belongs to Helpward: a dispute or refund lands on Helpward's balance
   regardless of this setting. Helpward has full chargeback exposure.

   Measured in the sandbox on 2026-10-26, refunding $10 of a $54.50 job:

     plain refund                  helper balance unchanged — Helpward
                                   absorbed all 1000c, the helper's share
                                   of it included
     reverse_transfer=true         helper balance fell by 734c, exactly
       + refund_application_fee    their 4000/5450 share; Helpward paid
                                   only its own 266c

   So the protection that matters is in how refunds are ISSUED, not in the
   controller: see refundBooking() in lib/payments.ts, which reverses the
   transfer by default. The reason to keep this configuration is simply
   that it is what the platform profile declares and what existing
   connected accounts were created with — switching splits the estate in
   two, since an account keeps its controller for life.

   Helpers keep self-service without the Express dashboard: earnings
   render at /provider/earnings, and bank details are changed by
   re-issuing an account_onboarding link, which startPayoutSetupAction()
   already does (account_update links are rejected for this shape).

   Verified against the sandbox on 2026-10-26, 19/19 in
   scripts/verify-payments.mjs: a $50 job holds $54.50 on the customer's
   card, captures, transfers, and leaves exactly $40.00 on the helper's
   balance and $14.50 with Helpward.
   ------------------------------------------------------------------------- */
export const CONNECTED_ACCOUNT_CONTROLLER = {
  losses: { payments: "stripe" },
  fees: { payer: "application" },
  stripe_dashboard: { type: "none" },
  requirement_collection: "stripe",
} as const satisfies Stripe.AccountCreateParams.Controller;

/**
 * card_payments is required alongside transfers under managed risk — Stripe
 * rejects a transfers-only request with "You must request one or more of
 * the following capabilities: [card_payments]".
 */
export const CONNECTED_ACCOUNT_CAPABILITIES = {
  transfers: { requested: true },
  card_payments: { requested: true },
} as const;

export type ConnectReadiness = {
  accountId: string;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  /** Requirements Stripe still needs before payouts can run. */
  currentlyDue: string[];
  /** Set when Stripe has disabled the account outright. */
  disabledReason: string | null;
};

export function readConnectReadiness(account: Stripe.Account): ConnectReadiness {
  return {
    accountId: account.id,
    chargesEnabled: account.charges_enabled === true,
    payoutsEnabled: account.payouts_enabled === true,
    detailsSubmitted: account.details_submitted === true,
    currentlyDue: account.requirements?.currently_due ?? [],
    disabledReason: account.requirements?.disabled_reason ?? null,
  };
}

/**
 * A helper can be paid only when Stripe says transfers will actually land.
 * payouts_enabled alone is not enough: an account can be payouts_enabled
 * while the transfers capability is still inactive, and the destination
 * charge then fails at authorization time with the customer watching.
 */
export function canReceiveTransfers(account: Stripe.Account): boolean {
  return (
    account.payouts_enabled === true &&
    account.capabilities?.transfers === "active"
  );
}
