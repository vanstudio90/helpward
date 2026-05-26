"use client";

import { useState } from "react";
import {
  Search, SlidersHorizontal, Plus, Bell, Calendar, CreditCard, Wallet, Gift,
  Download, MoreHorizontal, ChevronDown, TrendingDown, TrendingUp, Star,
} from "lucide-react";
import { ServiceIcon } from "@/components/ServiceIcon";
import { transactions, providerById } from "@/lib/mock";
import { cn } from "@/lib/cn";

const TX_TABS = ["All Transactions", "Completed", "Pending", "Refunds", "Disputes"] as const;

const STATUS_TONE: Record<string, string> = {
  completed: "bg-emerald-50 text-emerald-700",
  pending: "bg-amber-50 text-amber-700",
  refunded: "bg-rose-50 text-rose-700",
};

export default function PaymentsPage() {
  const [tab, setTab] = useState<(typeof TX_TABS)[number]>("All Transactions");

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 lg:py-8 max-w-[1500px] mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">Payments</h1>
          <p className="text-sm text-slate-500 mt-1">Track your spending, manage payments and download receipts.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input placeholder="Search transactions, services..." className="w-full pl-9 pr-3 py-2 rounded-xl bg-white border border-slate-200 text-sm" />
          </div>
          <button className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-slate-200 text-sm">
            <SlidersHorizontal className="w-4 h-4 text-slate-500" /> Filter
          </button>
          <button className="hidden sm:inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-slate-200 text-sm">
            <Calendar className="w-4 h-4 text-slate-500" /> May 1 – May 19, 2024 <ChevronDown className="w-3 h-3 text-slate-400" />
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
          {/* Stat cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard label="Total Spent" value="$486.75" trend={{ dir: "down", text: "8.6% from Apr 1 – Apr 30" }} icon={<CreditCard className="w-5 h-5 text-brand-600" />} />
            <StatCard label="This Month" value="$246.40" sub="May 1 – May 19, 2024" icon={<MiniChart />} />
            <StatCard label="This Week" value="$98.20" sub="May 13 – May 19, 2024" icon={<MiniChart up />} />
            <StatCard label="Your Balance" value="$124.50" sub="Available credits" icon={<Wallet className="w-5 h-5 text-violet-600" />} />
          </div>

          {/* Tabs */}
          <div className="mt-6 border-b border-slate-200 flex gap-6 overflow-x-auto scrollbar-none">
            {TX_TABS.map((t) => (
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

          <div className="mt-4 rounded-2xl bg-white border border-slate-100 overflow-hidden">
            <div className="hidden md:grid grid-cols-[1.5fr_1.3fr_1.1fr_0.7fr_0.9fr_auto] gap-4 px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400 border-b border-slate-100">
              <span>Transaction</span><span>Service</span><span>Date & Time</span><span>Amount</span><span>Status</span><span></span>
            </div>
            <ul className="divide-y divide-slate-100">
              {transactions.map((t) => {
                const p = providerById(t.providerId)!;
                return (
                  <li key={t.id} className="grid md:grid-cols-[1.5fr_1.3fr_1.1fr_0.7fr_0.9fr_auto] gap-3 px-4 py-3 items-center">
                    <div className="flex items-center gap-3 min-w-0">
                      <ServiceIcon name={t.icon} />
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-slate-900 truncate">{t.service}</div>
                        <div className="text-[11px] text-slate-500 truncate">Booking #{t.bookingId}</div>
                      </div>
                    </div>
                    <div className="hidden md:flex items-center gap-2 min-w-0">
                      <img src={p.avatar} className="w-7 h-7 rounded-full" alt="" />
                      <span className="text-sm text-slate-700 truncate">{p.name}</span>
                    </div>
                    <div className="hidden md:block text-xs text-slate-600">{t.date}</div>
                    <div className="text-sm font-bold text-slate-900">${t.amount.toFixed(2)}</div>
                    <span className={cn("inline-flex w-fit items-center px-2.5 py-1 rounded-full text-[11px] font-semibold", STATUS_TONE[t.status])}>
                      {t.status[0].toUpperCase() + t.status.slice(1)}
                    </span>
                    <div className="flex items-center gap-1">
                      <button className="p-2 rounded-lg border border-slate-200"><Download className="w-3.5 h-3.5 text-slate-500" /></button>
                      <button className="p-2 rounded-lg border border-slate-200"><MoreHorizontal className="w-3.5 h-3.5 text-slate-500" /></button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="mt-6 text-center">
            <button className="inline-flex items-center gap-2 text-sm font-semibold text-brand-700 bg-white border border-slate-200 px-4 py-2 rounded-xl">
              Load More <ChevronDown className="w-3 h-3" />
            </button>
          </div>
        </section>

        <aside className="hidden lg:block space-y-4 lg:sticky lg:top-6 lg:self-start">
          <div className="rounded-2xl bg-gradient-to-br from-brand-600 to-violet-600 text-white p-5 relative overflow-hidden">
            <div className="absolute -right-6 -top-6 opacity-20">
              <Star className="w-32 h-32" />
            </div>
            <div className="text-sm/none opacity-90">Wallet Balance</div>
            <div className="mt-2 text-4xl font-bold">$124.50</div>
            <div className="text-xs opacity-90 mt-1">Available credits</div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button className="bg-white text-brand-700 text-sm font-semibold py-2 rounded-xl">Add Credits</button>
              <button className="bg-white/15 backdrop-blur text-white text-sm font-semibold py-2 rounded-xl inline-flex items-center justify-center gap-2">
                <Gift className="w-4 h-4" /> Send a Gift
              </button>
            </div>
          </div>

          <div className="rounded-2xl bg-white border border-slate-100 p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-slate-900">Payment Methods</h3>
              <a className="text-xs font-semibold text-brand-700">Manage</a>
            </div>
            <ul className="space-y-3">
              <Card label="Visa •••• 4242" sub="Expires 04/28" tag="Default" brand="VISA" tone="bg-blue-600" />
              <Card label="Mastercard •••• 8888" sub="Expires 09/26" brand="MC" tone="bg-orange-500" />
              <Card label="PayPal" sub="alex.morgan@example.com" brand="PP" tone="bg-sky-500" />
            </ul>
            <button className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-brand-700">
              <Plus className="w-3.5 h-3.5" /> Add Payment Method
            </button>
          </div>

          <div className="rounded-2xl bg-white border border-slate-100 p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-slate-900">Spending by Category</h3>
              <a className="text-xs font-semibold text-brand-700">View Report</a>
            </div>
            <div className="flex items-center gap-4">
              <Donut />
              <ul className="text-xs space-y-1.5 flex-1">
                <Legend dot="bg-brand-500" label="Transportation" value="$168.50 (34%)" />
                <Legend dot="bg-emerald-500" label="Home Services" value="$143.00 (29%)" />
                <Legend dot="bg-amber-500" label="Delivery" value="$86.75 (18%)" />
                <Legend dot="bg-rose-500" label="Errands" value="$46.50 (10%)" />
                <Legend dot="bg-slate-400" label="Other" value="$41.00 (9%)" />
              </ul>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function StatCard({
  label, value, sub, trend, icon,
}: { label: string; value: string; sub?: string; trend?: { dir: "up" | "down"; text: string }; icon: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-white border border-slate-100 p-4 sm:p-5">
      <div className="flex items-start justify-between">
        <div className="text-xs text-slate-500">{label}</div>
        <span className="w-9 h-9 inline-flex items-center justify-center rounded-xl bg-slate-50">{icon}</span>
      </div>
      <div className="mt-3 text-2xl font-bold text-slate-900">{value}</div>
      {trend && (
        <div className={cn("text-[11px] font-semibold mt-1 flex items-center gap-1", trend.dir === "down" ? "text-emerald-600" : "text-rose-600")}>
          {trend.dir === "down" ? <TrendingDown className="w-3 h-3" /> : <TrendingUp className="w-3 h-3" />}
          {trend.text}
        </div>
      )}
      {sub && <div className="text-[11px] text-slate-500 mt-1">{sub}</div>}
    </div>
  );
}

function MiniChart({ up = false }: { up?: boolean }) {
  return (
    <svg width="36" height="20" viewBox="0 0 36 20" fill="none">
      <path
        d={up ? "M2 16 L8 12 L14 14 L20 8 L26 10 L34 4" : "M2 12 L8 14 L14 8 L20 10 L26 6 L34 8"}
        stroke={up ? "#10b981" : "#6366f1"} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
      />
    </svg>
  );
}

function Card({ label, sub, tag, brand, tone }: { label: string; sub: string; tag?: string; brand: string; tone: string }) {
  return (
    <li className="flex items-center gap-3">
      <span className={cn("inline-flex w-10 h-7 rounded items-center justify-center text-white text-[10px] font-bold", tone)}>{brand}</span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-slate-900 truncate">{label} {tag && <span className="ml-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">{tag}</span>}</div>
        <div className="text-[11px] text-slate-500 truncate">{sub}</div>
      </div>
      <button className="p-2"><MoreHorizontal className="w-4 h-4 text-slate-400" /></button>
    </li>
  );
}

function Donut() {
  return (
    <div className="relative w-28 h-28 shrink-0">
      <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
        <circle cx="18" cy="18" r="14" fill="none" stroke="#f1f5f9" strokeWidth="6" />
        {[
          { offset: 0, len: 34, color: "#6366f1" },
          { offset: 34, len: 29, color: "#10b981" },
          { offset: 63, len: 18, color: "#f59e0b" },
          { offset: 81, len: 10, color: "#f43f5e" },
          { offset: 91, len: 9, color: "#94a3b8" },
        ].map((s) => (
          <circle key={s.offset} cx="18" cy="18" r="14" fill="none" stroke={s.color} strokeWidth="6"
            strokeDasharray={`${s.len * 0.88} 88`} strokeDashoffset={-s.offset * 0.88} />
        ))}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <div className="text-[10px] text-slate-500">Total</div>
        <div className="text-sm font-bold text-slate-900">$486.75</div>
      </div>
    </div>
  );
}

function Legend({ dot, label, value }: { dot: string; label: string; value: string }) {
  return (
    <li className="flex items-center gap-2">
      <span className={cn("w-2 h-2 rounded-full", dot)} />
      <span className="text-slate-600">{label}</span>
      <span className="ml-auto text-slate-900 font-semibold">{value}</span>
    </li>
  );
}
