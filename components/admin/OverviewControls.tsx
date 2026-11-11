"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Calendar, MapPin, RefreshCw, FlaskConical } from "lucide-react";

/*
  THE FILTERS, AND THEY ALL ACTUALLY FILTER.

  Each one is a URL parameter the server reads before it queries, so the
  whole page — counters, queues, coverage, money — changes together and
  a filtered view can be linked to or reloaded without losing itself.

  THE REVIEW TOGGLE IS THE IMPORTANT ONE. App Review's controlled
  customer and helpers transact in Stripe test mode, isolated from real
  dispatch. Leaving them in the numbers inflates every figure on this
  page, so they are out by default and the toggle says so in as many
  words rather than hiding behind a label like "all data".
*/

const WINDOWS = [
  { key: "today", label: "Today" },
  { key: "7d", label: "Last 7 days" },
  { key: "30d", label: "Last 30 days" },
];

export function OverviewControls({
  regions,
  asOf,
  stale,
}: {
  regions: { name: string; requests: number }[];
  asOf: string;
  stale?: boolean;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const [ago, setAgo] = useState("just now");

  const windowKey = params.get("window") ?? "today";
  const region = params.get("region") ?? "";
  const review = params.get("review") === "1";

  /* The age of what is on screen, ticking. A dashboard that cannot say
     how old it is invites someone to act on a number from an hour ago. */
  useEffect(() => {
    const tick = () => {
      const seconds = Math.max(0, Math.round((Date.now() - new Date(asOf).getTime()) / 1000));
      setAgo(
        seconds < 10 ? "just now"
          : seconds < 60 ? `${seconds} sec ago`
          : seconds < 3600 ? `${Math.floor(seconds / 60)} min ago`
          : `${Math.floor(seconds / 3600)} h ago`,
      );
    };
    tick();
    const id = setInterval(tick, 5000);
    return () => clearInterval(id);
  }, [asOf]);

  const set = (key: string, value: string | null) => {
    const next = new URLSearchParams(params.toString());
    if (value === null || value === "") next.delete(key);
    else next.set(key, value);
    start(() => router.replace(`/admin?${next.toString()}`, { scroll: false }));
  };

  const select =
    "appearance-none bg-white border border-slate-200 rounded-xl pl-8 pr-7 py-2 text-[13px] font-medium text-slate-700 hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-200";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative">
        <MapPin className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        <select value={region} onChange={(e) => set("region", e.target.value)} className={select}>
          <option value="">All regions</option>
          {regions.map((r) => (
            <option key={r.name} value={r.name}>{r.name}</option>
          ))}
        </select>
      </div>

      <div className="relative">
        <Calendar className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        <select value={windowKey} onChange={(e) => set("window", e.target.value)} className={select}>
          {WINDOWS.map((w) => (
            <option key={w.key} value={w.key}>{w.label}</option>
          ))}
        </select>
      </div>

      <button
        onClick={() => set("review", review ? null : "1")}
        className={`inline-flex items-center gap-1.5 text-[13px] font-medium px-3 py-2 rounded-xl border transition ${
          review
            ? "bg-amber-50 border-amber-200 text-amber-800"
            : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
        }`}
        title={
          review
            ? "Showing App Review's controlled accounts alongside the marketplace"
            : "App Review's controlled accounts are excluded"
        }
      >
        <FlaskConical className="w-4 h-4" />
        {review ? "Review activity included" : "Review activity excluded"}
      </button>

      <button
        onClick={() => start(() => router.refresh())}
        disabled={pending}
        className="inline-flex items-center gap-1.5 bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white text-[13px] font-semibold px-3.5 py-2 rounded-xl"
      >
        <RefreshCw className={`w-4 h-4 ${pending ? "animate-spin" : ""}`} />
        Refresh
      </button>

      <span className={`text-[11px] ${stale ? "text-amber-700" : "text-slate-400"} ml-1`}>
        {stale ? "Showing the last good read · " : "Updated "}
        {ago}
      </span>
    </div>
  );
}
