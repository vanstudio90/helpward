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
   successfully, with controller.losses.payments = "application" — meaning
   HELPWARD would carry chargeback liability on helper transactions, and
   helpers would get a Stripe-hosted Express dashboard.

   We are deliberately staying with managed risk:

     - The platform profile the owner filled in says refunds and chargeback
       liability sits with STRIPE. Express contradicts that.
     - A new marketplace with no fraud history is the worst place to absorb
       chargebacks. A helper who takes a disputed job cannot leave Helpward
       with a negative balance under this shape.
     - The Express dashboard's value is helper self-service, and the two
       things helpers actually need are covered without it: earnings are
       rendered at /provider/earnings, and bank details are changed by
       re-issuing an account_onboarding link, which
       startPayoutSetupAction() already does. (account_update links are
       rejected for this shape — account_onboarding IS the update path.)

   Revisit only as a deliberate decision: switching shape changes who pays
   for fraud, and existing connected accounts keep the controller they were
   created with, so a switch splits the estate in two.

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
