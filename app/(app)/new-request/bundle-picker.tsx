"use client";

import { useState, useMemo } from "react";
import {
  Layers, Plus, X, GripVertical, Info, AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/cn";
import {
  type BundleItemDraft, newDraftItem, priceBundle, validateBundle,
  MAX_BUNDLE_ITEMS,
} from "@/lib/bundle-pure";
import type { ServiceWithCategory } from "@/lib/data/services";

// Self-contained bundle picker. When "Bundle multiple tasks" is on, the
// new-request form serialises the item list into a hidden `bundle_items`
// JSON field and sets `is_bundle=1`. The server action branches on this.
//
// Service-id selection inside each row is decoupled from the parent
// new-request form's primary service selector — we don't try to keep them
// in sync. The bundle owns its own item list.

export function BundlePicker({
  services, primaryService,
}: {
  services: ServiceWithCategory[];
  primaryService: ServiceWithCategory | null;
}) {
  const [enabled, setEnabled] = useState(false);
  // Seed with two rows so the user immediately sees the "two stops" shape.
  // Pre-fill the first row with the primary service they already picked.
  const [items, setItems] = useState<BundleItemDraft[]>(() => [
    newDraftItem(primaryService ? {
      serviceId: primaryService.id,
      serviceTitle: primaryService.title,
      servicePriceCents: primaryService.base_price_cents,
    } : {}),
    newDraftItem(),
  ]);

  const updateItem = (id: string, patch: Partial<BundleItemDraft>) => {
    setItems((prev) => prev.map((it) => (it.draftId === id ? { ...it, ...patch } : it)));
  };

  const addItem = () => {
    if (items.length >= MAX_BUNDLE_ITEMS) return;
    setItems((prev) => [...prev, newDraftItem()]);
  };

  const removeItem = (id: string) => {
    setItems((prev) => (prev.length <= 2 ? prev : prev.filter((it) => it.draftId !== id)));
  };

  const pickService = (id: string, serviceId: string) => {
    const svc = services.find((s) => s.id === serviceId);
    updateItem(id, {
      serviceId,
      serviceTitle: svc?.title ?? "",
      servicePriceCents: svc?.base_price_cents ?? 0,
    });
  };

  const price = useMemo(() => priceBundle(items), [items]);
  const validationError = useMemo(() => validateBundle(items), [items]);

  // Serialise to JSON for the server action — only when enabled, otherwise
  // we don't want the server to think this is a bundle request.
  const serialised = useMemo(() => JSON.stringify(items.map((it) => ({
    serviceId: it.serviceId, notes: it.notes,
  }))), [items]);

  return (
    <fieldset className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <input type="hidden" name="is_bundle" value={enabled ? "1" : "0"} />
      {enabled && <input type="hidden" name="bundle_items" value={serialised} />}

      <label className="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="w-4 h-4 rounded text-brand-600"
        />
        <span className="inline-flex items-center gap-2 text-sm font-bold text-slate-900">
          <Layers className="w-4 h-4 text-brand-600" />
          Bundle multiple tasks in one trip
        </span>
        <span className="text-xs text-slate-500">Up to {MAX_BUNDLE_ITEMS} stops, one helper.</span>
      </label>

      {enabled && (
        <div className="mt-4 space-y-3">
          <p className="text-[11px] text-slate-600 leading-relaxed">
            Use one helper for several errands on the same trip — groceries + dry cleaning + a package return, for
            example. You pay one service fee for the whole bundle.
          </p>

          {/* Item rows */}
          <ol className="space-y-2">
            {items.map((it, idx) => (
              <li key={it.draftId} className="rounded-xl bg-white border border-slate-200 p-3">
                <div className="flex items-start gap-2">
                  <span className="w-6 h-6 rounded-full bg-brand-50 text-brand-700 text-xs font-bold inline-flex items-center justify-center shrink-0 mt-1">
                    {idx + 1}
                  </span>
                  <div className="min-w-0 flex-1 space-y-2">
                    <select
                      value={it.serviceId}
                      onChange={(e) => pickService(it.draftId, e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-white border border-slate-200 text-sm focus:outline-none focus:ring-4 focus:ring-brand-100 focus:border-brand-400"
                    >
                      <option value="">Pick a service…</option>
                      {services.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.title} · ${(s.base_price_cents / 100).toFixed(0)}
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={it.notes}
                      onChange={(e) => updateItem(it.draftId, { notes: e.target.value })}
                      maxLength={500}
                      placeholder={`Stop ${idx + 1} notes (address, specific store, items…)`}
                      className="w-full px-3 py-2 rounded-lg bg-white border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-brand-100 focus:border-brand-400"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeItem(it.draftId)}
                    disabled={items.length <= 2}
                    title={items.length <= 2 ? "Bundles need at least 2 stops" : "Remove this stop"}
                    aria-label="Remove stop"
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ol>

          {/* Add another */}
          <button
            type="button"
            onClick={addItem}
            disabled={items.length >= MAX_BUNDLE_ITEMS}
            className={cn(
              "w-full inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl border-2 border-dashed text-xs font-semibold transition",
              items.length >= MAX_BUNDLE_ITEMS
                ? "border-slate-200 text-slate-400 cursor-not-allowed"
                : "border-brand-200 text-brand-700 hover:bg-brand-50",
            )}
          >
            <Plus className="w-3.5 h-3.5" />
            {items.length >= MAX_BUNDLE_ITEMS
              ? `Max ${MAX_BUNDLE_ITEMS} stops`
              : `Add another stop (${items.length}/${MAX_BUNDLE_ITEMS})`}
          </button>

          {/* Pricing summary */}
          <div className="rounded-xl bg-white border border-slate-200 p-3 text-xs">
            <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-2 font-bold">
              Bundle price
            </div>
            <dl className="space-y-1">
              {items.map((it, idx) => it.serviceId && (
                <div key={it.draftId} className="flex justify-between gap-2">
                  <dt className="text-slate-600 truncate">{idx + 1}. {it.serviceTitle}</dt>
                  <dd className="font-semibold text-slate-900 tabular-nums">
                    ${(it.servicePriceCents / 100).toFixed(2)}
                  </dd>
                </div>
              ))}
              <div className="flex justify-between gap-2 pt-1.5 border-t border-slate-100">
                <dt className="text-slate-500">Items subtotal</dt>
                <dd className="font-semibold text-slate-900 tabular-nums">
                  ${(price.itemsSubtotalCents / 100).toFixed(2)}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">Service fee (one for the whole bundle)</dt>
                <dd className="font-semibold text-slate-900 tabular-nums">
                  ${(price.serviceFeeCents / 100).toFixed(2)}
                </dd>
              </div>
              <div className="flex justify-between gap-2 pt-1.5 border-t border-slate-100">
                <dt className="text-sm font-bold text-slate-900">Total estimate</dt>
                <dd className="text-sm font-bold text-brand-700 tabular-nums">
                  ${(price.totalCents / 100).toFixed(2)}
                </dd>
              </div>
            </dl>
          </div>

          {validationError ? (
            <div className="flex items-start gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
              <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {validationError}
            </div>
          ) : (
            <div className="flex items-start gap-2 text-xs text-slate-600 bg-white border border-slate-200 rounded-lg p-2.5">
              <Info className="w-3.5 h-3.5 mt-0.5 shrink-0 text-brand-600" />
              One helper handles all {items.length} stops in one trip. They&apos;ll see each item and can mark them
              done as they go — you&apos;ll watch the progress on the booking page.
            </div>
          )}
        </div>
      )}
    </fieldset>
  );
}
