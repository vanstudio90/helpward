"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
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
import { MissingFieldsNotice, friendlyLabel, type MissingField } from "./missing-fields";
import { priceService, type PricingRule } from "@/lib/service-pricing";
import { formatMoney, unitFor } from "@/lib/money";
import { AddressConfirm } from "./address-confirm";
import { IntakeFields } from "./intake-fields";
import { intakeFor } from "@/lib/service-intake";
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
  /** ISO alpha-2, verified when the address was saved. Drives the quote's currency. */
  country?: string | null;
};

export type PreferredHelper = {
  id: string;
  full_name: string;
  avatar_url: string | null;
};

export function NewRequestView({
  services, pricingRules, defaultCurrency, categories, initialServiceId, initialQuery, queryUnresolved = false,
  savedAddresses = [], preferredHelper = null,
}: {
  services: ServiceWithCategory[];
  categories: ServiceCategory[];
  initialServiceId?: string | null;
  /** The customer searched and we could not resolve it to one service. */
  queryUnresolved?: boolean;
  initialQuery?: string | null;
  /** Per-service pricing rules, for the live quote. Keyed by service id. */
  pricingRules: Record<string, PricingRule>;
  /**
   * What to quote in before an address is known.
   *
   * The booking's real currency is set at acceptance from the PICKUP
   * ADDRESS (migration 0052) — where the work happens, not where the
   * customer's account is registered. Until they type one, their own
   * country is the best guess available.
   */
  defaultCurrency: "USD" | "CAD";
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
  // Set when the customer presses "Confirm address". Posted back with the
  // form; the server re-geocodes and checks it against what IT resolves,
  // so this value cannot grant a verified address on its own.
  const [addressConfirmation, setAddressConfirmation] = useState("");
  // The country of the address the SERVER resolved, once it has. Null
  // until then: an unresolved address has no country, and pretending
  // otherwise is what made the quote flip.
  const [confirmedCountry, setConfirmedCountry] = useState<"US" | "CA" | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);
  // What the customer still has to fill in. Empty until they actually try
  // to submit — telling someone what they have not done yet, before they
  // have had a chance to do it, is nagging rather than help.
  const [missing, setMissing] = useState<MissingField[]>([]);
  // Switches the moment the address resolves to the other country, so a
  // customer booking in Vancouver is quoted CAD before they submit.
  // Which step the customer is on, derived rather than stored: a stored
  // step and a real selection drift apart, and the stepper then lies.
  //
  //   1  no service chosen
  //   2  service chosen, address not yet given
  //   3  both, so what is left is to check the total and send it
  const step: 1 | 2 | 3 = !selected ? 1 : address.trim().length === 0 ? 2 : 3;

  // Quoted in the currency of the PLACE, from the address the server
  // actually RESOLVED — never from guessing at what was typed.
  //
  // This was a regex over the raw input box, so the quote flipped
  // mid-keystroke: "…Vancouver" read CA$, the resolved address
  // re-rendered as US$, then flipped back. A price that changes
  // currency three times before submission is not a quote.
  //
  // Null until something is verified. An unresolved address has no
  // country, and inventing one is what made it oscillate — so the
  // customer's own country stands in until then, and the booking's
  // real currency comes from the pickup country at acceptance (0052).
  const currency: "USD" | "CAD" = confirmedCountry
    ? (confirmedCountry === "CA" ? "CAD" : "USD")
    : defaultCurrency;
  // The answers that set the price, mirrored out of the (uncontrolled)
  // intake inputs so the quote can move as the customer fills them in.
  const [pricedAnswers, setPricedAnswers] = useState<Record<string, string>>({});

  // Read the priced fields off the DOM. Cheaper and less invasive than
  // making every intake input controlled, and the server re-derives the
  // real price from the request anyway — this number is for display.
  const readPricedAnswers = (form: HTMLFormElement): Record<string, string> => {
    const rule = selected ? pricingRules[selected.id] : null;
    if (!rule) return {};
    const out: Record<string, string> = {};
    for (const key of [rule.durationField, rule.unitField, rule.crewField]) {
      if (!key) continue;
      const el = form.elements.namedItem(`intake_${key}`);
      const field = el instanceof RadioNodeList ? el[0] : el;
      if (field instanceof HTMLInputElement || field instanceof HTMLSelectElement) {
        out[key] = field.value;
      }
    }
    return out;
  };

  // Everything the customer still has to fill in, in page order.
  //
  // The browser's own validation stops at the FIRST empty field and says
  // so in a native bubble, which on this page can sit behind an autofill
  // dropdown and never mentions the other four things also missing.
  const findMissing = (form: HTMLFormElement): MissingField[] => {
    const found: MissingField[] = [];
    const seen = new Set<string>();

    // A service is not a form control, so it needs saying here. It used to
    // disable the submit button with a small hint underneath, which on a
    // phone sits below the fold — so the button just looked broken.
    if (!selected) {
      found.push({ name: "service_id", label: "Choose what you need help with" });
    }
    if (bundleError) {
      found.push({ name: "bundle_items", label: bundleError });
    }

    for (const el of Array.from(form.elements)) {
      if (!(el instanceof HTMLInputElement
            || el instanceof HTMLSelectElement
            || el instanceof HTMLTextAreaElement)) continue;
      if (el.type === "hidden" || el.disabled || !el.willValidate) continue;
      if (el.checkValidity()) continue;
      if (seen.has(el.name)) continue;   // a group shares one name
      seen.add(el.name);
      found.push({ name: el.name, label: friendlyLabel(el) });
    }

    // Required checkbox groups. HTML cannot express "at least one of
    // these", so these were declared required in the spec, enforced by
    // the server, and entirely unchecked in the browser — the customer
    // only found out after submitting.
    for (const group of Array.from(
      form.querySelectorAll<HTMLFieldSetElement>("fieldset[data-required-group]"),
    )) {
      if (group.querySelector("input:checked")) continue;
      const first = group.querySelector<HTMLInputElement>("input[type=checkbox]");
      if (!first || seen.has(first.name)) continue;
      seen.add(first.name);
      found.push({ name: first.name, label: group.dataset.friendly ?? friendlyLabel(first) });
    }

    return found;
  };
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
    // Editing the address makes any previously verified country stale.
    // Keeping it would quote the old place's money for the new address.
    setConfirmedCountry(null);
    // A confirmation is bound to one exact resolved address. Editing the
    // field makes it stale, so drop it rather than submit something the
    // server will reject.
    setAddressConfirmation("");
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
        {/* The title names what is being booked once a service is
            chosen — "New Request" told the customer nothing about which
            of 27 services the form in front of them was for. */}
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">
          {selected ? `Book ${selected.title}` : "Book a service"}
        </h1>
        {selected && (
          <button
            type="button"
            onClick={() => { setSelected(null); setPricedAnswers({}); }}
            className="text-xs font-semibold text-brand-700 underline underline-offset-2"
          >
            Change service
          </button>
        )}
      </div>

      {/* The stepper now tracks where the customer actually is.
          It used to render 1-of-3 permanently, with all three steps on
          one long screen and step 1 "active" even after a service had
          been chosen — a progress indicator that never progressed. */}
      <div className="mb-5 lg:mb-6 flex items-center gap-1.5 sm:gap-3">
        <StepDot n={1} label="Choose service" active={step === 1} done={step > 1} />
        <Dash />
        <StepDot n={2} label="Details" active={step === 2} done={step > 2} />
        <Dash />
        <StepDot n={3} label="Review & request" active={step === 3} done={false} />
      </div>

      {state?.error && !state?.addressPrompt && (
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

      <MissingFieldsNotice
        missing={missing}
        onJump={(name) => {
          const el = formRef.current?.elements.namedItem(name);
          const field = el instanceof RadioNodeList ? el[0] : el;
          if (field instanceof HTMLElement) {
            field.scrollIntoView({ behavior: "smooth", block: "center" });
            field.focus({ preventScroll: true });
          }
        }}
      />

      <form
        ref={formRef}
        action={formAction}
        // The browser's own validation stops at the FIRST empty field and
        // says so in a native bubble — which on this page can be hidden
        // behind an autofill dropdown, and which never mentions the other
        // four things also missing. We check it ourselves instead, and the
        // `required` attributes stay as the backstop if JS never runs.
        noValidate
        // Once the notice is up, keep it honest as they fill things in:
        // an item that stays listed after it has been answered reads as
        // the form not noticing. Does nothing until they have actually
        // tried to submit.
        onInput={(e) => {
          setPricedAnswers(readPricedAnswers(e.currentTarget));
          if (missing.length === 0) return;
          setMissing(findMissing(e.currentTarget));
        }}
        onChange={(e) => {
          setPricedAnswers(readPricedAnswers(e.currentTarget));
          if (missing.length === 0) return;
          setMissing(findMissing(e.currentTarget));
        }}
        onSubmit={(e) => {
          const found = findMissing(e.currentTarget);
          if (found.length > 0) {
            e.preventDefault();
            setMissing(found);
            return;
          }
          setMissing([]);
        }}
        className="grid lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_400px] gap-6"
      >
        <input type="hidden" name="address_confirmation" value={addressConfirmation} />
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

          {/* Two columns, not four.
              At 1280px the left navigation and the sticky summary panel
              left roughly 150px per card, so names and prices truncated
              and nothing was readable. A third column only appears when
              there is genuinely room for it. */}
          <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 2xl:grid-cols-3 gap-3 sm:gap-4">
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
                    {/* Two lines, never truncated. A service whose name
                        is cut off cannot be chosen on purpose. */}
                    <div className="text-sm font-bold text-slate-900 leading-snug line-clamp-2">
                      {s.title}
                    </div>
                    <div className="text-[11px] sm:text-xs text-slate-500 mt-0.5 line-clamp-2">{s.blurb}</div>
                    {/* The price with its unit and currency. "From $20"
                        alone said neither what it buys nor in what money,
                        and the $4.50 fee only appeared much later. */}
                    <div className="mt-2 sm:mt-3 text-[11px] sm:text-xs">
                      <div className="font-semibold text-brand-700">
                        From {formatMoney(s.base_price_cents, currency)}
                        <span className="font-normal text-slate-500">
                          {" "}{unitFor(pricingRules[s.id])}
                        </span>
                      </div>
                      <div className="text-slate-500 mt-0.5">
                        + {formatMoney(SERVICE_FEE_CENTS, currency)} service fee
                      </div>
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
                            // A saved address was verified when it was
                            // saved, so its country is known without a
                            // round trip.
                            setConfirmedCountry(a.country === "CA" ? "CA" : "US");
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
                    data-friendly="The address your helper is coming to"
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
                  onResolved={(formatted, lat, lng, country) => {
                    setAddress(formatted);
                    setCoords({ lat, lng });
                    // A reverse geocode IS a verified resolution, so the
                    // quote can use its country straight away.
                    setConfirmedCountry(country === "CA" ? "CA" : "US");
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

              {state?.addressPrompt && (
                <AddressConfirm
                  mode={state.addressPrompt.mode}
                  typed={state.addressPrompt.typed}
                  candidates={state.addressPrompt.candidates}
                  changes={state.addressPrompt.changes}
                  message={state.addressPrompt.message}
                  onConfirm={(token, formatted, country) => {
                    // Adopt the address we are about to be dispatched to, so
                    // what the customer sees matches what the server stores.
                    setAddress(formatted);
                    setCoords(null);
                    setAddressConfirmation(token);
                    // Now there is a verified country, so the quote can
                    // stop guessing at one.
                    setConfirmedCountry(country === "CA" ? "CA" : "US");
                    // Resubmit the SAME form. Every other field keeps its
                    // value, so the service, schedule, notes, bundle and
                    // recurrence all survive the round trip.
                    requestAnimationFrame(() => formRef.current?.requestSubmit());
                  }}
                  onEdit={() => {
                    setAddressConfirmation("");
                    const el = formRef.current?.elements.namedItem("address");
                    if (el instanceof HTMLInputElement) { el.focus(); el.select(); }
                  }}
                />
              )}

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
                {/* Not keyed on the echo: ScheduledPicker holds its value
                    in React state and is never remounted, so the chosen
                    time already survives. Remounting it to "restore" would
                    have cleared the one scheduling field that was fine. */}
                {scheduled === "later" && <ScheduledPicker />}
              </fieldset>

              <label className="block">
                <span className="text-xs font-semibold text-slate-700">Notes (optional)</span>
                <textarea
                  name="notes"
                  rows={3}
                  // Keyed on the echo so React remounts the textarea with
                  // the refilled value. React 19 resets an uncontrolled
                  // form once its action resolves, so without this the
                  // notes vanish the moment an address needs confirming.
                  key={`notes-${state?.submitted ? "restored" : "fresh"}`}
                  defaultValue={state?.submitted?.notes ?? initialQuery ?? ""}
                  placeholder="Any special instructions..."
                  className="mt-1 w-full px-3 py-2.5 rounded-xl bg-white border border-slate-200 text-sm focus:outline-none focus:ring-4 focus:ring-brand-100 focus:border-brand-400"
                />
              </label>

              {/* Service-specific questions. Keyed on the service id so
                  switching services resets the answers rather than carrying
                  a dog's details onto a TV mount. */}
              {selected && intakeFor(selected.id) && (
                <IntakeFields
                  // Keyed on the service so switching services clears the
                  // answers, and on the echo so a refill remounts with the
                  // restored values rather than the reset ones.
                  key={`${selected.id}-${state?.submitted ? "restored" : "fresh"}`}
                  spec={intakeFor(selected.id)!}
                  serviceTitle={selected.title}
                  values={state?.submitted?.intake}
                />
              )}

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
            <SummaryCard
              selected={selected}
              rule={selected ? pricingRules[selected.id] ?? null : null}
              answers={pricedAnswers}
              currency={currency}
              bundle={bundleEnabled ? { items: bundleItems, price: bundlePrice } : null}
            />
            <ContinueButtons
              pending={pending}
              disabledReason={submitBlockedReason}
              awaitingAddress={!!state?.addressPrompt}
            />
          </div>
        </section>

        <aside className="hidden lg:block space-y-4 lg:sticky lg:top-6 lg:self-start">
          <SummaryCard
            selected={selected}
            rule={selected ? pricingRules[selected.id] ?? null : null}
            answers={pricedAnswers}
            currency={currency}
            bundle={bundleEnabled ? { items: bundleItems, price: bundlePrice } : null}
          />
          <ContinueButtons
            pending={pending}
            disabledReason={submitBlockedReason}
            awaitingAddress={!!state?.addressPrompt}
          />
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

function SummaryCard({ selected, rule, answers, currency, bundle }: {
  selected: ServiceWithCategory | null;
  rule: PricingRule | null;
  answers: Record<string, string>;
  currency: "USD" | "CAD";
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
  // Priced from the customer's answers. The same rules run in SQL at
  // acceptance (price_service_cents, migration 0053); parity across both
  // is asserted by scripts/verify-pricing-parity.mjs.
  const priced = priceService(selected.base_price_cents, rule, answers);

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
                {priced.lines.map((line) => (
                  <div key={line.label} className="flex justify-between gap-2">
                    <dt className="text-slate-500 min-w-0">{line.label}</dt>
                    <dd className="font-semibold text-slate-900 tabular-nums shrink-0">
                      {formatMoney(line.cents, currency)}
                    </dd>
                  </div>
                ))}
                <div className="flex justify-between">
                  <dt className="text-slate-500">Service fee</dt>
                  <dd className="font-semibold text-slate-900 tabular-nums">{formatMoney(SERVICE_FEE_CENTS, currency)}</dd>
                </div>
                <div className="flex justify-between pt-1.5 border-t border-slate-100">
                  <dt className="text-sm font-bold text-slate-900">Total</dt>
                  <dd className="text-sm font-bold text-brand-700 tabular-nums">
                    {formatMoney(quoteOneShotCents(priced.subtotalCents), currency)}
                  </dd>
                </div>
                <div className="text-[11px] text-slate-500 pt-0.5">
                  {formatMoney(quoteOneShotCents(priced.subtotalCents), currency)} total before an optional tip.
                </div>
              </>
            )}
          </dl>
          {/* Said BEFORE submitting, not discovered afterwards: a hold
              appearing on a statement with no warning reads as a charge. */}
          <div className="mt-3 rounded-xl bg-slate-50 border border-slate-100 p-2.5">
            <p className="text-[11px] text-slate-600 leading-relaxed">
              We&rsquo;ll find a nearby helper. A <strong className="font-semibold">temporary hold</strong>{" "}
              is placed on your card when one accepts — not a charge. You pay after the task is
              marked complete, and nothing is taken if it&rsquo;s cancelled.
            </p>
          </div>

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

function ContinueButtons({ pending, disabledReason, awaitingAddress }: {
  pending: boolean;
  disabledReason?: string | null;
  /** The form came back needing the address confirmed first. */
  awaitingAddress?: boolean;
}) {
  return (
    <div className="space-y-2">
      {/* Only disabled while a submit is in flight. A button disabled for
          an unmet requirement is a dead end: the hint explaining it sits
          below the fold on a phone, so the control just looks broken.
          Pressing it now says what is missing, at the top, with a link to
          each field. */}
      <button
        type="submit"
        disabled={pending || !!awaitingAddress}
        className="w-full inline-flex items-center justify-center gap-2 py-3.5 rounded-xl bg-gradient-to-r from-brand-600 to-violet-600 text-white font-semibold shadow-lg shadow-brand-900/10 disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {pending
          ? "Submitting…"
          : awaitingAddress
            // The button is the thing they are looking at, so it is the
            // thing that has to tell them the request did not go through.
            ? <>Confirm address to continue <ArrowRight className="w-4 h-4" aria-hidden="true" /></>
            : <>Submit request <ArrowRight className="w-4 h-4" aria-hidden="true" /></>}
      </button>
      {disabledReason && (
        <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2 leading-snug">
          {disabledReason}
        </p>
      )}
    </div>
  );
}
