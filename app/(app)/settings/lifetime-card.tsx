import Link from "next/link";
import { Sparkles, DollarSign, CheckCircle2, Heart, Calendar, ArrowRight } from "lucide-react";
import { Sparkline } from "@/components/charts/Sparkline";
import type { CustomerLifetimeStats } from "@/lib/data/customer-lifetime";
import { ClientDateTime } from "@/components/ClientDateTime";

function formatMoney(cents: number): string {
  if (cents >= 100_00) return `$${Math.round(cents / 100).toLocaleString()}`;
  return `$${(cents / 100).toFixed(2)}`;
}

// Customer-side mirror of /provider/analytics — compact lifetime-stats card
// slotted on /settings. Hides itself when there's nothing to show (no
// completed bookings yet) since "0 tasks, $0 spent" reads as the empty
// state of the empty state.
export function CustomerLifetimeCard({ stats }: { stats: CustomerLifetimeStats }) {
  if (stats.completedAllTime === 0) return null;

  const weeklyValues = stats.weeklySpend.map((w) => w.spentCents);

  return (
    <section className="rounded-2xl bg-white border border-slate-100 p-4 sm:p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-bold text-slate-900 inline-flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-brand-600" /> Your Helpward
        </h2>
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Lifetime</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <Stat
          icon={<DollarSign className="w-3.5 h-3.5 text-emerald-600" />}
          tint="bg-emerald-50"
          label="Total spent"
          value={formatMoney(stats.totalSpentCents)}
          sub={`${formatMoney(stats.spent30dCents)} last 30 days`}
        />
        <Stat
          icon={<CheckCircle2 className="w-3.5 h-3.5 text-brand-600" />}
          tint="bg-brand-50"
          label="Tasks done"
          value={String(stats.completedAllTime)}
          sub={`${stats.completedLast30Days} last 30 days`}
        />
        <Stat
          icon={<Sparkles className="w-3.5 h-3.5 text-violet-600" />}
          tint="bg-violet-50"
          label="Most booked"
          value={stats.favoriteService?.title ?? "—"}
          sub={stats.favoriteService ? `${stats.favoriteService.bookings}× completed` : "—"}
          truncate
        />
        <Stat
          icon={<Heart className="w-3.5 h-3.5 text-rose-500 fill-rose-500" />}
          tint="bg-rose-50"
          label="Top helper"
          value={stats.topHelper?.fullName ?? "—"}
          sub={stats.topHelper ? `${stats.topHelper.bookings} bookings together` : "Book the same helper twice"}
          href={stats.topHelper ? `/providers/${stats.topHelper.slug ?? stats.topHelper.userId}` : undefined}
          truncate
        />
      </div>

      {stats.totalSpentCents > 0 && weeklyValues.some((v) => v > 0) && (
        <div className="rounded-xl bg-slate-50 p-3 mb-3">
          <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-1">
            Weekly spend (last 12 weeks)
          </div>
          <div className="text-emerald-600">
            <Sparkline values={weeklyValues} width={600} height={44} strokeWidth={2} ariaLabel="Weekly spend last 12 weeks" />
          </div>
        </div>
      )}

      {stats.nextScheduled && (
        <Link
          href={`/bookings/${stats.nextScheduled.id}`}
          className="flex items-center gap-3 rounded-xl border border-brand-100 bg-brand-50/40 p-3 hover:bg-brand-50 transition"
        >
          <span className="w-9 h-9 rounded-lg bg-white inline-flex items-center justify-center shrink-0">
            <Calendar className="w-4 h-4 text-brand-600" />
          </span>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-wide text-brand-700">Next scheduled</div>
            <div className="text-sm font-bold text-slate-900 truncate">{stats.nextScheduled.serviceTitle}</div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              <ClientDateTime iso={stats.nextScheduled.scheduledFor} />
            </div>
          </div>
          <ArrowRight className="w-4 h-4 text-brand-700 shrink-0" />
        </Link>
      )}
    </section>
  );
}

function Stat({
  icon, tint, label, value, sub, truncate, href,
}: {
  icon: React.ReactNode; tint: string; label: string; value: string; sub: string;
  truncate?: boolean; href?: string;
}) {
  const inner = (
    <>
      <div className="flex items-center justify-between mb-1.5">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
        <span className={`w-6 h-6 ${tint} rounded-md inline-flex items-center justify-center shrink-0`}>{icon}</span>
      </div>
      <div className={`text-sm sm:text-base font-bold text-slate-900 tabular-nums ${truncate ? "truncate" : ""}`}>{value}</div>
      <div className="text-[10px] text-slate-500 mt-0.5 truncate">{sub}</div>
    </>
  );
  if (href) {
    return (
      <Link href={href} className="block rounded-xl bg-slate-50 hover:bg-slate-100 transition p-3 min-w-0">
        {inner}
      </Link>
    );
  }
  return <div className="rounded-xl bg-slate-50 p-3 min-w-0">{inner}</div>;
}
