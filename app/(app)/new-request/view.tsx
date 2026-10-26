"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, Search, Sparkles, Check, ArrowRight, Calendar, MapPin,
  AlertCircle, Info, Clock, Star, CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { createRequestAction } from "./actions";
import { RecurrencePicker } from "./recurrence-picker";
import { BundlePicker } from "./bundle-picker";
import { UseCurrentLocationButton } from "./use-current-location";
import {
  type BundleItemDraft, newDraftItem, priceBundle, validateBundle,
} from "@/lib/bundle-pure";
import { SERVICE_FEE_CENTS, quoteOneShotCents, dollars } from "@/lib/pricing";
import { pickInitialSelected } from "@/lib/new-request-selection";
import type { ServiceWithCategory } from "@/lib/data/services";
import type { ServiceCategory } from "@/lib/supabase/types";

export type SavedAddressOption = {
  id: string;
  label: string;
  formatted: string;
  is_default: boolean;
  lat?: number | null;
  lng?: number | null;
};

export type PreferredHelper = {
  id: string;
  full_name: string;
  avatar_url: string | null;
};

export function NewRequestView({
  services, categories, initialServiceId, initialQuery, queryUnresolved = false,
  savedAddresses = [], preferredHelper = null,
}: {
  services: ServiceWithCategory[];
  categories: ServiceCategory[];
  initialServiceId?: string | null;
  /** The customer searched and we could not resolve it to one service. */
  queryUnresolved?: boolean;
  initialQuery?: string | null;
  savedAddresses?: SavedAddressOption[];
  preferredHelper?: PreferredHelper | null;
}) {
  const [state, formAction, pending] = useActionState(createRequestAction, undefined);
  // pickInitialSelected, not `?? services[0]`: an unresolved search must
  // start with NOTHING selected. The old fallback meant a search for
  // "plumber" silently preselected the first catalog row — Designated
  // Driver — along with its hidden service_id and its price in the summary.
  const [selected, setSelected] = useState<ServiceWithCategory | null>(
    () => pickInitialSelected(services, initialServiceId, queryUnresolved),
  );
  const [tab, setTab] = useState<string>("Popular");
  // This field rendered with no value or onChange, so typing in it did
  // nothing at all.
  const [serviceQuery, setServiceQuery] = useState("");
  // Bundle state lives here, not inside BundlePicker, so the request summary
  // and the bundle panel quote the same thing (HW-07).
  const [bundleEnabled, setBundleEnabled] = useState(false);
  const [bundleItems, setBundleItems] = useState<BundleItemDraft[]>(() => [
    newDraftItem(), newDraftItem(),
  ]);
  const [scheduled, setScheduled] = useState<"asap" | "later">("asap");
  // Auto-fill the address field from the default saved address (if any) so
  // a returning customer doesn't have to retype "Home" every time. Saved
  // addresses already carry geocoded lat/lng, so we also seed those so the
  // server can skip the forward-geocode round-trip.
  const defaultSavedAddr = savedAddresses.find((a) => a.is_default) ?? null;
  const [address, setAddress] = useState<string>(defaultSavedAddr?.formatted ?? "");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    defaultSavedAddr && defaultSavedAddr.lat != null && defaultSavedAddr.lng != null
      ? { lat: defaultSavedAddr.lat, lng: defaultSavedAddr.lng }
      : null
  );

  // Stop 1 of a bundle is always the service selected above. Syncing here
  // (rather than seeding once at mount) is what makes "pick Dog Walking,
  // then enable bundling" keep Dog Walking as stop 1 (HW-06).
  useEffect(() => {
    if (!selected) return;
    setBundleItems((prev) => {
      const first = prev[0];
      if (first && first.serviceId === selected.id) return prev;
      const next = [...prev];
      next[0] = {
        ...(first ?? newDraftItem()),
        serviceId: selected.id,
        serviceTitle: selected.title,
        servicePriceCents: selected.base_price_cents,
      };
      return next;
    });
  }, [selected]);

  const bundlePrice = useMemo(() => priceBundle(bundleItems), [bundleItems]);
  const bundleError = useMemo(
    () => (bundleEnabled ? validateBundle(bundleItems) : null),
    [bundleEnabled, bundleItems],
  );
  // Nothing selected is a real state now, so the form must not submit.
  const submitBlockedReason = !selected
    ? "Choose a service above to continue."
    : bundleError;

  // When the user types directly into the input we clear any cached coords
  // (they no longer line up with the text). The server will forward-geocode
  // on submit instead.
  const onAddressChange = (v: string) => {
    setAddress(v);
    setCoords(null);
  };

  const filtered = (() => {
    const q = serviceQuery.trim().toLowerCase();
    if (q) {
      // A search spans every category — scoping it to the active tab would
      // hide the match the customer just typed.
      return services.filter(
        (s) =>
          s.title.toLowerCase().includes(q) ||
          s.blurb.toLowerCase().includes(q) ||
          s.category.label.toLowerCase().includes(q),
      );
    }
    return tab === "Popular"
      ? services.filter((s) => s.popular).concat(services.filter((s) => !s.popular)).slice(0, 12)
      : services.filter((s) => s.category.label === tab);
  })();

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-5 lg:py-8 max-w-[1500px] mx-auto">
      <div className="flex items-center gap-3 mb-3 lg:mb-4">
        <Link href="/dashboard" aria-label="Back" className="p-2 -ml-2 rounded-lg hover:bg-slate-100">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">New Request</h1>
      </div>

      <div className="mb-5 lg:mb-6 flex items-center gap-1.5 sm:gap-3">
        <StepDot n={1} label="Choose Service" active={true} done={false} />
        <Dash />
        <StepDot n={2} label="Provide Details" active={false} done={false} />
        <Dash />
        <StepDot n={3} label="Review & Confirm" active={false} done={false} />
      </div>

      {state?.error && (
        <div className="mb-4 flex items-start gap-2 text-sm text-rose-700 bg-rose-50 border border-rose-100 rounded-xl p-3">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> {state.error}
        </div>
      )}

      {preferredHelper && (
        <div className="mb-4 flex items-center gap-3 rounded-2xl bg-gradient-to-r from-rose-50 to-pink-50 border border-rose-100 p-3">
          {preferredHelper.avatar_url ? (
            <img src={preferredHelper.avatar_url} className="w-10 h-10 rounded-full ring-2 ring-white shadow-sm" alt="" />
          ) : (
            <div className="w-10 h-10 rounded-full bg-rose-100 text-rose-700 flex items-center justify-center font-bold ring-2 ring-white shadow-sm">
              {preferredHelper.full_name[0] ?? "?"}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold text-rose-900">
              Booking again with {preferredHelper.full_name.split(" ")[0]}
            </div>
            <div className="text-[11px] text-rose-700/80 leading-snug">
              They&apos;ll be offered this task first. If they don&apos;t accept within 2 minutes
              (or aren&apos;t online), it opens up to other nearby helpers automatically.
            </div>
          </div>
        </div>
      )}

      <form action={formAction} className="grid lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_400px] gap-6">
        <input type="hidden" name="service_id" value={selected?.id ?? ""} />
        {preferredHelper && (
          <input type="hidden" name="preferred_helper_id" value={preferredHelper.id} />
        )}

        <section className="min-w-0">
          <h2 className="text-base sm:text-xl font-bold text-slate-900">What do you need help with?</h2>

          <div className="mt-3 sm:mt-4 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
            <input
              placeholder="Search services..."
              value={serviceQuery}
              onChange={(e) => setServiceQuery(e.target.value)}
              className="w-full pl-11 pr-4 py-3 rounded-full bg-white border border-slate-200 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-4 focus:ring-brand-100 focus:border-brand-400"
            />
          </div>

          <div className="mt-4 flex gap-2 overflow-x-auto scrollbar-none -mx-4 px-4 lg:mx-0 lg:px-0 pb-1">
            {(["Popular", ...categories.map((c) => c.label)] as string[]).map((c) => (
              <button
                type="button"
                key={c}
                onClick={() => setTab(c)}
                className={cn(
                  "shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-semibold transition border whitespace-nowrap",
                  tab === c
                    ? "bg-brand-50 text-brand-700 border-brand-200"
                    : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                )}
              >
                {c}
              </button>
            ))}
          </div>

          {queryUnresolved && !selected && (
            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              We couldn&rsquo;t match {initialQuery ? <>&ldquo;{initialQuery}&rdquo;</> : "that search"} to
              one service, so nothing is selected. Pick the closest one below &mdash; your
              description is kept in the notes.
            </div>
          )}

          <div className="mt-5 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
            {filtered.map((s) => {
              const isSel = s.id === selected?.id;
              return (
                <button
                  type="button"
                  key={s.id}
                  onClick={() => setSelected(s)}
                  className={cn(
                    "relative text-left rounded-2xl overflow-hidden bg-white border transition group",
                    isSel
                      ? "border-brand-500 ring-2 ring-brand-200"
                      : "border-slate-100 hover:border-slate-300 hover:shadow-lg hover:-translate-y-0.5"
                  )}
                >
                  <div className="relative aspect-[5/3] bg-slate-100">
                    {s.image_url && (
                      <img src={s.image_url} alt={s.title} className="w-full h-full object-cover group-hover:scale-105 transition" />
                    )}
                    {s.popular && (
                      <span className="absolute top-2 left-2 text-[10px] font-bold uppercase tracking-wide bg-violet-600 text-white px-2 py-1 rounded-md">
                        Popular
                      </span>
                    )}
                    {isSel && (
                      <span className="absolute top-2 right-2 w-7 h-7 rounded-full bg-brand-600 text-white flex items-center justify-center shadow">
                        <Check className="w-3.5 h-3.5" />
                      </span>
                    )}
                  </div>
                  <div className="p-3 sm:p-4">
                    <div className="text-sm font-bold text-slate-900 truncate">{s.title}</div>
                    <div className="text-[11px] sm:text-xs text-slate-500 mt-0.5 line-clamp-1">{s.blurb}</div>
                    <div className="mt-2 sm:mt-3 flex items-center justify-between gap-2 text-[11px] sm:text-xs">
                      <span className="font-semibold text-brand-700 truncate">From ${(s.base_price_cents / 100).toFixed(0)}</span>
                      <span className="text-slate-500 whitespace-nowrap shrink-0">{s.eta_label}</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {serviceQuery.trim() && filtered.length === 0 && (
            <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
              No service matches &ldquo;{serviceQuery.trim()}&rdquo;. Clear the search to
              browse all services, or describe what you need in the notes below and
              pick the closest match.
            </div>
          )}

          {/* Details section */}
          <div className="mt-7 lg:mt-8 space-y-4">
            <h3 className="text-base font-bold text-slate-900">When &amp; where</h3>

            <div className="rounded-2xl bg-white border border-slate-100 p-4 sm:p-5 space-y-4">
              <label className="block">
                <span className="text-xs font-semibold text-slate-700">Address</span>
                {savedAddresses.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {savedAddresses.map((a) => {
                      const active = address === a.formatted;
                      return (
                        <button
                          key={a.id}
                          type="button"
                          onClick={() => {
                            setAddress(a.formatted);
                            setCoords(a.lat != null && a.lng != null ? { lat: a.lat, lng: a.lng } : null);
                          }}
                          className={cn(
                            "inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1.5 rounded-full border transition",
                            active
                              ? "bg-brand-600 text-white border-brand-600"
                              : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50",
                          )}
                          title={a.formatted}
                        >
                          <MapPin className="w-3 h-3" /> {a.label}
                          {a.is_default && !active && (
                            <Star className="w-2.5 h-2.5 text-amber-500 fill-current" />
                          )}
                        </button>
                      );
                    })}
                    <Link
                      href="/settings"
                      className="inline-flex items-center text-[11px] font-semibold text-slate-500 px-2 py-1.5 hover:text-brand-700"
                    >
                      Manage →
                    </Link>
                  </div>
                )}
                <div className="mt-1 relative">
                  <MapPin className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    name="address"
                    required
                    value={address}
                    onChange={(e) => onAddressChange(e.target.value)}
                    placeholder="123 Main St, Vancouver, BC"
                    className="w-full pl-10 pr-3 py-2.5 rounded-xl bg-white border border-slate-200 text-sm focus:outline-none focus:ring-4 focus:ring-brand-100 focus:border-brand-400"
                  />
                </div>
                {coords && (
                  <input type="hidden" name="address_lat" value={coords.lat} />
                )}
                {coords && (
                  <input type="hidden" name="address_lng" value={coords.lng} />
                )}
                <UseCurrentLocationButton
                  onResolved={(formatted, lat, lng) => {
                    setAddress(formatted);
                    setCoords({ lat, lng });
                  }}
                />
                <p className="text-[11px] text-slate-500 mt-1 inline-flex items-center gap-1">
                  <Info className="w-3 h-3" />
                  {coords
                    ? <>Location pinned — your helper will be matched against the real coordinates.</>
                    : savedAddresses.length === 0
                    ? <>Tip: <Link href="/settings" className="text-brand-700 font-semibold">save your addresses</Link> for one-tap fill next time.</>
                    : <>Pick a saved address or tap &ldquo;Use my current location&rdquo; for precise matching.</>}
                </p>
              </label>

              <fieldset>
                <legend className="text-xs font-semibold text-slate-700">When</legend>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setScheduled("asap")}
                    className={cn(
                      "py-2.5 rounded-xl text-sm font-semibold border",
                      scheduled === "asap"
                        ? "bg-brand-600 text-white border-brand-600"
                        : "bg-white text-slate-700 border-slate-200"
                    )}
                  >
                    ASAP
                  </button>
                  <button
                    type="button"
                    onClick={() => setScheduled("later")}
                    className={cn(
                      "py-2.5 rounded-xl text-sm font-semibold border",
                      scheduled === "later"
                        ? "bg-brand-600 text-white border-brand-600"
                        : "bg-white text-slate-700 border-slate-200"
                    )}
                  >
                    Schedule
                  </button>
                </div>
                {scheduled === "later" && (
                  <ScheduledPicker />
                )}
              </fieldset>

              <label className="block">
                <span className="text-xs font-semibold text-slate-700">Notes (optional)</span>
                <textarea
                  name="notes"
                  rows={3}
                  defaultValue={initialQuery ?? ""}
                  placeholder="Any special instructions..."
                  className="mt-1 w-full px-3 py-2.5 rounded-xl bg-white border border-slate-200 text-sm focus:outline-none focus:ring-4 focus:ring-brand-100 focus:border-brand-400"
                />
              </label>

              <BundlePicker
                services={services}
                enabled={bundleEnabled}
                onEnabledChange={setBundleEnabled}
                items={bundleItems}
                onItemsChange={setBundleItems}
                onPrimaryServiceChange={setSelected}
              />
              <RecurrencePicker />
            </div>
          </div>

          <div className="lg:hidden mt-5 space-y-3">
            <SummaryCard selected={selected} bundle={bundleEnabled ? { items: bundleItems, price: bundlePrice } : null} />
            <ContinueButtons pending={pending} disabledReason={submitBlockedReason} />
          </div>
        </section>

        <aside className="hidden lg:block space-y-4 lg:sticky lg:top-6 lg:self-start">
          <SummaryCard selected={selected} bundle={bundleEnabled ? { items: bundleItems, price: bundlePrice } : null} />
          <ContinueButtons pending={pending} disabledReason={submitBlockedReason} />
        </aside>
      </form>
    </div>
  );
}

function StepDot({ n, label, active, done }: { n: number; label: string; active: boolean; done: boolean }) {
  return (
    <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
      <span className={cn(
        "w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold border-2 shrink-0",
        active ? "bg-brand-600 text-white border-brand-600" :
        done ? "bg-emerald-500 text-white border-emerald-500" :
        "bg-white text-slate-400 border-slate-300"
      )}>
        {done ? <Check className="w-3 h-3" /> : n}
      </span>
      <span className={cn(
        "text-[11px] sm:text-xs whitespace-nowrap",
        active ? "text-brand-700 font-semibold" : "text-slate-500"
      )}>{label}</span>
    </div>
  );
}

function Dash() {
  return <span className="flex-1 h-px border-t border-dashed border-slate-300 min-w-[8px]" />;
}

function SummaryCard({ selected, bundle }: {
  selected: ServiceWithCategory | null;
  bundle: { items: BundleItemDraft[]; price: { itemsSubtotalCents: number; serviceFeeCents: number; totalCents: number } } | null;
}) {
  if (!selected) {
    return (
      <div className="rounded-2xl bg-white border border-slate-100 p-4 sm:p-5">
        <h3 className="text-sm font-bold text-slate-900 mb-3">Request Summary</h3>
        <div className="text-sm text-slate-500">Pick a service to continue.</div>
      </div>
    );
  }

  const filledStops = bundle?.items.filter((i) => i.serviceId) ?? [];

  return (
    <div className="rounded-2xl bg-white border border-slate-100 overflow-hidden">
      {selected.image_url && (
        <div className="relative h-32 bg-slate-100">
          <img src={selected.image_url} alt={selected.title} className="w-full h-full object-cover" />
          {selected.popular && (
            <span className="absolute top-2 left-2 text-[10px] font-bold uppercase tracking-wide bg-violet-600 text-white px-2 py-1 rounded-md">
              Popular
            </span>
          )}
        </div>
      )}
      <div className="p-4 sm:p-5">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1">Request Summary</div>
        <div className="text-base font-bold text-slate-900">
          {bundle ? `${filledStops.length}-stop bundle` : selected.title}
        </div>
        <div className="text-[11px] text-slate-500 mt-0.5">
          {bundle ? "One helper, one trip, one service fee" : selected.category.label}
        </div>
        {!bundle && <p className="mt-2 text-xs text-slate-600 leading-relaxed">{selected.blurb}</p>}

        {/* An "Available Now" pill and a flat 4.9 rating used to render here
            for every service, with nothing behind either (HW-10). */}
        {!bundle && selected.eta_label && (
          <div className="mt-3 flex flex-wrap gap-1.5 text-[11px] font-semibold">
            <span className="inline-flex items-center gap-1 text-amber-700 bg-amber-50 px-2 py-1 rounded-full">
              <Clock className="w-3 h-3" /> Typically {selected.eta_label}
            </span>
          </div>
        )}

        {/* What's included */}
        <div className="mt-4 border-t border-slate-100 pt-4">
          <div className="text-xs font-bold text-slate-900 mb-2">What&apos;s included</div>
          <ul className="space-y-1.5 text-xs text-slate-700">
            {[
              "Verified, background-checked provider",
              "Real-time tracking & messaging",
              "Fully insured during the task",
              "Pay only after completion",
              "24/7 support if anything goes wrong",
            ].map((i) => (
              <li key={i} className="flex items-start gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" /> {i}
              </li>
            ))}
          </ul>
        </div>

        {/* Price estimate — reads the same quote the bundle panel shows, so
            the two can no longer disagree (HW-07). */}
        <div className="mt-4 border-t border-slate-100 pt-4">
          <div className="text-xs font-bold text-slate-900 mb-2">Price estimate</div>
          <dl className="text-xs space-y-1.5">
            {bundle ? (
              <>
                {filledStops.map((it, idx) => (
                  <div key={it.draftId} className="flex justify-between gap-2">
                    <dt className="text-slate-500 truncate">{idx + 1}. {it.serviceTitle}</dt>
                    <dd className="font-semibold text-slate-900 tabular-nums">${dollars(it.servicePriceCents)}</dd>
                  </div>
                ))}
                {filledStops.length === 0 && (
                  <div className="text-slate-500">Pick a service for each stop to see the total.</div>
                )}
                <div className="flex justify-between pt-1.5 border-t border-slate-100">
                  <dt className="text-slate-500">Service fee (one per bundle)</dt>
                  <dd className="font-semibold text-slate-900 tabular-nums">${dollars(bundle.price.serviceFeeCents)}</dd>
                </div>
                <div className="flex justify-between pt-1.5 border-t border-slate-100">
                  <dt className="text-sm font-bold text-slate-900">Total estimate</dt>
                  <dd className="text-sm font-bold text-brand-700 tabular-nums">${dollars(bundle.price.totalCents)}</dd>
                </div>
              </>
            ) : (
              <>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Base price</dt>
                  <dd className="font-semibold text-slate-900">${dollars(selected.base_price_cents)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Service fee</dt>
                  <dd className="font-semibold text-slate-900">${dollars(SERVICE_FEE_CENTS)}</dd>
                </div>
                <div className="flex justify-between pt-1.5 border-t border-slate-100">
                  <dt className="text-sm font-bold text-slate-900">Total estimate</dt>
                  <dd className="text-sm font-bold text-brand-700">${dollars(quoteOneShotCents(selected.base_price_cents))}</dd>
                </div>
              </>
            )}
          </dl>
          <p className="text-[10px] text-slate-400 mt-2 leading-snug">
            This is the amount saved with your request. A tip is optional and goes to your helper in full. You&apos;re
            only charged after the task is marked complete.
          </p>
        </div>

        {/* A three-up "Live matching / ETA / 24-7" block used to sit here.
            It asserted live matching capacity that cannot be shown until
            approved helpers are online (HW-10). */}
      </div>
    </div>
  );
}

function ScheduledPicker() {
  // datetime-local values are timezone-naive ("2026-05-27T14:30"). If we let
  // the server parse them with `new Date(str)`, it interprets the string as
  // UTC and stores the wrong time. So we convert locally — `new Date(local)`
  // in the browser parses in the user's TZ — and submit a real ISO string
  // via a hidden input. The visible datetime-local input is unnamed so the
  // server only sees `scheduled_for` (the converted ISO).
  const [local, setLocal] = useState("");
  const iso = local ? new Date(local).toISOString() : "";
  return (
    <div className="mt-2 relative">
      <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
      <input
        type="datetime-local"
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        className="w-full pl-10 pr-3 py-2.5 rounded-xl bg-white border border-slate-200 text-sm focus:outline-none focus:ring-4 focus:ring-brand-100 focus:border-brand-400"
      />
      <input type="hidden" name="scheduled_for" value={iso} />
    </div>
  );
}

function ContinueButtons({ pending, disabledReason }: { pending: boolean; disabledReason?: string | null }) {
  return (
    <div className="space-y-2">
      <button
        type="submit"
        disabled={pending || !!disabledReason}
        className="w-full inline-flex items-center justify-center gap-2 py-3.5 rounded-xl bg-gradient-to-r from-brand-600 to-violet-600 text-white font-semibold shadow-lg shadow-brand-900/10 disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {pending ? "Submitting…" : <>Submit request <ArrowRight className="w-4 h-4" /></>}
      </button>
      {disabledReason && (
        <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2 leading-snug">
          {disabledReason}
        </p>
      )}
    </div>
  );
}
