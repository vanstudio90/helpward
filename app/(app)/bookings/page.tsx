"use client";

import { useState } from "react";
import {
  Search, SlidersHorizontal, Plus, Star, ChevronRight, MapPin, Phone, MessageSquare,
  Bell, Headphones, Calendar, ChevronDown,
} from "lucide-react";
import { ServiceIcon } from "@/components/ServiceIcon";
import { MapBackdrop } from "@/components/MapBackdrop";
import { bookings, providerById } from "@/lib/mock";
import { cn } from "@/lib/cn";

const TABS = [
  { key: "upcoming", label: "Upcoming" },
  { key: "active", label: "Active" },
  { key: "completed", label: "Completed" },
  { key: "cancelled", label: "Cancelled" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

const STATUS_TONE: Record<string, string> = {
  scheduled: "bg-brand-50 text-brand-700",
  in_progress: "bg-emerald-50 text-emerald-700",
  completed: "bg-emerald-50 text-emerald-700",
  cancelled: "bg-rose-50 text-rose-700",
};

export default function BookingsPage() {
  const [tab, setTab] = useState<TabKey>("upcoming");
  const [selectedId, setSelectedId] = useState(bookings[0].id);
  const selected = bookings.find((b) => b.id === selectedId)!;
  const selectedProvider = providerById(selected.providerId)!;

  const counts = {
    upcoming: bookings.filter((b) => b.status === "scheduled").length,
    active: bookings.filter((b) => b.status === "in_progress").length,
    completed: 18,
    cancelled: 2,
  };

  const filtered =
    tab === "upcoming" ? bookings.filter((b) => b.status === "scheduled")
    : tab === "active" ? bookings.filter((b) => b.status === "in_progress")
    : bookings.filter((b) => b.status === "completed");

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 lg:py-8 max-w-[1500px] mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">Bookings</h1>
          <p className="text-sm text-slate-500 mt-1">View and manage all your bookings in one place.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input placeholder="Search bookings..." className="w-full pl-9 pr-3 py-2 rounded-xl bg-white border border-slate-200 text-sm" />
          </div>
          <button className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-slate-200 text-sm">
            <SlidersHorizontal className="w-4 h-4 text-slate-500" /> Filter
          </button>
          <button className="hidden sm:inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-slate-200 text-sm">
            <Calendar className="w-4 h-4 text-slate-500" /> All Time <ChevronDown className="w-3 h-3 text-slate-400" />
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

      <div className="grid lg:grid-cols-[1fr_360px] xl:grid-cols-[1fr_400px] gap-6">
        <section>
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
                )}>{counts[t.key]}</span>
              </button>
            ))}
          </div>

          <div className="mt-5 text-xs font-semibold uppercase tracking-wide text-slate-400 mb-3">
            {tab.toUpperCase()} BOOKINGS
          </div>

          <ul className="space-y-3">
            {filtered.map((b) => {
              const isSel = b.id === selectedId;
              return (
                <li key={b.id}>
                  <button
                    onClick={() => setSelectedId(b.id)}
                    className={cn(
                      "w-full text-left rounded-2xl bg-white border p-4 flex items-center gap-4 transition",
                      isSel ? "border-brand-500 ring-4 ring-brand-100" : "border-slate-100 hover:border-slate-300"
                    )}
                  >
                    <ServiceIcon name={b.icon} size="lg" />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-bold text-slate-900 truncate">{b.service}</div>
                      <div className="text-xs text-slate-500 truncate">{b.whenLabel}</div>
                      <div className="text-xs text-slate-500 truncate">{b.address}</div>
                    </div>
                    <span className={cn("hidden sm:inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold", STATUS_TONE[b.status])}>
                      {b.status === "in_progress" ? "In Progress" : b.status[0].toUpperCase() + b.status.slice(1)}
                    </span>
                    <div className="hidden sm:block text-sm font-bold text-slate-900 w-20 text-right">${b.price.toFixed(2)}</div>
                    {b.status === "in_progress" ? (
                      <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-brand-50 text-brand-700 text-xs font-semibold">
                        <MapPin className="w-3.5 h-3.5" /> Track
                      </span>
                    ) : b.status === "completed" ? (
                      <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 text-xs font-semibold">
                        <Star className="w-3.5 h-3.5" /> Rate
                      </span>
                    ) : (
                      <ChevronRight className="w-4 h-4 text-slate-300" />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="mt-6 text-center">
            <button className="inline-flex items-center gap-2 text-sm font-semibold text-brand-700 bg-white border border-slate-200 px-4 py-2 rounded-xl">
              Load more <ChevronDown className="w-3 h-3" />
            </button>
          </div>
        </section>

        {/* Side panel */}
        <aside className="hidden lg:block">
          <div className="rounded-2xl bg-white border border-slate-100 p-5 lg:sticky lg:top-6 space-y-5">
            <div className="flex items-start gap-3">
              <ServiceIcon name={selected.icon} size="lg" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-base font-bold text-slate-900 truncate">{selected.service}</div>
                  <span className={cn("inline-flex px-2 py-1 rounded-full text-[11px] font-semibold", STATUS_TONE[selected.status])}>
                    {selected.status === "in_progress" ? "In Progress" : selected.status[0].toUpperCase() + selected.status.slice(1)}
                  </span>
                </div>
                <div className="text-xs text-slate-500 mt-0.5">Booking ID: #{selected.id}</div>
                <div className="text-sm font-bold text-slate-900 mt-2">${selected.price.toFixed(2)}</div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-xl bg-slate-50 p-3">
                <div className="text-[11px] text-slate-500">When</div>
                <div className="font-semibold text-slate-900">Today, May 17</div>
                <div className="text-xs text-slate-600">10:00 PM</div>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <div className="text-[11px] text-slate-500">Est. Duration</div>
                <div className="font-semibold text-slate-900">30 - 45 min</div>
              </div>
            </div>

            <div>
              <div className="text-xs font-semibold text-slate-500 mb-2">Pickup Location</div>
              <div className="flex items-start gap-2 text-sm">
                <span className="w-2 h-2 rounded-full bg-brand-600 mt-1.5" />
                <span className="flex-1">{selected.address.split(" → ")[0]}</span>
              </div>
              <div className="text-xs font-semibold text-slate-500 mt-3 mb-2">Drop-off Location</div>
              <div className="flex items-start gap-2 text-sm">
                <span className="w-2 h-2 rounded-full bg-rose-500 mt-1.5" />
                <span className="flex-1">{selected.address.includes("→") ? selected.address.split(" → ")[1] : "Home"}</span>
                <button className="text-xs font-semibold text-brand-700 border border-slate-200 px-2 py-1 rounded-md">Edit</button>
              </div>
            </div>

            <div>
              <div className="text-xs font-semibold text-slate-500 mb-2">Provider</div>
              <div className="flex items-center gap-3">
                <img src={selectedProvider.avatar} className="w-10 h-10 rounded-full" alt="" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-slate-900 truncate">{selectedProvider.name} <span className="text-brand-700 text-xs">★ {selectedProvider.rating}</span></div>
                  <div className="text-xs text-slate-500">10,432 tasks completed</div>
                </div>
                <button className="p-2 rounded-lg border border-brand-200 text-brand-700"><Phone className="w-4 h-4" /></button>
                <button className="p-2 rounded-lg border border-brand-200 text-brand-700"><MessageSquare className="w-4 h-4" /></button>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between text-xs font-semibold text-slate-500 mb-2">
                <span>Payment Method</span>
                <span>Total Amount</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2"><span className="text-xs bg-blue-600 text-white px-1.5 py-0.5 rounded">VISA</span> Visa •••• 4242</span>
                <span className="font-bold">${selected.price.toFixed(2)}</span>
              </div>
              <span className="mt-2 inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-semibold text-emerald-700 bg-emerald-50">✓ Paid</span>
            </div>

            <div>
              <div className="text-xs font-semibold text-slate-500 mb-2">Live Tracking</div>
              <p className="text-xs text-slate-600">Your driver is on the way.<br />Live location will be available 15 min before pickup.</p>
              <div className="mt-3 rounded-xl overflow-hidden h-32 bg-slate-100 relative">
                <MapBackdrop />
                <div className="absolute top-2 left-2 bg-white text-xs rounded-lg px-2 py-1 shadow">
                  <div className="font-bold">12 min away</div>
                  <div className="text-slate-500">1.2 km from you</div>
                </div>
              </div>
            </div>

            <button className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-xl bg-brand-600 text-white text-sm font-semibold">
              <Headphones className="w-4 h-4" /> Need Help?
            </button>
            <button className="w-full text-sm font-semibold text-rose-600">Cancel Booking</button>
          </div>
        </aside>
      </div>
    </div>
  );
}
