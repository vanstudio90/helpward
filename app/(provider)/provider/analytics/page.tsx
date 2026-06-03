import {
  BarChart3, DollarSign, CheckCircle2, Star, TrendingUp, Users, ZapOff, Clock,
  Download,
} from "lucide-react";
import { getHelperAnalytics } from "@/lib/data/helper-analytics";
import { Sparkline } from "@/components/charts/Sparkline";

export const dynamic = "force-dynamic";

function formatMoney(cents: number): string {
  if (cents >= 100_00) return `$${Math.round(cents / 100).toLocaleString()}`;
  return `$${(cents / 100).toFixed(2)}`;
}

export default async function HelperAnalyticsPage() {
  const a = await getHelperAnalytics();
  if (!a) return null;

  const weeklyCounts = a.weeklyBookings.map((w) => w.count);
  const weeklyPayouts = a.weeklyBookings.map((w) => w.payoutCents);
  const lastWeek = a.weeklyBookings[a.weeklyBookings.length - 1];
  const prevWeek = a.weeklyBookings[a.weeklyBookings.length - 2];
  const weekDelta = prevWeek && lastWeek
    ? lastWeek.count - prevWeek.count
    : 0;

  // Hour-of-day peak: find the hour bucket with the most offers, for the
  // copy under the histogram. UTC since the histogram itself doesn't know
  // the helper's local timezone (Vercel runs UTC).
  const peakHour = a.hourHistogram.reduce(
    (best, cur) => cur.count > best.count ? cur : best,
    { hour: 0, count: 0 },
  );
  const histMax = Math.max(...a.hourHistogram.map((h) => h.count), 1);

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 lg:py-8 max-w-5xl mx-auto pb-12">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 inline-flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-brand-600" /> Analytics
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            How your work has been going over the last 12 weeks. Numbers update on every page load.
          </p>
        </div>
        <a
          href="/api/provider/export/bookings?days=90"
          download
          className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50"
          title="Download the last 90 days of bookings as CSV — accountant-ready"
        >
          <Download className="w-3.5 h-3.5" /> Export 90-day CSV
        </a>
      </div>
      <div className="mb-6" />

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <Kpi
          icon={<DollarSign className="w-4 h-4 text-emerald-600" />}
          tint="bg-emerald-50"
          label="Lifetime earnings"
          value={formatMoney(a.kpis.lifetimeEarningsCents)}
          sub={`${formatMoney(a.kpis.earningsLast30DaysCents)} last 30 days`}
        />
        <Kpi
          icon={<CheckCircle2 className="w-4 h-4 text-brand-600" />}
          tint="bg-brand-50"
          label="Completed tasks"
          value={String(a.kpis.completedAllTime)}
          sub={`${a.kpis.completedLast30Days} last 30 days`}
        />
        <Kpi
          icon={<Star className="w-4 h-4 text-amber-500" />}
          tint="bg-amber-50"
          label="Avg rating"
          value={a.kpis.averageRating != null ? a.kpis.averageRating.toFixed(1) : "—"}
          sub={a.kpis.averageRating != null ? "Across all reviews" : "Awaiting first review"}
        />
        <Kpi
          icon={<TrendingUp className="w-4 h-4 text-violet-600" />}
          tint="bg-violet-50"
          label="Acceptance rate"
          value={a.kpis.acceptanceRatePct != null ? `${a.kpis.acceptanceRatePct}%` : "—"}
          sub={a.kpis.acceptanceRatePct != null ? "Of offers in last 12 weeks" : "Needs 5+ offers"}
        />
      </div>

      {/* Bookings sparkline + repeat-customer card */}
      <div className="grid lg:grid-cols-3 gap-4 mb-6">
        <section className="lg:col-span-2 rounded-2xl bg-white border border-slate-100 p-5">
          <div className="flex items-start justify-between mb-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900 inline-flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-brand-600" /> Bookings per week
              </h2>
              <div className="text-xs text-slate-500 mt-0.5">Last 12 weeks</div>
            </div>
            {prevWeek && (
              <div className="text-right">
                <div className={`text-xs font-bold ${
                  weekDelta > 0 ? "text-emerald-700"
                  : weekDelta < 0 ? "text-rose-700" : "text-slate-500"
                }`}>
                  {weekDelta > 0 ? "+" : ""}{weekDelta} vs prior week
                </div>
                <div className="text-[11px] text-slate-500">{lastWeek?.count ?? 0} this week</div>
              </div>
            )}
          </div>
          <div className="text-emerald-600">
            <Sparkline values={weeklyCounts} width={640} height={80} strokeWidth={2} ariaLabel="Bookings per week, last 12 weeks" />
          </div>
          <div className="mt-3 text-violet-600">
            <Sparkline values={weeklyPayouts} width={640} height={48} strokeWidth={2} ariaLabel="Payout per week, last 12 weeks" color="#7c3aed" />
          </div>
          <p className="text-[11px] text-slate-500 mt-2">
            Top line: booking count. Bottom: payout dollars (mirrors count when prices are stable; diverges when you take more or fewer high-ticket tasks).
          </p>
        </section>

        <section className="rounded-2xl bg-white border border-slate-100 p-5">
          <h2 className="text-sm font-bold text-slate-900 inline-flex items-center gap-2 mb-3">
            <Users className="w-4 h-4 text-rose-600" /> Repeat customers
          </h2>
          {a.kpis.repeatCustomerRatePct != null ? (
            <>
              <div className="text-3xl font-bold text-slate-900">{a.kpis.repeatCustomerRatePct}%</div>
              <p className="text-xs text-slate-500 mt-1 leading-snug">
                of your completed bookings are from customers who&apos;ve hired you more than once.
              </p>
              <p className="text-[11px] text-slate-500 mt-2 leading-snug">
                {a.kpis.repeatCustomerRatePct >= 30
                  ? "Strong loyalty — customers like working with you and come back."
                  : "Solid baseline. Saving favorites + portfolio photos tends to lift this."}
              </p>
            </>
          ) : (
            <p className="text-xs text-slate-500 leading-snug">
              We start showing repeat-customer rate after 5 completed bookings — gives us enough signal to draw a meaningful line.
            </p>
          )}
        </section>
      </div>

      {/* Top services */}
      <section className="rounded-2xl bg-white border border-slate-100 p-5 mb-6">
        <h2 className="text-sm font-bold text-slate-900 inline-flex items-center gap-2 mb-3">
          <BarChart3 className="w-4 h-4 text-brand-600" /> Top services by payout
        </h2>
        {a.topServices.length === 0 ? (
          <p className="text-xs text-slate-500 italic py-2">No completed services yet.</p>
        ) : (
          <ul className="space-y-2">
            {a.topServices.map((s) => {
              const pct = a.topServices[0].payoutCents > 0
                ? Math.round((s.payoutCents / a.topServices[0].payoutCents) * 100)
                : 0;
              return (
                <li key={s.serviceTitle} className="grid grid-cols-[1fr_auto_auto] gap-3 items-center">
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-slate-900 truncate">{s.serviceTitle}</div>
                    <div className="relative h-2 mt-1.5 rounded-full bg-slate-100 overflow-hidden">
                      <div className="absolute inset-y-0 left-0 bg-brand-500 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                  <div className="text-xs font-bold text-slate-900 tabular-nums">{formatMoney(s.payoutCents)}</div>
                  <div className="text-[11px] text-slate-500 tabular-nums w-10 text-right">{s.bookings}×</div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Hour-of-day */}
      <section className="rounded-2xl bg-white border border-slate-100 p-5 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-slate-900 inline-flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-600" /> When offers come in
          </h2>
          <span className="text-[10px] font-semibold text-slate-400 uppercase" title={a.timezone}>
            {a.timezone === "UTC" ? "UTC" : `${a.timezone.split("/").slice(-1)[0].replace(/_/g, " ")} time`}
          </span>
        </div>
        {peakHour.count === 0 ? (
          <p className="text-xs text-slate-500 italic py-2">
            No offers received yet — toggle yourself online from Active task to start receiving them.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-24 gap-0.5 h-20 items-end" style={{ gridTemplateColumns: "repeat(24, 1fr)" }}>
              {a.hourHistogram.map((h) => {
                const pct = (h.count / histMax) * 100;
                return (
                  <div key={h.hour} className="relative h-full flex items-end" title={`${h.hour}:00 — ${h.count} offer${h.count === 1 ? "" : "s"}`}>
                    <div
                      className={h.hour === peakHour.hour ? "bg-amber-500 rounded-sm w-full" : "bg-amber-200 rounded-sm w-full"}
                      style={{ height: `${pct}%` }}
                    />
                  </div>
                );
              })}
            </div>
            <div className="grid mt-1 text-[9px] text-slate-400" style={{ gridTemplateColumns: "repeat(24, 1fr)" }}>
              {a.hourHistogram.map((h) => (
                <div key={h.hour} className="text-center">{h.hour % 6 === 0 ? h.hour : ""}</div>
              ))}
            </div>
            <p className="text-[11px] text-slate-500 mt-2 leading-snug">
              Peak offer hour: <strong>{peakHour.hour}:00 {a.timezone === "UTC" ? "UTC" : "local"}</strong> ({peakHour.count} offer{peakHour.count === 1 ? "" : "s"} in the last 12 weeks). Aligning your schedule to overlap these hours raises your offer flow.
            </p>
          </>
        )}
      </section>

      {a.kpis.completedAllTime === 0 && (
        <div className="rounded-2xl bg-amber-50 border border-amber-200 p-4 flex items-start gap-3">
          <ZapOff className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
          <div className="text-xs text-amber-900 leading-relaxed">
            <strong>No completed tasks yet.</strong> Once you wrap your first booking, this page fills in
            with real numbers. Toggle online from <a href="/provider/active" className="font-semibold underline">Active task</a> to start receiving offers.
          </div>
        </div>
      )}
    </div>
  );
}

function Kpi({
  icon, tint, label, value, sub,
}: { icon: React.ReactNode; tint: string; label: string; value: string; sub: string }) {
  return (
    <div className="rounded-2xl bg-white border border-slate-100 p-4">
      <div className="flex items-start justify-between mb-2">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
        <span className={`w-7 h-7 ${tint} rounded-lg inline-flex items-center justify-center shrink-0`}>{icon}</span>
      </div>
      <div className="text-xl sm:text-2xl font-bold text-slate-900 tabular-nums">{value}</div>
      <div className="text-[11px] text-slate-500 mt-0.5 truncate">{sub}</div>
    </div>
  );
}
