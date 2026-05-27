import Stripe from "stripe";

let _client: Stripe | null = null;

/* Server-only Stripe client. Throws if STRIPE_SECRET_KEY isn't set so
   callers fail loudly during Phase 4 wiring instead of silently no-op'ing. */
export function getStripe(): Stripe {
  if (_client) return _client;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      "STRIPE_SECRET_KEY is not set — drop it in Vercel env vars to enable payments."
    );
  }
  _client = new Stripe(key, {
    // Latest stable API version as of build time
    apiVersion: "2024-12-18.acacia" as Stripe.LatestApiVersion,
    typescript: true,
  });
  return _client;
}

export function stripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

/* Common amounts in cents */
export const PLATFORM_FEE_PCT = 0.20;
export const SERVICE_FEE_CENTS = 450;

export function feeBreakdown(basePriceCents: number) {
  const total = basePriceCents + SERVICE_FEE_CENTS;
  const platformFee = Math.round(total * PLATFORM_FEE_PCT);
  const providerPayout = total - platformFee;
  return { total, platformFee, providerPayout };
}
