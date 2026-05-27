"use client";

import { useState } from "react";
import {
  Search, SlidersHorizontal, MessageSquare, Phone, Plus, Bell, ChevronDown,
  Star, MoreHorizontal, ShieldCheck, ArrowLeft, X, Edit3, Calendar,
  CheckCircle2, Clock, Globe,
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
  const [mobileView, setMobileView] = useState<"list" | "detail">("list");

  const openDetail = (p: Provider) => { setSelected(p); setMobileView("detail"); };

  return (
    <div className="px-4 lg:px-8 py-5 lg:py-8 max-w-[1500px] mx-auto">
      {/* Header — list view + always on desktop */}
      <div className={cn("mb-4 lg:mb-6", mobileView === "detail" ? "hidden lg:block" : "")}>
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold text-slate-900">Saved Providers</h1>
            <p className="text-sm text-slate-500 mt-1">Your trusted providers, saved for faster booking.</p>
          </div>
          <div className="hidden lg:flex items-center gap-2">
            <div className="relative w-72">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input placeholder="Search saved providers..." className="w-full pl-9 pr-3 py-2 rounded-xl bg-white border border-slate-200 text-sm" />
            </div>
            <button className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-slate-200 text-sm">
              <SlidersHorizontal className="w-4 h-4 text-slate-500" /> Filters
            </button>
            <button className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-slate-200 text-sm">
              Sort by: Recently Saved <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>
            <button className="relative p-2 rounded-xl bg-white border border-slate-200">
              <Bell className="w-5 h-5 text-slate-700" />
              <span className="absolute -top-1 -right-1 bg-rose-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">3</span>
            </button>
          </div>
        </div>

        {/* Mobile-only: search + filter icons row above the chips */}
        <div className="mt-3 lg:hidden flex gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input placeholder="Search saved providers..." className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-white border border-slate-200 text-sm" />
          </div>
          <button className="p-2.5 rounded-xl border border-slate-200 bg-white">
            <SlidersHorizontal className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        {/* Filter chips (wrap on mobile per mockup) */}
        <div className={cn("mt-4 flex flex-wrap gap-2", mobileView === "detail" ? "lg:flex hidden" : "flex")}>
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold",
                tab === t.key ? "bg-brand-50 text-brand-700 border border-brand-200" : "bg-white border border-slate-200 text-slate-700"
              )}
            >
              {t.label}
              <span className={cn(
                "rounded-full px-1.5 py-0.5 text-[10px] font-bold min-w-[20px] text-center",
                tab === t.key ? "bg-brand-100 text-brand-700" : "bg-slate-100 text-slate-600"
              )}>{t.count}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="grid lg:grid-cols-[1fr_360px] xl:grid-cols-[1fr_400px] gap-6">
        {/* LIST */}
        <section className={cn(mobileView === "detail" ? "hidden lg:block" : "")}>
          <ul className="space-y-3">
            {providers.map((p) => (
              <li key={p.id}>
                <ProviderCard p={p} isSelected={p.id === selected.id} onOpen={openDetail} />
              </li>
            ))}
            <li className="text-center pt-2">
              <button className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700 bg-white border border-slate-200 px-4 py-2 rounded-xl">
                Load More <ChevronDown className="w-3 h-3" />
              </button>
            </li>
          </ul>
        </section>

        {/* DETAIL */}
        <aside className={cn(mobileView === "detail" ? "block" : "hidden lg:block")}>
          <DetailPanel p={selected} onBack={() => setMobileView("list")} />
        </aside>
      </div>
    </div>
  );
}

function ProviderCard({
  p, isSelected, onOpen,
}: { p: Provider; isSelected: boolean; onOpen: (p: Provider) => void }) {
  return (
    <button
      onClick={() => onOpen(p)}
      className={cn(
        "w-full text-left rounded-2xl border p-4 transition flex items-start gap-3",
        isSelected ? "border-brand-300 bg-brand-50/40 ring-2 ring-brand-100" : "border-slate-100 bg-white hover:border-slate-300"
      )}
    >
      {/* Drag handle */}
      <span className="text-slate-300 self-stretch flex items-center -ml-1">⋮</span>

      <div className="min-w-0 flex-1">
        {/* Top row: avatar + name + actions */}
        <div className="flex items-start gap-3">
          <div className="relative shrink-0">
            <img src={p.avatar} className="w-12 h-12 rounded-full" alt="" />
            <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-white" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-sm font-bold text-slate-900 truncate">{p.name}</span>
              {p.verified && <ShieldCheck className="w-3.5 h-3.5 text-brand-600 shrink-0" />}
              {p.tag && (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
                  <Star className="w-2.5 h-2.5 fill-emerald-700" />
                  {p.tag}
                </span>
              )}
            </div>
            <div className="text-xs text-slate-500 truncate mt-0.5">{p.role}</div>
            <div className="text-xs mt-1">
              <span className="text-brand-700 font-semibold">★ {p.rating}</span>
              <span className="text-slate-400 ml-1">({p.reviews.toLocaleString()} reviews)</span>
            </div>
          </div>

          <div className="flex flex-col gap-1.5 shrink-0">
            <button
              aria-label="Message"
              onClick={(e) => e.stopPropagation()}
              className="w-9 h-9 rounded-full border border-brand-200 bg-white text-brand-700 flex items-center justify-center"
            >
              <MessageSquare className="w-4 h-4" />
            </button>
            <button
              aria-label="Call"
              onClick={(e) => e.stopPropagation()}
              className="w-9 h-9 rounded-full border border-brand-200 bg-white text-brand-700 flex items-center justify-center"
            >
              <Phone className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Bottom row: services + usage */}
        <div className="mt-3 pt-3 border-t border-slate-100 flex items-end justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] font-semibold text-slate-500 mb-1.5">Services</div>
            <div className="flex items-center gap-1.5">
              <ServiceIcon name={p.serviceIcon || "car"} size="sm" />
              {(p.services?.length ?? 0) > 1 && (
                <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-slate-100 text-slate-600 text-[11px] font-bold">
                  +{(p.services?.length ?? 1) - 1}
                </span>
              )}
            </div>
          </div>
          <div className="text-right text-[11px] text-slate-500 whitespace-nowrap shrink-0">
            <div className="font-semibold text-slate-700">Used {Math.max(3, Math.round(p.reviews / 100))} times</div>
            <div>Last: May {7 + (parseInt(p.id, 36) % 10)}, 2024</div>
          </div>
        </div>
      </div>
    </button>
  );
}

function DetailPanel({ p, onBack }: { p: Provider; onBack: () => void }) {
  return (
    <div className="rounded-2xl bg-white border border-slate-100 lg:sticky lg:top-6 overflow-hidden">
      {/* Mobile back bar */}
      <div className="lg:hidden flex items-center justify-between px-4 py-3 border-b border-slate-100">
        <button onClick={onBack} aria-label="Back" className="p-1.5 -ml-1.5 rounded-lg hover:bg-slate-100">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="text-sm font-bold text-slate-900">Provider Details</div>
        <button className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-700 border border-brand-200 px-2.5 py-1.5 rounded-lg">
          <Edit3 className="w-3 h-3" /> Edit Note
        </button>
      </div>

      {/* Desktop close + edit row */}
      <div className="hidden lg:flex items-center justify-between px-5 pt-4">
        <button onClick={onBack} aria-label="Close" className="p-1 rounded-lg hover:bg-slate-100">
          <X className="w-4 h-4 text-slate-400" />
        </button>
        <button className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-700 border border-brand-200 px-2.5 py-1.5 rounded-lg">
          <Edit3 className="w-3 h-3" /> Edit Note
        </button>
      </div>

      <div className="p-4 sm:p-5 space-y-5">
        {/* Header */}
        <div className="text-center">
          <img src={p.avatar} className="w-20 h-20 rounded-full mx-auto" alt="" />
          <div className="mt-3 flex items-center justify-center gap-1.5">
            <span className="text-base font-bold text-slate-900">{p.name}</span>
            {p.verified && <ShieldCheck className="w-4 h-4 text-brand-600" />}
          </div>
          <div className="text-sm text-slate-500">{p.role}</div>
          <div className="text-xs mt-1">
            <span className="text-brand-700 font-semibold">★ {p.rating}</span>
            <span className="text-slate-400 ml-1">({p.reviews.toLocaleString()} reviews)</span>
          </div>
        </div>

        {/* Badges */}
        <div className="flex flex-wrap justify-center gap-2">
          {(p.badges ?? ["ID Verified", "Background Checked", "Insured"]).map((b) => (
            <span key={b} className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full">
              <CheckCircle2 className="w-3 h-3" /> {b}
            </span>
          ))}
        </div>

        {/* Action grid */}
        <div className="grid grid-cols-4 gap-2 text-center text-[11px]">
          <Action icon={<MessageSquare className="w-4 h-4" />} label="Message" />
          <Action icon={<Phone className="w-4 h-4" />} label="Call" />
          <Action icon={<Calendar className="w-4 h-4" />} label="Book Now" />
          <Action icon={<MoreHorizontal className="w-4 h-4" />} label="More" />
        </div>

        {/* About */}
        <div>
          <div className="text-sm font-bold text-slate-900 mb-2">About</div>
          <p className="text-sm text-slate-600 leading-relaxed">{p.about ?? "Professional and reliable. Specializes in safe, comfortable service."}</p>
        </div>

        {/* Stats */}
        <dl className="text-sm space-y-3 border-t border-slate-100 pt-4">
          <div className="flex justify-between items-center">
            <dt className="text-slate-500 inline-flex items-center gap-2"><Calendar className="w-4 h-4" /> Member since</dt>
            <dd className="font-medium text-slate-900">{p.member ?? "Jan 2023"}</dd>
          </div>
          <div className="flex justify-between items-center">
            <dt className="text-slate-500 inline-flex items-center gap-2"><CheckCircle2 className="w-4 h-4" /> Completed tasks</dt>
            <dd className="font-medium text-slate-900">{(p.completed ?? p.reviews).toLocaleString()}</dd>
          </div>
          <div className="flex justify-between items-center">
            <dt className="text-slate-500 inline-flex items-center gap-2"><Clock className="w-4 h-4" /> Response time</dt>
            <dd className="font-medium text-slate-900">{p.response ?? "Within 10 min"}</dd>
          </div>
          <div className="flex justify-between items-center">
            <dt className="text-slate-500 inline-flex items-center gap-2"><Globe className="w-4 h-4" /> Languages</dt>
            <dd className="font-medium text-slate-900">{p.languages ?? "English"}</dd>
          </div>
        </dl>

        {/* Services */}
        <div>
          <div className="text-sm font-bold text-slate-900 mb-3">Services</div>
          <div className="grid grid-cols-3 gap-2 text-[11px] text-center">
            {(p.services ?? []).slice(0, 3).map((s, i) => (
              <div key={s} className={cn(
                "rounded-xl p-3 flex flex-col items-center gap-1.5 border",
                i === 0 ? "bg-brand-50 border-brand-200 text-brand-700" : "bg-slate-50 border-slate-100 text-slate-700"
              )}>
                <ServiceIcon name={["car", "plane", "calendar"][i] ?? "spark"} size="sm" />
                <span className="leading-tight font-semibold">{s}</span>
              </div>
            ))}
          </div>
          {(p.services?.length ?? 0) > 3 && (
            <button className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-slate-600 bg-slate-100 px-3 py-1.5 rounded-full">
              + {(p.services?.length ?? 0) - 3} more
            </button>
          )}
        </div>

        {/* Notes */}
        <div>
          <div className="text-sm font-bold text-slate-900 mb-2">Notes</div>
          <div className="rounded-xl bg-amber-50 border border-amber-100 p-3 text-sm text-amber-900">
            Very reliable and professional. Always on time and has a safe driving record.
            <div className="text-[11px] text-amber-700 mt-2">Added on May 1, 2024</div>
          </div>
        </div>

        {/* Recent bookings */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-bold text-slate-900">Recent Bookings</div>
            <a className="text-xs font-semibold text-brand-700">View All</a>
          </div>
          <ul className="space-y-3 text-xs">
            <li className="border-b border-slate-100 pb-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-700">May 17, 2024 · 10:00 PM</span>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold text-emerald-700 bg-emerald-50">Completed</span>
              </div>
              <div className="text-slate-500 mt-0.5">123 Main St, Vancouver, BC → Home</div>
            </li>
            <li>
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-700">May 10, 2024 · 11:30 PM</span>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold text-emerald-700 bg-emerald-50">Completed</span>
              </div>
              <div className="text-slate-500 mt-0.5">Downtown Vancouver → Home</div>
            </li>
          </ul>
        </div>

        <button className="w-full py-3 rounded-xl border-2 border-rose-300 text-rose-600 text-sm font-semibold">
          Remove from Saved
        </button>
      </div>
    </div>
  );
}

function Action({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <button className="rounded-xl border border-slate-200 bg-white py-3 flex flex-col items-center gap-1 text-slate-700 font-semibold hover:bg-slate-50">
      <span className="text-brand-600">{icon}</span>
      <span>{label}</span>
    </button>
  );
}
