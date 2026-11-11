"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Loader2, Calendar, Send, User, ShieldCheck, CreditCard } from "lucide-react";
import type { LucideIcon } from "lucide-react";

type Hit = {
  kind: "booking" | "request" | "customer" | "helper" | "payment";
  title: string;
  detail: string;
  href: string;
};

const ICON: Record<Hit["kind"], LucideIcon> = {
  booking: Calendar,
  request: Send,
  customer: User,
  helper: ShieldCheck,
  payment: CreditCard,
};

/*
  The search box in the top bar.

  Debounced at 200ms, because this hits four tables and an operator
  pasting a reference types it in one burst anyway. Results are keyboard
  reachable — arrow keys and Enter — since the people living in this
  console do so all day and a mouse-only dropdown is a tax on them.
*/
export function AdminSearch() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cursor, setCursor] = useState(0);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (query.trim().length < 2) { setHits([]); setBusy(false); return; }
    setBusy(true);
    const id = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/search?q=${encodeURIComponent(query.trim())}`);
        const body = await res.json();
        setHits(res.ok ? (body.hits ?? []) : []);
        setCursor(0);
        setOpen(true);
      } finally {
        setBusy(false);
      }
    }, 200);
    return () => clearTimeout(id);
  }, [query]);

  useEffect(() => {
    const away = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, []);

  const go = (hit: Hit) => {
    setOpen(false);
    setQuery("");
    router.push(hit.href);
  };

  return (
    <div ref={box} className="relative flex-1 max-w-2xl">
      <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => hits.length && setOpen(true)}
        onKeyDown={(e) => {
          if (!open || hits.length === 0) return;
          if (e.key === "ArrowDown") { e.preventDefault(); setCursor((c) => (c + 1) % hits.length); }
          if (e.key === "ArrowUp") { e.preventDefault(); setCursor((c) => (c - 1 + hits.length) % hits.length); }
          if (e.key === "Enter") { e.preventDefault(); go(hits[cursor]); }
          if (e.key === "Escape") setOpen(false);
        }}
        placeholder="Search bookings, customers, helpers, or payments…"
        className="w-full bg-white border border-slate-200 rounded-full pl-10 pr-10 py-2.5 text-[13px] text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-300"
      />
      {busy && <Loader2 className="w-4 h-4 text-slate-400 animate-spin absolute right-3.5 top-1/2 -translate-y-1/2" />}

      {open && (
        <div className="absolute z-30 left-0 right-0 top-full mt-2 bg-white rounded-2xl border border-slate-200 shadow-lg overflow-hidden">
          {hits.length === 0 ? (
            <p className="px-4 py-3 text-[13px] text-slate-500">
              Nothing matched “{query.trim()}”. References look like BK-2C89C5 or RQ-5640DE.
            </p>
          ) : (
            <ul className="max-h-80 overflow-y-auto">
              {hits.map((hit, i) => {
                const Icon = ICON[hit.kind];
                return (
                  <li key={`${hit.kind}-${hit.title}-${i}`}>
                    <button
                      onMouseEnter={() => setCursor(i)}
                      onClick={() => go(hit)}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left ${
                        i === cursor ? "bg-brand-50" : "hover:bg-slate-50"
                      }`}
                    >
                      <Icon className="w-4 h-4 text-slate-400 shrink-0" />
                      <span className="text-[13px] font-semibold text-slate-900 truncate">{hit.title}</span>
                      <span className="text-[12px] text-slate-500 truncate">{hit.detail}</span>
                      <span className="ml-auto text-[10px] uppercase tracking-wide text-slate-400">{hit.kind}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
