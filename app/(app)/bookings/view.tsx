"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Search, SlidersHorizontal, Plus, Star, ChevronRight, MapPin, Calendar,
  ChevronDown, ArrowLeft, Bell, Sparkles, Clock, X, Repeat,
} from "lucide-react";
import { ServiceIcon } from "@/components/ServiceIcon";
import type { BookingWithProvider } from "@/lib/data/customer";
import type { RequestRow } from "@/lib/data/requests";
import type { SeriesRow } from "./page";
import { cn } from "@/lib/cn";
import { cancelRequestAction } from "./actions";
import { describeRule, type RecurrenceRule } from "@/lib/recurrence-pure";

const TABS = [
  { key: "upcoming" as const, label: "Upcoming" },
  { key: "pending" as const, label: "Pending" },
  { key: "active" as const, label: "Active" },
  { key: "recurring" as const, label: "Recurring" },
  { key: "completed" as const, label: "Completed" },
  { key: "cancelled" as const, label: "Cancelled" },
];
type TabKey = (typeof TABS)[number]["key"];

const STATUS_TONE: Record<string, string> = {
  scheduled: "bg-brand-50 text-brand-700",
  matching: "bg-amber-50 text-amber-700",
  in_progress: "bg-emerald-50 text-emerald-700",
  completed: "bg-emerald-50 text-emerald-700",
  cancelled: "bg-rose-50 text-rose-700",
};

export function BookingsView({
  bookings: allBookings, requests: allRequests, series: allSeries,
}: {
  bookings: BookingWithProvider[];
  requests: RequestRow[];
  series: SeriesRow[];
}) {
  const [tab, setTab] = useState<TabKey>(allRequests.length > 0 ? "pending" : "upcoming");
  const [query, setQuery] = useState("");

  const q = query.trim().toLowerCase();
  const bookings = !q ? allBookings : allBookings.filter((b) =>
    b.service?.title?.toLowerCase().includes(q) ||
    b.id.toLowerCase().includes(q)
  );
  const requests = !q ? allRequests : allRequests.filter((r) =>
    r.service?.title?.toLowerCase().includes(q) ||
    r.pickup?.formatted?.toLowerCase().includes(q)
  );

  const activeSeries = allSeries.filter((s) => s.status === "active" || s.status === "paused");
  const counts = {
    upcoming: bookings.filter((b) => b.status === "scheduled").length,
    pending: requests.filter((r) => r.status === "matching" || r.status === "draft").length,
    active: bookings.filter((b) => b.status === "in_progress").length,
    recurring: activeSeries.length,
    completed: bookings.filter((b) => b.status === "completed").length,
    cancelled: bookings.filter((b) => b.status === "cancelled").length,
  };

  const tabContent: { title: string; items: { kind: "booking" | "request"; row: BookingWithProvider | RequestRow }[] } = (() => {
    switch (tab) {
      case "upcoming":
        return { title: "UPCOMING BOOKINGS", items: bookings.filter((b) => b.status === "scheduled").map((b) => ({ kind: "booking", row: b })) };
      case "pending":
        return { title: "PENDING REQUESTS", items: requests.filter((r) => r.status === "matching" || r.status === "draft").map((r) => ({ kind: "request", row: r })) };
      case "active":
        return { title: "ACTIVE BOOKINGS", items: bookings.filter((b) => b.status === "in_progress").map((b) => ({ kind: "booking", row: b })) };
      case "completed":
        return { title: "COMPLETED BOOKINGS", items: bookings.filter((b) => b.status === "completed").map((b) => ({ kind: "booking", row: b })) };
      case "cancelled":
        return { title: "CANCELLED BOOKINGS", items: bookings.filter((b) => b.status === "cancelled").map((b) => ({ kind: "booking", row: b })) };
    }
  })();

  return (
    <div className="px-4 lg:px-8 py-5 lg:py-8 max-w-[1500px] mx-auto">
      <div className="mb-4 lg:mb-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold text-slate-900">Bookings</h1>
            <p className="text-sm text-slate-500 mt-1">View and manage all your bookings in one place.</p>
          </div>
          <div className="hidden lg:flex items-center gap-2">
            <div className="relative w-72">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input placeholder="Search bookings..." value={query} onChange={(e) => setQuery(e.target.value)} className="w-full pl-9 pr-3 py-2 rounded-xl bg-white border border-slate-200 text-sm" />
            </div>
            <button disabled title="Filters ship soon" aria-label="Filter" className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-slate-200 text-sm cursor-not-allowed opacity-70">
              <SlidersHorizontal className="w-4 h-4 text-slate-500" /> Filter
            </button>
            <button disabled title="Date-range picker ships soon" aria-label="Date range" className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-slate-200 text-sm cursor-not-allowed opacity-70">
              <Calendar className="w-4 h-4 text-slate-500" /> All Time <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>
          </div>
        </div>

        <div className="mt-4 lg:hidden grid grid-cols-[1fr_auto_auto] gap-2">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input placeholder="Search bookings..." value={query} onChange={(e) => setQuery(e.target.value)} className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-white border border-slate-200 text-sm" />
          </div>
          <button disabled title="Filters ship soon" aria-label="Filter" className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-white border border-slate-200 text-sm cursor-not-allowed opacity-70">
            <SlidersHorizontal className="w-4 h-4 text-slate-500" />
          </button>
          <button disabled title="Date-range picker ships soon" aria-label="Date range" className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-white border border-slate-200 text-sm cursor-not-allowed opacity-70">
            <Calendar className="w-4 h-4 text-slate-500" />
          </button>
        </div>
      </div>

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

      <div className="mt-5">
        {tab === "recurring" ? (
          activeSeries.length === 0 ? <EmptyTab tab={tab} /> : (
            <>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-3 px-1">
                RECURRING SERIES
              </div>
              <ul className="rounded-2xl bg-white border border-slate-100 overflow-hidden divide-y divide-slate-100">
                {activeSeries.map((s) => (
                  <li key={s.id}>
                    <SeriesRowView series={s} />
                  </li>
                ))}
              </ul>
            </>
          )
        ) : tabContent.items.length === 0 ? (
          <EmptyTab tab={tab} />
        ) : (
          <>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-3 px-1">
              {tabContent.title}
            </div>
            <ul className="rounded-2xl bg-white border border-slate-100 overflow-hidden divide-y divide-slate-100">
              {tabContent.items.map((item) => (
                <li key={(item.row as { id: string }).id}>
                  {item.kind === "booking" ? (
                    <BookingRow booking={item.row as BookingWithProvider} />
                  ) : (
                    <RequestRowView request={item.row as RequestRow} />
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

function BookingRow({ booking }: { booking: BookingWithProvider }) {
  return (
    <Link href={`/bookings/${booking.id}`} className="p-4 flex items-start gap-3 hover:bg-slate-50">
      <ServiceIcon name="spark" size="md" />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="text-sm font-bold text-slate-900 truncate">{booking.service.title}</div>
          <span className={cn("shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold", STATUS_TONE[booking.status])}>
            {booking.status === "in_progress" ? "In Progress" : booking.status[0].toUpperCase() + booking.status.slice(1)}
          </span>
        </div>
        <div className="text-xs text-slate-500 mt-0.5 truncate">
          {booking.scheduled_for ? new Date(booking.scheduled_for).toLocaleString() : new Date(booking.created_at).toLocaleString()}
        </div>
        <div className="mt-2 flex items-center justify-between gap-2">
          <div className="text-sm font-bold text-slate-900">${(booking.total_cents / 100).toFixed(2)}</div>
          <ChevronRight className="w-4 h-4 text-slate-300" />
        </div>
      </div>
    </Link>
  );
}

function RequestRowView({ request }: { request: RequestRow }) {
  return (
    <div className="p-4 flex items-start gap-3 hover:bg-slate-50">
      <ServiceIcon name="spark" size="md" />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="text-sm font-bold text-slate-900 truncate">{request.service.title}</div>
          <span className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700">
            <Clock className="w-3 h-3 animate-pulse" /> Matching
          </span>
        </div>
        <div className="text-xs text-slate-500 mt-0.5 truncate">{request.pickup?.formatted ?? "—"}</div>
        <div className="text-xs text-slate-500 mt-0.5 truncate">
          {request.scheduled_for ? new Date(request.scheduled_for).toLocaleString() : `Created ${new Date(request.created_at).toLocaleString()}`}
        </div>
        <div className="mt-2 flex items-center justify-between gap-2">
          <div className="text-sm font-bold text-slate-900">
            Est. ${request.estimated_price_cents ? (request.estimated_price_cents / 100).toFixed(2) : "—"}
          </div>
          <button
            type="button"
            onClick={async () => {
              if (confirm("Cancel this request?")) {
                await cancelRequestAction(request.id);
              }
            }}
            className="text-xs font-semibold text-rose-600 inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-rose-200"
          >
            <X className="w-3 h-3" /> Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function SeriesRowView({ series }: { series: SeriesRow }) {
  const rule: RecurrenceRule = {
    cadence: series.cadence,
    weekday: series.weekday ?? undefined,
    dayOfMonth: series.day_of_month ?? undefined,
    timeOfDay: typeof series.time_of_day === "string" ? series.time_of_day.slice(0, 5) : "09:00",
    startDate: series.start_date,
    endDate: series.end_date,
    maxOccurrences: series.max_occurrences,
  };
  const isPaused = series.status === "paused";
  return (
    <Link href={`/bookings/series/${series.id}`} className="p-4 flex items-start gap-3 hover:bg-slate-50">
      <span className="w-10 h-10 rounded-xl bg-brand-50 inline-flex items-center justify-center shrink-0">
        <Repeat className="w-4 h-4 text-brand-600" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="text-sm font-bold text-slate-900 truncate">{series.service?.title ?? "Series"}</div>
          <span className={cn(
            "shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold",
            isPaused ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700",
          )}>
            {isPaused ? "Paused" : "Active"}
          </span>
        </div>
        <div className="text-xs text-slate-600 mt-0.5 truncate">{describeRule(rule)}</div>
        <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-slate-500">
          <span>
            {series.max_occurrences
              ? `${series.occurrences_created} of ${series.max_occurrences} occurrences`
              : `${series.occurrences_created} occurrences so far`}
          </span>
          <ChevronRight className="w-3 h-3 text-slate-300" />
        </div>
      </div>
    </Link>
  );
}

function EmptyTab({ tab }: { tab: TabKey }) {
  const map: Record<TabKey, { title: string; sub: string }> = {
    upcoming: { title: "No upcoming bookings", sub: "Schedule a task and it'll show up here." },
    pending: { title: "No pending requests", sub: "Create a new request to start." },
    active: { title: "Nothing in progress", sub: "Your active task will live here with real-time tracking." },
    recurring: { title: "No recurring series yet", sub: "Toggle 'Repeat this task' when you create a request to schedule it weekly, biweekly, or monthly." },
    completed: { title: "No completed bookings yet", sub: "Once a task wraps up, you can rate the provider here." },
    cancelled: { title: "No cancelled bookings", sub: "Cancellations show up here." },
  };
  const e = map[tab];
  return (
    <div className="text-center py-12">
      <span className="inline-flex w-14 h-14 rounded-2xl bg-brand-50 items-center justify-center mb-3">
        <Sparkles className="w-7 h-7 text-brand-600" />
      </span>
      <h3 className="text-base font-bold text-slate-900">{e.title}</h3>
      <p className="mt-1 text-sm text-slate-500 max-w-xs mx-auto">{e.sub}</p>
      <Link href="/new-request" className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold">
        <Plus className="w-4 h-4" /> New request
      </Link>
    </div>
  );
}
