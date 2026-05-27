"use client";

import { useState } from "react";
import {
  Calendar, SlidersHorizontal, Download, ChevronDown, TrendingUp, Star,
  Clock, Users, CheckCircle2, DollarSign, ArrowUpRight, BarChart3, Car,
  Home, Box, ShoppingBag, MoreHorizontal,
} from "lucide-react";
import { cn } from "@/lib/cn";

const TABS = ["Overview", "Bookings", "Spending", "Providers", "Services"];

export default function AnalyticsPage() {
  const [tab, setTab] = useState("Overview");
  const [chartTab, setChartTab] = useState<"Daily" | "Weekly" | "Monthly">("Daily");

  return (
    <div className="px-4 lg:px-8 py-5 lg:py-8 max-w-[1500px] mx-auto">
      {/* Header */}
      <div className="mb-4 lg:mb-6">
        <h1 className="text-2xl lg:text-3xl font-bold text-slate-900">Analytics</h1>
        <p className="text-sm text-slate-500 mt-1">Track your activity, spending, and performance insights.</p>
      </div>

      {/* Action row */}
      <div className="flex flex-wrap items-center gap-2 mb-5 -mx-4 px-4 overflow-x-auto scrollbar-none">
        <button className="shrink-0 inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-white border border-slate-200 text-sm font-medium text-slate-700">
          <Calendar className="w-4 h-4 text-slate-500" /> May 1 – May 19, 2024 <ChevronDown className="w-3 h-3 text-slate-400" />
        </button>
        <button className="shrink-0 inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-white border border-slate-200 text-sm font-medium text-slate-700">
          <SlidersHorizontal className="w-4 h-4 text-slate-500" /> Filters
        </button>
        <button className="shrink-0 inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-white border border-slate-200 text-sm font-medium text-slate-700">
          <Download className="w-4 h-4 text-slate-500" /> Export
        </button>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200 flex items-center gap-5 sm:gap-6 overflow-x-auto scrollbar-none mb-5">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "shrink-0 pb-3 -mb-px text-sm border-b-2 whitespace-nowrap",
              tab === t ? "border-brand-600 text-brand-700 font-semibold" : "border-transparent text-slate-500"
            )}
          >
            {t}
          </button>
        ))}
        <button className="shrink-0 ml-auto inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-sm text-slate-700">
          More <ChevronDown className="w-3 h-3 text-slate-400" />
        </button>
      </div>

      {/* KPI grid — 2-col mobile, 3-col sm+, 6-col xl+ */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3 mb-5">
        <KPI icon={<Calendar className="w-5 h-5 text-brand-600" />} tint="bg-brand-50" label="Total Bookings" value="128" trend="18.5%" />
        <KPI icon={<DollarSign className="w-5 h-5 text-emerald-600" />} tint="bg-emerald-50" label="Total Spent" value="$2,486.75" trend="8.6%" />
        <KPI icon={<CheckCircle2 className="w-5 h-5 text-brand-600" />} tint="bg-brand-50" label="Completed Bookings" value="112" trend="20.1%" />
        <KPI icon={<Users className="w-5 h-5 text-orange-600" />} tint="bg-orange-50" label="Active Providers" value="18" trend="12.5%" />
        <KPI icon={<Star className="w-5 h-5 text-brand-600 fill-brand-600" />} tint="bg-brand-50" label="Avg. Rating" value="4.8" trend="0.3" />
        <KPI icon={<Clock className="w-5 h-5 text-violet-600" />} tint="bg-violet-50" label="Hours Saved" value="46.5 hrs" trend="15.2%" />
      </div>

      {/* Charts — stack mobile, 2-col lg+ */}
      <div className="rounded-2xl bg-white border border-slate-100 p-4 sm:p-5 mb-5">
        <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
          <h3 className="text-sm font-bold text-slate-900">Bookings &amp; Spending Over Time</h3>
          <div className="inline-flex bg-slate-100 rounded-lg p-0.5 text-xs font-semibold">
            {(["Daily", "Weekly", "Monthly"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setChartTab(t)}
                className={cn(
                  "px-3 py-1 rounded-md",
                  chartTab === t ? "bg-white text-brand-700 shadow-sm" : "text-slate-500"
                )}
              >{t}</button>
            ))}
          </div>
        </div>

        <div className="grid lg:grid-cols-2 gap-5">
          <ChartBlock label="Bookings" value="128 bookings" color="#6366f1" tooltipDate="May 19" tooltipValue="42 bookings" />
          <ChartBlock label="Spending" value="$2,486.75" color="#10b981" tooltipDate="May 19" tooltipValue="$820.20" />
        </div>
      </div>

      {/* Insights */}
      <div className="rounded-2xl bg-white border border-slate-100 p-4 sm:p-5 mb-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-slate-900">Insights</h3>
          <a className="text-xs font-semibold text-brand-700">View All</a>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <InsightCard icon={<TrendingUp className="w-4 h-4 text-emerald-600" />} tint="bg-emerald-50" title="Bookings up" big="18.5%" sub="vs last month" />
          <InsightCard icon={<BarChart3 className="w-4 h-4 text-amber-600" />} tint="bg-amber-50" title="Spending up" big="8.6%" sub="vs last month" />
          <InsightCard icon={<Clock className="w-4 h-4 text-violet-600" />} tint="bg-violet-50" title="Hours saved" big="46.5 hrs" sub="vs last month" />
          <InsightCard icon={<Star className="w-4 h-4 text-rose-500 fill-rose-500" />} tint="bg-rose-50" title="Top rated" big="James Carter" sub="4.9 stars" />
        </div>
      </div>

      {/* Bookings by Service + Top Service Categories */}
      <div className="grid lg:grid-cols-2 gap-5 mb-5">
        <PanelCard title="Bookings by Service" right={<a className="text-xs font-semibold text-brand-700">View Report</a>}>
          <div className="flex items-center gap-4">
            <Donut total="128" subtitle="Total" />
            <ul className="text-xs space-y-1.5 flex-1 min-w-0">
              <Legend dot="bg-brand-500" label="Transportation" value="45 (35.2%)" />
              <Legend dot="bg-emerald-500" label="Home Services" value="34 (26.6%)" />
              <Legend dot="bg-amber-500" label="Delivery" value="20 (15.6%)" />
              <Legend dot="bg-rose-500" label="Errands" value="16 (12.5%)" />
              <Legend dot="bg-slate-400" label="Other" value="13 (10.1%)" />
            </ul>
          </div>
        </PanelCard>

        <PanelCard title="Top Service Categories by Spending" right={<a className="text-xs font-semibold text-brand-700">View Report</a>}>
          <ul className="space-y-3 text-xs">
            <CategoryBar icon={<Car className="w-3.5 h-3.5 text-brand-600" />} tint="bg-brand-50" label="Transportation" value="$1,168.50" pct="47%" tone="bg-brand-500" />
            <CategoryBar icon={<Home className="w-3.5 h-3.5 text-emerald-600" />} tint="bg-emerald-50" label="Home Services" value="$643.20" pct="26%" tone="bg-emerald-500" />
            <CategoryBar icon={<Box className="w-3.5 h-3.5 text-amber-600" />} tint="bg-amber-50" label="Delivery" value="$362.75" pct="15%" tone="bg-amber-500" />
            <CategoryBar icon={<ShoppingBag className="w-3.5 h-3.5 text-rose-500" />} tint="bg-rose-50" label="Errands" value="$208.50" pct="8%" tone="bg-rose-500" />
            <CategoryBar icon={<MoreHorizontal className="w-3.5 h-3.5 text-slate-500" />} tint="bg-slate-100" label="Other" value="$103.80" pct="4%" tone="bg-slate-400" />
          </ul>
        </PanelCard>
      </div>

      {/* Top Providers + Booking Status */}
      <div className="grid lg:grid-cols-2 gap-5">
        <PanelCard title="Top Providers by Bookings" right={<a className="text-xs font-semibold text-brand-700">View All</a>}>
          <ul className="space-y-3 text-sm">
            {[
              ["James Carter", "Designated Driver", 32, 12],
              ["Sarah Thompson", "Grocery Pickup", 24, 47],
              ["Michael Roberts", "Furniture Assembly", 18, 33],
            ].map(([n, role, count, img]) => (
              <li key={String(n)} className="flex items-center gap-3">
                <img src={`https://i.pravatar.cc/40?img=${img}`} className="w-8 h-8 rounded-full" alt="" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold text-slate-900 truncate">{n}</div>
                  <div className="text-xs text-slate-500 truncate">{role}</div>
                </div>
                <span className="text-xs font-bold text-brand-700 bg-brand-50 rounded-full px-2.5 py-1">{count}</span>
              </li>
            ))}
          </ul>
        </PanelCard>

        <PanelCard title="Booking Status Breakdown">
          <div className="flex items-center gap-4">
            <Donut total="128" subtitle="Total" variant="status" />
            <ul className="text-xs space-y-1.5 flex-1 min-w-0">
              <Legend dot="bg-emerald-500" label="Completed" value="112 (87.5%)" />
              <Legend dot="bg-rose-500" label="Cancelled" value="8 (6.3%)" />
              <Legend dot="bg-amber-500" label="Pending" value="6 (4.7%)" />
              <Legend dot="bg-brand-500" label="In Progress" value="2 (1.5%)" />
            </ul>
          </div>
        </PanelCard>
      </div>
    </div>
  );
}

function KPI({ icon, tint, label, value, trend }: { icon: React.ReactNode; tint: string; label: string; value: string; trend: string }) {
  return (
    <div className="rounded-2xl bg-white border border-slate-100 p-3.5 sm:p-4 flex items-start gap-3">
      <span className={cn("inline-flex w-10 h-10 rounded-xl items-center justify-center shrink-0", tint)}>{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="text-[11px] text-slate-500 leading-tight">{label}</div>
        <div className="text-lg sm:text-xl font-bold text-slate-900 mt-1 leading-tight">{value}</div>
        <div className="text-[11px] font-semibold text-emerald-600 inline-flex items-center gap-0.5 mt-1">
          <ArrowUpRight className="w-3 h-3" /> {trend}
        </div>
        <div className="text-[10px] text-slate-400 mt-0.5">vs Apr 1 – Apr 30</div>
      </div>
    </div>
  );
}

function ChartBlock({ label, value, color, tooltipDate, tooltipValue }: { label: string; value: string; color: string; tooltipDate: string; tooltipValue: string }) {
  return (
    <div>
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} /> {label}
      </div>
      <div className="text-xl font-bold text-slate-900 mt-1">{value}</div>
      <div className="mt-3 relative">
        <LineChart color={color} filled />
        <div className="absolute right-[8%] -top-1 bg-white border border-slate-100 rounded-lg px-2 py-1 shadow text-[10px]">
          <div className="text-slate-500">{tooltipDate}</div>
          <div className="font-semibold text-slate-900">{tooltipValue}</div>
        </div>
      </div>
      <div className="flex justify-between text-[10px] text-slate-400 mt-1">
        <span>May 1</span><span>May 7</span><span>May 13</span><span>May 19</span>
      </div>
    </div>
  );
}

function InsightCard({ icon, tint, title, big, sub }: { icon: React.ReactNode; tint: string; title: string; big: string; sub: string }) {
  return (
    <div className="rounded-xl border border-slate-100 p-3 flex items-start gap-2.5">
      <span className={cn("w-8 h-8 rounded-lg inline-flex items-center justify-center shrink-0", tint)}>{icon}</span>
      <div className="min-w-0">
        <div className="text-[11px] text-slate-500 leading-tight">{title}</div>
        <div className="text-sm font-bold text-slate-900 leading-tight mt-0.5">{big}</div>
        <div className="text-[10px] text-slate-500 mt-0.5">{sub}</div>
      </div>
    </div>
  );
}

function PanelCard({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-white border border-slate-100 p-4 sm:p-5">
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
    <svg viewBox="0 0 100 80" preserveAspectRatio="none" className="w-full h-32">
      {filled && <path d={area} fill={`${color}22`} />}
      <path d={path} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      {points.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r="1.2" fill={color} />)}
    </svg>
  );
}

function Donut({ total, subtitle, variant }: { total: string; subtitle: string; variant?: "default" | "status" }) {
  const segments = variant === "status"
    ? [
        { offset: 0, len: 76, color: "#10b981" },
        { offset: 76, len: 6, color: "#f43f5e" },
        { offset: 82, len: 5, color: "#f59e0b" },
        { offset: 87, len: 4, color: "#6366f1" },
      ]
    : [
        { offset: 0, len: 35, color: "#6366f1" },
        { offset: 35, len: 27, color: "#10b981" },
        { offset: 62, len: 16, color: "#f59e0b" },
        { offset: 78, len: 13, color: "#f43f5e" },
        { offset: 91, len: 9, color: "#94a3b8" },
      ];
  return (
    <div className="relative w-24 h-24 sm:w-28 sm:h-28 shrink-0">
      <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
        <circle cx="18" cy="18" r="14" fill="none" stroke="#f1f5f9" strokeWidth="6" />
        {segments.map((s) => (
          <circle key={s.offset} cx="18" cy="18" r="14" fill="none" stroke={s.color} strokeWidth="6"
            strokeDasharray={`${s.len * 0.88} 88`} strokeDashoffset={-s.offset * 0.88} />
        ))}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <div className="text-base font-bold text-slate-900">{total}</div>
        <div className="text-[10px] text-slate-500">{subtitle}</div>
      </div>
    </div>
  );
}

function Legend({ dot, label, value }: { dot: string; label: string; value: string }) {
  return (
    <li className="flex items-center gap-2 min-w-0">
      <span className={cn("w-2 h-2 rounded-full shrink-0", dot)} />
      <span className="text-slate-600 truncate">{label}</span>
      <span className="ml-auto text-slate-900 font-semibold whitespace-nowrap text-[10px]">{value}</span>
    </li>
  );
}

function CategoryBar({ icon, tint, label, value, pct, tone }: { icon: React.ReactNode; tint: string; label: string; value: string; pct: string; tone: string }) {
  return (
    <li>
      <div className="flex items-center gap-2">
        <span className={cn("w-7 h-7 rounded-lg inline-flex items-center justify-center shrink-0", tint)}>{icon}</span>
        <span className="text-slate-700 text-xs flex-1 min-w-0 truncate">{label}</span>
        <span className="font-semibold text-slate-900 text-xs whitespace-nowrap">{value} <span className="text-slate-400">({pct})</span></span>
      </div>
      <div className="h-1.5 mt-1.5 ml-9 bg-slate-100 rounded-full overflow-hidden">
        <div className={cn("h-full", tone)} style={{ width: pct }} />
      </div>
    </li>
  );
}
