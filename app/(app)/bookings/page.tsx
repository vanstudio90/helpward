"use client";

import { useState } from "react";
import {
  Search, SlidersHorizontal, Plus, Star, ChevronRight, MapPin, Phone, MessageSquare,
  Bell, Headphones, Calendar, ChevronDown, ArrowLeft,
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

const SECTION_TITLES: Record<TabKey, string> = {
  upcoming: "UPCOMING BOOKINGS",
  active: "ACTIVE BOOKINGS",
  completed: "COMPLETED BOOKINGS",
  cancelled: "CANCELLED BOOKINGS",
};

export default function BookingsPage() {
  const [tab, setTab] = useState<TabKey>("upcoming");
  const [selectedId, setSelectedId] = useState(bookings[0].id);
  const [mobileView, setMobileView] = useState<"list" | "detail">("list");
  const selected = bookings.find((b) => b.id === selectedId)!;
  const selectedProvider = providerById(selected.providerId)!;

  const counts = {
    upcoming: bookings.filter((b) => b.status === "scheduled").length,
    active: bookings.filter((b) => b.status === "in_progress").length,
    completed: 18,
    cancelled: 2,
  };

  // For the mobile single-tab view, render whichever bookings match the current tab
  const tabBookings =
    tab === "upcoming" ? bookings.filter((b) => b.status === "scheduled")
    : tab === "active" ? bookings.filter((b) => b.status === "in_progress")
    : tab === "completed" ? bookings.filter((b) => b.status === "completed")
    : [];

  // For the mobile list-all view, group all bookings by section
  const grouped: { key: TabKey; items: typeof bookings }[] = [
    { key: "upcoming", items: bookings.filter((b) => b.status === "scheduled") },
    { key: "active", items: bookings.filter((b) => b.status === "in_progress") },
    { key: "completed", items: bookings.filter((b) => b.status === "completed") },
  ];

  const openDetail = (id: string) => { setSelectedId(id); setMobileView("detail"); };

  return (
    <div className="px-4 lg:px-8 py-5 lg:py-8 max-w-[1500px] mx-auto">
      {/* Page header (list view + always on desktop) */}
      <div className={cn("mb-4 lg:mb-6", mobileView === "detail" ? "hidden lg:block" : "")}>
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold text-slate-900">Bookings</h1>
            <p className="text-sm text-slate-500 mt-1">View and manage all your bookings in one place.</p>
          </div>
          {/* Desktop-only actions row */}
          <div className="hidden lg:flex items-center gap-2">
            <div className="relative w-72">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input placeholder="Search bookings..." className="w-full pl-9 pr-3 py-2 rounded-xl bg-white border border-slate-200 text-sm" />
            </div>
            <button className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-slate-200 text-sm">
              <SlidersHorizontal className="w-4 h-4 text-slate-500" /> Filter
            </button>
            <button className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-slate-200 text-sm">
              <Calendar className="w-4 h-4 text-slate-500" /> All Time <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>
            <button className="relative p-2 rounded-xl bg-white border border-slate-200">
              <Bell className="w-5 h-5 text-slate-700" />
              <span className="absolute -top-1 -right-1 bg-rose-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">3</span>
            </button>
          </div>
        </div>

        {/* Mobile: full-width search + filter + date row */}
        <div className="mt-4 lg:hidden grid grid-cols-[1fr_auto_auto] gap-2">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input placeholder="Search bookings..." className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-white border border-slate-200 text-sm" />
          </div>
          <button className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-white border border-slate-200 text-sm">
            <SlidersHorizontal className="w-4 h-4 text-slate-500" /> Filter
          </button>
          <button className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-white border border-slate-200 text-sm">
            <Calendar className="w-4 h-4 text-slate-500" /> All Time <ChevronDown className="w-3 h-3 text-slate-400" />
          </button>
        </div>
      </div>

      <div className="grid lg:grid-cols-[1fr_360px] xl:grid-cols-[1fr_400px] gap-6">
        {/* LIST */}
        <section className={cn(mobileView === "detail" ? "hidden lg:block" : "")}>
          {/* Tabs */}
          <div className="border-b border-slate-200 flex gap-5 sm:gap-6 overflow-x-auto scrollbar-none">
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

          {/* Section list — show only active tab on mobile, all sections on desktop */}
          <div className="mt-5 space-y-6 lg:hidden">
            {tabBookings.length > 0 ? (
              <SectionList sectionTitle={SECTION_TITLES[tab]} items={tabBookings} selectedId={selectedId} onOpen={openDetail} />
            ) : (
              <div className="text-center py-12 text-sm text-slate-500">No {tab} bookings.</div>
            )}
          </div>

          <div className="mt-5 hidden lg:block space-y-6">
            {grouped.map((g) => (
              g.items.length > 0 && (
                <SectionList key={g.key} sectionTitle={SECTION_TITLES[g.key]} items={g.items} selectedId={selectedId} onOpen={openDetail} />
              )
            ))}
          </div>

          <div className="mt-6 text-center">
            <button className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700 bg-white border border-slate-200 px-4 py-2 rounded-xl">
              Load more <ChevronDown className="w-3 h-3" />
            </button>
          </div>
        </section>

        {/* DETAIL */}
        <aside className={cn(
          "lg:block",
          mobileView === "detail" ? "block" : "hidden lg:block"
        )}>
          <DetailPanel
            booking={selected}
            provider={selectedProvider}
            onBack={() => setMobileView("list")}
          />
        </aside>
      </div>
    </div>
  );
}

function SectionList({
  sectionTitle, items, selectedId, onOpen,
}: {
  sectionTitle: string;
  items: typeof bookings;
  selectedId: string;
  onOpen: (id: string) => void;
}) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-3 px-1">
        {sectionTitle}
      </div>
      <ul className="rounded-2xl bg-white border border-slate-100 overflow-hidden divide-y divide-slate-100">
        {items.map((b) => (
          <li key={b.id}>
            <BookingRow
              booking={b}
              isSelected={b.id === selectedId}
              onOpen={onOpen}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

function BookingRow({
  booking, isSelected, onOpen,
}: {
  booking: typeof bookings[number];
  isSelected: boolean;
  onOpen: (id: string) => void;
}) {
  return (
    <button
      onClick={() => onOpen(booking.id)}
      className={cn(
        "w-full text-left p-3.5 sm:p-4 flex items-start gap-3 transition",
        isSelected ? "bg-brand-50/40" : "hover:bg-slate-50"
      )}
    >
      <ServiceIcon name={booking.icon} size="md" />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="text-sm font-bold text-slate-900 truncate">{booking.service}</div>
          <span className={cn(
            "shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold",
            STATUS_TONE[booking.status]
          )}>
            {booking.status === "in_progress" ? "In Progress" : booking.status[0].toUpperCase() + booking.status.slice(1)}
          </span>
        </div>
        <div className="text-xs text-slate-500 mt-0.5 truncate">{booking.whenLabel}</div>
        <div className="text-xs text-slate-500 mt-0.5 truncate">{booking.address}</div>

        {/* Bottom row: price + action */}
        <div className="mt-2 flex items-center justify-between gap-2">
          <div className="text-sm font-bold text-slate-900">${booking.price.toFixed(2)}</div>
          {booking.status === "in_progress" ? (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-brand-200 text-brand-700 text-xs font-semibold">
              <MapPin className="w-3.5 h-3.5" /> Track
            </span>
          ) : booking.status === "completed" ? (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-brand-200 text-brand-700 text-xs font-semibold">
              <Star className="w-3.5 h-3.5" /> Rate
            </span>
          ) : (
            <ChevronRight className="w-4 h-4 text-slate-300" />
          )}
        </div>
      </div>
    </button>
  );
}

function DetailPanel({
  booking, provider, onBack,
}: {
  booking: typeof bookings[number];
  provider: ReturnType<typeof providerById>;
  onBack: () => void;
}) {
  if (!provider) return null;
  return (
    <div className="rounded-2xl bg-white border border-slate-100 lg:sticky lg:top-6 overflow-hidden">
      {/* Mobile back bar */}
      <div className="lg:hidden flex items-center justify-between px-4 py-3 border-b border-slate-100">
        <button onClick={onBack} aria-label="Back" className="p-1.5 -ml-1.5 rounded-lg hover:bg-slate-100">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="text-sm font-bold text-slate-900">Booking Details</div>
        <span className="w-7" />
      </div>

      <div className="p-4 sm:p-5 space-y-5">
        {/* Service header */}
        <div className="flex items-start gap-3">
          <ServiceIcon name={booking.icon} size="lg" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="text-base font-bold text-slate-900 truncate">{booking.service}</div>
              <span className={cn("inline-flex px-2 py-1 rounded-full text-[11px] font-semibold", STATUS_TONE[booking.status])}>
                {booking.status === "in_progress" ? "In Progress" : booking.status[0].toUpperCase() + booking.status.slice(1)}
              </span>
            </div>
            <div className="text-xs text-slate-500 mt-1">Booking ID: #{booking.id}</div>
            <div className="text-sm font-bold text-slate-900 mt-2">${booking.price.toFixed(2)}</div>
          </div>
        </div>

        {/* Date + Duration */}
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-xl bg-slate-50 p-3">
            <div className="flex items-center gap-1.5 text-[11px] text-slate-500"><Calendar className="w-3 h-3" />Today, May 17, 2024</div>
            <div className="text-sm font-semibold text-slate-900 mt-1">10:00 PM</div>
          </div>
          <div className="rounded-xl bg-slate-50 p-3">
            <div className="flex items-center gap-1.5 text-[11px] text-slate-500">⏱ Est. Duration</div>
            <div className="text-sm font-semibold text-slate-900 mt-1">30 - 45 min</div>
          </div>
        </div>

        {/* Pickup / Drop-off with timeline */}
        <div>
          <div className="relative pl-5">
            <span className="absolute left-[5px] top-1.5 w-2 h-2 rounded-full bg-brand-600" />
            <span className="absolute left-[9px] top-4 bottom-4 w-px border-l border-dashed border-slate-300" />
            <span className="absolute left-[5px] bottom-1.5 w-2 h-2 rounded-full bg-orange-500" />
            <div className="pb-3">
              <div className="text-[11px] font-semibold text-slate-500">Pickup Location</div>
              <div className="text-sm text-slate-900 mt-0.5">{booking.address.split(" → ")[0]} V6B 1A1</div>
            </div>
            <div className="flex items-center justify-between pt-3">
              <div>
                <div className="text-[11px] font-semibold text-slate-500">Drop-off Location</div>
                <div className="text-sm text-slate-900 mt-0.5">{booking.address.includes("→") ? booking.address.split(" → ")[1] : "Home"}</div>
              </div>
              <button className="text-xs font-semibold text-brand-700 border border-slate-200 px-2.5 py-1 rounded-md">Edit</button>
            </div>
          </div>
        </div>

        {/* Provider */}
        <div className="pt-4 border-t border-slate-100">
          <div className="text-[11px] font-semibold text-slate-500 mb-2">Provider</div>
          <div className="flex items-center gap-3">
            <img src={provider.avatar} className="w-10 h-10 rounded-full shrink-0" alt="" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-bold text-slate-900 truncate flex items-center gap-1.5">
                {provider.name}
                <span className="text-brand-700 text-xs font-semibold">★ {provider.rating}</span>
              </div>
              <div className="text-[11px] text-slate-500">10,432 tasks completed</div>
            </div>
            <button aria-label="Call" className="p-2 rounded-lg border border-brand-200 text-brand-700"><Phone className="w-4 h-4" /></button>
            <button aria-label="Message" className="p-2 rounded-lg border border-brand-200 text-brand-700"><MessageSquare className="w-4 h-4" /></button>
          </div>
        </div>

        {/* Payment */}
        <div className="pt-4 border-t border-slate-100">
          <div className="text-[11px] font-semibold text-slate-500 mb-2">Payment</div>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[11px] text-slate-500">Payment Method</div>
              <div className="mt-1 text-sm font-medium flex items-center gap-2">
                <span className="text-[10px] bg-blue-600 text-white px-1.5 py-0.5 rounded font-bold">VISA</span>
                Visa •••• 4242
              </div>
              <span className="mt-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold text-emerald-700 bg-emerald-50">✓ Paid</span>
            </div>
            <div className="text-right">
              <div className="text-[11px] text-slate-500">Total Amount</div>
              <div className="text-base font-bold text-slate-900 mt-1">${booking.price.toFixed(2)}</div>
            </div>
          </div>
        </div>

        {/* Live tracking */}
        <div className="pt-4 border-t border-slate-100">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 mb-2">
            Live Tracking <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            Your driver is on the way.<br />
            Live location will be available 15 min before pickup.
          </p>
          <div className="mt-3 rounded-xl overflow-hidden h-36 bg-slate-100 relative">
            <MapBackdrop />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
              <img src={provider.avatar} className="w-9 h-9 rounded-full ring-2 ring-white shadow" alt="" />
            </div>
            <div className="absolute bottom-2 right-2 bg-white text-xs rounded-lg px-2.5 py-1.5 shadow">
              <div className="font-bold text-emerald-600">12 min away</div>
              <div className="text-[10px] text-slate-500">1.2 km from you</div>
            </div>
          </div>
        </div>

        {/* CTAs */}
        <div className="pt-2 space-y-2">
          <button className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-xl border border-brand-200 text-brand-700 text-sm font-semibold">
            <Headphones className="w-4 h-4" /> Need Help?
          </button>
          <button className="w-full text-center py-2 text-sm font-semibold text-rose-600">
            Cancel Booking
          </button>
        </div>
      </div>
    </div>
  );
}
