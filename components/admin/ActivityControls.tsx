"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Calendar, MapPin, Coins, Layers, Search, SlidersHorizontal, X } from "lucide-react";

/*
  THE FILTERS ABOVE THE LIST.

  All of them are URL parameters the server reads before it queries, so
  the counters, the table and the pagination always describe the same
  set — and a filtered view can be pasted into a message and open the
  same way for the next person.

  Changing a filter drops back to page one. Staying on page 3 of a
  result set that just shrank to eight rows shows an empty table and
  reads as a bug.
*/

const WINDOWS = [
  { key: "today", label: "Today" },
  { key: "7d", label: "Last 7 days" },
  { key: "30d", label: "Last 30 days" },
];

const FLAGS = [
  { key: "attention", label: "Needs attention" },
  { key: "payment", label: "Payment issue" },
  { key: "unassigned", label: "Unassigned" },
];

export function ActivityControls({
  regions, services, currencies,
}: {
  regions: string[];
  services: { id: string; title: string }[];
  currencies: string[];
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [, start] = useTransition();
  const [search, setSearch] = useState(params.get("q") ?? "");

  const set = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value === null || value === "") next.delete(key);
      else next.set(key, value);
    }
    // Any filter change means the old page number describes nothing.
    if (!("page" in changes)) next.delete("page");
    start(() => router.replace(`/admin/bookings?${next.toString()}`, { scroll: false }));
  };

  /* Debounced, because this one runs a query across two tables and an
     operator pastes a reference in one burst. */
  useEffect(() => {
    const current = params.get("q") ?? "";
    if (search === current) return;
    const id = setTimeout(() => set({ q: search || null }), 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const select =
    "appearance-none bg-white border border-slate-200 rounded-xl pl-8 pr-7 py-2 text-[13px] font-medium text-slate-700 hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-200";
  const flag = params.get("flag");
  const review = params.get("review") === "1";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <MapPin className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <select value={params.get("region") ?? ""} onChange={(e) => set({ region: e.target.value })} className={select}>
            <option value="">All regions</option>
            {regions.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>

        <div className="relative">
          <Calendar className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <select value={params.get("window") ?? "7d"} onChange={(e) => set({ window: e.target.value })} className={select}>
            {WINDOWS.map((w) => <option key={w.key} value={w.key}>{w.label}</option>)}
          </select>
        </div>

        <div className="relative">
          <Coins className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <select value={params.get("currency") ?? ""} onChange={(e) => set({ currency: e.target.value })} className={select}>
            <option value="">All currencies</option>
            {currencies.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        <div className="relative">
          <Layers className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <select value={params.get("service") ?? ""} onChange={(e) => set({ service: e.target.value })} className={select}>
            <option value="">All services</option>
            {services.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
          </select>
        </div>

        <button
          onClick={() => set({ review: review ? null : "1" })}
          className={`inline-flex items-center gap-1.5 text-[12px] font-medium px-3 py-2 rounded-xl border ${
            review ? "bg-amber-50 border-amber-200 text-amber-800" : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
          }`}
          title="App Review's controlled accounts transact in Stripe test mode"
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          Review &amp; test activity: {review ? "Included" : "Excluded"}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[260px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by ID, customer or helper"
            className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-8 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-brand-200"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {FLAGS.map((f) => {
          const active = flag === f.key;
          return (
            <button
              key={f.key}
              onClick={() => set({ flag: active ? null : f.key })}
              className={`text-[12px] font-semibold px-3 py-1.5 rounded-full border transition ${
                active
                  ? f.key === "payment"
                    ? "bg-rose-50 border-rose-200 text-rose-700"
                    : "bg-amber-50 border-amber-200 text-amber-800"
                  : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
              }`}
            >
              {f.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
