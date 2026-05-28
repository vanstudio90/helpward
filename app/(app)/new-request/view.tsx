"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, Search, Sparkles, Check, ArrowRight, Calendar, MapPin,
  AlertCircle, Info, Clock, Star, CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { createRequestAction } from "./actions";
import type { ServiceWithCategory } from "@/lib/data/services";
import type { ServiceCategory } from "@/lib/supabase/types";

export function NewRequestView({
  services, categories,
}: { services: ServiceWithCategory[]; categories: ServiceCategory[] }) {
  const [state, formAction, pending] = useActionState(createRequestAction, undefined);
  const [selected, setSelected] = useState<ServiceWithCategory | null>(services[0] ?? null);
  const [tab, setTab] = useState<string>("Popular");
  const [scheduled, setScheduled] = useState<"asap" | "later">("asap");

  const filtered = tab === "Popular"
    ? services.filter((s) => s.popular).concat(services.filter((s) => !s.popular)).slice(0, 12)
    : services.filter((s) => s.category.label === tab);

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

      <form action={formAction} className="grid lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_400px] gap-6">
        <input type="hidden" name="service_id" value={selected?.id ?? ""} />

        <section className="min-w-0">
          <h2 className="text-base sm:text-xl font-bold text-slate-900">What do you need help with?</h2>

          <div className="mt-3 sm:mt-4 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
            <input
              placeholder="Search services..."
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

          {/* Details section */}
          <div className="mt-7 lg:mt-8 space-y-4">
            <h3 className="text-base font-bold text-slate-900">When &amp; where</h3>

            <div className="rounded-2xl bg-white border border-slate-100 p-4 sm:p-5 space-y-4">
              <label className="block">
                <span className="text-xs font-semibold text-slate-700">Address</span>
                <div className="mt-1 relative">
                  <MapPin className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    name="address"
                    required
                    placeholder="123 Main St, Vancouver, BC"
                    className="w-full pl-10 pr-3 py-2.5 rounded-xl bg-white border border-slate-200 text-sm focus:outline-none focus:ring-4 focus:ring-brand-100 focus:border-brand-400"
                  />
                </div>
                <p className="text-[11px] text-slate-500 mt-1 inline-flex items-center gap-1">
                  <Info className="w-3 h-3" /> Real geocoding lands in Phase 3 (Mapbox).
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
                  placeholder="Any special instructions..."
                  className="mt-1 w-full px-3 py-2.5 rounded-xl bg-white border border-slate-200 text-sm focus:outline-none focus:ring-4 focus:ring-brand-100 focus:border-brand-400"
                />
              </label>
            </div>
          </div>

          <div className="lg:hidden mt-5 space-y-3">
            <SummaryCard selected={selected} />
            <ContinueButtons pending={pending} />
          </div>
        </section>

        <aside className="hidden lg:block space-y-4 lg:sticky lg:top-6 lg:self-start">
          <SummaryCard selected={selected} />
          <ContinueButtons pending={pending} />
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

function SummaryCard({ selected }: { selected: ServiceWithCategory | null }) {
  if (!selected) {
    return (
      <div className="rounded-2xl bg-white border border-slate-100 p-4 sm:p-5">
        <h3 className="text-sm font-bold text-slate-900 mb-3">Request Summary</h3>
        <div className="text-sm text-slate-500">Pick a service to continue.</div>
      </div>
    );
  }

  const baseDollars = selected.base_price_cents / 100;
  const serviceFee = 4.50;
  const total = baseDollars + serviceFee;

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
        <div className="text-base font-bold text-slate-900">{selected.title}</div>
        <div className="text-[11px] text-slate-500 mt-0.5">{selected.category.label}</div>
        <p className="mt-2 text-xs text-slate-600 leading-relaxed">{selected.blurb}</p>

        {/* Status pills */}
        <div className="mt-3 flex flex-wrap gap-1.5 text-[11px] font-semibold">
          <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 px-2 py-1 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Available Now
          </span>
          {selected.eta_label && (
            <span className="inline-flex items-center gap-1 text-amber-700 bg-amber-50 px-2 py-1 rounded-full">
              <Clock className="w-3 h-3" /> {selected.eta_label}
            </span>
          )}
          <span className="inline-flex items-center gap-1 text-slate-700 bg-slate-100 px-2 py-1 rounded-full">
            <Star className="w-3 h-3 fill-amber-500 text-amber-500" /> 4.9
          </span>
        </div>

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

        {/* Price estimate */}
        <div className="mt-4 border-t border-slate-100 pt-4">
          <div className="text-xs font-bold text-slate-900 mb-2">Price estimate</div>
          <dl className="text-xs space-y-1.5">
            <div className="flex justify-between">
              <dt className="text-slate-500">Base fare</dt>
              <dd className="font-semibold text-slate-900">${baseDollars.toFixed(2)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Service fee</dt>
              <dd className="font-semibold text-slate-900">${serviceFee.toFixed(2)}</dd>
            </div>
            <div className="flex justify-between pt-1.5 border-t border-slate-100">
              <dt className="text-sm font-bold text-slate-900">Total estimate</dt>
              <dd className="text-sm font-bold text-brand-700">${total.toFixed(2)}</dd>
            </div>
          </dl>
          <p className="text-[10px] text-slate-400 mt-2 leading-snug">
            Final price depends on distance, time, and any tip. You&apos;re only charged after the task is marked complete.
          </p>
        </div>

        {/* Service highlights — real-time provider count lands once matching has live capacity data. */}
        <div className="mt-4 rounded-xl bg-brand-50 p-3">
          <div className="text-[10px] font-bold text-brand-700 uppercase tracking-wide mb-2">What you can count on</div>
          <div className="grid grid-cols-3 gap-2 text-center text-[10px]">
            <div>
              <div className="font-bold text-slate-900 inline-flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Live
              </div>
              <div className="text-slate-500 mt-0.5 leading-tight">matching</div>
            </div>
            <div>
              <div className="font-bold text-slate-900">ETA</div>
              <div className="text-slate-500 mt-0.5 leading-tight">{selected.eta_label ?? "—"}</div>
            </div>
            <div>
              <div className="font-bold text-slate-900">24/7</div>
              <div className="text-slate-500 mt-0.5 leading-tight">support</div>
            </div>
          </div>
        </div>
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

function ContinueButtons({ pending }: { pending: boolean }) {
  return (
    <div className="space-y-2">
      <button
        type="submit"
        disabled={pending}
        className="w-full inline-flex items-center justify-center gap-2 py-3.5 rounded-xl bg-gradient-to-r from-brand-600 to-violet-600 text-white font-semibold shadow-lg shadow-brand-900/10 disabled:opacity-60"
      >
        {pending ? "Submitting…" : <>Submit request <ArrowRight className="w-4 h-4" /></>}
      </button>
    </div>
  );
}
