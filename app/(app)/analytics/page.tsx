"use client";

import { useState } from "react";
import {
  Calendar, SlidersHorizontal, Download, ChevronDown, TrendingUp, Star,
  Clock, Users, CheckCircle2, DollarSign, ArrowUpRight,
} from "lucide-react";
import { cn } from "@/lib/cn";

const TABS = ["Overview", "Bookings", "Spending", "Providers", "Services", "Locations", "Time Trends", "Customer Satisfaction"];

export default function AnalyticsPage() {
  const [tab, setTab] = useState("Overview");

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 lg:py-8 max-w-[1500px] mx-auto">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">Analytics</h1>
          <p className="text-sm text-slate-500 mt-1">Track your activity, spending, and performance insights.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-slate-200 text-sm">
            <Calendar className="w-4 h-4 text-slate-500" /> May 1 – May 19, 2024 <ChevronDown className="w-3 h-3 text-slate-400" />
          </button>
          <button className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-slate-200 text-sm">
            <SlidersHorizontal className="w-4 h-4 text-slate-500" /> Filters
          </button>
          <button className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold">
            <Download className="w-4 h-4" /> Export Report
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200 flex gap-6 overflow-x-auto scrollbar-none">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "shrink-0 pb-3 -mb-px text-sm border-b-2",
              tab === t ? "border-brand-600 text-brand-700 font-semibold" : "border-transparent text-slate-500"
            )}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="mt-6 grid lg:grid-cols-[1fr_320px] gap-6">
        <section className="space-y-6">
          {/* KPI cards */}
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
            <KPI label="Total Bookings" value="128" icon={<Calendar className="w-5 h-5 text-brand-600" />} tint="bg-brand-50" trend="↑ 18.5%" />
            <KPI label="Total Spent" value="$2,486.75" icon={<DollarSign className="w-5 h-5 text-emerald-600" />} tint="bg-emerald-50" trend="↑ 8.6%" />
            <KPI label="Completed Bookings" value="112" icon={<CheckCircle2 className="w-5 h-5 text-emerald-600" />} tint="bg-emerald-50" trend="↑ 20.1%" />
            <KPI label="Active Providers" value="18" icon={<Users className="w-5 h-5 text-amber-600" />} tint="bg-amber-50" trend="↑ 12.5%" />
            <KPI label="Avg. Rating" value="4.8" icon={<Star className="w-5 h-5 text-violet-600" />} tint="bg-violet-50" trend="↑ 0.3" />
            <KPI label="Hours Saved" value="46.5 hrs" icon={<Clock className="w-5 h-5 text-brand-600" />} tint="bg-brand-50" trend="↑ 15.2%" />
          </div>

          {/* Charts row */}
          <div className="grid md:grid-cols-2 gap-4">
            <ChartCard title="Bookings Over Time" subtitle="Daily">
              <LineChart color="#6366f1" />
            </ChartCard>
            <ChartCard title="Spending Over Time" subtitle="Daily">
              <LineChart color="#10b981" filled />
            </ChartCard>
          </div>

          {/* Bottom panels */}
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            <PanelCard title="Bookings by Service">
              <div className="flex items-center gap-4">
                <Donut total="128" />
                <ul className="text-xs space-y-1.5 flex-1">
                  <Legend dot="bg-brand-500" label="Transportation" value="45 (35.2%)" />
                  <Legend dot="bg-emerald-500" label="Home Services" value="34 (26.6%)" />
                  <Legend dot="bg-amber-500" label="Delivery" value="20 (15.6%)" />
                  <Legend dot="bg-rose-500" label="Errands" value="16 (12.5%)" />
                  <Legend dot="bg-slate-400" label="Other" value="13 (10.1%)" />
                </ul>
              </div>
            </PanelCard>

            <PanelCard title="Top Service Categories by Spending">
              <ul className="space-y-3 text-xs">
                <Bar label="Transportation" value="$1,168.50" pct="47%" tone="bg-brand-500" />
                <Bar label="Home Services" value="$643.20" pct="26%" tone="bg-emerald-500" />
                <Bar label="Delivery" value="$362.75" pct="15%" tone="bg-amber-500" />
                <Bar label="Errands" value="$208.50" pct="8%" tone="bg-rose-500" />
                <Bar label="Other" value="$103.80" pct="4%" tone="bg-slate-400" />
              </ul>
            </PanelCard>

            <PanelCard title="Top Providers by Bookings">
              <ul className="space-y-3 text-sm">
                {[
                  ["James Carter", "Designated Driver", 32, 12],
                  ["Sarah Thompson", "Grocery Pickup", 24, 47],
                  ["Michael Lee", "Furniture Assembly", 18, 33],
                  ["David Park", "Moving Help", 15, 15],
                  ["Emma Wilson", "House Cleaning", 12, 45],
                ].map(([n, role, count, img]) => (
                  <li key={String(n)} className="flex items-center gap-3">
                    <img src={`https://i.pravatar.cc/40?img=${img}`} className="w-8 h-8 rounded-full" alt="" />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-slate-900 truncate">{n}</div>
                      <div className="text-xs text-slate-500 truncate">{role}</div>
                    </div>
                    <span className="text-xs font-bold text-slate-900 bg-slate-100 rounded-full px-2 py-1">{count}</span>
                  </li>
                ))}
              </ul>
            </PanelCard>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <PanelCard title="Spending by Payment Method">
              <div className="flex items-center gap-4">
                <Donut total="$2,486.75" small />
                <ul className="text-xs space-y-2 flex-1">
                  <Legend dot="bg-blue-500" label="Visa •••• 4242" value="$1,242.50 (50%)" />
                  <Legend dot="bg-orange-500" label="Mastercard •••• 8888" value="$746.00 (30%)" />
                  <Legend dot="bg-sky-500" label="PayPal" value="$348.75 (14%)" />
                  <Legend dot="bg-emerald-500" label="Credits" value="$149.50 (6%)" />
                </ul>
              </div>
            </PanelCard>
            <PanelCard title="Booking Status Breakdown">
              <div className="flex items-center gap-4">
                <Donut total="128" />
                <ul className="text-xs space-y-1.5 flex-1">
                  <Legend dot="bg-emerald-500" label="Completed" value="112 (87.5%)" />
                  <Legend dot="bg-rose-500" label="Cancelled" value="8 (6.3%)" />
                  <Legend dot="bg-amber-500" label="Pending" value="6 (4.7%)" />
                  <Legend dot="bg-brand-500" label="In Progress" value="2 (1.5%)" />
                </ul>
              </div>
            </PanelCard>
          </div>
        </section>

        <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <PanelCard title="Insights" right={<a className="text-xs font-semibold text-brand-700">View All</a>}>
            <ul className="space-y-3 text-sm">
              <Insight icon={<TrendingUp className="w-4 h-4 text-brand-600" />} title="Your bookings are up 18.5%" sub="Nice! You've completed 20 more bookings compared to last month." />
              <Insight icon={<DollarSign className="w-4 h-4 text-emerald-600" />} title="Spending is up 8.6%" sub="You spent $198.24 more than Apr 1 – Apr 30." />
              <Insight icon={<Clock className="w-4 h-4 text-brand-600" />} title="You saved 46.5 hours" sub="That's 15.2% more time saved compared to last month." />
              <Insight icon={<Star className="w-4 h-4 text-violet-600" />} title="Top rated provider" sub="James Carter has the highest rating with 4.9 stars." />
            </ul>
          </PanelCard>

          <PanelCard title="Customer Satisfaction" right={<a className="text-xs font-semibold text-brand-700">View Report</a>}>
            <div className="flex items-baseline gap-2">
              <div className="text-3xl font-bold">4.8</div>
              <div className="text-amber-500">★★★★★</div>
            </div>
            <div className="text-xs text-slate-500 mt-1">Based on 1,248 reviews</div>
            <ul className="mt-3 space-y-2 text-xs">
              {[["5", 78], ["4", 16], ["3", 4], ["2", 1], ["1", 1]].map(([s, pct]) => (
                <li key={s as string} className="flex items-center gap-2">
                  <span className="w-2 text-slate-500">{s}</span>
                  <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-brand-500" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="w-8 text-right text-slate-600">{pct}%</span>
                </li>
              ))}
            </ul>
          </PanelCard>

          <PanelCard title="Top Locations" right={<a className="text-xs font-semibold text-brand-700">View Report</a>}>
            <ul className="space-y-2 text-xs">
              {[["Downtown, Vancouver", 45], ["Yaletown, Vancouver", 25], ["Burnaby, BC", 15], ["Richmond, BC", 10], ["Other Areas", 5]].map(([n, p]) => (
                <li key={n as string}>
                  <div className="flex justify-between text-slate-700"><span>{n}</span><span className="font-semibold">{p}%</span></div>
                  <div className="h-1.5 mt-1 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-brand-500" style={{ width: `${p}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          </PanelCard>
        </aside>
      </div>
    </div>
  );
}

function KPI({ label, value, icon, tint, trend }: { label: string; value: string; icon: React.ReactNode; tint: string; trend: string }) {
  return (
    <div className="rounded-2xl bg-white border border-slate-100 p-4">
      <div className="flex items-start justify-between">
        <span className={cn("inline-flex w-9 h-9 rounded-xl items-center justify-center", tint)}>{icon}</span>
        <span className="text-[11px] font-semibold text-emerald-600 inline-flex items-center gap-0.5">
          <ArrowUpRight className="w-3 h-3" /> {trend}
        </span>
      </div>
      <div className="mt-3 text-xl font-bold text-slate-900">{value}</div>
      <div className="text-[11px] text-slate-500 mt-1">{label}</div>
      <div className="text-[10px] text-slate-400 mt-1">vs Apr 1 – Apr 30</div>
    </div>
  );
}

function ChartCard({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-white border border-slate-100 p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-slate-900">{title}</h3>
        <button className="inline-flex items-center gap-1 text-xs text-slate-500 border border-slate-200 px-2 py-1 rounded-md">
          {subtitle} <ChevronDown className="w-3 h-3" />
        </button>
      </div>
      {children}
    </div>
  );
}

function PanelCard({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-white border border-slate-100 p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-slate-900">{title}</h3>
        {right}
      </div>
      {children}
    </div>
  );
}

function LineChart({ color, filled }: { color: string; filled?: boolean }) {
  const points = [
    [0, 70], [10, 60], [20, 55], [30, 65], [40, 45], [50, 40], [60, 50], [70, 35], [80, 30], [90, 25], [100, 20],
  ];
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p[0]} ${p[1]}`).join(" ");
  const area = `${path} L 100 100 L 0 100 Z`;
  return (
    <svg viewBox="0 0 100 80" className="w-full h-40">
      {filled && <path d={area} fill={`${color}22`} />}
      <path d={path} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      {points.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r="1.2" fill={color} />)}
    </svg>
  );
}

function Donut({ total, small }: { total: string; small?: boolean }) {
  const size = small ? "w-20 h-20" : "w-24 h-24";
  return (
    <div className={`relative ${size} shrink-0`}>
      <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
        <circle cx="18" cy="18" r="14" fill="none" stroke="#f1f5f9" strokeWidth="5" />
        {[
          { offset: 0, len: 35, color: "#6366f1" },
          { offset: 35, len: 27, color: "#10b981" },
          { offset: 62, len: 16, color: "#f59e0b" },
          { offset: 78, len: 13, color: "#f43f5e" },
          { offset: 91, len: 9, color: "#94a3b8" },
        ].map((s) => (
          <circle key={s.offset} cx="18" cy="18" r="14" fill="none" stroke={s.color} strokeWidth="5"
            strokeDasharray={`${s.len * 0.88} 88`} strokeDashoffset={-s.offset * 0.88} />
        ))}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <div className="text-xs font-bold text-slate-900">{total}</div>
        <div className="text-[9px] text-slate-500">Total</div>
      </div>
    </div>
  );
}

function Legend({ dot, label, value }: { dot: string; label: string; value: string }) {
  return (
    <li className="flex items-center gap-2">
      <span className={cn("w-2 h-2 rounded-full", dot)} />
      <span className="text-slate-600 truncate">{label}</span>
      <span className="ml-auto text-slate-900 font-semibold whitespace-nowrap">{value}</span>
    </li>
  );
}

function Bar({ label, value, pct, tone }: { label: string; value: string; pct: string; tone: string }) {
  return (
    <li>
      <div className="flex justify-between text-slate-700"><span>{label}</span><span className="font-semibold">{value} <span className="text-slate-400">({pct})</span></span></div>
      <div className="h-1.5 mt-1 bg-slate-100 rounded-full overflow-hidden">
        <div className={cn("h-full", tone)} style={{ width: pct }} />
      </div>
    </li>
  );
}

function Insight({ icon, title, sub }: { icon: React.ReactNode; title: string; sub: string }) {
  return (
    <li className="flex items-start gap-3">
      <span className="w-8 h-8 rounded-lg bg-slate-50 inline-flex items-center justify-center shrink-0">{icon}</span>
      <div className="min-w-0">
        <div className="text-sm font-semibold text-slate-900">{title}</div>
        <div className="text-xs text-slate-500 mt-0.5">{sub}</div>
      </div>
    </li>
  );
}
