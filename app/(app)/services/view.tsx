"use client";

import { useState } from "react";
import {
  Search, MapPin, Sparkles, Car, Home, ShoppingBag, User, Heart, Briefcase,
  MoreHorizontal, ChevronDown, X, CheckCircle2, Clock, Star, Plus, ArrowLeft,
  SlidersHorizontal, Bell, type LucideIcon,
} from "lucide-react";
import type { ServiceWithCategory } from "@/lib/data/services";
import type { ServiceCategory } from "@/lib/supabase/types";
import { cn } from "@/lib/cn";

const CAT_ICONS: Record<string, LucideIcon> = {
  car: Car, home: Home, bag: ShoppingBag, user: User, heart: Heart, briefcase: Briefcase,
};

export function ServicesView({
  services, categories,
}: {
  services: ServiceWithCategory[];
  categories: ServiceCategory[];
}) {
  const [activeTab, setActiveTab] = useState<string>("All Services");
  const [selected, setSelected] = useState<ServiceWithCategory | null>(services[0] ?? null);
  const [panelOpen, setPanelOpen] = useState(false);

  const filtered = activeTab === "All Services"
    ? services
    : services.filter((s) => s.category.label === activeTab);

  if (!selected) {
    return <div className="p-8 text-center text-slate-500">No services available yet.</div>;
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-5 lg:py-8 max-w-[1500px] mx-auto">
      <div className="hidden lg:flex items-center gap-3 mb-6">
        <div className="relative flex-1 max-w-2xl">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            placeholder="What do you need help with?"
            className="w-full pl-9 pr-10 py-2.5 rounded-xl bg-white border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200"
          />
          <Sparkles className="w-4 h-4 text-brand-500 absolute right-3 top-1/2 -translate-y-1/2" />
        </div>
        <button className="inline-flex items-center gap-2 px-3 py-2.5 rounded-xl bg-white border border-slate-200 text-sm font-medium text-slate-700">
          <MapPin className="w-4 h-4 text-slate-500" /> Vancouver, BC <ChevronDown className="w-3 h-3 text-slate-400" />
        </button>
        <button className="relative p-2.5 rounded-xl bg-white border border-slate-200">
          <Bell className="w-5 h-5 text-slate-700" />
          <span className="absolute -top-1 -right-1 bg-rose-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">3</span>
        </button>
      </div>

      <div className="lg:hidden relative mb-5">
        <Search className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
        <input
          placeholder="What do you need help with?"
          className="w-full pl-11 pr-11 py-3 rounded-full bg-white border border-slate-200 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-4 focus:ring-brand-100 focus:border-brand-400"
        />
        <Sparkles className="w-4 h-4 text-brand-500 absolute right-4 top-1/2 -translate-y-1/2" />
      </div>

      <div className="flex items-start justify-between gap-3 mb-1">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">All Services</h1>
          <p className="text-sm text-slate-500 mt-1">Browse and request any real-world help you need.</p>
        </div>
        <button className="lg:hidden inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs font-medium text-slate-700 shrink-0">
          <MapPin className="w-3.5 h-3.5 text-slate-500" /> Vancouver, BC <ChevronDown className="w-3 h-3 text-slate-400" />
        </button>
      </div>

      <div className="mt-5 flex gap-2 overflow-x-auto scrollbar-none -mx-4 px-4">
        <CategoryChip
          label="All Services"
          icon={Sparkles}
          active={activeTab === "All Services"}
          onClick={() => setActiveTab("All Services")}
        />
        {categories.map((cat) => (
          <CategoryChip
            key={cat.id}
            label={cat.label}
            icon={CAT_ICONS[cat.icon] ?? Sparkles}
            active={activeTab === cat.label}
            onClick={() => setActiveTab(cat.label)}
          />
        ))}
        <button className="shrink-0 inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-sm font-semibold bg-white border border-slate-200 text-slate-700">
          <MoreHorizontal className="w-4 h-4" /> More
        </button>
      </div>

      <div className="mt-4 flex items-center gap-2 text-sm overflow-x-auto scrollbar-none -mx-4 px-4 pb-1">
        <button className="shrink-0 inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-white border border-slate-200 text-slate-700">
          <SlidersHorizontal className="w-4 h-4 text-slate-500" /> Filter
        </button>
        <FilterPill label="Category" />
        <FilterPill label="Price" />
        <FilterPill label="Availability" />
        <FilterPill label="Rating 4.0+" className="hidden sm:inline-flex" />
        <div className="hidden sm:inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-white border border-slate-200 shrink-0">
          <span className="text-slate-700">Available Now</span>
          <span className="relative inline-flex w-9 h-5 bg-brand-600 rounded-full">
            <span className="absolute right-0.5 top-0.5 w-4 h-4 bg-white rounded-full" />
          </span>
        </div>
      </div>

      <div className="mt-6 grid lg:grid-cols-[1fr_360px] xl:grid-cols-[1fr_400px] gap-6">
        <section>
          <div className="flex items-center justify-between mb-3 sm:mb-4">
            <h2 className="text-base font-bold text-slate-900">Popular Services</h2>
            <button className="text-sm font-semibold text-brand-700">View all</button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
            {filtered.map((s) => (
              <button
                key={s.id}
                onClick={() => { setSelected(s); setPanelOpen(true); }}
                className="text-left rounded-2xl overflow-hidden bg-white border border-slate-100 hover:shadow-lg hover:-translate-y-0.5 transition group"
              >
                <div className="relative aspect-[5/3] bg-slate-100">
                  {s.image_url && (
                    <img src={s.image_url} alt={s.title} className="w-full h-full object-cover group-hover:scale-105 transition" />
                  )}
                  {s.popular && (
                    <span className="absolute top-2 left-2 text-[10px] font-bold uppercase tracking-wide bg-violet-600 text-white px-2 py-1 rounded-md">Popular</span>
                  )}
                  <button
                    aria-label="Save"
                    onClick={(e) => { e.stopPropagation(); }}
                    className="absolute top-2 right-2 w-7 h-7 rounded-full bg-white/95 backdrop-blur flex items-center justify-center shadow-sm hover:bg-white"
                  >
                    <Heart className="w-3.5 h-3.5 text-slate-500" />
                  </button>
                </div>
                <div className="p-3 sm:p-4">
                  <div className="text-sm font-bold text-slate-900 truncate">{s.title}</div>
                  <div className="text-[11px] sm:text-xs text-slate-500 mt-0.5 line-clamp-1">{s.blurb}</div>
                  <div className="mt-2 sm:mt-3 flex items-center justify-between gap-2 text-[11px] sm:text-xs">
                    <span className="font-semibold text-slate-900 truncate">
                      ${(s.base_price_cents / 100).toFixed(0)} - ${(s.base_price_cents / 50).toFixed(0)}
                    </span>
                    <span className="text-slate-500 whitespace-nowrap shrink-0">{s.eta_label}</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </section>

        <aside className="hidden lg:block">
          <SidePanel service={selected} onClose={() => {}} mobile={false} />
        </aside>
      </div>

      {panelOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/40 transition-opacity" onClick={() => setPanelOpen(false)} />
          <div className="absolute bottom-0 inset-x-0 rounded-t-3xl bg-white max-h-[92vh] overflow-y-auto shadow-2xl">
            <div className="sticky top-0 bg-white px-4 py-3 border-b border-slate-100 flex items-center justify-between">
              <button onClick={() => setPanelOpen(false)} className="p-1.5 -ml-1.5 rounded-lg hover:bg-slate-100">
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div className="text-sm font-bold text-slate-900">Service Details</div>
              <button onClick={() => setPanelOpen(false)} className="p-1.5 -mr-1.5 rounded-lg hover:bg-slate-100">
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>
            <SidePanel service={selected} onClose={() => setPanelOpen(false)} mobile />
          </div>
        </div>
      )}
    </div>
  );
}

function CategoryChip({
  label, icon: Icon, active, onClick,
}: { label: string; icon: LucideIcon; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "shrink-0 inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition",
        active ? "bg-brand-600 text-white" : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-50"
      )}
    >
      <Icon className="w-4 h-4" /> {label}
    </button>
  );
}

function FilterPill({ label, className }: { label: string; className?: string }) {
  return (
    <button className={cn("shrink-0 inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-white border border-slate-200 text-slate-700", className)}>
      {label} <ChevronDown className="w-3 h-3 text-slate-400" />
    </button>
  );
}

function SidePanel({ service, onClose, mobile }: { service: ServiceWithCategory; onClose: () => void; mobile: boolean }) {
  const cat = service.category;
  const CatIcon = CAT_ICONS[cat.icon] ?? Sparkles;
  return (
    <div className={cn(
      "bg-white p-4 sm:p-5",
      !mobile && "border border-slate-100 rounded-2xl lg:sticky lg:top-6"
    )}>
      {!mobile && (
        <div className="flex items-center justify-between mb-4">
          <div className="text-xs font-semibold text-slate-500">Service Details</div>
          <button onClick={onClose} className="p-1"><X className="w-4 h-4 text-slate-400" /></button>
        </div>
      )}

      <div className="bg-brand-50/60 rounded-2xl p-4 flex items-start gap-3">
        <span className="inline-flex w-12 h-12 rounded-xl bg-brand-600 items-center justify-center shrink-0">
          <CatIcon className="w-5 h-5 text-white" />
        </span>
        <div className="min-w-0">
          <div className="text-base font-bold text-slate-900">{service.title}</div>
          <div className="text-xs text-slate-600 mt-1">{service.blurb}</div>
          <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-semibold">
            <span className="inline-flex items-center gap-1 text-emerald-700 bg-white px-2 py-1 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Available Now
            </span>
            <span className="inline-flex items-center gap-1 text-amber-700 bg-white px-2 py-1 rounded-full">
              <Clock className="w-3 h-3" /> {service.eta_label}
            </span>
            <span className="inline-flex items-center gap-1 text-slate-700 bg-white px-2 py-1 rounded-full">
              <Star className="w-3 h-3 fill-amber-500 text-amber-500" /> 4.9 (1,248)
            </span>
          </div>
        </div>
      </div>

      <div className="mt-5">
        <div className="text-sm font-bold text-slate-900 mb-2">What's included</div>
        <ul className="space-y-2 text-sm text-slate-700">
          {["Verified, background-checked provider", "Real-time tracking & messaging", "Fully insured during the task", "Pay only after completion", "24/7 support if anything goes wrong"].map((i) => (
            <li key={i} className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" /> {i}
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-5 border-t border-slate-100 pt-4">
        <div className="text-sm font-bold text-slate-900 mb-3">Price Estimate</div>
        <dl className="text-sm space-y-2">
          <div className="flex justify-between"><dt className="text-slate-500">Base Fare</dt><dd className="font-semibold">${(service.base_price_cents / 100).toFixed(2)}</dd></div>
          <div className="flex justify-between"><dt className="text-slate-500">Distance (12 km)</dt><dd className="font-semibold">$18.00</dd></div>
          <div className="flex justify-between"><dt className="text-slate-500">Service Fee</dt><dd className="font-semibold">$4.50</dd></div>
          <div className="flex justify-between pt-2 border-t border-slate-100">
            <dt className="text-base font-bold text-slate-900">Total Estimate</dt>
            <dd className="text-base font-bold text-brand-700">${((service.base_price_cents / 100) + 22.5).toFixed(2)}</dd>
          </div>
        </dl>
      </div>

      <button className="mt-5 w-full inline-flex items-center justify-center gap-2 py-3.5 rounded-xl bg-gradient-to-r from-brand-600 to-violet-600 text-white font-semibold">
        Add This Service
      </button>
      <button className="mt-2 w-full inline-flex items-center justify-center gap-2 py-3 rounded-xl bg-white border border-brand-200 text-brand-700 font-semibold">
        <Heart className="w-4 h-4" /> Save for later
      </button>

      <div className="mt-5 rounded-xl bg-brand-50 p-4">
        <div className="text-xs font-bold text-brand-700 mb-3">Real-time Availability</div>
        <div className="grid grid-cols-3 gap-2 text-center text-[11px]">
          <div>
            <div className="font-bold text-slate-900 inline-flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> 12 nearby
            </div>
            <div className="text-slate-500 mt-0.5">providers</div>
          </div>
          <div>
            <div className="font-bold text-slate-900">ETA</div>
            <div className="text-slate-500 mt-0.5">{service.eta_label}</div>
          </div>
          <div>
            <div className="font-bold text-slate-900">24/7</div>
            <div className="text-slate-500 mt-0.5">Available</div>
          </div>
        </div>
      </div>

      <button className="mt-4 w-full flex items-center justify-between gap-2 px-4 py-3 rounded-xl bg-slate-50 border border-slate-100 text-left">
        <div>
          <div className="text-xs font-semibold text-slate-900">Need something custom?</div>
          <div className="text-[11px] text-slate-500">Describe your task</div>
        </div>
        <ChevronDown className="w-4 h-4 -rotate-90 text-slate-400" />
      </button>
    </div>
  );
}
