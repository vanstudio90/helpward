"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Search, MapPin, User, Flag, SlidersHorizontal, FlaskConical, X } from "lucide-react";

/*
  THE FILTERS OVER THE CASE QUEUE.

  Owner, region and priority rather than free text alone, because the
  question a reviewer arrives with is "what is mine" or "what is on
  fire in Vancouver", not "find me a word".
*/
export function CaseQueueControls({ regions, admins }: {
  regions: string[];
  admins: { id: string; name: string | null }[];
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [, start] = useTransition();
  const [search, setSearch] = useState(params.get("q") ?? "");
  const [more, setMore] = useState(Boolean(params.get("status") || params.get("flag")));

  const set = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value === null || value === "") next.delete(key);
      else next.set(key, value);
    }
    if (!("page" in changes)) next.delete("page");
    start(() => router.replace(`/admin/disputes?${next.toString()}`, { scroll: false }));
  };

  useEffect(() => {
    const current = params.get("q") ?? "";
    if (search === current) return;
    const id = setTimeout(() => set({ q: search || null }), 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const select =
    "appearance-none bg-white border border-slate-200 rounded-xl pl-8 pr-7 py-2 text-[13px] font-medium text-slate-700 hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-200";
  const review = params.get("review") === "1";

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search case or booking"
            className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-8 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-brand-200"
          />
          {search && (
            <button onClick={() => setSearch("")} aria-label="Clear search"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="relative">
          <MapPin className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <select value={params.get("region") ?? ""} onChange={(e) => set({ region: e.target.value })} className={select}>
            <option value="">Region: All</option>
            {regions.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>

        <div className="relative">
          <User className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <select value={params.get("owner") ?? ""} onChange={(e) => set({ owner: e.target.value })} className={select}>
            <option value="">Owner: Anyone</option>
            <option value="me">Mine</option>
            <option value="unassigned">Unassigned</option>
            {admins.map((a) => <option key={a.id} value={a.id}>{a.name ?? a.id.slice(0, 8)}</option>)}
          </select>
        </div>

        <div className="relative">
          <Flag className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <select value={params.get("priority") ?? ""} onChange={(e) => set({ priority: e.target.value })} className={select}>
            <option value="">Priority: All</option>
            <option value="urgent">Urgent</option>
            <option value="high">High</option>
            <option value="normal">Normal</option>
            <option value="low">Low</option>
          </select>
        </div>

        <button
          onClick={() => setMore((v) => !v)}
          className={`inline-flex items-center gap-1.5 text-[12px] font-medium px-3 py-2 rounded-xl border ${
            more ? "bg-slate-100 border-slate-300 text-slate-800" : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
          }`}
        >
          <SlidersHorizontal className="w-3.5 h-3.5" /> More filters
        </button>
      </div>

      {more && (
        <div className="flex flex-wrap items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2.5">
          <span className="text-[12px] font-semibold text-slate-500">Status</span>
          {[
            { key: "", label: "Any" },
            { key: "open", label: "New" },
            { key: "investigating", label: "Investigating" },
            { key: "awaiting_response", label: "Awaiting response" },
            { key: "evidence_requested", label: "Evidence requested" },
            { key: "escalated", label: "Escalated" },
          ].map((o) => {
            const active = (params.get("status") ?? "") === o.key;
            return (
              <button key={o.key || "any"} onClick={() => set({ status: o.key || null })}
                className={`text-[12px] font-medium px-2.5 py-1 rounded-full border ${
                  active ? "bg-brand-600 border-brand-600 text-white" : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
                }`}>
                {o.label}
              </button>
            );
          })}
          <button
            onClick={() => set({ review: review ? null : "1" })}
            className={`ml-auto inline-flex items-center gap-1.5 text-[12px] font-medium px-2.5 py-1 rounded-full border ${
              review ? "bg-amber-50 border-amber-200 text-amber-800" : "bg-white border-slate-200 text-slate-600"
            }`}>
            <FlaskConical className="w-3 h-3" />
            {review ? "Review cases included" : "Review & test cases excluded"}
          </button>
        </div>
      )}
    </div>
  );
}
