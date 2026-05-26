"use client";

import { useState } from "react";
import {
  Search, SlidersHorizontal, Plus, Bell, Heart, ChevronDown, ShieldCheck,
  MapPin, MessageSquare, Phone, MoreHorizontal, Pin,
} from "lucide-react";
import { ServiceIcon } from "@/components/ServiceIcon";
import { providers, type Provider } from "@/lib/mock";
import { cn } from "@/lib/cn";

const TABS = [
  { key: "all", label: "All Favorites", count: 24 },
  { key: "providers", label: "Providers", count: 18 },
  { key: "services", label: "Services", count: 6 },
  { key: "addresses", label: "Addresses", count: 4 },
] as const;

const addresses = [
  { id: "addr-1", label: "321 Pine St, Vancouver", sub: "Saved Address", note: "Home · Vancouver, BC", date: "May 10, 2024", icon: "pin" },
  { id: "addr-2", label: "Downtown Office", sub: "Office · Vancouver, BC", date: "May 8, 2024", icon: "briefcase" },
  { id: "addr-3", label: "Airport Transfer", sub: "Ride to/from airport", date: "May 6, 2024", icon: "plane" },
];

export default function FavoritesPage() {
  const [tab, setTab] = useState<typeof TABS[number]["key"]>("all");
  const [selected, setSelected] = useState<Provider>(providers[0]);
  const pinned = providers.slice(0, 4);

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 lg:py-8 max-w-[1500px] mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 flex items-center gap-2">
            <Heart className="w-6 h-6 text-rose-500 fill-rose-500" /> Favorites
          </h1>
          <p className="text-sm text-slate-500 mt-1">Your favorite providers and services for quick access.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input placeholder="Search favorites by name or service..." className="w-full pl-9 pr-3 py-2 rounded-xl bg-white border border-slate-200 text-sm" />
          </div>
          <button className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-slate-200 text-sm">
            <SlidersHorizontal className="w-4 h-4 text-slate-500" /> Filters
          </button>
          <button className="hidden sm:inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-slate-200 text-sm">
            Sort by: Recently Added <ChevronDown className="w-3 h-3 text-slate-400" />
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
      <div className="border-b border-slate-200 flex gap-6 overflow-x-auto scrollbar-none">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "shrink-0 pb-3 -mb-px text-sm flex items-center gap-2 border-b-2",
              tab === t.key ? "border-brand-600 text-brand-700 font-semibold" : "border-transparent text-slate-500"
            )}
          >
            {t.label}
            <span className={cn(
              "text-[10px] font-bold rounded-full min-w-[20px] h-[20px] px-1.5 flex items-center justify-center",
              tab === t.key ? "bg-brand-100 text-brand-700" : "bg-slate-100 text-slate-500"
            )}>{t.count}</span>
          </button>
        ))}
      </div>

      <div className="mt-6 grid lg:grid-cols-[1fr_360px] xl:grid-cols-[1fr_400px] gap-6">
        <section>
          {/* Pinned */}
          <div className="flex items-center gap-2 mb-3">
            <h2 className="text-sm font-bold text-slate-900">Pinned Favorites</h2>
            <Pin className="w-3 h-3 text-slate-400" />
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-4 gap-3 mb-8">
            {pinned.map((p) => (
              <button
                key={p.id}
                onClick={() => setSelected(p)}
                className={cn(
                  "text-left rounded-2xl border p-4 bg-white relative transition",
                  p.id === selected.id ? "border-brand-500 ring-4 ring-brand-100" : "border-slate-100 hover:border-slate-300"
                )}
              >
                <Pin className="absolute top-3 left-3 w-3.5 h-3.5 text-brand-500 fill-brand-500" />
                <div className="flex items-start justify-between mb-3">
                  <img src={p.avatar} className="w-12 h-12 rounded-full mt-3 mx-auto" alt="" />
                  <ServiceIcon name={p.serviceIcon || "car"} size="sm" />
                </div>
                <div className="text-sm font-bold text-slate-900 flex items-center justify-center gap-1">{p.name} {p.verified && <ShieldCheck className="w-3.5 h-3.5 text-brand-600" />}</div>
                <div className="text-xs text-slate-500 text-center">{p.role}</div>
                <div className="text-xs text-amber-500 text-center mt-1">★ {p.rating} <span className="text-slate-400">({p.reviews.toLocaleString()} reviews)</span></div>
                {p.tag && (
                  <div className="mt-2 text-center"><span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">{p.tag}</span></div>
                )}
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <span className="text-[11px] text-center font-semibold text-brand-700 bg-brand-50 py-1.5 rounded-lg">Book Now</span>
                  <span className="text-[11px] text-center font-semibold text-brand-700 border border-brand-200 py-1.5 rounded-lg">Message</span>
                </div>
              </button>
            ))}
          </div>

          {/* All Favorites list */}
          <h2 className="text-sm font-bold text-slate-900 mb-3">All Favorites</h2>
          <ul className="space-y-2">
            {providers.slice(4).map((p) => (
              <li key={p.id}>
                <button
                  onClick={() => setSelected(p)}
                  className="w-full text-left rounded-2xl bg-white border border-slate-100 hover:border-slate-300 p-3 flex items-center gap-3"
                >
                  <img src={p.avatar} className="w-10 h-10 rounded-full" alt="" />
                  <ServiceIcon name={p.serviceIcon || "car"} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold text-slate-900 truncate flex items-center gap-1">{p.name} {p.verified && <ShieldCheck className="w-3.5 h-3.5 text-brand-600" />}</div>
                    <div className="text-xs text-slate-500 truncate">{p.role}</div>
                  </div>
                  <div className="hidden sm:block text-xs text-amber-500">★ {p.rating} <span className="text-slate-400">({p.reviews.toLocaleString()})</span></div>
                  <span className="hidden sm:inline-flex text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">Provider</span>
                  <div className="hidden md:block text-xs text-slate-500 w-24"><div className="text-slate-400">Added on</div>May 14, 2024</div>
                  <button className="hidden sm:inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white border border-brand-200 text-brand-700 text-xs font-semibold">Book Now</button>
                  <button className="p-2 rounded-lg border border-slate-200"><MessageSquare className="w-4 h-4 text-slate-500" /></button>
                  <button className="p-2 rounded-lg border border-slate-200"><MoreHorizontal className="w-4 h-4 text-slate-500" /></button>
                </button>
              </li>
            ))}

            {addresses.map((a) => (
              <li key={a.id}>
                <div className="rounded-2xl bg-white border border-slate-100 p-3 flex items-center gap-3">
                  <ServiceIcon name={a.icon} size="sm" />
                  <ServiceIcon name="spark" size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold text-slate-900 truncate">{a.label}</div>
                    <div className="text-xs text-slate-500 truncate">{a.sub}{a.note ? ` · ${a.note}` : ""}</div>
                  </div>
                  <span className="hidden sm:inline-flex text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">Address</span>
                  <div className="hidden md:block text-xs text-slate-500 w-24"><div className="text-slate-400">Added on</div>{a.date}</div>
                  <button className="hidden sm:inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white border border-brand-200 text-brand-700 text-xs font-semibold">Use Address</button>
                  <button className="p-2 rounded-lg border border-slate-200"><MoreHorizontal className="w-4 h-4 text-slate-500" /></button>
                </div>
              </li>
            ))}
          </ul>

          <div className="mt-6 text-center">
            <button className="inline-flex items-center gap-2 text-sm font-semibold text-brand-700 bg-white border border-slate-200 px-4 py-2 rounded-xl">
              Load More <ChevronDown className="w-3 h-3" />
            </button>
          </div>
        </section>

        <aside className="hidden lg:block">
          <FavoritePanel p={selected} />
        </aside>
      </div>
    </div>
  );
}

function FavoritePanel({ p }: { p: Provider }) {
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
        {(p.badges ?? ["ID Verified", "Background Checked", "Insured"]).map((b) => (
          <span key={b} className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-full">✓ {b}</span>
        ))}
      </div>

      <div className="grid grid-cols-4 gap-2 text-center text-[11px]">
        <Action icon={<MessageSquare className="w-4 h-4" />} label="Message" />
        <Action icon={<Phone className="w-4 h-4" />} label="Call" />
        <Action icon={<Plus className="w-4 h-4" />} label="Book Now" />
        <Action icon={<MoreHorizontal className="w-4 h-4" />} label="More" />
      </div>

      <div>
        <div className="text-sm font-bold text-slate-900 mb-2">About</div>
        <p className="text-sm text-slate-600">{p.about ?? "Professional and reliable. Specializes in safe and comfortable service."}</p>
      </div>

      <dl className="text-sm space-y-2.5 border-t border-slate-100 pt-4">
        <div className="flex justify-between"><dt className="text-slate-500 flex items-center gap-2">📅 Member since</dt><dd className="font-medium">Jan 2023</dd></div>
        <div className="flex justify-between"><dt className="text-slate-500 flex items-center gap-2">✅ Completed tasks</dt><dd className="font-medium">1,248</dd></div>
        <div className="flex justify-between"><dt className="text-slate-500 flex items-center gap-2">⚡ Response time</dt><dd className="font-medium">Usually within 5 min</dd></div>
        <div className="flex justify-between"><dt className="text-slate-500 flex items-center gap-2">🌐 Languages</dt><dd className="font-medium">English, Spanish</dd></div>
      </dl>

      <div>
        <div className="text-sm font-bold text-slate-900 mb-3">Services Offered</div>
        <div className="flex flex-wrap gap-2 text-xs">
          {(p.services ?? []).map((s) => (
            <span key={s} className="inline-flex items-center gap-1 bg-brand-50 text-brand-700 px-2.5 py-1.5 rounded-lg font-semibold">{s}</span>
          ))}
          {(p.services?.length ?? 0) > 2 && <span className="inline-flex bg-slate-100 text-slate-600 px-2.5 py-1.5 rounded-lg font-semibold">+2 more</span>}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm font-bold text-slate-900">Notes</div>
          <a className="text-xs text-brand-700 font-semibold">Edit Note</a>
        </div>
        <p className="text-sm text-slate-700">Only available after 6 PM on weekdays.</p>
        <p className="text-sm text-slate-700 mt-1">Prefers cash tips 😊</p>
        <div className="text-[11px] text-slate-400 mt-2">Added on May 1, 2024 · Updated on May 10, 2024</div>
      </div>

      <button className="w-full py-2.5 rounded-xl border border-rose-200 text-rose-700 text-sm font-semibold inline-flex items-center justify-center gap-2">
        <Heart className="w-4 h-4" /> Remove from Favorites
      </button>
    </div>
  );
}

function Action({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <button className="rounded-xl bg-brand-50 text-brand-700 py-3 flex flex-col items-center gap-1 font-semibold">
      {icon}<span>{label}</span>
    </button>
  );
}
