import Link from "next/link";
import {
  Bell, Search, Plus, Calendar, CheckCircle2, DollarSign, Car, ShoppingBag,
  Home, Box, MessageSquare, Phone, Headphones, ChevronRight, Activity, MoreHorizontal, User,
  Sparkles,
} from "lucide-react";
import { ServiceIcon } from "@/components/ServiceIcon";
import { MapBackdrop } from "@/components/MapBackdrop";
import {
  getMe, getDashboardStats, getActiveBooking, listMyBookings,
  listSavedProviderIds,
} from "@/lib/data/customer";
import { ClientDateTime } from "@/components/ClientDateTime";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NextStepsWidget } from "./next-steps";

export default async function DashboardPage() {
  const me = await getMe();
  const stats = await getDashboardStats();
  const inProgress = await getActiveBooking();
  const upcoming = await listMyBookings({ status: "scheduled", limit: 2 });
  const recent = await listMyBookings({ limit: 4 });

  // Next-steps inputs. Saved-address + favorite-helper counts are head-only
  // count queries so we pay almost nothing for them; unrated detection reuses
  // the recent[] list we already loaded for the "Recent" rail.
  const supabase = await createSupabaseServerClient();
  const [{ count: savedAddressCount }, savedHelperIds] = await Promise.all([
    supabase.from("saved_addresses").select("id", { count: "exact", head: true }),
    listSavedProviderIds(),
  ]);
  const completedBookings = recent.filter((b) => b.status === "completed");
  const unrated = completedBookings
    .filter((b) => (b.review?.length ?? 0) === 0)
    .sort((a, b) => (a.completed_at ?? "").localeCompare(b.completed_at ?? ""));
  const nextStepsInput = {
    hasCompletedBooking: stats.completed_month > 0 || completedBookings.length > 0,
    unratedCount: unrated.length,
    oldestUnratedBookingId: unrated[0]?.id ?? null,
    savedAddressCount: savedAddressCount ?? 0,
    favoriteHelperCount: savedHelperIds.length,
  };

  const firstName = me?.profile.full_name?.split(" ")[0] || "there";
  const greeting = new Date().getHours() < 12 ? "Good morning" : new Date().getHours() < 18 ? "Good afternoon" : "Good evening";

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-5 lg:py-8 max-w-[1500px] mx-auto">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 mb-4 lg:mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">{greeting}, {firstName}! 👋</h1>
          <p className="text-sm text-slate-500 mt-1">How can we help you today?</p>
        </div>
        <div className="hidden lg:flex items-center gap-3">
          <button className="relative p-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50">
            <Bell className="w-5 h-5 text-slate-700" />
          </button>
          <Link href="/new-request" className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800">
            <Plus className="w-4 h-4" /> New Request
          </Link>
        </div>
      </div>

      <div className="relative mb-5 lg:mb-6">
        <Search className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
        <input
          placeholder="Search across services and bookings (ships soon)…"
          disabled
          title="Global search ships soon — use /services or /bookings to filter for now"
          aria-label="Global search (coming soon)"
          className="w-full pl-11 pr-4 py-3 rounded-2xl bg-white border border-slate-200 text-sm placeholder:text-slate-400 cursor-not-allowed opacity-70"
        />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-3 lg:gap-4 mb-5">
        <StatCard icon={<Calendar className="w-5 h-5 text-brand-600" />} tint="bg-brand-50" label="Upcoming Tasks" value={String(stats.upcoming)} cta="View all" href="/bookings" arrow />
        <StatCard icon={<Activity className="w-5 h-5 text-amber-600" />} tint="bg-amber-50" label="In Progress" value={String(stats.in_progress)} cta={stats.in_progress > 0 ? "Track now" : "—"} href="/bookings" arrow={stats.in_progress > 0} />
        <StatCard icon={<CheckCircle2 className="w-5 h-5 text-emerald-600" />} tint="bg-emerald-50" label="Completed" value={String(stats.completed_month)} cta="This month" />
        <StatCard icon={<DollarSign className="w-5 h-5 text-orange-600" />} tint="bg-orange-50" label="Total Spent" value={`$${(stats.total_spent_month_cents / 100).toFixed(stats.total_spent_month_cents % 100 ? 2 : 0)}`} cta="This month" />
      </div>

      <NextStepsWidget {...nextStepsInput} />

      {/* MOBILE: Quick Request first */}
      <section className="lg:hidden mb-5">
        <QuickRequestCard />
      </section>

      <div className="grid lg:grid-cols-3 gap-5 lg:gap-6">
        <div className="lg:col-span-2 space-y-5 lg:space-y-6">
          {inProgress ? (
            <InProgressCard booking={inProgress} />
          ) : (
            <NoActiveCard />
          )}

          {upcoming.length > 0 && (
            <section className="rounded-2xl bg-white border border-slate-100 p-4 sm:p-5 lg:p-6 lg:hidden">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-base font-bold text-slate-900">Upcoming</h2>
                <Link href="/bookings" className="text-xs font-semibold text-brand-700 inline-flex items-center gap-1">View calendar <ChevronRight className="w-3 h-3" /></Link>
              </div>
              <div className="grid grid-cols-2 gap-3 items-center">
                {upcoming.map((b) => (
                  <UpcomingMini key={b.id} booking={b} />
                ))}
              </div>
            </section>
          )}

          <section className="rounded-2xl bg-white border border-slate-100 p-4 sm:p-5 lg:p-6">
            <div className="flex items-center justify-between mb-3 sm:mb-4">
              <h2 className="text-base lg:text-lg font-bold text-slate-900">Recent Tasks</h2>
              {recent.length > 0 && (
                <Link href="/bookings" className="text-xs sm:text-sm font-semibold text-brand-700 inline-flex items-center gap-1">View all <ChevronRight className="w-3 h-3" /></Link>
              )}
            </div>
            {recent.length === 0 ? (
              <EmptyState
                icon={<Sparkles className="w-6 h-6 text-brand-600" />}
                title="No tasks yet"
                sub="Create your first request — a verified helper will be matched in seconds."
                cta={{ href: "/new-request", label: "Start a request" }}
              />
            ) : (
              <ul className="divide-y divide-slate-100 -mx-1">
                {recent.map((b) => <RecentRow key={b.id} booking={b} />)}
              </ul>
            )}
          </section>
        </div>

        <div className="space-y-5 lg:space-y-6">
          <section className="hidden lg:block">
            <QuickRequestCard />
          </section>

          {upcoming.length > 0 && (
            <section className="hidden lg:block rounded-2xl bg-white border border-slate-100 p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-slate-900">Upcoming</h3>
                <Link href="/bookings" className="text-xs font-semibold text-brand-700">View calendar</Link>
              </div>
              <ul className="space-y-3">
                {upcoming.map((b) => (
                  <li key={b.id} className="flex items-center gap-3 p-2 rounded-xl hover:bg-slate-50">
                    <ServiceIcon name="calendar" />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-slate-900 truncate">{b.service.title}</div>
                      <div className="text-xs text-slate-500 truncate">
                        <ClientDateTime iso={b.scheduled_for} />
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-300" />
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="rounded-2xl bg-slate-900 text-white p-5 relative overflow-hidden">
            <Headphones className="absolute right-3 top-1/2 -translate-y-1/2 w-20 h-20 text-slate-700/40" />
            <h3 className="text-sm font-bold">Need help?</h3>
            <p className="text-xs text-slate-300 mt-1">Our support team is available 24/7.</p>
            <button className="mt-3 inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-white/10 text-white text-xs font-semibold border border-white/15">
              <MessageSquare className="w-3.5 h-3.5" /> Contact Support
            </button>
          </section>
        </div>
      </div>
    </div>
  );
}

function InProgressCard({ booking }: { booking: NonNullable<Awaited<ReturnType<typeof getActiveBooking>>> }) {
  const providerName = booking.provider?.profile?.full_name ?? "Your provider";
  return (
    <section className="rounded-2xl bg-white border border-slate-100 p-4 sm:p-5 lg:p-6">
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_180px] lg:grid-cols-2 gap-4 lg:gap-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <h2 className="text-base lg:text-lg font-bold text-slate-900">In Progress</h2>
            <span className="inline-flex items-center gap-1 text-[10px] sm:text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Live tracking
            </span>
          </div>
          <div className="text-sm sm:text-base font-bold text-slate-900">{booking.service.title}</div>
          <div className="text-[11px] sm:text-xs text-slate-500 mt-0.5">Booking ID: #{booking.id.slice(0, 8)}</div>

          <div className="flex items-center gap-2 mt-3 sm:mt-4">
            {booking.provider?.profile?.avatar_url ? (
              <img src={booking.provider.profile.avatar_url} className="w-9 h-9 sm:w-10 sm:h-10 rounded-full shrink-0" alt="" />
            ) : (
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 font-bold shrink-0">
                {providerName[0]}
              </div>
            )}
            <div className="min-w-0">
              <div className="text-sm font-semibold text-slate-900 truncate">
                {providerName}
                {booking.provider?.rating_avg && (
                  <span className="text-brand-700 text-xs ml-1">★ {booking.provider.rating_avg}</span>
                )}
              </div>
              <div className="text-xs text-slate-500">Your provider</div>
            </div>
          </div>

          <div className="flex items-center gap-2 mt-4">
            <Link href="/messages" className="flex-1 inline-flex items-center justify-center gap-1.5 text-xs sm:text-sm font-semibold text-brand-700 bg-brand-50 hover:bg-brand-100 rounded-xl py-2 sm:py-2.5">
              <MessageSquare className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> Message
            </Link>
            <button aria-label="Call" className="p-2 sm:p-2.5 rounded-xl border border-brand-200 text-brand-700 hover:bg-brand-50">
              <Phone className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </button>
          </div>
        </div>

        <div className="relative rounded-2xl overflow-hidden bg-slate-100 h-44 sm:h-auto sm:min-h-[240px] lg:min-h-[260px]">
          <MapBackdrop />
        </div>
      </div>
    </section>
  );
}

function NoActiveCard() {
  return (
    <section className="rounded-2xl bg-gradient-to-br from-brand-50 to-violet-50 border border-brand-100 p-6 sm:p-8 text-center">
      <span className="inline-flex w-12 h-12 rounded-2xl bg-white items-center justify-center mb-3">
        <Sparkles className="w-6 h-6 text-brand-600" />
      </span>
      <h2 className="text-lg font-bold text-slate-900">Nothing in progress</h2>
      <p className="mt-1 text-sm text-slate-600">When you create a request, your active task shows up here with live tracking.</p>
      <Link href="/new-request" className="mt-4 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-semibold">
        <Plus className="w-4 h-4" /> Create a request
      </Link>
    </section>
  );
}

function UpcomingMini({ booking }: { booking: BookingWithProvider }) {
  const date = booking.scheduled_for ? new Date(booking.scheduled_for) : null;
  const month = date?.toLocaleDateString("en-US", { month: "short" }).toUpperCase() ?? "—";
  const day = date?.getDate() ?? "—";
  return (
    <div className="flex items-start gap-2.5 min-w-0">
      <div className="text-center w-10 shrink-0 bg-rose-50/60 rounded-lg py-1.5">
        <div className="text-[10px] font-bold uppercase text-rose-500">{month}</div>
        <div className="text-base font-bold text-slate-900 leading-none mt-0.5">{day}</div>
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-xs font-bold text-slate-900 truncate">{booking.service.title}</div>
        <div className="text-[11px] text-slate-500 truncate">
          <ClientDateTime iso={booking.scheduled_for} mode="time" />
        </div>
      </div>
    </div>
  );
}

function RecentRow({ booking }: { booking: BookingWithProvider }) {
  return (
    <li className="flex items-center gap-2.5 sm:gap-3 px-1 py-2.5 sm:py-3">
      <ServiceIcon name={iconForService(booking.service.id)} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="text-xs sm:text-sm font-bold text-slate-900 truncate">{booking.service.title}</div>
        <div className="text-[11px] text-slate-500 truncate"><ClientDateTime iso={booking.created_at} mode="date" /></div>
      </div>
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold shrink-0 ${
        booking.status === "completed" ? "bg-emerald-50 text-emerald-700" :
        booking.status === "cancelled" ? "bg-rose-50 text-rose-700" :
        booking.status === "in_progress" ? "bg-amber-50 text-amber-700" :
        "bg-brand-50 text-brand-700"
      }`}>
        {booking.status === "in_progress" ? "Active" : booking.status[0].toUpperCase() + booking.status.slice(1)}
      </span>
      <div className="text-xs sm:text-sm font-bold text-slate-900 w-14 sm:w-16 text-right shrink-0">
        ${(booking.total_cents / 100).toFixed(2)}
      </div>
      <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
    </li>
  );
}

function QuickRequestCard() {
  return (
    <div className="rounded-2xl bg-white border border-slate-100 p-4 sm:p-5">
      <h3 className="text-base font-bold text-slate-900 mb-3 sm:mb-4">Quick Request</h3>
      <div className="grid grid-cols-3 sm:grid-cols-6 lg:grid-cols-3 gap-2 sm:gap-3">
        <Quick icon={<Car className="w-5 h-5 text-brand-600" />} tint="bg-brand-50" label="Ride / Driver" />
        <Quick icon={<ShoppingBag className="w-5 h-5 text-brand-600" />} tint="bg-brand-50" label="Errand" />
        <Quick icon={<Home className="w-5 h-5 text-brand-600" />} tint="bg-brand-50" label="Home Help" />
        <Quick icon={<Box className="w-5 h-5 text-orange-500" />} tint="bg-orange-50" label="Move / Lift" />
        <Quick icon={<User className="w-5 h-5 text-brand-600" />} tint="bg-brand-50" label="Wait in Line" />
        <Quick icon={<MoreHorizontal className="w-5 h-5 text-slate-500" />} tint="bg-slate-100" label="More" />
      </div>
    </div>
  );
}

function StatCard({
  icon, tint, label, value, cta, href, arrow,
}: { icon: React.ReactNode; tint: string; label: string; value: string; cta: string; href?: string; arrow?: boolean }) {
  const inner = (
    <div className="rounded-2xl bg-white border border-slate-100 p-4 lg:p-5 h-full flex flex-col gap-2 lg:gap-3 hover:border-slate-200 hover:-translate-y-0.5 transition">
      <div className="flex items-start justify-between gap-2">
        <div className="text-xs text-slate-500 leading-tight whitespace-nowrap">{label}</div>
        <span className={`inline-flex w-9 h-9 ${tint} rounded-xl items-center justify-center shrink-0`}>{icon}</span>
      </div>
      <div className="text-2xl lg:text-3xl font-bold text-slate-900 leading-none">{value}</div>
      <div className="text-xs font-semibold text-brand-700 inline-flex items-center gap-0.5 mt-auto whitespace-nowrap">
        {cta} {arrow && href && <ChevronRight className="w-3 h-3" />}
      </div>
    </div>
  );
  return href ? <Link href={href} className="block">{inner}</Link> : inner;
}

function Quick({ icon, tint, label }: { icon: React.ReactNode; tint: string; label: string }) {
  return (
    <Link href="/new-request" className="flex flex-col items-center gap-1.5 p-1 rounded-xl hover:bg-slate-50">
      <span className={`inline-flex w-10 h-10 sm:w-11 sm:h-11 ${tint} rounded-xl items-center justify-center shrink-0`}>{icon}</span>
      <span className="text-[10px] sm:text-[11px] text-center font-medium text-slate-700 leading-tight">{label}</span>
    </Link>
  );
}

function EmptyState({
  icon, title, sub, cta,
}: { icon: React.ReactNode; title: string; sub: string; cta?: { href: string; label: string } }) {
  return (
    <div className="text-center py-8 sm:py-12">
      <span className="inline-flex w-12 h-12 rounded-2xl bg-brand-50 items-center justify-center mb-3">{icon}</span>
      <h3 className="text-base font-bold text-slate-900">{title}</h3>
      <p className="mt-1 text-sm text-slate-500 max-w-xs mx-auto">{sub}</p>
      {cta && (
        <Link href={cta.href} className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold">
          <Plus className="w-4 h-4" /> {cta.label}
        </Link>
      )}
    </div>
  );
}

function iconForService(slug: string): string {
  if (slug.includes("driver") || slug.includes("motorcycle") || slug.includes("battery")) return "car";
  if (slug.includes("grocery") || slug.includes("errand") || slug.includes("shopping")) return "bag";
  if (slug.includes("dog")) return "paw";
  if (slug.includes("furniture") || slug.includes("appliance") || slug.includes("tech")) return "wrench";
  if (slug.includes("moving")) return "truck";
  if (slug.includes("package")) return "box";
  if (slug.includes("house") || slug.includes("maid") || slug.includes("inspection")) return "home";
  if (slug.includes("key")) return "key";
  return "spark";
}

import type { BookingWithProvider } from "@/lib/data/customer";
