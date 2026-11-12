"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import {
  Search, MapPin, CalendarRange, UserCheck, SlidersHorizontal, FlaskConical, X,
} from "lucide-react";

/*
  THE FILTERS OVER THE CUSTOMER LIST.

  SEARCH REACHES THE REAL EMAIL AND PHONE NUMBER; the table does not
  show either. The matching happens inside admin_customer_list, which
  returns no contact field at all, so finding a customer by the address
  they wrote in from is a lookup and not a disclosure. That is why the
  placeholder says what it will match on — an operator who does not
  know they can paste an email will go and find it somewhere worse.

  REGIONS COME FROM THE CUSTOMERS THEMSELVES rather than a list of
  places we serve: a region with nobody in it is not a filter anybody
  needs, and an empty result from a populated dropdown looks like a bug.
*/
export function CustomerControls({ regions }: { regions: string[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const [, start] = useTransition();
  const [search, setSearch] = useState(params.get("q") ?? "");
  const [more, setMore] = useState(
    Boolean(params.get("attention") || params.get("status")),
  );

  const set = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value === null || value === "") next.delete(key);
      else next.set(key, value);
    }
    if (!("page" in changes)) next.delete("page");
    start(() => router.replace(`/admin/users?${next.toString()}`, { scroll: false }));
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
        <div className="relative flex-1 min-w-[260px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email, phone or customer ID"
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
            <option value="">All regions</option>
            {regions.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>

        <div className="relative">
          <CalendarRange className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <select value={params.get("joined") ?? ""} onChange={(e) => set({ joined: e.target.value })} className={select}>
            <option value="">Joined any time</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
            <option value="12m">Last 12 months</option>
          </select>
        </div>

        <div className="relative">
          <UserCheck className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <select value={params.get("status") ?? ""} onChange={(e) => set({ status: e.target.value })} className={select}>
            <option value="">Any account status</option>
            <option value="active">Active</option>
            <option value="restricted">Restricted</option>
            <option value="deletion_scheduled">Deletion scheduled</option>
          </select>
        </div>

        <button
          onClick={() => setMore((v) => !v)}
          className={`inline-flex items-center gap-1.5 text-[12px] font-medium px-3 py-2 rounded-xl border ${
            more ? "bg-slate-100 border-slate-300 text-slate-800" : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
          }`}
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          More filters
        </button>

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

      {more && (
        <div className="flex flex-wrap items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2.5">
          <span className="text-[12px] font-semibold text-slate-500">Needs attention</span>
          {[
            { key: "", label: "Any" },
            { key: "support_case", label: "Support case" },
            { key: "payment_issue", label: "Payment issue" },
            { key: "account_review", label: "Account review" },
            { key: "privacy_request", label: "Privacy request" },
            { key: "none", label: "Nothing outstanding" },
          ].map((o) => {
            const active = (params.get("attention") ?? "") === o.key;
            return (
              <button key={o.key || "any"} onClick={() => set({ attention: o.key || null })}
                className={`text-[12px] font-medium px-2.5 py-1 rounded-full border ${
                  active ? "bg-brand-600 border-brand-600 text-white" : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
                }`}>
                {o.label}
              </button>
            );
          })}
          <span className="ml-auto text-[11px] text-slate-400">
            One reason per customer — the most urgent one.
          </span>
        </div>
      )}
    </div>
  );
}
