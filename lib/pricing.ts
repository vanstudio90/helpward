// Single source of truth for how a Helpward task is priced and split.
//
// AGREED MODEL (2026-10-24):
//   Helper receives   80% of the service subtotal + 100% of any tip
//   Helpward receives 20% of the service subtotal + the $4.50 service fee
//
// The $4.50 service fee is NOT commissionable and never reaches the helper.
// It previously did: accept_request computed both the platform fee and the
// payout as a percentage of (base + 450), so helpers took 80% of the
// service fee too and Helpward netted $0.90 of it — which contradicted the
// published /vs/pricing explanation.
//
// DISTANCE CHARGES: there are none. Nothing in the codebase computes a
// distance component today (the "Distance (12 km) · $18.00" line that used
// to appear in the catalog was hardcoded display text with no backing
// calculation, and has been removed). So the question of whether distance
// is commissionable is currently moot. If distance pricing is ever added,
// that decision has to be made explicitly at that point and encoded here —
// see DISTANCE_IS_COMMISSIONABLE below.

export const SERVICE_FEE_CENTS = 450;

/** Platform commission on the service subtotal. Tips and the service fee are excluded. */
export const COMMISSION_RATE = 0.20;

/**
 * Unresolved: if a distance/mileage component is introduced, does it count
 * toward the commissionable subtotal (helper gets 80% of it) or pass
 * through to the helper in full? No distance component exists today, so
 * this is a placeholder for a decision that must be made before one ships.
 */
export const DISTANCE_IS_COMMISSIONABLE: null = null;

export type PriceBreakdown = {
  /** Commissionable base: the service price, or the sum of bundle stop prices. */
  subtotalCents: number;
  /** Flat platform fee. 100% Helpward. */
  serviceFeeCents: number;
  /** Customer tip. 100% helper, never commissioned. */
  tipCents: number;
  /**
   * Sales tax / GST / PST. NOT computed yet — no tax engine is wired, and
   * no tax is collected or remitted today. Explicitly zero rather than
   * silently absent so that every total in the app is auditable and adding
   * tax later is a visible change, not a surprise.
   */
  taxCents: number;
  /** What the customer is charged. */
  totalCents: number;
  /** What the helper takes home: 80% of subtotal + 100% of tip. */
  helperPayoutCents: number;
  /**
   * What Helpward keeps BEFORE payment-processing costs: 20% of subtotal
   * plus the service fee. Processing (Stripe et al.) is not deducted here
   * because no processor is connected; when one is, its cost comes out of
   * this number — it is a platform cost, not a helper deduction.
   */
  platformGrossCents: number;
};

/**
 * Compose a full breakdown from a commissionable subtotal.
 * Rounding rule: the helper's 80% is rounded to the nearest cent and the
 * platform takes the remainder, so subtotal always splits exactly and no
 * cent is created or lost.
 */
export function priceTask(subtotalCents: number, tipCents = 0): PriceBreakdown {
  const safeSubtotal = Math.max(0, Math.round(subtotalCents));
  const safeTip = Math.max(0, Math.round(tipCents));
  const helperShareOfSubtotal = Math.round(safeSubtotal * (1 - COMMISSION_RATE));
  const commission = safeSubtotal - helperShareOfSubtotal;
  return {
    subtotalCents: safeSubtotal,
    serviceFeeCents: SERVICE_FEE_CENTS,
    tipCents: safeTip,
    taxCents: 0,
    totalCents: safeSubtotal + SERVICE_FEE_CENTS + safeTip,
    helperPayoutCents: helperShareOfSubtotal + safeTip,
    platformGrossCents: commission + SERVICE_FEE_CENTS,
  };
}

/** Total a customer is quoted for a single-service request. */
export function quoteOneShotCents(baseCents: number): number {
  return priceTask(baseCents).totalCents;
}

/** Total a customer is quoted for a multi-stop bundle — ONE fee, not one per stop. */
export function quoteBundleCents(itemsSubtotalCents: number): number {
  return priceTask(itemsSubtotalCents).totalCents;
}

/**
 * Helper take-home shown on a request before it is accepted.
 * `estimateCents` is requests.estimated_price_cents, which includes the
 * service fee — so the fee must be removed before commission is applied.
 * Getting this wrong is how the provider inbox previously quoted helpers a
 * payout that included 80% of the service fee.
 */
export function payoutFromEstimateCents(estimateCents: number): number {
  const subtotal = Math.max(0, estimateCents - SERVICE_FEE_CENTS);
  return priceTask(subtotal).helperPayoutCents;
}

export function dollars(cents: number): string {
  return (cents / 100).toFixed(2);
}
