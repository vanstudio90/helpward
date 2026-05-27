"use client";

import { useState } from "react";
import {
  Search, SlidersHorizontal, Plus, Bell, Heart, ChevronDown, ShieldCheck,
  MapPin, MessageSquare, Phone, MoreHorizontal, Pin, ArrowLeft, Edit3,
  Star, CheckCircle2, Calendar, Clock, Globe, X, Info,
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

type FavItem =
  | { kind: "provider"; provider: Provider; added: string }
  | { kind: "address"; id: string; label: string; sub: string; note?: string; added: string; icon: string }
  | { kind: "service"; id: string; label: string; sub: string; added: string; icon: string };

const otherProviders = providers.slice(4); // first 4 are pinned in this demo

const allFavorites: FavItem[] = [
  ...otherProviders.map<FavItem>((p, i) => ({ kind: "provider", provider: p, added: `May ${15 - i}, 2024` })),
  { kind: "address", id: "addr-1", label: "321 Pine St, Vancouver", sub: "Saved Address", note: "Home · Vancouver, BC", added: "May 10, 2024", icon: "pin" },
  { kind: "address", id: "addr-2", label: "Downtown Office", sub: "Office · Vancouver, BC", added: "May 8, 2024", icon: "briefcase" },
  { kind: "service", id: "svc-1", label: "Airport Transfer", sub: "Ride to/from airport", added: "May 6, 2024", icon: "plane" },
];

const STATUS_TONE: Record<string, string> = {
  "Top Rated": "bg-emerald-50 text-emerald-700",
  "Fast & Reliable": "bg-brand-50 text-brand-700",
  "Highly Skilled": "bg-orange-50 text-orange-700",
  "Excellent": "bg-emerald-50 text-emerald-700",
};

export default function FavoritesPage() {
  const [tab, setTab] = useState<typeof TABS[number]["key"]>("all");
  const [selected, setSelected] = useState<Provider>(providers[0]);
  const [mobileView, setMobileView] = useState<"list" | "detail">("list");

  const pinned = providers.slice(0, 4);
  const openDetail = (p: Provider) => { setSelected(p); setMobileView("detail"); };

  return (
    <div className="px-4 lg:px-8 py-5 lg:py-8 max-w-[1500px] mx-auto">
      {/* Header */}
      <div className={cn("mb-4 lg:mb-6", mobileView === "detail" ? "hidden lg:block" : "")}>
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold text-slate-900 flex items-center gap-2">
              <Heart className="w-5 h-5 lg:w-6 lg:h-6 text-rose-500 fill-rose-500" /> Favorites
            </h1>
            <p className="text-sm text-slate-500 mt-1">Your favorite providers and services for quick access.</p>
          </div>
          <div className="hidden lg:flex items-center gap-2">
            <div className="relative w-72">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input placeholder="Search favorites by name or service..." className="w-full pl-9 pr-3 py-2 rounded-xl bg-white border border-slate-200 text-sm" />
            </div>
            <button className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-slate-200 text-sm">
              <SlidersHorizontal className="w-4 h-4 text-slate-500" /> Filters
            </button>
            <button className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-slate-200 text-sm">
              Sort by: Recently Added <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>
            <button className="relative p-2 rounded-xl bg-white border border-slate-200">
              <Bell className="w-5 h-5 text-slate-700" />
              <span className="absolute -top-1 -right-1 bg-rose-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">3</span>
            </button>
          </div>
        </div>

        {/* Mobile search + filter */}
        <div className="lg:hidden mt-3 flex gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input placeholder="Search favorites..." className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-white border border-slate-200 text-sm" />
          </div>
          <button className="p-2.5 rounded-xl border border-slate-200 bg-white">
            <SlidersHorizontal className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        {/* Filter chips */}
        <div className="mt-4 flex flex-wrap gap-2">
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
        <section className={cn(mobileView === "detail" ? "hidden lg:block" : "")}>
          {/* Pinned Favorites */}
          <div className="flex items-center gap-1.5 mb-3">
            <h2 className="text-sm font-bold text-slate-900">Pinned Favorites</h2>
            <Info className="w-3 h-3 text-slate-400" />
          </div>
          {/* H-scroll on mobile, grid on lg+ */}
          <div className="-mx-4 px-4 lg:mx-0 lg:px-0 mb-7">
            <div className="flex lg:grid lg:grid-cols-4 gap-3 overflow-x-auto scrollbar-none snap-x snap-mandatory">
              {pinned.map((p) => (
                <PinnedCard key={p.id} p={p} onOpen={openDetail} />
              ))}
            </div>
          </div>

          {/* All Favorites */}
          <h2 className="text-sm font-bold text-slate-900 mb-3">All Favorites</h2>
          <ul className="rounded-2xl bg-white border border-slate-100 overflow-hidden divide-y divide-slate-100">
            {allFavorites.map((item, i) => (
              <li key={i}>
                <FavoriteRow item={item} onOpen={openDetail} />
              </li>
            ))}
          </ul>

          <div className="mt-5 text-center">
            <button className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-xl border border-brand-200 text-brand-700 text-sm font-semibold">
              Load More <ChevronDown className="w-4 h-4" />
            </button>
          </div>
        </section>

        {/* Detail panel */}
        <aside className={cn(mobileView === "detail" ? "block" : "hidden lg:block")}>
          <DetailPanel p={selected} onBack={() => setMobileView("list")} />
        </aside>
      </div>
    </div>
  );
}

function PinnedCard({ p, onOpen }: { p: Provider; onOpen: (p: Provider) => void }) {
  return (
    <button
      onClick={() => onOpen(p)}
      className="snap-start shrink-0 w-[58%] sm:w-[44%] md:w-[30%] lg:w-auto text-left rounded-2xl border border-slate-100 bg-white p-4 relative hover:border-slate-300 transition flex flex-col"
    >
      <Pin className="absolute top-3 left-3 w-3.5 h-3.5 text-brand-500 fill-brand-500" />

      <div className="relative w-fit mx-auto">
        <img src={p.avatar} className="w-14 h-14 rounded-full" alt="" />
        <span className="absolute -bottom-1 -right-2 w-7 h-7 rounded-full bg-white border border-slate-100 flex items-center justify-center shadow-sm">
          <ServiceIcon name={p.serviceIcon || "car"} size="sm" className="!w-6 !h-6 !rounded-md" />
        </span>
      </div>

      <div className="mt-3 flex items-center justify-center gap-1.5">
        <span className="text-sm font-bold text-slate-900 truncate">{p.name}</span>
        {p.verified && <ShieldCheck className="w-3.5 h-3.5 text-brand-600 shrink-0" />}
      </div>
      <div className="text-xs text-slate-500 text-center mt-0.5 truncate">{p.role}</div>
      <div className="text-[11px] text-center mt-1">
        <span className="text-brand-700 font-semibold">★ {p.rating}</span>
        <span className="text-slate-400 ml-1">({p.reviews.toLocaleString()})</span>
      </div>
      {p.tag && (
        <div className="mt-2 text-center">
          <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold", STATUS_TONE[p.tag] ?? "bg-slate-100 text-slate-700")}>
            {p.tag}
          </span>
        </div>
      )}

      <div className="mt-3 space-y-1.5">
        <span className="block text-center text-[11px] font-semibold text-brand-700 border border-brand-200 rounded-lg py-1.5">Book Now</span>
        <span className="block text-center text-[11px] font-semibold text-brand-700 border border-brand-200 rounded-lg py-1.5">Message</span>
      </div>
    </button>
  );
}

function FavoriteRow({ item, onOpen }: { item: FavItem; onOpen: (p: Provider) => void }) {
  if (item.kind === "provider") {
    const p = item.provider;
    return (
      <button
        onClick={() => onOpen(p)}
        className="w-full text-left p-3.5 flex items-start gap-3 hover:bg-slate-50 transition"
      >
        <div className="relative shrink-0">
          <img src={p.avatar} className="w-11 h-11 rounded-full" alt="" />
          <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-md bg-white border border-slate-100 flex items-center justify-center shadow-sm">
            <ServiceIcon name={p.serviceIcon || "car"} size="sm" className="!w-5 !h-5 !rounded" />
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-bold text-slate-900 truncate">{p.name}</span>
            {p.verified && <ShieldCheck className="w-3.5 h-3.5 text-brand-600 shrink-0" />}
          </div>
          <div className="text-xs text-slate-500 truncate">{p.role}</div>
          <div className="text-[11px] mt-0.5">
            <span className="text-brand-700 font-semibold">★ {p.rating}</span>
            <span className="text-slate-400 ml-1">({p.reviews})</span>
          </div>
          <div className="text-[10px] text-slate-400 mt-1">Added on {item.added}</div>
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <span className="inline-flex items-center px-3 py-1.5 rounded-lg border border-brand-200 text-brand-700 text-[11px] font-semibold">
            Book Now
          </span>
          <div className="flex items-center gap-1">
            <button aria-label="Message" onClick={(e) => e.stopPropagation()} className="w-7 h-7 rounded-md border border-slate-200 flex items-center justify-center">
              <MessageSquare className="w-3.5 h-3.5 text-slate-500" />
            </button>
            <button aria-label="More" onClick={(e) => e.stopPropagation()} className="w-7 h-7 rounded-md flex items-center justify-center">
              <MoreHorizontal className="w-3.5 h-3.5 text-slate-500" />
            </button>
          </div>
        </div>
      </button>
    );
  }

  // Address or Service
  const isAddress = item.kind === "address";
  return (
    <div className="p-3.5 flex items-start gap-3">
      <ServiceIcon name={item.icon} />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-bold text-slate-900 truncate">{item.label}</div>
        <div className="text-xs text-slate-500 truncate">{item.sub}{item.kind === "address" && item.note ? ` · ${item.note}` : ""}</div>
        <div className="mt-1 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-600">
          {isAddress ? "Address" : "Service"}
        </div>
        <div className="text-[10px] text-slate-400 mt-1">Added on {item.added}</div>
      </div>
      <div className="flex flex-col items-end gap-1.5 shrink-0">
        <span className="inline-flex items-center px-3 py-1.5 rounded-lg border border-brand-200 text-brand-700 text-[11px] font-semibold whitespace-nowrap">
          {isAddress ? "Use Address" : "Book Now"}
        </span>
        <div className="flex items-center gap-1">
          {!isAddress && (
            <button aria-label="Message" className="w-7 h-7 rounded-md border border-slate-200 flex items-center justify-center">
              <MessageSquare className="w-3.5 h-3.5 text-slate-500" />
            </button>
          )}
          <button aria-label="More" className="w-7 h-7 rounded-md flex items-center justify-center">
            <MoreHorizontal className="w-3.5 h-3.5 text-slate-500" />
          </button>
        </div>
      </div>
    </div>
  );
}

function DetailPanel({ p, onBack }: { p: Provider; onBack: () => void }) {
  return (
    <div className="rounded-2xl bg-white border border-slate-100 lg:sticky lg:top-6 overflow-hidden">
      <div className="lg:hidden flex items-center justify-between px-4 py-3 border-b border-slate-100">
        <button onClick={onBack} aria-label="Back" className="p-1.5 -ml-1.5 rounded-lg hover:bg-slate-100">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="text-sm font-bold text-slate-900">Favorite Details</div>
        <button className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-700 border border-brand-200 px-2.5 py-1.5 rounded-lg">
          <Edit3 className="w-3 h-3" /> Edit Note
        </button>
      </div>
      <div className="hidden lg:flex items-center justify-between px-5 pt-4">
        <button onClick={onBack} aria-label="Close" className="p-1 rounded-lg hover:bg-slate-100">
          <X className="w-4 h-4 text-slate-400" />
        </button>
        <button className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-700 border border-brand-200 px-2.5 py-1.5 rounded-lg">
          <Edit3 className="w-3 h-3" /> Edit Note
        </button>
      </div>

      <div className="p-4 sm:p-5 space-y-5">
        {/* Avatar header */}
        <div className="text-center">
          <div className="relative inline-block">
            <img src={p.avatar} className="w-20 h-20 rounded-full" alt="" />
            <span className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-white border border-slate-100 flex items-center justify-center shadow-sm">
              <ServiceIcon name={p.serviceIcon || "car"} size="sm" className="!w-7 !h-7 !rounded-md" />
            </span>
          </div>
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
          <PanelAction icon={<MessageSquare className="w-4 h-4" />} label="Message" />
          <PanelAction icon={<Phone className="w-4 h-4" />} label="Call" />
          <PanelAction icon={<Calendar className="w-4 h-4" />} label="Book Now" />
          <PanelAction icon={<MoreHorizontal className="w-4 h-4" />} label="More" />
        </div>

        <div>
          <div className="text-sm font-bold text-slate-900 mb-2">About</div>
          <p className="text-sm text-slate-600 leading-relaxed">{p.about ?? "Professional and reliable. Specializes in safe, comfortable service."}</p>
        </div>

        <dl className="text-sm space-y-3 border-t border-slate-100 pt-4">
          <div className="flex justify-between items-center">
            <dt className="text-slate-500 inline-flex items-center gap-2"><Calendar className="w-4 h-4" /> Member since</dt>
            <dd className="font-medium text-slate-900">Jan 2023</dd>
          </div>
          <div className="flex justify-between items-center">
            <dt className="text-slate-500 inline-flex items-center gap-2"><CheckCircle2 className="w-4 h-4" /> Completed tasks</dt>
            <dd className="font-medium text-slate-900">1,248</dd>
          </div>
          <div className="flex justify-between items-center">
            <dt className="text-slate-500 inline-flex items-center gap-2"><Clock className="w-4 h-4" /> Response time</dt>
            <dd className="font-medium text-slate-900">Usually within 5 min</dd>
          </div>
          <div className="flex justify-between items-center">
            <dt className="text-slate-500 inline-flex items-center gap-2"><Globe className="w-4 h-4" /> Languages</dt>
            <dd className="font-medium text-slate-900">English, Spanish</dd>
          </div>
        </dl>

        <div>
          <div className="text-sm font-bold text-slate-900 mb-3">Services Offered</div>
          <div className="grid grid-cols-4 gap-2 text-[11px] text-center">
            <ServicePill icon="car" label="Designated Driver" active />
            <ServicePill icon="plane" label="Airport Transfer" />
            <ServicePill icon="calendar" label="Ride to Event" />
            <div className="rounded-xl border border-slate-200 bg-slate-50 text-slate-600 py-3 flex items-center justify-center font-semibold">
              +2 more
            </div>
          </div>
        </div>

        <div>
          <div className="text-sm font-bold text-slate-900 mb-2">Notes</div>
          <div className="rounded-xl bg-amber-50 border border-amber-100 p-3 text-sm text-amber-900">
            Only available after 6 PM on weekdays.<br />Prefers cash tips 😊
            <div className="flex items-center justify-between mt-2">
              <div className="text-[11px] text-amber-700">Added on May 1, 2024 · Updated on May 10, 2024</div>
              <a className="text-[11px] font-semibold text-brand-700">Edit Note</a>
            </div>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-bold text-slate-900">Recent Bookings</div>
            <a className="text-xs font-semibold text-brand-700">View All</a>
          </div>
          <ul className="space-y-3 text-xs">
            <RecentBookingRow when="May 17, 2024 · 10:00 PM" where="123 Main St, Vancouver, BC → Home" />
            <RecentBookingRow when="May 10, 2024 · 11:30 PM" where="Downtown Vancouver → Home" />
            <RecentBookingRow when="May 3, 2024 · 9:45 PM" where="Home → YVR Airport" />
          </ul>
        </div>

        <button className="w-full py-3 rounded-xl border-2 border-rose-300 text-rose-600 text-sm font-semibold inline-flex items-center justify-center gap-2">
          <Heart className="w-4 h-4 fill-rose-500 text-rose-500" /> Remove from Favorites
        </button>
      </div>
    </div>
  );
}

function PanelAction({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <button className="rounded-xl border border-slate-200 bg-white py-3 flex flex-col items-center gap-1 text-slate-700 font-semibold hover:bg-slate-50">
      <span className="text-brand-600">{icon}</span>
      <span>{label}</span>
    </button>
  );
}

function ServicePill({ icon, label, active }: { icon: string; label: string; active?: boolean }) {
  return (
    <div className={cn(
      "rounded-xl p-2.5 flex flex-col items-center gap-1 border",
      active ? "bg-brand-50 border-brand-200 text-brand-700" : "bg-slate-50 border-slate-100 text-slate-700"
    )}>
      <ServiceIcon name={icon} size="sm" />
      <span className="leading-tight font-semibold">{label}</span>
    </div>
  );
}

function RecentBookingRow({ when, where }: { when: string; where: string }) {
  return (
    <li>
      <div className="flex items-center justify-between gap-2">
        <span className="text-slate-700">{when}</span>
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold text-emerald-700 bg-emerald-50">Completed</span>
      </div>
      <div className="text-slate-500 mt-0.5">{where}</div>
    </li>
  );
}
