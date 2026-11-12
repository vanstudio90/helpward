"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";

/*
  THE FILTERS OVER THE CONVERSATION LIST.

  The three chips are the three questions a support shift actually
  starts with — what is mine, what is nobody's, what is on fire — and
  each carries its own count so the chip is an answer before it is a
  filter.
*/
export function InboxControls({
  counts,
}: {
  counts: { mine: number; unassigned: number; urgent: number };
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [, start] = useTransition();
  const [search, setSearch] = useState(params.get("q") ?? "");
  const [more, setMore] = useState(Boolean(params.get("channel") || params.get("priority")));

  const set = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value === null || value === "") next.delete(key);
      else next.set(key, value);
    }
    if (!("page" in changes)) next.delete("page");
    start(() => router.replace(`/admin/inbox?${next.toString()}`, { scroll: false }));
  };

  useEffect(() => {
    const current = params.get("q") ?? "";
    if (search === current) return;
    const id = setTimeout(() => set({ q: search || null }), 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const owner = params.get("owner");
  const priority = params.get("priority");
  const select =
    "appearance-none bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 text-[12px] font-medium text-slate-700 hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-200";

  const chip = (active: boolean) =>
    `inline-flex items-center gap-1.5 text-[12px] font-semibold px-2.5 py-1 rounded-full border ${
      active ? "bg-brand-600 border-brand-600 text-white" : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
    }`;

  return (
    <div className="px-3 py-2.5 border-b border-slate-100 space-y-2">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search inbox…"
            className="w-full bg-white border border-slate-200 rounded-xl pl-8 pr-7 py-1.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-brand-200"
          />
          {search && (
            <button onClick={() => setSearch("")} aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <button
          onClick={() => setMore((v) => !v)}
          aria-label="More filters"
          className={`shrink-0 w-8 h-8 grid place-items-center rounded-xl border ${
            more ? "bg-slate-100 border-slate-300 text-slate-700" : "bg-white border-slate-200 text-slate-500 hover:border-slate-300"
          }`}
        >
          <SlidersHorizontal className="w-4 h-4" />
        </button>
      </div>

      <div className="flex items-center gap-2">
        <select value={params.get("status") ?? "open"} onChange={(e) => set({ status: e.target.value })}
          className={`${select} flex-1`}>
          <option value="open">All open</option>
          <option value="waiting">Waiting on customer</option>
          <option value="snoozed">Snoozed</option>
          <option value="resolved">Resolved</option>
          <option value="all">Everything</option>
        </select>
        <select value={params.get("sort") ?? "oldest"} onChange={(e) => set({ sort: e.target.value })}
          className={`${select} flex-1`}>
          <option value="oldest">Oldest waiting</option>
          <option value="due">Reply due first</option>
          <option value="newest">Newest first</option>
        </select>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <button onClick={() => set({ owner: owner === "me" ? null : "me" })} className={chip(owner === "me")}>
          Mine <span className={owner === "me" ? "text-white/80" : "text-slate-400"}>{counts.mine}</span>
        </button>
        <button onClick={() => set({ owner: owner === "unassigned" ? null : "unassigned" })} className={chip(owner === "unassigned")}>
          Unassigned <span className={owner === "unassigned" ? "text-white/80" : "text-slate-400"}>{counts.unassigned}</span>
        </button>
        <button onClick={() => set({ priority: priority === "urgent" ? null : "urgent" })}
          className={`inline-flex items-center gap-1.5 text-[12px] font-semibold px-2.5 py-1 rounded-full border ${
            priority === "urgent" ? "bg-rose-600 border-rose-600 text-white" : "bg-rose-50 border-rose-200 text-rose-700 hover:border-rose-300"
          }`}>
          Urgent <span className={priority === "urgent" ? "text-white/80" : "text-rose-400"}>{counts.urgent}</span>
        </button>
      </div>

      {more && (
        <div className="flex items-center gap-2 pt-0.5">
          <select value={params.get("channel") ?? ""} onChange={(e) => set({ channel: e.target.value })} className={`${select} flex-1`}>
            <option value="">Any channel</option>
            <option value="email">Email</option>
            <option value="in_app">In-app</option>
          </select>
          <select value={params.get("priority") ?? ""} onChange={(e) => set({ priority: e.target.value })} className={`${select} flex-1`}>
            <option value="">Any priority</option>
            <option value="urgent">Urgent</option>
            <option value="high">High</option>
            <option value="normal">Normal</option>
            <option value="low">Low</option>
          </select>
        </div>
      )}
    </div>
  );
}
