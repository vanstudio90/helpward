// Pure helpers for multi-task bundles — safe to import from client. Only
// price math + validation; server-side fetchers live in the action.

// Max items per bundle. Past 5 stops the helper's time blows out the
// matching engine's distance estimates and price feels less honest.
// Bumpable later if customer behaviour says we should.
export const MAX_BUNDLE_ITEMS = 5;

export type BundleItemDraft = {
  // Stable client-side id while editing — server replaces with DB uuid.
  draftId: string;
  serviceId: string;
  serviceTitle: string;
  servicePriceCents: number;
  notes: string;
};

export function newDraftItem(seed: Partial<BundleItemDraft> = {}): BundleItemDraft {
  return {
    draftId: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Math.random()),
    serviceId: seed.serviceId ?? "",
    serviceTitle: seed.serviceTitle ?? "",
    servicePriceCents: seed.servicePriceCents ?? 0,
    notes: seed.notes ?? "",
  };
}

// Bundle pricing — sum the items, charge ONE flat service fee. The helper
// does N tasks in one trip; the platform fee covers the dispatch + insurance
// for the whole engagement, not per stop.
export const BUNDLE_SERVICE_FEE_CENTS = 450; // $4.50 — same as the one-shot fee

export type BundlePriceBreakdown = {
  itemsSubtotalCents: number;
  serviceFeeCents: number;
  totalCents: number;
};

export function priceBundle(items: BundleItemDraft[]): BundlePriceBreakdown {
  const itemsSubtotalCents = items.reduce((s, i) => s + (i.servicePriceCents || 0), 0);
  return {
    itemsSubtotalCents,
    serviceFeeCents: BUNDLE_SERVICE_FEE_CENTS,
    totalCents: itemsSubtotalCents + BUNDLE_SERVICE_FEE_CENTS,
  };
}

// Returns a human-readable error string if the bundle isn't valid yet, or
// null when it's ready to submit. Drives the disabled state on the form's
// continue button and the inline hint text.
export function validateBundle(items: BundleItemDraft[]): string | null {
  if (items.length < 2) return "Add at least one more stop, or turn off bundling for a single-task request.";
  if (items.length > MAX_BUNDLE_ITEMS) return `Bundles are capped at ${MAX_BUNDLE_ITEMS} stops — split into two bookings if you need more.`;
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (!it.serviceId) return `Pick a service for stop ${i + 1}.`;
    if (it.notes.length > 500) return `Stop ${i + 1} notes are too long (max 500 chars).`;
  }
  return null;
}

// Compact label for list rows / badges — "3 stops".
export function bundleSummaryLabel(count: number): string {
  if (count <= 1) return "Single task";
  return `${count} stops`;
}
