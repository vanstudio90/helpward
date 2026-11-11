"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Search, MapPin, User, ArrowDownNarrowWide, FlaskConical, X } from "lucide-react";

/*
  The filters over the approval queue.

  Owners come from the applications themselves rather than from a list
  of staff: a reviewer with nothing assigned is not a filter anybody
  needs, and an empty result from a populated dropdown looks like a bug.
*/
export function HelperQueueControls({
  owners, regions,
}: {
  owners: { id: string; name: string | null }[];
  regions: string[];
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
    if (!("page" in changes)) next.delete("page");
    start(() => router.replace(`/admin/helpers?${next.toString()}`, { scroll: false }));
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
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative flex-1 min-w-[220px]">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or reference"
          className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-8 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-brand-200"
        />
        {search && (
          <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="relative">
        <MapPin className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        <select value={params.get("region") ?? ""} onChange={(e) => set({ region: e.target.value })} className={select}>
          <option value="">All regions</option>
          {regions.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>

      <div className="relative">
        <User className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        <select value={params.get("owner") ?? ""} onChange={(e) => set({ owner: e.target.value })} className={select}>
          <option value="">Anyone</option>
          {owners.map((o) => <option key={o.id} value={o.id}>{o.name ?? o.id.slice(0, 8)}</option>)}
        </select>
      </div>

      <div className="relative">
        <ArrowDownNarrowWide className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        <select value={params.get("sort") ?? "oldest"} onChange={(e) => set({ sort: e.target.value })} className={select}>
          <option value="oldest">Oldest first</option>
          <option value="newest">Newest first</option>
        </select>
      </div>

      <button
        onClick={() => set({ review: review ? null : "1" })}
        className={`inline-flex items-center gap-1.5 text-[12px] font-medium px-3 py-2 rounded-xl border ${
          review ? "bg-amber-50 border-amber-200 text-amber-800" : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
        }`}
      >
        <FlaskConical className="w-3.5 h-3.5" />
        {review ? "Review accounts included" : "Review & test accounts excluded"}
      </button>
    </div>
  );
}
