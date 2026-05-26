"use client";

import { useState } from "react";
import {
  Search, SlidersHorizontal, MessageSquare, Phone, Plus, Bell, ChevronDown,
  Star, MoreHorizontal, ShieldCheck,
} from "lucide-react";
import { ServiceIcon } from "@/components/ServiceIcon";
import { providers, type Provider } from "@/lib/mock";
import { cn } from "@/lib/cn";

const TABS = [
  { key: "all", label: "All Providers", count: providers.length },
  { key: "freq", label: "Frequently Used", count: 8 },
  { key: "rated", label: "Highly Rated", count: 12 },
  { key: "recent", label: "Recently Saved", count: providers.length },
] as const;

export default function SavedProvidersPage() {
  const [tab, setTab] = useState<typeof TABS[number]["key"]>("all");
  const [selected, setSelected] = useState<Provider>(providers[0]);

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 lg:py-8 max-w-[1500px] mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">Saved Providers</h1>
          <p className="text-sm text-slate-500 mt-1">Your trusted providers, saved for faster booking.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input placeholder="Search saved providers..." className="w-full pl-9 pr-3 py-2 rounded-xl bg-white border border-slate-200 text-sm" />
          </div>
          <button className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-slate-200 text-sm">
            <SlidersHorizontal className="w-4 h-4 text-slate-500" /> Filters
          </button>
          <button className="hidden sm:inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-slate-200 text-sm">
            Sort by: Recently Saved <ChevronDown className="w-3 h-3 text-slate-400" />
          </button>
          <button className="relative p-2 rounded-xl bg-white border border-slate-200">
            <Bell className="w-5 h-5 text-slate-700" />
            <span className="absolute -top-1 -right-1 bg-rose-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">3</span>
          </button>
          <button className="hidden sm:inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold">
            <Plus className="w-4 h-4" /> New Request
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 overflow-x-auto scrollbar-none -mx-4 px-4">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold",
              tab === t.key ? "bg-brand-600 text-white" : "bg-white border border-slate-200 text-slate-700"
            )}
          >
            {t.label}
            <span className={cn(
              "rounded-full px-1.5 py-0.5 text-[10px] font-bold",
              tab === t.key ? "bg-white/20 text-white" : "bg-slate-100 text-slate-600"
            )}>{t.count}</span>
          </button>
        ))}
      </div>

      <div className="mt-6 grid lg:grid-cols-[1fr_360px] xl:grid-cols-[1fr_400px] gap-6">
        <ul className="space-y-3">
          {providers.map((p) => {
            const isSel = p.id === selected.id;
            return (
              <li key={p.id}>
                <button
                  onClick={() => setSelected(p)}
                  className={cn(
                    "w-full text-left rounded-2xl bg-white border p-4 flex items-center gap-4 transition",
                    isSel ? "border-brand-500 ring-4 ring-brand-100" : "border-slate-100 hover:border-slate-300"
                  )}
                >
                  <MoreHorizontal className="w-4 h-4 text-slate-300 rotate-90" />
                  <div className="relative">
                    <img src={p.avatar} className="w-12 h-12 rounded-full" alt="" />
                    <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-white" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <div className="text-sm font-bold text-slate-900 truncate">{p.name}</div>
                      {p.verified && <ShieldCheck className="w-3.5 h-3.5 text-brand-600" />}
                      {p.tag && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">{p.tag}</span>}
                    </div>
                    <div className="text-xs text-slate-500">{p.role}</div>
                    <div className="text-xs text-amber-500">★ {p.rating} <span className="text-slate-400">({p.reviews.toLocaleString()} reviews)</span></div>
                  </div>
                  <div className="hidden md:flex flex-col gap-1 text-xs">
                    <div className="text-slate-500 font-semibold">Services</div>
                    <div className="flex gap-1">
                      <ServiceIcon name={p.serviceIcon || "car"} size="sm" />
                      {(p.services?.length ?? 0) > 1 && (
                        <span className="inline-flex w-9 h-9 rounded-lg bg-slate-100 text-slate-500 text-[11px] font-bold items-center justify-center">+{(p.services?.length ?? 1) - 1}</span>
                      )}
                    </div>
                  </div>
                  <div className="hidden md:block text-xs text-slate-500 w-28">
                    <div className="font-semibold text-slate-700">Used {Math.max(3, Math.round(p.reviews / 100))} times</div>
                    <div>Last: May {7 + Math.floor(Math.random() * 10)}</div>
                  </div>
                  <div className="flex gap-1">
                    <button className="p-2 rounded-lg border border-brand-200 text-brand-700"><MessageSquare className="w-4 h-4" /></button>
                    <button className="p-2 rounded-lg border border-brand-200 text-brand-700"><Phone className="w-4 h-4" /></button>
                  </div>
                </button>
              </li>
            );
          })}
          <li className="text-center">
            <button className="inline-flex items-center gap-2 text-sm font-semibold text-brand-700 bg-white border border-slate-200 px-4 py-2 rounded-xl">
              Load More <ChevronDown className="w-3 h-3" />
            </button>
          </li>
        </ul>

        <aside className="hidden lg:block">
          <ProviderPanel p={selected} />
        </aside>
      </div>
    </div>
  );
}

function ProviderPanel({ p }: { p: Provider }) {
  return (
    <div className="rounded-2xl bg-white border border-slate-100 p-5 lg:sticky lg:top-6 space-y-5">
      <div className="flex items-start gap-4">
        <img src={p.avatar} className="w-16 h-16 rounded-full" alt="" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div className="text-base font-bold text-slate-900 truncate">{p.name}</div>
            {p.verified && <ShieldCheck className="w-4 h-4 text-brand-600" />}
          </div>
          <div className="text-sm text-slate-500">{p.role}</div>
          <div className="text-xs text-amber-500 mt-1">★ {p.rating} <span className="text-slate-400">({p.reviews.toLocaleString()} reviews)</span></div>
        </div>
        <ServiceIcon name={p.serviceIcon || "car"} />
      </div>

      <div className="flex flex-wrap gap-2">
        {(p.badges ?? []).map((b) => (
          <span key={b} className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-full">
            ✓ {b}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-4 gap-2 text-center text-[11px]">
        <ActionBtn icon={<MessageSquare className="w-4 h-4" />} label="Message" />
        <ActionBtn icon={<Phone className="w-4 h-4" />} label="Call" />
        <ActionBtn icon={<Plus className="w-4 h-4" />} label="Book Now" />
        <ActionBtn icon={<MoreHorizontal className="w-4 h-4" />} label="More" />
      </div>

      {p.about && (
        <div>
          <div className="text-sm font-bold text-slate-900 mb-2">About</div>
          <p className="text-sm text-slate-600">{p.about}</p>
        </div>
      )}

      <dl className="text-sm space-y-2.5 border-t border-slate-100 pt-4">
        <div className="flex justify-between"><dt className="text-slate-500 flex items-center gap-2">📅 Member since</dt><dd className="font-medium">{p.member ?? "Jan 2023"}</dd></div>
        <div className="flex justify-between"><dt className="text-slate-500 flex items-center gap-2">✅ Completed tasks</dt><dd className="font-medium">{p.completed?.toLocaleString() ?? p.reviews.toLocaleString()}</dd></div>
        <div className="flex justify-between"><dt className="text-slate-500 flex items-center gap-2">⚡ Response time</dt><dd className="font-medium">{p.response ?? "Within 10 min"}</dd></div>
        <div className="flex justify-between"><dt className="text-slate-500 flex items-center gap-2">🌐 Languages</dt><dd className="font-medium">{p.languages ?? "English"}</dd></div>
      </dl>

      <div>
        <div className="text-sm font-bold text-slate-900 mb-3">Services</div>
        <div className="grid grid-cols-4 gap-2 text-[11px] text-center">
          {(p.services ?? []).slice(0, 3).map((s, i) => (
            <div key={s} className={cn("rounded-xl p-2 flex flex-col items-center gap-1", i === 0 ? "bg-brand-50 text-brand-700" : "bg-slate-50 text-slate-700")}>
              <ServiceIcon name={["car", "plane", "calendar"][i] ?? "spark"} size="sm" />
              <span className="leading-tight">{s}</span>
            </div>
          ))}
          {(p.services?.length ?? 0) > 3 && (
            <div className="rounded-xl p-2 bg-slate-50 text-slate-500 flex flex-col items-center justify-center">
              <Plus className="w-4 h-4" />
              <span className="text-[11px]">{(p.services?.length ?? 0) - 3} more</span>
            </div>
          )}
        </div>
      </div>

      <div className="rounded-xl bg-amber-50 border border-amber-100 p-3 text-sm text-amber-900">
        <div className="font-semibold mb-1">Notes</div>
        Very reliable and professional. Always on time and has a safe driving record.
        <div className="text-[11px] text-amber-700 mt-2">Added on May 1, 2024</div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-bold text-slate-900">Recent Bookings</div>
          <a className="text-xs font-semibold text-brand-700">View All</a>
        </div>
        <ul className="space-y-2 text-xs">
          <li className="flex justify-between border-b border-slate-100 pb-2"><span>May 17, 2024 · 10:00 PM<br /><span className="text-slate-500">123 Main St, Vancouver → Home</span></span><span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full whitespace-nowrap h-fit">Completed</span></li>
          <li className="flex justify-between"><span>May 10, 2024 · 11:30 PM<br /><span className="text-slate-500">Downtown Vancouver → Home</span></span><span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full whitespace-nowrap h-fit">Completed</span></li>
        </ul>
      </div>

      <button className="w-full py-2.5 rounded-xl border border-rose-200 text-rose-700 text-sm font-semibold">Remove from Saved</button>
    </div>
  );
}

function ActionBtn({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <button className="rounded-xl bg-brand-50 text-brand-700 py-3 flex flex-col items-center gap-1">
      {icon}<span>{label}</span>
    </button>
  );
}
