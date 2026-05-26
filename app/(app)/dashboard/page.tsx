import Link from "next/link";
import {
  Bell, Search, Plus, Calendar, CheckCircle2, DollarSign, Car, ShoppingBag,
  Home, Box, MessageSquare, Phone, Headphones, ChevronRight, Activity, MoreHorizontal,
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
    <div className="px-4 sm:px-6 lg:px-8 py-6 lg:py-8 max-w-[1500px] mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">Good morning, Alex! 👋</h1>
          <p className="text-sm text-slate-500 mt-1">How can we help you today?</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative flex-1 sm:flex-initial sm:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              placeholder="Search anything..."
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-white border border-slate-200 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-200"
            />
          </div>
          <button className="relative p-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50">
            <Bell className="w-5 h-5 text-slate-700" />
            <span className="absolute -top-1 -right-1 bg-rose-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">2</span>
          </button>
          <Link href="/new-request" className="hidden sm:inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800">
            <Plus className="w-4 h-4" /> New Request
          </Link>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
        <StatCard icon={<Calendar className="w-5 h-5 text-brand-600" />} tint="bg-brand-50" label="Upcoming Tasks" value={String(stats.upcoming)} cta="View all" href="/bookings" />
        <StatCard icon={<Activity className="w-5 h-5 text-amber-600" />} tint="bg-amber-50" label="In Progress" value={String(stats.inProgress)} cta="Track now" href="/bookings" />
        <StatCard icon={<CheckCircle2 className="w-5 h-5 text-emerald-600" />} tint="bg-emerald-50" label="Completed" value={String(stats.completedMonth)} cta="This month" />
        <StatCard icon={<DollarSign className="w-5 h-5 text-orange-600" />} tint="bg-orange-50" label="Total Spent" value={`$${stats.totalSpentMonth.toLocaleString()}`} cta="This month" />
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Main column */}
        <div className="lg:col-span-2 space-y-6">
          {/* In progress */}
          <section className="rounded-2xl bg-white border border-slate-100 p-5 lg:p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-bold text-slate-900">In Progress</h2>
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Live tracking
                </span>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-5">
              <div>
                <div className="text-base font-bold text-slate-900">{inProgress.service}</div>
                <div className="text-xs text-slate-500 mt-0.5">Task ID: #{inProgress.id}</div>

                <div className="flex items-center gap-3 mt-4">
                  <img src={provider.avatar} className="w-10 h-10 rounded-full" alt="" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-slate-900 truncate">
                      {provider.name} <span className="text-amber-500 ml-1">★ {provider.rating}</span>
                    </div>
                    <div className="text-xs text-slate-500">Your Tasker</div>
                  </div>
                </div>

                <dl className="mt-5 text-sm divide-y divide-slate-100 border-y border-slate-100">
                  <Row k="Estimated arrival" v="12 min" />
                  <Row k="Started" v="10:24 AM" />
                  <Row k="Address" v={inProgress.address} />
                </dl>

                <div className="flex items-center gap-2 mt-4">
                  <Link href="/messages" className="flex-1 inline-flex items-center justify-center gap-2 text-sm font-semibold text-brand-700 bg-brand-50 hover:bg-brand-100 rounded-xl py-2.5">
                    <MessageSquare className="w-4 h-4" /> Message {provider.name.split(" ")[0]}
                  </Link>
                  <button className="p-2.5 rounded-xl border border-brand-200 text-brand-700 hover:bg-brand-50">
                    <Phone className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Map */}
              <div className="relative rounded-2xl overflow-hidden bg-slate-100 min-h-[260px]">
                <MapBackdrop />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-xl shadow-lg px-3 py-2 text-xs">
                  <div className="font-bold text-slate-900">12 min away</div>
                  <div className="text-slate-500">1.2 km from you</div>
                </div>
                <div className="absolute bottom-3 right-3 bg-white rounded-full p-1 shadow">
                  <img src={provider.avatar} className="w-8 h-8 rounded-full" alt="" />
                </div>
              </div>
            </div>
          </section>

          {/* Recent tasks */}
          <section className="rounded-2xl bg-white border border-slate-100 p-5 lg:p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-slate-900">Recent Tasks</h2>
              <Link href="/bookings" className="text-sm font-semibold text-brand-700">View all</Link>
            </div>
            <ul className="divide-y divide-slate-100 -mx-2">
              {recent.map((t) => {
                const p = providerById(t.providerId)!;
                return (
                  <li key={t.id} className="flex items-center gap-3 px-2 py-3">
                    <ServiceIcon name={t.icon} />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-slate-900 truncate">{t.service}</div>
                      <div className="text-xs text-slate-500">{t.date}</div>
                    </div>
                    <div className="hidden sm:flex items-center gap-2">
                      <img src={p.avatar} className="w-7 h-7 rounded-full" alt="" />
                      <span className="text-sm text-slate-700">{p.name.split(" ")[0]} {p.name.split(" ")[1]?.[0]}.</span>
                    </div>
                    <StatusBadge status={t.status} />
                    <div className="text-sm font-semibold text-slate-900 w-16 text-right">${t.amount.toFixed(2)}</div>
                    <ChevronRight className="w-4 h-4 text-slate-300 hidden sm:block" />
                  </li>
                );
              })}
            </ul>
          </section>
        </div>

        {/* Side column */}
        <div className="space-y-6">
          <section className="rounded-2xl bg-white border border-slate-100 p-5">
            <h3 className="text-sm font-bold text-slate-900 mb-3">Quick Request</h3>
            <div className="grid grid-cols-3 gap-3">
              <Quick icon={<Car className="w-5 h-5 text-brand-600" />} tint="bg-brand-50" label="Ride / Driver" />
              <Quick icon={<ShoppingBag className="w-5 h-5 text-emerald-600" />} tint="bg-emerald-50" label="Errand" />
              <Quick icon={<Home className="w-5 h-5 text-brand-600" />} tint="bg-brand-50" label="Home Help" />
              <Quick icon={<Box className="w-5 h-5 text-amber-600" />} tint="bg-amber-50" label="Move / Lift" />
              <Quick icon={<Calendar className="w-5 h-5 text-brand-600" />} tint="bg-brand-50" label="Wait in Line" />
              <Quick icon={<MoreHorizontal className="w-5 h-5 text-slate-500" />} tint="bg-slate-100" label="More" />
            </div>
          </section>

          <section className="rounded-2xl bg-white border border-slate-100 p-5">
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

          <section className="rounded-2xl bg-white border border-slate-100 p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-slate-900">Recent Activity</h3>
              <Link href="#" className="text-xs font-semibold text-brand-700">View all</Link>
            </div>
            <ul className="space-y-3 text-sm">
              <Activity2 icon={<CheckCircle2 className="w-4 h-4 text-emerald-600" />} text='Your task "Furniture assembly" is in progress.' time="10 min ago" />
              <Activity2 icon={<img src="https://i.pravatar.cc/30?img=12" className="w-5 h-5 rounded-full" alt="" />} text="James Carter started working on your task." time="12 min ago" />
              <Activity2 icon={<DollarSign className="w-4 h-4 text-emerald-600" />} text="Payment of $48.50 was successful." time="11:42 PM" />
              <Activity2 icon={<img src="https://i.pravatar.cc/30?img=47" className="w-5 h-5 rounded-full" alt="" />} text="Sarah T. completed your grocery pickup." time="6:45 PM" />
            </ul>
          </section>

          <section className="rounded-2xl bg-slate-900 text-white p-5 relative overflow-hidden">
            <Headphones className="absolute right-3 top-3 w-16 h-16 text-slate-700/40" />
            <h3 className="text-sm font-bold">Need help?</h3>
            <p className="text-xs text-slate-300 mt-1">Our support team is available 24/7.</p>
            <button className="mt-4 inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-white text-slate-900 text-xs font-semibold">
              <MessageSquare className="w-4 h-4" /> Contact Support
            </button>
          </section>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon, tint, label, value, cta, href,
}: { icon: React.ReactNode; tint: string; label: string; value: string; cta: string; href?: string }) {
  const inner = (
    <div className="rounded-2xl bg-white border border-slate-100 p-4 sm:p-5 flex flex-col gap-3 hover:border-slate-200 hover:-translate-y-0.5 transition">
      <div className="flex items-start justify-between">
        <div className="text-xs text-slate-500">{label}</div>
        <span className={`inline-flex w-9 h-9 ${tint} rounded-xl items-center justify-center`}>{icon}</span>
      </div>
      <div className="text-2xl sm:text-3xl font-bold text-slate-900">{value}</div>
      <div className="text-xs font-semibold text-brand-700">{cta} {href && "→"}</div>
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-start justify-between py-2.5 gap-3">
      <dt className="text-slate-500">{k}</dt>
      <dd className="text-slate-900 font-medium text-right">{v}</dd>
    </div>
  );
}

function Quick({ icon, tint, label }: { icon: React.ReactNode; tint: string; label: string }) {
  return (
    <Link href="/new-request" className="flex flex-col items-center gap-2 p-2 rounded-xl hover:bg-slate-50">
      <span className={`inline-flex w-11 h-11 ${tint} rounded-xl items-center justify-center`}>{icon}</span>
      <span className="text-[11px] text-center font-medium text-slate-700">{label}</span>
    </Link>
  );
}

function Activity2({ icon, text, time }: { icon: React.ReactNode; text: string; time: string }) {
  return (
    <li className="flex items-start gap-3">
      <span className="w-7 h-7 rounded-full bg-slate-50 flex items-center justify-center mt-0.5">{icon}</span>
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
    <span className={`hidden sm:inline-flex items-center px-2 py-1 rounded-full text-[11px] font-semibold ${map[status]}`}>
      {status[0].toUpperCase() + status.slice(1)}
    </span>
  );
}
