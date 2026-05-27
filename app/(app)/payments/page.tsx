"use client";

import { useState } from "react";
import {
  Search, SlidersHorizontal, Bell, Calendar, CreditCard, Wallet, Gift,
  Download, MoreHorizontal, ChevronDown, TrendingDown, Plus, Star,
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
    <div className="px-4 lg:px-8 py-5 lg:py-8 max-w-[1500px] mx-auto">
      {/* Header */}
      <div className="mb-4 lg:mb-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold text-slate-900">Payments</h1>
            <p className="text-sm text-slate-500 mt-1">Track your spending, manage payments and download receipts.</p>
          </div>
          <div className="hidden lg:flex items-center gap-2">
            <div className="relative w-72">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input placeholder="Search transactions, services..." className="w-full pl-9 pr-3 py-2 rounded-xl bg-white border border-slate-200 text-sm" />
            </div>
            <button className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-slate-200 text-sm">
              <SlidersHorizontal className="w-4 h-4 text-slate-500" /> Filter
            </button>
            <button className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-slate-200 text-sm">
              <Calendar className="w-4 h-4 text-slate-500" /> May 1 – May 19, 2024 <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>
            <button className="relative p-2 rounded-xl bg-white border border-slate-200">
              <Bell className="w-5 h-5 text-slate-700" />
              <span className="absolute -top-1 -right-1 bg-rose-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">3</span>
            </button>
          </div>
        </div>

        {/* Mobile date range pill */}
        <button className="lg:hidden mt-4 inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-white border border-slate-200 text-sm font-medium text-slate-700">
          <Calendar className="w-4 h-4 text-slate-500" /> May 1 – May 19, 2024 <ChevronDown className="w-3 h-3 text-slate-400" />
        </button>
      </div>

      <div className="grid lg:grid-cols-[1fr_360px] xl:grid-cols-[1fr_400px] gap-6">
        <section className="space-y-5">
          {/* Stat cards — 2x2 mobile, 4-up sm+ */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="Total Spent" value="$486.75" trend={{ dir: "down", text: "8.6% vs Apr 1 – Apr 30" }} icon={<CreditCard className="w-5 h-5 text-brand-600" />} tint="bg-brand-50" />
            <StatCard label="This Month" value="$246.40" sub="May 1 – May 19" icon={<MiniChart />} tint="bg-slate-50" />
            <StatCard label="This Week" value="$98.20" sub="May 13 – May 19" icon={<MiniChart up />} tint="bg-emerald-50" />
            <StatCard label="Your Balance" value="$124.50" sub="Available credits" icon={<Wallet className="w-5 h-5 text-violet-600" />} tint="bg-violet-50" />
          </div>

          {/* Wallet Balance — prominent card */}
          <div className="rounded-2xl bg-gradient-to-br from-brand-50 to-violet-50 border border-brand-100 p-4 sm:p-5 relative overflow-hidden">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-slate-900">Wallet Balance</div>
                <div className="mt-2 text-3xl sm:text-4xl font-bold text-slate-900">$124.50</div>
                <div className="text-xs text-slate-500 mt-1">Available credits</div>
              </div>
              <WalletIllustration />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <button className="inline-flex items-center justify-center gap-2 py-2.5 rounded-xl bg-brand-600 text-white text-sm font-semibold">
                Add Credits
              </button>
              <button className="inline-flex items-center justify-center gap-2 py-2.5 rounded-xl bg-white border border-brand-200 text-brand-700 text-sm font-semibold">
                <Gift className="w-4 h-4" /> Send a Gift
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="border-b border-slate-200 flex gap-5 sm:gap-6 overflow-x-auto scrollbar-none">
            {TX_TABS.map((t) => (
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
          </div>

          {/* Transactions */}
          <ul className="rounded-2xl bg-white border border-slate-100 overflow-hidden divide-y divide-slate-100">
            {transactions.map((t) => {
              const p = providerById(t.providerId)!;
              return (
                <li key={t.id} className="p-3.5 sm:p-4 flex items-start gap-3">
                  <ServiceIcon name={t.icon} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-slate-900 truncate">{t.service}</div>
                        <div className="text-[11px] text-slate-500 truncate mt-0.5">Booking #{t.bookingId}</div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button aria-label="Download" className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-slate-50">
                          <Download className="w-3.5 h-3.5 text-slate-500" />
                        </button>
                        <button aria-label="More" className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-slate-50">
                          <MoreHorizontal className="w-4 h-4 text-slate-500" />
                        </button>
                      </div>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2 min-w-0">
                        <img src={p.avatar} className="w-6 h-6 rounded-full shrink-0" alt="" />
                        <div className="text-[11px] text-slate-500 truncate">{t.date.replace(" · ", " • ")}</div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-sm font-bold text-slate-900">${t.amount.toFixed(2)}</span>
                        <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold", STATUS_TONE[t.status])}>
                          {t.status[0].toUpperCase() + t.status.slice(1)}
                        </span>
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>

          <button className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-xl border border-brand-200 text-brand-700 text-sm font-semibold">
            Load More <ChevronDown className="w-4 h-4" />
          </button>
        </section>

        {/* Side column — payment methods, spending donut, recent receipts */}
        <aside className="space-y-4">
          {/* Payment Methods */}
          <div className="rounded-2xl bg-white border border-slate-100 p-4 sm:p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-slate-900">Payment Methods</h3>
              <a className="text-xs font-semibold text-brand-700">Manage</a>
            </div>
            <ul className="space-y-3">
              <CardRow label="Visa •••• 4242" sub="Expires 04/28" tag="Default" brand="VISA" tone="bg-blue-600" />
              <CardRow label="Mastercard •••• 8888" sub="Expires 09/26" brand="MC" tone="bg-orange-500" />
              <CardRow label="PayPal" sub="alex.morgan@exemplo.com" brand="PP" tone="bg-sky-500" />
            </ul>
            <button className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-brand-700">
              <Plus className="w-3.5 h-3.5" /> Add Payment Method
            </button>
          </div>

          {/* Spending by Category */}
          <div className="rounded-2xl bg-white border border-slate-100 p-4 sm:p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-slate-900">Spending by Category</h3>
              <a className="text-xs font-semibold text-brand-700">View Report</a>
            </div>
            <div className="flex items-center gap-4">
              <Donut />
              <ul className="text-xs space-y-1.5 flex-1 min-w-0">
                <Legend dot="bg-brand-500" label="Transportation" value="$168.50 (34%)" />
                <Legend dot="bg-emerald-500" label="Home Services" value="$143.00 (29%)" />
                <Legend dot="bg-amber-500" label="Delivery" value="$86.75 (18%)" />
                <Legend dot="bg-rose-500" label="Errands" value="$46.50 (10%)" />
                <Legend dot="bg-slate-400" label="Other" value="$41.00 (9%)" />
              </ul>
            </div>
          </div>

          {/* Recent Receipts */}
          <div className="rounded-2xl bg-white border border-slate-100 p-4 sm:p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-slate-900">Recent Receipts</h3>
              <a className="text-xs font-semibold text-brand-700">View All</a>
            </div>
            <ul className="space-y-3">
              {transactions.slice(0, 3).map((t) => (
                <li key={t.id} className="flex items-center gap-3">
                  <ServiceIcon name={t.icon} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-slate-900 truncate">{t.service}</div>
                    <div className="text-[11px] text-slate-500 truncate">{t.date.split(" · ")[0]} • ${t.amount.toFixed(2)}</div>
                  </div>
                  <button aria-label="Download" className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center">
                    <Download className="w-3.5 h-3.5 text-slate-500" />
                  </button>
                </li>
              ))}
            </ul>
            <p className="text-[11px] text-slate-500 mt-3">Receipts are available for 12 months.</p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function StatCard({
  label, value, sub, trend, icon, tint,
}: { label: string; value: string; sub?: string; trend?: { dir: "down"; text: string }; icon: React.ReactNode; tint: string }) {
  return (
    <div className="rounded-2xl bg-white border border-slate-100 p-3.5 sm:p-5 h-full flex flex-col">
      <div className="flex items-start justify-between gap-2">
        <div className="text-[11px] sm:text-xs text-slate-500 leading-tight">{label}</div>
        <span className={`inline-flex w-8 h-8 sm:w-9 sm:h-9 ${tint} rounded-lg sm:rounded-xl items-center justify-center shrink-0`}>{icon}</span>
      </div>
      <div className="mt-2 sm:mt-3 text-xl sm:text-2xl font-bold text-slate-900 leading-tight">{value}</div>
      {trend && (
        <div className="mt-1 inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 self-start px-1.5 py-0.5 rounded">
          <TrendingDown className="w-3 h-3" /> {trend.text.split(" vs")[0]}
        </div>
      )}
      {trend && (
        <div className="text-[10px] text-slate-500 mt-1">vs {trend.text.split(" vs ")[1]}</div>
      )}
      {sub && <div className="text-[10px] sm:text-[11px] text-slate-500 mt-1">{sub}</div>}
    </div>
  );
}

function MiniChart({ up = false }: { up?: boolean }) {
  return (
    <svg width="32" height="18" viewBox="0 0 36 20" fill="none">
      <path
        d={up ? "M2 16 L8 12 L14 14 L20 8 L26 10 L34 4" : "M2 12 L8 14 L14 8 L20 10 L26 6 L34 8"}
        stroke={up ? "#10b981" : "#6366f1"} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
      />
    </svg>
  );
}

function WalletIllustration() {
  return (
    <div className="relative w-20 h-20 sm:w-24 sm:h-24 shrink-0">
      <svg viewBox="0 0 80 80" className="w-full h-full">
        {/* Wallet body */}
        <rect x="10" y="28" width="56" height="42" rx="6" fill="#a5b4fc" />
        <rect x="10" y="28" width="56" height="14" rx="6" fill="#818cf8" />
        {/* Wallet flap */}
        <rect x="40" y="36" width="22" height="14" rx="3" fill="#4f46e5" />
        <circle cx="58" cy="43" r="2" fill="#fef3c7" />
        {/* Cards/stars peeking */}
        <rect x="18" y="20" width="24" height="14" rx="2" fill="#fde68a" />
        <rect x="24" y="14" width="20" height="14" rx="2" fill="#fef3c7" />
        {/* Stars */}
        <path d="M62 18 l1.5 3 l3 .4 l-2.2 2 l.6 3 l-2.8-1.5 l-2.8 1.5 l.6-3 l-2.2-2 l3-.4z" fill="#fbbf24" />
        <path d="M68 38 l1 2 l2 .3 l-1.5 1.4 l.4 2 l-1.9-1 l-1.9 1 l.4-2 l-1.5-1.4 l2-.3z" fill="#fbbf24" />
      </svg>
    </div>
  );
}

function CardRow({ label, sub, tag, brand, tone }: { label: string; sub: string; tag?: string; brand: string; tone: string }) {
  return (
    <li className="flex items-center gap-3">
      <span className={cn("inline-flex w-10 h-7 rounded items-center justify-center text-white text-[10px] font-bold shrink-0", tone)}>{brand}</span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-slate-900 truncate flex items-center gap-2 flex-wrap">
          <span className="truncate">{label}</span>
          {tag && <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full shrink-0">{tag}</span>}
        </div>
        <div className="text-[11px] text-slate-500 truncate">{sub}</div>
      </div>
      <button aria-label="More" className="p-2 -mr-2"><MoreHorizontal className="w-4 h-4 text-slate-400" /></button>
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
    <li className="flex items-center gap-2 min-w-0">
      <span className={cn("w-2 h-2 rounded-full shrink-0", dot)} />
      <span className="text-slate-600 truncate">{label}</span>
      <span className="ml-auto text-slate-900 font-semibold whitespace-nowrap text-[10px]">{value}</span>
    </li>
  );
}
