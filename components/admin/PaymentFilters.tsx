"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import {
  CalendarRange, MapPin, Coins, SlidersHorizontal, FlaskConical, RefreshCw,
} from "lucide-react";
import { WINDOW_OPTIONS, DEFAULT_WINDOW } from "@/lib/admin-filters";

/*
  THE FILTERS OVER THE PAYMENTS VIEW.

  CURRENCY IS A SELECTOR, NOT A COLUMN. Every total on this page is in
  one currency because CA$ and US$ are different money and adding them
  produces a number that is true of nothing. Switching the selector
  changes which set of payments the page is about.

  LIVE AND TEST ARE SEPARATED THE SAME WAY. Review accounts transact
  against Stripe's test keys; a console that mixed them would report
  revenue that never existed. The toggle is prominent for that reason,
  and test mode is amber everywhere it appears.
*/
export function PaymentFilters({ asOf }: { asOf: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const pathname = usePathname();
  const [, start] = useTransition();

  const set = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value === null || value === "") next.delete(key);
      else next.set(key, value);
    }
    if (!("page" in changes)) next.delete("page");
    /*
      THE ROUTE IS WHERE WE ARE, not a constant.

      This was hardcoded to /admin/payments, so changing a filter on
      the Refunds page navigated to Payments — the operator pressed
      "Test" on refunds and arrived somewhere else entirely, with the
      refund they were looking at left behind.
    */
    start(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
  };

  const select =
    "appearance-none bg-white border border-slate-200 rounded-xl pl-8 pr-7 py-2 text-[13px] font-medium text-slate-700 hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-200";
  const mode = params.get("mode") === "test" ? "test" : "live";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative">
        <CalendarRange className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        {/* The same table the readers use. A value only this control
            knows about is a filter that silently does nothing. */}
        <select value={params.get("window") ?? DEFAULT_WINDOW}
          onChange={(e) => set({ window: e.target.value })} className={select}>
          {WINDOW_OPTIONS.map((w) => (
            <option key={w.value} value={w.value}>{w.label}</option>
          ))}
        </select>
      </div>

      <div className="relative">
        <MapPin className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        <select value={params.get("region") ?? ""} onChange={(e) => set({ region: e.target.value })} className={select}>
          <option value="">All regions</option>
          <option value="Vancouver">Vancouver</option>
          <option value="Toronto">Toronto</option>
          <option value="San Diego">San Diego</option>
        </select>
      </div>

      <div className="relative">
        <Coins className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        <select value={params.get("currency") ?? "CAD"} onChange={(e) => set({ currency: e.target.value })} className={select}
          title="One currency at a time. Totals are never added across currencies.">
          <option value="CAD">CAD</option>
          <option value="USD">USD</option>
        </select>
      </div>

      {/* LIVE / TEST */}
      <div className="inline-flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-2.5 py-1.5">
        <span className="text-[12px] font-semibold text-slate-500">Payment mode:</span>
        <div className="inline-flex rounded-lg overflow-hidden border border-slate-200">
          {(["live", "test"] as const).map((m) => (
            <button key={m} onClick={() => set({ mode: m === "live" ? null : m })}
              className={`text-[12px] font-semibold px-2.5 py-1 ${
                mode === m
                  ? m === "live" ? "bg-brand-600 text-white" : "bg-amber-400 text-amber-950"
                  : "bg-white text-slate-500 hover:text-slate-800"
              }`}>
              {m === "live" ? "Live" : "Test"}
            </button>
          ))}
        </div>
      </div>

      <button
        onClick={() => set({ filters: params.get("filters") ? null : "1" })}
        className={`inline-flex items-center gap-1.5 text-[12px] font-medium px-3 py-2 rounded-xl border ${
          params.get("filters") ? "bg-slate-100 border-slate-300 text-slate-800" : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
        }`}
      >
        <SlidersHorizontal className="w-3.5 h-3.5" /> More filters
      </button>

      <button
        onClick={() => set({ review: params.get("review") ? null : "1" })}
        className={`inline-flex items-center gap-1.5 text-[12px] font-medium px-3 py-2 rounded-xl border ${
          params.get("review") ? "bg-amber-50 border-amber-200 text-amber-800" : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
        }`}
      >
        <FlaskConical className="w-3.5 h-3.5" />
        {params.get("review") ? "Review & test activity included." : "Review & test activity excluded."}
      </button>

      <span className="ml-auto inline-flex items-center gap-1.5 text-[12px] text-slate-500">
        <RefreshCw className="w-3.5 h-3.5" /> Updated {asOf}
      </span>
    </div>
  );
}
