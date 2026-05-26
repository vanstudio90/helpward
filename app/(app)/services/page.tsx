"use client";

import { useState } from "react";
import {
  Search, MapPin, Bell, Sparkles, Car, Home, ShoppingBag, User, Heart, Briefcase,
  MoreHorizontal, ChevronDown, X, CheckCircle2, Clock, Star, Plus,
} from "lucide-react";
import { services, type ServiceCategory } from "@/lib/mock";
import { cn } from "@/lib/cn";

const tabs: { label: ServiceCategory | "All Services"; icon: React.ComponentType<{ className?: string }> }[] = [
  { label: "All Services", icon: Sparkles },
  { label: "Transportation", icon: Car },
  { label: "Home Help", icon: Home },
  { label: "Errands", icon: ShoppingBag },
  { label: "Presence", icon: User },
  { label: "Lifestyle", icon: Heart },
  { label: "Business", icon: Briefcase },
];

export default function ServicesPage() {
  const [activeTab, setActiveTab] = useState<string>("All Services");
  const [selected, setSelected] = useState(services[0]);
  const [panelOpen, setPanelOpen] = useState(false);

  const filtered = activeTab === "All Services" ? services : services.filter((s) => s.category === activeTab);

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 lg:py-8 max-w-[1500px] mx-auto">
      {/* Top bar */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-6">
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

      <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">All Services</h1>
      <p className="text-sm text-slate-500 mt-1">Browse and request any real-world help you need.</p>

      {/* Category tabs */}
      <div className="mt-6 flex gap-2 overflow-x-auto scrollbar-none -mx-4 px-4">
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = activeTab === t.label;
          return (
            <button
              key={t.label}
              onClick={() => setActiveTab(t.label)}
              className={cn(
                "shrink-0 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition",
                active ? "bg-brand-600 text-white" : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-50"
              )}
            >
              <Icon className="w-4 h-4" /> {t.label}
            </button>
          );
        })}
        <button className="shrink-0 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-white border border-slate-200 text-slate-700">
          <MoreHorizontal className="w-4 h-4" /> More
        </button>
      </div>

      {/* Filter bar */}
      <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-slate-500">Filter by</span>
        <FilterPill label="Category" />
        <FilterPill label="Price" />
        <FilterPill label="Availability" />
        <FilterPill label="Rating 4.0+" />
        <div className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-white border border-slate-200">
          <span className="text-slate-700">Available Now</span>
          <span className="relative inline-flex w-9 h-5 bg-brand-600 rounded-full">
            <span className="absolute right-0.5 top-0.5 w-4 h-4 bg-white rounded-full" />
          </span>
        </div>
        <div className="ml-auto inline-flex items-center gap-2 text-slate-500">
          Sort by
          <button className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-white border border-slate-200 text-slate-700">
            Recommended <ChevronDown className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Grid + side panel */}
      <div className="mt-6 grid lg:grid-cols-[1fr_360px] xl:grid-cols-[1fr_400px] gap-6">
        <section>
          <h2 className="text-base font-bold text-slate-900 mb-4">Popular Services</h2>
          <div className="grid sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtered.map((s) => (
              <button
                key={s.slug}
                onClick={() => { setSelected(s); setPanelOpen(true); }}
                className="text-left rounded-2xl overflow-hidden bg-white border border-slate-100 hover:shadow-lg hover:-translate-y-0.5 transition group"
              >
                <div className="relative aspect-[5/3] bg-slate-100">
                  <img src={s.image} alt={s.title} className="w-full h-full object-cover group-hover:scale-105 transition" />
                  {s.popular && (
                    <span className="absolute top-2 left-2 text-[10px] font-bold uppercase tracking-wide bg-violet-600 text-white px-2 py-1 rounded-md">Popular</span>
                  )}
                </div>
                <div className="p-4">
                  <div className="text-sm font-bold text-slate-900">{s.title}</div>
                  <div className="text-xs text-slate-500 mt-0.5 line-clamp-1">{s.blurb}</div>
                  <div className="mt-3 flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-900">From ${s.fromPrice}</span>
                    <span className="text-slate-500">{s.eta}</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* Side panel (desktop) */}
        <aside className="hidden lg:block">
          <SidePanel service={selected} onClose={() => {}} />
        </aside>
      </div>

      {/* Side panel sheet (mobile) */}
      {panelOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setPanelOpen(false)} />
          <div className="absolute bottom-0 inset-x-0 rounded-t-3xl bg-white max-h-[90vh] overflow-y-auto">
            <SidePanel service={selected} onClose={() => setPanelOpen(false)} />
          </div>
        </div>
      )}
    </div>
  );
}

function FilterPill({ label }: { label: string }) {
  return (
    <button className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-white border border-slate-200 text-slate-700">
      {label} <ChevronDown className="w-3 h-3 text-slate-400" />
    </button>
  );
}

function SidePanel({ service, onClose }: { service: typeof services[number]; onClose: () => void }) {
  return (
    <div className="bg-white border border-slate-100 rounded-2xl p-5 lg:sticky lg:top-6">
      <div className="flex items-center justify-between mb-4 lg:mb-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
          <button onClick={onClose} className="lg:hidden p-1 -ml-1"><X className="w-4 h-4" /></button>
          Service Details
        </div>
        <button onClick={onClose} className="p-1 hidden lg:block"><X className="w-4 h-4 text-slate-400" /></button>
      </div>

      <div className="bg-brand-50/60 rounded-2xl p-4 flex items-start gap-3">
        <span className="inline-flex w-11 h-11 rounded-xl bg-brand-600/10 items-center justify-center">
          <Car className="w-5 h-5 text-brand-600" />
        </span>
        <div className="min-w-0">
          <div className="text-sm font-bold text-slate-900">{service.title}</div>
          <div className="text-xs text-slate-600 mt-0.5">{service.blurb}</div>
          <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-semibold">
            <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-100 px-2 py-1 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Available Now
            </span>
            <span className="inline-flex items-center gap-1 text-amber-700 bg-amber-100 px-2 py-1 rounded-full">
              <Clock className="w-3 h-3" /> {service.eta}
            </span>
            <span className="inline-flex items-center gap-1 text-slate-700 bg-slate-100 px-2 py-1 rounded-full">
              <Star className="w-3 h-3 fill-amber-500 text-amber-500" /> 4.9 (1,248)
            </span>
          </div>
        </div>
      </div>

      <div className="mt-5">
        <div className="text-sm font-bold text-slate-900 mb-2">What's included</div>
        <ul className="space-y-2 text-sm text-slate-700">
          {["Drive your car to your destination", "Pick up from any location", "Fully licensed & insured", "Real-time tracking", "Safe & discreet service"].map((i) => (
            <li key={i} className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" /> {i}
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-5 border-t border-slate-100 pt-4">
        <div className="text-sm font-bold text-slate-900 mb-3">Price Estimate</div>
        <dl className="text-sm space-y-2">
          <div className="flex justify-between"><dt className="text-slate-500">Base Fare</dt><dd className="font-semibold">${service.fromPrice}.00</dd></div>
          <div className="flex justify-between"><dt className="text-slate-500">Distance (12 km)</dt><dd className="font-semibold">$18.00</dd></div>
          <div className="flex justify-between"><dt className="text-slate-500">Service Fee</dt><dd className="font-semibold">$4.50</dd></div>
          <div className="flex justify-between pt-2 border-t border-slate-100"><dt className="text-base font-bold text-slate-900">Total Estimate</dt><dd className="text-base font-bold text-brand-700">${(service.fromPrice + 22.5).toFixed(2)} CAD</dd></div>
        </dl>
      </div>

      <button className="mt-5 w-full inline-flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-brand-600 to-violet-600 text-white font-semibold">
        <Plus className="w-4 h-4" /> Add This Service
      </button>
      <button className="mt-2 w-full inline-flex items-center justify-center gap-2 py-3 rounded-xl bg-white border border-brand-200 text-brand-700 font-semibold">
        <Heart className="w-4 h-4" /> Save for later
      </button>

      <div className="mt-5 rounded-xl bg-brand-50 p-4">
        <div className="text-xs font-bold text-brand-700 mb-2">Real-time Availability</div>
        <div className="grid grid-cols-3 gap-3 text-center text-xs">
          <div><div className="font-bold text-slate-900">12 drivers</div><div className="text-slate-500">near you</div></div>
          <div><div className="font-bold text-slate-900">ETA</div><div className="text-slate-500">{service.eta}</div></div>
          <div><div className="font-bold text-slate-900">24/7</div><div className="text-slate-500">Available</div></div>
        </div>
      </div>
    </div>
  );
}
