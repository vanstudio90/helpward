"use client";

import { useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { ServiceIcon } from "@/components/ServiceIcon";
import { categorySummary } from "@/lib/marketing";
import type { ServiceWithCategory } from "@/lib/data/services";
import type { ServiceCategory } from "@/lib/supabase/types";

// Catalog with category-filter tabs. Client because the tab state is interactive,
// but every service still renders in the SSR'd HTML — the tabs just toggle
// visibility client-side so AI crawlers see the full inventory regardless.
export function ServicesCatalog({
  services, categories,
}: { services: ServiceWithCategory[]; categories: ServiceCategory[] }) {
  const [tab, setTab] = useState<string>("all");

  // Pre-group services by category once
  const grouped = categories
    .map((c) => ({ category: c, items: services.filter((s) => s.category?.id === c.id) }))
    .filter((g) => g.items.length > 0);
  const visible = tab === "all" ? grouped : grouped.filter((g) => g.category.id === tab);

  return (
    <section id="services" className="bg-white border-t border-slate-100 py-12 lg:py-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-5">
          <div className="min-w-0">
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900">Explore all services</h2>
            <p className="text-sm text-slate-500 mt-1">{services.length} services across {grouped.length} categories</p>
          </div>
          <Link href="/services" className="text-xs sm:text-sm font-semibold text-brand-700 hover:text-brand-800 inline-flex items-center gap-1">
            View all services →
          </Link>
        </div>

        {/* Filter tabs */}
        <div className="-mx-4 sm:mx-0 mb-6 lg:mb-8 overflow-x-auto scrollbar-none">
          <div className="inline-flex items-center gap-2 px-4 sm:px-0 whitespace-nowrap">
            <TabButton active={tab === "all"} onClick={() => setTab("all")}>All</TabButton>
            {grouped.map((g) => (
              <TabButton key={g.category.id} active={tab === g.category.id} onClick={() => setTab(g.category.id)}>
                {g.category.label}
              </TabButton>
            ))}
          </div>
        </div>

        <div className="space-y-10">
          {visible.map(({ category, items }) => (
            <div key={category.id}>
              <div className="flex items-center justify-between gap-3 mb-3 lg:mb-4">
                <div className="flex items-center gap-3 min-w-0">
                  <ServiceIcon name={category.icon ?? "spark"} size="md" />
                  <div className="min-w-0">
                    <h3 className="text-base sm:text-lg font-bold text-slate-900">{category.label}</h3>
                    <p className="text-xs text-slate-500">{items.length} service{items.length === 1 ? "" : "s"}</p>
                  </div>
                </div>
                {tab === "all" && (
                  <button
                    type="button"
                    onClick={() => setTab(category.id)}
                    className="text-xs font-semibold text-brand-700 hover:text-brand-800 shrink-0"
                  >
                    View all
                  </button>
                )}
              </div>
              {/* AI-extraction-friendly summary — leads the section with a
                  complete-sentence answer so search assistants can quote it. */}
              <p className="text-xs sm:text-sm text-slate-600 mb-4 lg:mb-5 max-w-3xl leading-relaxed">
                {categorySummary(category.id, items)}
              </p>
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
                {items.map((s) => (
                  <Link
                    key={s.id}
                    href={`/services/${s.id}`}
                    className="group flex flex-col rounded-2xl border border-slate-100 bg-white hover:border-brand-300 hover:shadow-lg hover:-translate-y-0.5 transition overflow-hidden"
                  >
                    {s.image_url && (
                      <div className="relative aspect-[5/3] bg-slate-100 overflow-hidden">
                        <img
                          src={s.image_url}
                          alt={s.title}
                          loading="lazy"
                          className="w-full h-full object-cover group-hover:scale-105 transition"
                        />
                        {s.popular && (
                          <span className="absolute top-2 left-2 text-[10px] font-bold uppercase tracking-wide bg-violet-600 text-white px-2 py-1 rounded-md">
                            Popular
                          </span>
                        )}
                      </div>
                    )}
                    <div className="p-3 sm:p-4 flex-1 flex flex-col">
                      <div className="text-sm font-bold text-slate-900 truncate">{s.title}</div>
                      <div className="text-[11px] sm:text-xs text-slate-500 mt-0.5 line-clamp-2 flex-1">{s.blurb}</div>
                      <div className="mt-2 sm:mt-3 flex items-center justify-between gap-2 text-[11px] sm:text-xs">
                        <span className="font-semibold text-slate-900 truncate">From ${(s.base_price_cents / 100).toFixed(0)}</span>
                        <span className="text-slate-500 whitespace-nowrap shrink-0">{s.eta_label}</span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-10 rounded-2xl bg-slate-50 border border-slate-100 p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="min-w-0">
            <div className="text-sm font-bold text-slate-900">Need something not on this list?</div>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">Describe what you need — if it&apos;s legal, safe, and a human can do it, someone in the network can probably help.</p>
          </div>
          <Link href="/new-request" className="shrink-0 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-300 bg-white text-sm font-semibold text-slate-900 hover:bg-slate-100">
            Describe your task →
          </Link>
        </div>
      </div>
    </section>
  );
}

function TabButton({
  active, onClick, children,
}: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "shrink-0 inline-flex items-center px-4 py-2 rounded-xl text-sm font-semibold transition border",
        active
          ? "bg-brand-600 text-white border-brand-600 shadow-sm shadow-brand-900/10"
          : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
      )}
    >
      {children}
    </button>
  );
}
