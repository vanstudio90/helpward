import Link from "next/link";
import {
  Users, Calendar, AlertOctagon, DollarSign, ShieldCheck, TrendingUp, TrendingDown,
  ArrowRight, Activity, Sparkles, MessageSquare, UserPlus,
} from "lucide-react";
import {
  getBookingsSeries, getDisputesSeries, getSignupsSeries,
  rollupKPI, getSnapshot, getTopServices, getDisputeBreakdown,
  getHelperFunnel, getRecentEvents,
} from "@/lib/data/admin-analytics";
import { Sparkline } from "@/components/charts/Sparkline";
import { LineChart } from "@/components/charts/LineChart";
import { StackedBars } from "@/components/charts/StackedBars";
import { ClientDateTime } from "@/components/ClientDateTime";

// Dynamic so admins always see fresh numbers — no ISR on this surface.
export const dynamic = "force-dynamic";

const DAYS = 30;

// Dispute-category palette — keeps tones consistent across the breakdown
// chart, the top-list, and any future per-category drill-down.
const CATEGORY_COLOR: Record<string, string> = {
  no_show: "#f59e0b",
  quality: "#f97316",
  damage: "#e11d48",
  billing: "#0ea5e9",
  safety: "#dc2626",
  other: "#64748b",
};

const CATEGORY_LABEL: Record<string, string> = {
  no_show: "No-show", quality: "Quality", damage: "Damage",
  billing: "Billing", safety: "Safety", other: "Other",
};

export default async function AdminOverviewPage() {
  const [
    bookings, disputes, signups, snapshot,
    topServices, disputeBreakdown, funnel, events,
  ] = await Promise.all([
    getBookingsSeries(DAYS),
    getDisputesSeries(DAYS),
    getSignupsSeries(DAYS),
    getSnapshot(),
    getTopServices(7),
    getDisputeBreakdown(DAYS),
    getHelperFunnel(),
    getRecentEvents(10),
  ]);

  const bookingsKPI = rollupKPI(bookings);
  const gmvKPI = rollupKPI(bookings, /* useSumCents */ true);
  const disputesKPI = rollupKPI(disputes);
  const customerSignupsKPI = rollupKPI(signups.customers);
  const helperSignupsKPI = rollupKPI(signups.providers);

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 lg:py-8 max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="flex items-end justify-between gap-3 mb-6 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">Overview</h1>
          <p className="text-sm text-slate-500 mt-1">
            Marketplace pulse across the last {DAYS} days.
          </p>
        </div>
        <div className="text-[11px] text-slate-400">
          Live snapshot · refreshes on reload
        </div>
      </div>

      {/* Tier-1 KPI row — the six numbers an operator looks at daily */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 mb-6">
        <KPI
          tone="bg-brand-50 text-brand-600"
          icon={<Calendar className="w-4 h-4" />}
          label={`Bookings · ${DAYS}d`}
          value={bookingsKPI.total.toLocaleString()}
          delta={bookingsKPI.deltaVsPrev}
          sparkValues={bookingsKPI.values}
          sparkColor="#4f46e5"
          href="/admin/bookings"
        />
        <KPI
          tone="bg-emerald-50 text-emerald-600"
          icon={<DollarSign className="w-4 h-4" />}
          label={`GMV · ${DAYS}d`}
          value={formatCurrencyShort(gmvKPI.total)}
          delta={gmvKPI.deltaVsPrev}
          sparkValues={gmvKPI.values}
          sparkColor="#059669"
          href="/admin/bookings"
        />
        <KPI
          tone="bg-rose-50 text-rose-600"
          icon={<AlertOctagon className="w-4 h-4" />}
          label={`Disputes · ${DAYS}d`}
          value={disputesKPI.total.toLocaleString()}
          delta={disputesKPI.deltaVsPrev}
          deltaPolarity="lower-is-better"
          sparkValues={disputesKPI.values}
          sparkColor="#e11d48"
          href="/admin/disputes"
        />
        <KPI
          tone="bg-amber-50 text-amber-600"
          icon={<UserPlus className="w-4 h-4" />}
          label={`Customer signups · ${DAYS}d`}
          value={customerSignupsKPI.total.toLocaleString()}
          delta={customerSignupsKPI.deltaVsPrev}
          sparkValues={customerSignupsKPI.values}
          sparkColor="#d97706"
          href="/admin/users"
        />
        <KPI
          tone="bg-violet-50 text-violet-600"
          icon={<ShieldCheck className="w-4 h-4" />}
          label={`Helper signups · ${DAYS}d`}
          value={helperSignupsKPI.total.toLocaleString()}
          delta={helperSignupsKPI.deltaVsPrev}
          sparkValues={helperSignupsKPI.values}
          sparkColor="#7c3aed"
          href="/admin/providers"
        />
        <KPI
          tone="bg-slate-100 text-slate-600"
          icon={<Activity className="w-4 h-4" />}
          label="Active right now"
          value={(snapshot.activeBookings + snapshot.scheduledBookings).toLocaleString()}
          sub={`${snapshot.activeBookings} in progress · ${snapshot.scheduledBookings} scheduled`}
          href="/admin/bookings"
        />
      </div>

      {/* Tier-2 attention strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        <Attention
          icon={<AlertOctagon className="w-4 h-4 text-rose-600" />}
          label="Open disputes"
          value={snapshot.openDisputes}
          warn={snapshot.unresolved24h > 0 ? `${snapshot.unresolved24h} unresolved >24h — check disputes queue` : undefined}
          href="/admin/disputes"
        />
        <Attention
          icon={<ShieldCheck className="w-4 h-4 text-amber-600" />}
          label="Helpers awaiting approval"
          value={snapshot.pendingProviders}
          warn={snapshot.pendingProviders > 5 ? "Queue building — review onboarding pipeline" : undefined}
          href="/admin/providers"
        />
        <Attention
          icon={<Users className="w-4 h-4 text-brand-600" />}
          label="Total users"
          value={snapshot.totalUsers}
          href="/admin/users"
        />
        <Attention
          icon={<ShieldCheck className="w-4 h-4 text-emerald-600" />}
          label="Approved helpers"
          value={snapshot.approvedProviders}
          href="/admin/providers"
        />
      </div>

      {/* Time-series block */}
      <div className="grid lg:grid-cols-2 gap-6 mb-8">
        <ChartCard title="Bookings + signups" subtitle={`Last ${DAYS} days`}>
          <LineChart
            labels={bookings.map((b) => b.label)}
            series={[
              { name: "Bookings", values: bookings.map((b) => b.count), color: "#4f46e5" },
              { name: "Customer signups", values: signups.customers.map((b) => b.count), color: "#d97706" },
              { name: "Helper signups", values: signups.providers.map((b) => b.count), color: "#7c3aed" },
            ]}
          />
        </ChartCard>

        <ChartCard title="GMV" subtitle={`Last ${DAYS} days · gross transaction value`}>
          <LineChart
            labels={bookings.map((b) => b.label)}
            series={[
              { name: "GMV", values: bookings.map((b) => (b.sumCents ?? 0) / 100), color: "#059669" },
            ]}
            formatY={(n) => `$${formatNumberShort(n)}`}
          />
        </ChartCard>
      </div>

      {/* Breakdown row */}
      <div className="grid lg:grid-cols-3 gap-6 mb-8">
        <ChartCard title="Top services" subtitle="Last 7 days · by booking volume">
          {topServices.length === 0 ? (
            <EmptyMini text="No bookings in the last 7 days." />
          ) : (
            <StackedBars
              items={topServices.map((s, i) => ({
                label: s.title,
                value: s.count,
                color: ["#4f46e5", "#7c3aed", "#0ea5e9", "#059669", "#d97706"][i % 5],
                sub: `${formatCurrencyShort(s.gmvCents)} GMV`,
                href: `/services/${s.id}`,
              }))}
            />
          )}
        </ChartCard>

        <ChartCard title="Dispute categories" subtitle={`Last ${DAYS} days`}>
          {disputeBreakdown.length === 0 ? (
            <EmptyMini text="No disputes in the last 30 days." />
          ) : (
            <StackedBars
              items={disputeBreakdown.map((d) => ({
                label: CATEGORY_LABEL[d.category] ?? d.category,
                value: d.count,
                color: CATEGORY_COLOR[d.category] ?? "#64748b",
                href: `/admin/disputes?category=${encodeURIComponent(d.category)}`,
              }))}
            />
          )}
        </ChartCard>

        <ChartCard title="Helper onboarding funnel" subtitle="All-time">
          <StackedBars
            scaleMax={funnel.applied || 1}
            items={[
              { label: "Applied", value: funnel.applied, color: "#94a3b8" },
              { label: "ID-verified", value: funnel.idVerified, color: "#0ea5e9",
                sub: funnel.applied > 0 ? `${pct(funnel.idVerified, funnel.applied)}% pass-through` : undefined },
              { label: "Background-cleared", value: funnel.bgCleared, color: "#7c3aed",
                sub: funnel.applied > 0 ? `${pct(funnel.bgCleared, funnel.applied)}% pass-through` : undefined },
              { label: "Approved", value: funnel.approved, color: "#059669",
                sub: funnel.applied > 0 ? `${pct(funnel.approved, funnel.applied)}% pass-through` : undefined,
                href: "/admin/providers" },
            ]}
          />
        </ChartCard>
      </div>

      {/* Recent activity */}
      <ChartCard title="Recent activity" subtitle="Last 10 marketplace events">
        {events.length === 0 ? (
          <EmptyMini text="No recent activity yet." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {events.map((e) => (
              <li key={e.id}>
                <Link href={e.href} className="flex items-center gap-3 py-2.5 px-1 hover:bg-slate-50 rounded-lg transition">
                  <EventIcon kind={e.kind} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-slate-900 truncate">{e.label}</div>
                    <div className="text-[11px] text-slate-500"><ClientDateTime iso={e.at} /></div>
                  </div>
                  <ArrowRight className="w-3 h-3 text-slate-300 shrink-0" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </ChartCard>
    </div>
  );
}

// =========================================================================
// Components
// =========================================================================

function KPI({
  tone, icon, label, value, sub, delta, deltaPolarity = "higher-is-better",
  sparkValues, sparkColor, href,
}: {
  tone: string;
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  delta?: number | null;
  deltaPolarity?: "higher-is-better" | "lower-is-better";
  sparkValues?: number[];
  sparkColor?: string;
  href: string;
}) {
  const isPositive = delta != null && (deltaPolarity === "higher-is-better" ? delta >= 0 : delta <= 0);
  return (
    <Link href={href} className="block rounded-2xl bg-white border border-slate-100 p-4 hover:border-slate-200 hover:shadow-sm transition">
      <div className="flex items-start justify-between mb-1.5 gap-2">
        <span className={`inline-flex w-7 h-7 rounded-lg ${tone} items-center justify-center shrink-0`}>{icon}</span>
        {delta != null && (
          <span className={`inline-flex items-center gap-0.5 text-[10px] font-bold ${isPositive ? "text-emerald-700" : "text-rose-700"}`}>
            {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {Math.abs(delta).toFixed(0)}%
          </span>
        )}
      </div>
      <div className="text-[10px] uppercase tracking-wide text-slate-500 leading-tight">{label}</div>
      <div className="text-xl sm:text-2xl font-bold text-slate-900 mt-1 leading-tight">{value}</div>
      {sub && <div className="text-[11px] text-slate-500 mt-0.5">{sub}</div>}
      {sparkValues && sparkValues.length > 0 && (
        <div className="mt-2 -mb-1" style={{ color: sparkColor ?? "#4f46e5" }}>
          <Sparkline values={sparkValues} width={140} height={24} color={sparkColor} fill={sparkColor} />
        </div>
      )}
    </Link>
  );
}

function Attention({
  icon, label, value, warn, href,
}: { icon: React.ReactNode; label: string; value: number; warn?: string; href: string }) {
  return (
    <Link href={href} className="block rounded-2xl bg-white border border-slate-100 p-4 hover:border-slate-200 hover:shadow-sm transition">
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-[11px] font-semibold text-slate-700">{label}</span>
      </div>
      <div className="text-xl font-bold text-slate-900">{value.toLocaleString()}</div>
      {warn && (
        <div className="text-[10px] text-amber-700 mt-1.5 leading-snug bg-amber-50 rounded-md px-2 py-1">
          {warn}
        </div>
      )}
    </Link>
  );
}

function ChartCard({
  title, subtitle, children,
}: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-white border border-slate-100 p-4 sm:p-5">
      <div className="mb-4">
        <h2 className="text-sm font-bold text-slate-900">{title}</h2>
        {subtitle && <p className="text-[11px] text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

function EmptyMini({ text }: { text: string }) {
  return (
    <div className="py-8 text-center text-xs text-slate-500">
      <Sparkles className="w-4 h-4 mx-auto mb-1.5 text-slate-300" />
      {text}
    </div>
  );
}

function EventIcon({ kind }: { kind: "signup" | "booking" | "dispute" | "review" }) {
  const map = {
    signup: { Icon: UserPlus, tone: "bg-emerald-50 text-emerald-600" },
    booking: { Icon: Calendar, tone: "bg-brand-50 text-brand-600" },
    dispute: { Icon: AlertOctagon, tone: "bg-rose-50 text-rose-600" },
    review: { Icon: MessageSquare, tone: "bg-amber-50 text-amber-600" },
  } as const;
  const { Icon, tone } = map[kind];
  return (
    <span className={`inline-flex w-7 h-7 rounded-lg ${tone} items-center justify-center shrink-0`}>
      <Icon className="w-3.5 h-3.5" />
    </span>
  );
}

function pct(part: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((part / total) * 100);
}

function formatCurrencyShort(cents: number): string {
  const dollars = cents / 100;
  if (Math.abs(dollars) >= 1_000_000) return `$${(dollars / 1_000_000).toFixed(1)}M`;
  if (Math.abs(dollars) >= 1_000) return `$${(dollars / 1_000).toFixed(1)}k`;
  return `$${dollars.toFixed(0)}`;
}

function formatNumberShort(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toFixed(0);
}
