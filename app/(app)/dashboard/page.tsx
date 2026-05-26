import Link from "next/link";
import {
  Bell, Search, Plus, Calendar, CheckCircle2, DollarSign, Car, ShoppingBag,
  Home, Box, MessageSquare, Phone, Headphones, ChevronRight, Activity, MoreHorizontal, User,
} from "lucide-react";
import { ServiceIcon } from "@/components/ServiceIcon";
import { MapBackdrop } from "@/components/MapBackdrop";
import { stats, bookings, transactions, providerById } from "@/lib/mock";

export default function DashboardPage() {
  const inProgress = bookings.find((b) => b.status === "in_progress")!;
  const provider = providerById(inProgress.providerId)!;
  const upcoming = bookings.filter((b) => b.status === "scheduled").slice(0, 2);
  const recent = transactions.slice(0, 4);

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-5 lg:py-8 max-w-[1500px] mx-auto">
      {/* Heading + (desktop-only) actions */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 mb-4 lg:mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">Good morning, Alex! 👋</h1>
          <p className="text-sm text-slate-500 mt-1">How can we help you today?</p>
        </div>
        <div className="hidden lg:flex items-center gap-3">
          <button className="relative p-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50">
            <Bell className="w-5 h-5 text-slate-700" />
            <span className="absolute -top-1 -right-1 bg-rose-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">2</span>
          </button>
          <Link href="/new-request" className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800">
            <Plus className="w-4 h-4" /> New Request
          </Link>
        </div>
      </div>

      {/* Full-width search bar */}
      <div className="relative mb-5 lg:mb-6">
        <Search className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
        <input
          placeholder="Search anything..."
          className="w-full pl-11 pr-4 py-3 rounded-2xl bg-white border border-slate-200 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-4 focus:ring-brand-100 focus:border-brand-400"
        />
      </div>

      {/* Stat cards — 2x2 mobile, 4-up sm+ */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-3 lg:gap-4 mb-5">
        <StatCard icon={<Calendar className="w-5 h-5 text-brand-600" />} tint="bg-brand-50" label="Upcoming Tasks" value={String(stats.upcoming)} cta="View all" href="/bookings" arrow />
        <StatCard icon={<Activity className="w-5 h-5 text-amber-600" />} tint="bg-amber-50" label="In Progress" value={String(stats.inProgress)} cta="Track now" href="/bookings" arrow />
        <StatCard icon={<CheckCircle2 className="w-5 h-5 text-emerald-600" />} tint="bg-emerald-50" label="Completed" value={String(stats.completedMonth)} cta="This month" />
        <StatCard icon={<DollarSign className="w-5 h-5 text-orange-600" />} tint="bg-orange-50" label="Total Spent" value={`$${stats.totalSpentMonth.toLocaleString()}`} cta="This month" />
      </div>

      {/* MOBILE: Quick Request comes first. DESKTOP: lives in right column */}
      <section className="lg:hidden mb-5">
        <QuickRequestCard />
      </section>

      <div className="grid lg:grid-cols-3 gap-5 lg:gap-6">
        {/* Main column */}
        <div className="lg:col-span-2 space-y-5 lg:space-y-6">
          {/* In progress — stacked on smallest, 2-col on sm+, both cols on lg */}
          <section className="rounded-2xl bg-white border border-slate-100 p-4 sm:p-5 lg:p-6">
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_180px] lg:grid-cols-2 gap-4 lg:gap-5">
              {/* Left: details */}
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <h2 className="text-base lg:text-lg font-bold text-slate-900">In Progress</h2>
                  <span className="inline-flex items-center gap-1 text-[10px] sm:text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Live tracking
                  </span>
                </div>
                <div className="text-sm sm:text-base font-bold text-slate-900">{inProgress.service}</div>
                <div className="text-[11px] sm:text-xs text-slate-500 mt-0.5">Task ID: #{inProgress.id}</div>

                <div className="flex items-center gap-2 mt-3 sm:mt-4">
                  <img src={provider.avatar} className="w-9 h-9 sm:w-10 sm:h-10 rounded-full shrink-0" alt="" />
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-slate-900 truncate">
                      {provider.name} <span className="text-brand-700 text-xs ml-0.5">★ {provider.rating}</span>
                    </div>
                    <div className="text-xs text-slate-500">Your Tasker</div>
                  </div>
                </div>

                <dl className="mt-3 sm:mt-4 text-xs sm:text-sm divide-y divide-slate-100 border-y border-slate-100">
                  <Row k="Estimated arrival" v="12 min" />
                  <Row k="Started" v="10:24 AM" />
                  <Row k="Address" v={inProgress.address} />
                </dl>

                <div className="flex items-center gap-2 mt-3 sm:mt-4">
                  <Link href="/messages" className="flex-1 inline-flex items-center justify-center gap-1.5 text-xs sm:text-sm font-semibold text-brand-700 bg-brand-50 hover:bg-brand-100 rounded-xl py-2 sm:py-2.5">
                    <MessageSquare className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> Message {provider.name.split(" ")[0]}
                  </Link>
                  <button aria-label="Call" className="p-2 sm:p-2.5 rounded-xl border border-brand-200 text-brand-700 hover:bg-brand-50">
                    <Phone className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  </button>
                </div>
              </div>

              {/* Right: map (full-width when stacked on smallest mobile) */}
              <div className="relative rounded-2xl overflow-hidden bg-slate-100 h-44 sm:h-auto sm:min-h-[240px] lg:min-h-[260px]">
                <MapBackdrop />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-xl shadow-lg px-2 py-1.5 sm:px-3 sm:py-2 text-[11px] sm:text-xs whitespace-nowrap">
                  <div className="font-bold text-emerald-600">12 min away</div>
                  <div className="text-slate-500">1.2 km from you</div>
                </div>
                <div className="absolute bottom-2 right-2 bg-white rounded-full p-0.5 shadow">
                  <img src={provider.avatar} className="w-7 h-7 sm:w-8 sm:h-8 rounded-full" alt="" />
                </div>
              </div>
            </div>
          </section>

          {/* Upcoming — 2 items side by side on mobile */}
          <section className="rounded-2xl bg-white border border-slate-100 p-4 sm:p-5 lg:p-6 lg:hidden">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-bold text-slate-900">Upcoming</h2>
              <Link href="/bookings" className="text-xs font-semibold text-brand-700 inline-flex items-center gap-1">View calendar <ChevronRight className="w-3 h-3" /></Link>
            </div>
            <div className="grid grid-cols-2 gap-3 items-center">
              {upcoming.map((b) => (
                <div key={b.id} className="flex items-start gap-2.5 min-w-0">
                  <div className="text-center w-10 shrink-0 bg-rose-50/60 rounded-lg py-1.5">
                    <div className="text-[10px] font-bold uppercase text-rose-500">JUN</div>
                    <div className="text-base font-bold text-slate-900 leading-none mt-0.5">{b.id.endsWith("HJ1") ? 6 : 7}</div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-bold text-slate-900 truncate">{b.service}</div>
                    <div className="text-[11px] text-slate-500 truncate">{b.whenLabel.split("·")[0].trim()}</div>
                    <div className="text-[11px] text-slate-500 truncate">{b.address.split(",")[0]}</div>
                  </div>
                </div>
              ))}
              <ChevronRight className="w-4 h-4 text-slate-300 absolute right-6 hidden" />
            </div>
          </section>

          {/* Recent tasks */}
          <section className="rounded-2xl bg-white border border-slate-100 p-4 sm:p-5 lg:p-6">
            <div className="flex items-center justify-between mb-3 sm:mb-4">
              <h2 className="text-base lg:text-lg font-bold text-slate-900">Recent Tasks</h2>
              <Link href="/bookings" className="text-xs sm:text-sm font-semibold text-brand-700 inline-flex items-center gap-1">View all <ChevronRight className="w-3 h-3" /></Link>
            </div>
            <ul className="divide-y divide-slate-100 -mx-1">
              {recent.map((t) => {
                const p = providerById(t.providerId)!;
                return (
                  <li key={t.id} className="flex items-center gap-2.5 sm:gap-3 px-1 py-2.5 sm:py-3">
                    <ServiceIcon name={t.icon} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs sm:text-sm font-bold text-slate-900 truncate">{t.service}</div>
                      <div className="text-[11px] text-slate-500 truncate">{t.date.replace(" · ", " • ")}</div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <img src={p.avatar} className="w-6 h-6 rounded-full" alt="" />
                      <span className="hidden sm:inline text-xs text-slate-700 whitespace-nowrap">{p.name.split(" ")[0]} {p.name.split(" ")[1]?.[0]}.</span>
                    </div>
                    <StatusBadge status={t.status} />
                    <div className="text-xs sm:text-sm font-bold text-slate-900 w-14 sm:w-16 text-right shrink-0">${t.amount.toFixed(2)}</div>
                    <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
                  </li>
                );
              })}
            </ul>
          </section>
        </div>

        {/* Side column (desktop only on mobile order, but Quick Request also lives here on desktop) */}
        <div className="space-y-5 lg:space-y-6">
          <section className="hidden lg:block">
            <QuickRequestCard />
          </section>

          {/* Upcoming (desktop) */}
          <section className="hidden lg:block rounded-2xl bg-white border border-slate-100 p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-slate-900">Upcoming</h3>
              <Link href="/bookings" className="text-xs font-semibold text-brand-700">View calendar</Link>
            </div>
            <ul className="space-y-3">
              {upcoming.map((b) => (
                <li key={b.id} className="flex items-center gap-3 p-2 rounded-xl hover:bg-slate-50">
                  <div className="text-center w-12 shrink-0">
                    <div className="text-[10px] font-semibold uppercase text-rose-500">JUN</div>
                    <div className="text-lg font-bold text-slate-900 leading-none">{b.id.endsWith("HJ1") ? 6 : 7}</div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-slate-900 truncate">{b.service}</div>
                    <div className="text-xs text-slate-500 truncate">{b.whenLabel.split("·")[0]}</div>
                    <div className="text-xs text-slate-500 truncate">{b.address.split(",")[0]}</div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-300" />
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-2xl bg-white border border-slate-100 p-4 sm:p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-bold text-slate-900">Recent Activity</h3>
              <Link href="#" className="text-xs font-semibold text-brand-700 inline-flex items-center gap-1">View all <ChevronRight className="w-3 h-3" /></Link>
            </div>
            <ul className="space-y-3 text-sm">
              <Activity2 icon={<CheckCircle2 className="w-4 h-4 text-emerald-600" />} text='Your task "Furniture assembly" is in progress.' time="10 min ago" />
              <Activity2 icon={<User className="w-4 h-4 text-orange-500" />} text="James Carter started working on your task." time="12 min ago" />
              <Activity2 icon={<DollarSign className="w-4 h-4 text-emerald-600" />} text="Payment of $48.50 was successful." time="Jun 5, 11:42 PM" />
              <Activity2 icon={<ShoppingBag className="w-4 h-4 text-brand-600" />} text="Sarah T. completed your grocery pickup." time="Jun 5, 6:45 PM" />
            </ul>
          </section>

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

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-start justify-between py-2 gap-3">
      <dt className="text-slate-500">{k}</dt>
      <dd className="text-slate-900 font-medium text-right">{v}</dd>
    </div>
  );
}

function Quick({ icon, tint, label }: { icon: React.ReactNode; tint: string; label: string }) {
  return (
    <Link href="/new-request" className="flex flex-col items-center gap-1.5 p-1 rounded-xl hover:bg-slate-50">
      <span className={`inline-flex w-10 h-10 sm:w-11 sm:h-11 ${tint} rounded-xl items-center justify-center shrink-0`}>{icon}</span>
      <span className="text-[10px] sm:text-[11px] text-center font-medium text-slate-700 leading-tight">{label}</span>
    </Link>
  );
}

function Activity2({ icon, text, time }: { icon: React.ReactNode; text: string; time: string }) {
  return (
    <li className="flex items-start gap-3">
      <span className="w-7 h-7 rounded-full bg-slate-50 flex items-center justify-center mt-0.5 shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="text-sm text-slate-700">{text}</div>
        <div className="text-[11px] text-slate-400 mt-0.5">{time}</div>
      </div>
    </li>
  );
}

function StatusBadge({ status }: { status: "completed" | "pending" | "refunded" }) {
  const map = {
    completed: "bg-emerald-50 text-emerald-700",
    pending: "bg-amber-50 text-amber-700",
    refunded: "bg-rose-50 text-rose-700",
  } as const;
  return (
    <span className={`inline-flex items-center px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full text-[9px] sm:text-[11px] font-semibold shrink-0 ${map[status]}`}>
      {status[0].toUpperCase() + status.slice(1)}
    </span>
  );
}
