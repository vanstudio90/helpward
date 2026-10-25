"use client";

import { useMemo, useState, useTransition } from "react";
import {
  Search, MapPin, Sparkles, Car, Home, ShoppingBag, User, Heart, Briefcase,
  MoreHorizontal, ChevronDown, X, CheckCircle2, Clock, ArrowLeft,
  SlidersHorizontal, type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { SERVICE_FEE_CENTS, quoteOneShotCents, dollars } from "@/lib/pricing";
import type { ServiceWithCategory } from "@/lib/data/services";
import type { ServiceCategory } from "@/lib/supabase/types";
import { toggleFavoriteAction } from "@/app/(app)/favorites/actions";
import { cn } from "@/lib/cn";

const CAT_ICONS: Record<string, LucideIcon> = {
  car: Car, home: Home, bag: ShoppingBag, user: User, heart: Heart, briefcase: Briefcase,
};

export function ServicesView({
  services, categories, initialFavoritedIds = [],
}: {
  services: ServiceWithCategory[];
  categories: ServiceCategory[];
  initialFavoritedIds?: string[];
}) {
  const [activeTab, setActiveTab] = useState<string>("All Services");
  const [selected, setSelected] = useState<ServiceWithCategory | null>(services[0] ?? null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [favorited, setFavorited] = useState<Set<string>>(new Set(initialFavoritedIds));
  const [, startTransition] = useTransition();

  const toggleFav = (serviceId: string) => {
    const next = new Set(favorited);
    if (next.has(serviceId)) next.delete(serviceId);
    else next.add(serviceId);
    setFavorited(next);
    startTransition(async () => {
      const r = await toggleFavoriteAction("service", serviceId);
      if ("error" in r) {
        // rollback
        const rb = new Set(favorited);
        if (rb.has(serviceId)) rb.delete(serviceId);
        else rb.add(serviceId);
        setFavorited(rb);
      }
    });
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return services.filter((s) => {
      if (activeTab !== "All Services" && s.category.label !== activeTab) return false;
      if (!q) return true;
      return (
        s.title.toLowerCase().includes(q) ||
        s.blurb.toLowerCase().includes(q) ||
        s.category.label.toLowerCase().includes(q)
      );
    });
  }, [services, activeTab, query]);

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
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full pl-9 pr-10 py-2.5 rounded-xl bg-white border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200"
          />
          <Sparkles className="w-4 h-4 text-brand-500 absolute right-3 top-1/2 -translate-y-1/2" />
        </div>
        <button
          disabled
          title="Choosing a different city isn\u2019t available yet"
          aria-label="Vancouver, BC location"
          className="inline-flex items-center gap-2 px-3 py-2.5 rounded-xl bg-white border border-slate-200 text-sm font-medium text-slate-700 cursor-not-allowed opacity-70"
        >
          <MapPin className="w-4 h-4 text-slate-500" /> Vancouver, BC <ChevronDown className="w-3 h-3 text-slate-400" />
        </button>
      </div>

      <div className="lg:hidden relative mb-5">
        <Search className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
        <input
          placeholder="What do you need help with?"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full pl-11 pr-11 py-3 rounded-full bg-white border border-slate-200 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-4 focus:ring-brand-100 focus:border-brand-400"
        />
        <Sparkles className="w-4 h-4 text-brand-500 absolute right-4 top-1/2 -translate-y-1/2" />
      </div>

      <div className="flex items-start justify-between gap-3 mb-1">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">All Services</h1>
          <p className="text-sm text-slate-500 mt-1">Browse and request any real-world help you need.</p>
        </div>
        <button
          disabled
          title="Choosing a different city isn&rsquo;t available yet"
          className="lg:hidden inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs font-medium text-slate-700 shrink-0 cursor-not-allowed opacity-70"
        >
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
        <button
          disabled
          title="More categories ship soon"
          className="shrink-0 inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-sm font-semibold bg-white border border-slate-200 text-slate-700 cursor-not-allowed opacity-70"
        >
          <MoreHorizontal className="w-4 h-4" /> More
        </button>
      </div>

      <div className="mt-4 flex items-center gap-2 text-sm overflow-x-auto scrollbar-none -mx-4 px-4 pb-1">
        <button
          disabled
          title="Advanced filters ship soon"
          className="shrink-0 inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-white border border-slate-200 text-slate-700 cursor-not-allowed opacity-70"
        >
          <SlidersHorizontal className="w-4 h-4 text-slate-500" /> Filter
        </button>
        <FilterPill label="Category" disabled />
        <FilterPill label="Price" disabled />
        <FilterPill label="Availability" disabled />
        <FilterPill label="Rating 4.0+" disabled className="hidden sm:inline-flex" />
        {/* An "Available Now" toggle used to render here permanently in the
            on position, implying live availability filtering that does not
            exist (HW-10/HW-16). */}
      </div>

      <div className="mt-6 grid lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_400px] gap-6">
        <section className="min-w-0">
          <div className="flex items-center justify-between mb-3 sm:mb-4">
            <h2 className="text-base font-bold text-slate-900">
              {activeTab === "All Services" && !query.trim() ? "All services" : `${filtered.length} match${filtered.length === 1 ? "" : "es"}`}
            </h2>
            {(activeTab !== "All Services" || query.trim()) && (
              <button
                type="button"
                onClick={() => { setActiveTab("All Services"); setQuery(""); }}
                className="text-sm font-semibold text-brand-700"
              >
                Clear filters
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
            {filtered.map((s) => (
              <div
                key={s.id}
                className="relative text-left rounded-2xl overflow-hidden bg-white border border-slate-100 hover:shadow-lg hover:-translate-y-0.5 transition group"
              >
                {/* The card used to be a <button> wrapping the favorite
                    <button>. Nested interactive elements are invalid HTML:
                    the parser hoists the inner button out, so the DOM React
                    hydrated against never matched the server markup and
                    every direct load threw React #418 (HW-05). They are
                    siblings now — the card body is the primary control and
                    the heart overlays it. */}
                <button
                  type="button"
                  onClick={() => { setSelected(s); setPanelOpen(true); }}
                  className="block w-full text-left"
                >
                  <span className="relative block aspect-[5/3] bg-slate-100">
                    {s.image_url && (
                      <img src={s.image_url} alt={s.title} className="w-full h-full object-cover group-hover:scale-105 transition" />
                    )}
                    {s.popular && (
                      <span className="absolute top-2 left-2 text-[10px] font-bold uppercase tracking-wide bg-violet-600 text-white px-2 py-1 rounded-md">Popular</span>
                    )}
                  </span>
                  <span className="block p-3 sm:p-4">
                    <span className="block text-sm font-bold text-slate-900 truncate">{s.title}</span>
                    <span className="block text-[11px] sm:text-xs text-slate-500 mt-0.5 line-clamp-1">{s.blurb}</span>
                    <span className="mt-2 sm:mt-3 flex items-center justify-between gap-2 text-[11px] sm:text-xs">
                      <span className="font-semibold text-slate-900 truncate">
                        From ${(s.base_price_cents / 100).toFixed(0)}
                      </span>
                      <span className="text-slate-500 whitespace-nowrap shrink-0">{s.eta_label}</span>
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  aria-label={favorited.has(s.id) ? `Remove ${s.title} from favorites` : `Save ${s.title} to favorites`}
                  aria-pressed={favorited.has(s.id)}
                  onClick={() => toggleFav(s.id)}
                  className="absolute top-2 right-2 w-7 h-7 rounded-full bg-white/95 backdrop-blur flex items-center justify-center shadow-sm hover:bg-white"
                >
                  <Heart className={cn("w-3.5 h-3.5", favorited.has(s.id) ? "text-rose-500 fill-rose-500" : "text-slate-500")} />
                </button>
              </div>
            ))}
          </div>
        </section>

        <aside className="hidden lg:block">
          <SidePanel
            service={selected}
            onClose={() => {}}
            mobile={false}
            dismissible={false}
            isFavorited={favorited.has(selected.id)}
            onToggleFavorite={() => toggleFav(selected.id)}
          />
        </aside>
      </div>

      {panelOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/40 transition-opacity" onClick={() => setPanelOpen(false)} />
          <div className="absolute bottom-0 inset-x-0 rounded-t-3xl bg-white max-h-[92vh] overflow-y-auto shadow-2xl">
            <div className="sticky top-0 bg-white px-4 py-3 border-b border-slate-100 flex items-center justify-between">
              <button aria-label="Back" onClick={() => setPanelOpen(false)} className="p-1.5 -ml-1.5 rounded-lg hover:bg-slate-100">
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div className="text-sm font-bold text-slate-900">Service Details</div>
              <button aria-label="Close details" onClick={() => setPanelOpen(false)} className="p-1.5 -mr-1.5 rounded-lg hover:bg-slate-100">
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>
            <SidePanel
              service={selected}
              onClose={() => setPanelOpen(false)}
              mobile
              dismissible
              isFavorited={favorited.has(selected.id)}
              onToggleFavorite={() => toggleFav(selected.id)}
            />
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

function FilterPill({ label, className, disabled }: { label: string; className?: string; disabled?: boolean }) {
  return (
    <button
      disabled={disabled}
      title={disabled ? "Filter ships soon" : undefined}
      className={cn(
        "shrink-0 inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-white border border-slate-200 text-slate-700",
        disabled && "cursor-not-allowed opacity-70",
        className
      )}
    >
      {label} <ChevronDown className="w-3 h-3 text-slate-400" />
    </button>
  );
}

function SidePanel({
  service, onClose, mobile, isFavorited, onToggleFavorite, dismissible,
}: {
  service: ServiceWithCategory;
  onClose: () => void;
  mobile: boolean;
  isFavorited: boolean;
  onToggleFavorite: () => void;
  dismissible: boolean;
}) {
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
          {/* Previously rendered unconditionally with onClose={() => {}} —
              a close affordance that could not close anything (HW-04). The
              desktop panel is the persistent detail rail, so it simply has
              no dismiss control now. */}
          {dismissible && (
            <button type="button" aria-label="Close details" onClick={onClose} className="p-1">
              <X className="w-4 h-4 text-slate-400" />
            </button>
          )}
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
            {/* The "Available Now" pill, a 4.9 (1,248) rating and a
                12-nearby-providers count were hardcoded and identical for
                every service, shown before any location was supplied and
                with no live supply behind them (HW-10). Only the catalog's
                own eta_label remains, because that is real catalog data. */}
            <span className="inline-flex items-center gap-1 text-amber-700 bg-white px-2 py-1 rounded-full">
              <Clock className="w-3 h-3" /> Typically {service.eta_label}
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
          <div className="flex justify-between"><dt className="text-slate-500">Base price</dt><dd className="font-semibold">${dollars(service.base_price_cents)}</dd></div>
          <div className="flex justify-between"><dt className="text-slate-500">Service fee</dt><dd className="font-semibold">${dollars(SERVICE_FEE_CENTS)}</dd></div>
          <div className="flex justify-between pt-2 border-t border-slate-100">
            <dt className="text-base font-bold text-slate-900">Total estimate</dt>
            <dd className="text-base font-bold text-brand-700">${dollars(quoteOneShotCents(service.base_price_cents))}</dd>
          </div>
        </dl>
        <p className="text-[10px] text-slate-400 mt-2 leading-snug">
          You're only charged after the task is marked complete. A tip is optional and goes to your helper in full.
        </p>
      </div>

      {/* These three were inert: "Add This Service", "Save for later" and
          the custom-task row all rendered with no handler at all (HW-04).
          "Add This Service" now reuses the same ?service= handoff the
          public service pages already use successfully. */}
      <Link
        href={`/new-request?service=${service.id}`}
        className="mt-5 w-full inline-flex items-center justify-center gap-2 py-3.5 rounded-xl bg-gradient-to-r from-brand-600 to-violet-600 text-white font-semibold"
      >
        Request this service
      </Link>
      <button
        type="button"
        onClick={onToggleFavorite}
        aria-pressed={isFavorited}
        className="mt-2 w-full inline-flex items-center justify-center gap-2 py-3 rounded-xl bg-white border border-brand-200 text-brand-700 font-semibold"
      >
        <Heart className={cn("w-4 h-4", isFavorited && "fill-rose-500 text-rose-500")} />
        {isFavorited ? "Saved to favorites" : "Save for later"}
      </button>

      {/* A "Real-time Availability / 12 nearby providers" panel used to sit
          here with a hardcoded count (HW-10). Live supply counts need the
          matching engine to have approved, online helpers to count — until
          then we say nothing rather than invent a number. */}

      <Link href="/new-request" className="mt-4 w-full flex items-center justify-between gap-2 px-4 py-3 rounded-xl bg-slate-50 border border-slate-100 text-left">
        <span>
          <span className="block text-xs font-semibold text-slate-900">Need something custom?</span>
          <span className="block text-[11px] text-slate-500">Describe your task</span>
        </span>
        <ChevronDown className="w-4 h-4 -rotate-90 text-slate-400 shrink-0" />
      </Link>
    </div>
  );
}
