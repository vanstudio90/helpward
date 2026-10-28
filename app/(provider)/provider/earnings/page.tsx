import Link from "next/link";
import {
  DollarSign, TrendingUp, Calendar, Heart, ArrowRight, Download, Info, Clock,
} from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ClientDateTime } from "@/components/ClientDateTime";

// Helper earnings — pulls real completed bookings and aggregates by week.
// Payout readiness is mirrored from Stripe onto provider_profiles by the
// account.updated webhook; see migration 0040.
//
// Earnings are computed from completed bookings (helper's 80% of
// the service subtotal +
// subtotal plus 100% of tips). Whether the helper can actually BE paid is
// mirrored from Stripe onto provider_profiles by the account.updated
// webhook — see migration 0040 — and is what `payable` below reads.
//
// There is deliberately no predicted arrival date anywhere on this page.
// Stripe decides its own payout schedule and reports a real arrival_date
// when a payout exists; anything else is a guess shown to someone waiting
// to be paid.

type CompletedRow = {
  id: string;
  completed_at: string | null;
  base_price_cents: number;
  service_fee_cents: number | null;
  distance_cents: number | null;
  tip_cents: number | null;
  payout_cents: number | null;
  currency: string;
  service: { title: string } | null;
  customer: { full_name: string } | null;
};

type WeekBucket = {
  key: string;           // ISO Monday of the week, used for ordering
  label: string;         // "May 26 – Jun 1, 2026"
  count: number;
  basePayoutCents: number; // helper's 80% of the service subtotal
  tipsCents: number;
  totalCents: number;     // sum for the week
};

// Monday at 00:00 UTC for a given date. Helpward payouts run weekly per Stripe
// Connect best practice — Monday-through-Sunday work, paid out the following

// Monday at 00:00 UTC for a given date. Weeks are Monday-through-Sunday
// for grouping only — Stripe sets its own payout schedule, and this page
// deliberately predicts no arrival date.
function mondayOf(d: Date): Date {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = x.getUTCDay(); // 0 Sun..6 Sat
  const diff = (day + 6) % 7; // back to Monday
  x.setUTCDate(x.getUTCDate() - diff);
  return x;
}

function bucketKey(d: Date): string { return mondayOf(d).toISOString().slice(0, 10); }

function fmtWeekLabel(monday: Date): string {
  const end = new Date(monday); end.setUTCDate(end.getUTCDate() + 6);
  const m = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  return `${m(monday)} – ${m(end)}, ${monday.getUTCFullYear()}`;
}

export default async function ProviderEarningsPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  // RLS lets a helper read only their own bookings. Pull the 200 most-recent
  // completed ones — enough for a year of weekly aggregates for active helpers.
  const { data: rows } = await supabase
    .from("bookings")
    .select(`
      id, completed_at, base_price_cents, service_fee_cents, distance_cents,
      tip_cents, payout_cents, currency,
      service:services(title),
      customer:profiles!bookings_customer_id_fkey(full_name)
    `)
    .eq("provider_id", user.id)
    .eq("status", "completed")
    .order("completed_at", { ascending: false })
    .limit(200);

  const completed = (rows ?? []) as unknown as CompletedRow[];

  // Bucket by Monday-week
  const buckets = new Map<string, WeekBucket>();
  for (const r of completed) {
    if (!r.completed_at) continue;
    const d = new Date(r.completed_at);
    const key = bucketKey(d);
    const monday = mondayOf(d);
    const tip = r.tip_cents ?? 0;
    // Helper keeps 80% of the service subtotal PLUS 100% of any tip. The
    // $4.50 service fee is entirely Helpward's and is not commissionable —
    // see lib/pricing.ts. payout_cents is the sum accept_request stores on
    // the booking row at acceptance time (migration 0031).
    const payout = r.payout_cents ?? 0;
    const existing = buckets.get(key) ?? {
      key,
      label: fmtWeekLabel(monday),
      count: 0,
      basePayoutCents: 0,
      tipsCents: 0,
      totalCents: 0,
    };
    existing.count += 1;
    existing.tipsCents += tip;
    existing.basePayoutCents += payout - tip; // tip is included in payout_cents
    existing.totalCents += payout;
    buckets.set(key, existing);
  }
  const weeks = Array.from(buckets.values()).sort((a, b) => (a.key < b.key ? 1 : -1));

  const lifetime = completed.reduce((s, r) => s + (r.payout_cents ?? 0), 0);
  const lifetimeTips = completed.reduce((s, r) => s + (r.tip_cents ?? 0), 0);
  const currency = completed[0]?.currency ?? "USD";

  const thisMonday = mondayOf(new Date());
  const thisWeekKey = bucketKey(new Date());
  const thisWeek = buckets.get(thisWeekKey) ?? null;
  // Whether THIS helper can actually be paid, mirrored from Stripe.
  const { data: payoutState } = await supabase
    .from("provider_profiles")
    .select("stripe_transfers_active, stripe_payouts_enabled, stripe_requirements_due")
    .eq("user_id", user.id)
    .maybeSingle();
  const payable = payoutState?.stripe_transfers_active === true;
  // Earnings reach them, but Stripe will not move the balance to their
  // bank yet — normally a document still under review. A distinct state
  // from "not set up", and one a helper has to be told about rather than
  // discover when no money arrives.
  const payoutsPending = payable && payoutState?.stripe_payouts_enabled !== true;

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 lg:py-8 max-w-5xl mx-auto pb-12">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 inline-flex items-center gap-2">
            <DollarSign className="w-6 h-6 text-emerald-600" /> Earnings
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            You keep 80% of the service price, plus 100% of any tip. The flat
            $4.50 service fee customers pay goes to Helpward and is never taken
            out of your share. Payout scheduling is not live yet.
          </p>
        </div>
        <a
          href="/api/provider/export/bookings?days=365"
          download
          className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50"
          title="Download the last 365 days of bookings as CSV — tax-season ready"
        >
          <Download className="w-3.5 h-3.5" /> Export year CSV
        </a>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
        <Stat
          icon={<Calendar className="w-5 h-5" />}
          tone="bg-brand-50 text-brand-600"
          label="This week so far"
          value={thisWeek ? formatMoney(thisWeek.totalCents, currency) : formatMoney(0, currency)}
          sub={thisWeek ? `${thisWeek.count} task${thisWeek.count === 1 ? "" : "s"}` : "No earnings yet"}
        />
        {/* Read from the helper's actual Stripe state.
            This used to show a computed next-Monday date under the words
            "Once Stripe Connect is wired" — a payout date promised by a
            page that simultaneously said payouts did not work. Connect IS
            wired; what varies is whether THIS helper has finished
            onboarding, which is what the card now reports. */}
        <Stat
          icon={<Clock className="w-5 h-5" />}
          tone={payable && !payoutsPending
            ? "bg-emerald-50 text-emerald-600"
            : "bg-amber-50 text-amber-600"}
          label="Payouts"
          value={payable ? (payoutsPending ? "In review" : "Active") : "Not set up"}
          sub={
            !payable
              ? "Finish payout setup to get paid"
              : payoutsPending
                ? "Earnings are safe; bank transfers start once Stripe finishes checking your details"
                : "Stripe pays out on its own schedule"
          }
        />
        <Stat
          icon={<Heart className="w-5 h-5" />}
          tone="bg-rose-50 text-rose-600"
          label="Lifetime tips"
          value={formatMoney(lifetimeTips, currency)}
          sub="100% kept"
        />
        <Stat
          icon={<TrendingUp className="w-5 h-5" />}
          tone="bg-emerald-50 text-emerald-600"
          label="Lifetime earnings"
          value={formatMoney(lifetime, currency)}
          sub={`${completed.length} task${completed.length === 1 ? "" : "s"} completed`}
        />
      </div>

      {/* This said "Real payouts ship once Stripe Connect is wired" while
          the card above it said payouts were Active — two statements on
          one screen that could not both be true. Connect IS wired; what
          varies is whether THIS helper has finished their own setup. */}
      {payoutsPending && (
        <div className="rounded-2xl bg-amber-50 border border-amber-100 p-4 mb-6 flex items-start gap-3">
          <Info className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" aria-hidden="true" />
          <div className="text-sm text-amber-800">
            <div className="font-semibold">Stripe is still checking your details.</div>
            <div className="text-xs mt-0.5">
              You can keep taking jobs — your earnings are being held safely in your Stripe
              balance. Bank transfers begin as soon as the check clears. Nothing is lost in the
              meantime.
            </div>
          </div>
        </div>
      )}

      {!payable && (
        <div className="rounded-2xl bg-amber-50 border border-amber-100 p-4 mb-6 flex items-start gap-3">
          <Info className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
          <div className="text-sm text-amber-800">
            <div className="font-semibold">You can&apos;t be paid yet.</div>
            <div className="text-xs mt-0.5">
              Your earnings below are tallied from completed bookings, but Stripe still needs your
              bank and tax details before any of it can reach you.
              <Link href="/provider/onboard" className="ml-1 font-semibold underline">Finish payout setup</Link>.
            </div>
          </div>
        </div>
      )}

      {/* Weekly breakdown */}
      <section className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-bold text-slate-900">Week-by-week</h2>
          <button
            disabled
            title="CSV export ships in the same release as Stripe Connect"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 px-3 py-1.5 rounded-lg border border-slate-200 cursor-not-allowed"
          >
            <Download className="w-3 h-3" /> Export CSV
          </button>
        </div>
        {weeks.length === 0 ? (
          <div className="rounded-2xl bg-white border border-slate-100 p-12 text-center">
            <p className="text-sm font-semibold text-slate-700">No earnings yet</p>
            <p className="text-xs text-slate-500 mt-1">
              Once you complete your first task, weekly aggregates land here automatically.
            </p>
            <Link
              href="/provider/active"
              className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold"
            >
              Go online <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        ) : (
          <ul className="rounded-2xl bg-white border border-slate-100 divide-y divide-slate-100 overflow-hidden">
            {weeks.map((w) => (
              <li key={w.key} className="p-4 flex items-center gap-4 flex-wrap sm:flex-nowrap">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold text-slate-900">{w.label}</div>
                  <div className="text-[11px] text-slate-500">
                    {/* "Pays Tuesday, Nov 3" was arithmetic, not a fact:
                        next Monday plus one day, with no Stripe payout
                        behind it. Stripe sets its own payout schedule and
                        tells us the arrival date when a payout exists —
                        until one does, there is no date to show. */}
                    {w.count} task{w.count === 1 ? "" : "s"}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-[10px] uppercase tracking-wide text-slate-500">Base + distance</div>
                  <div className="text-sm font-semibold text-slate-900">{formatMoney(w.basePayoutCents, currency)}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-[10px] uppercase tracking-wide text-slate-500">Tips</div>
                  <div className="text-sm font-semibold text-rose-700">+ {formatMoney(w.tipsCents, currency)}</div>
                </div>
                <div className="text-right shrink-0 sm:w-28">
                  <div className="text-[10px] uppercase tracking-wide text-slate-500">Total</div>
                  <div className="text-base font-bold text-emerald-700">{formatMoney(w.totalCents, currency)}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Recent completed bookings */}
      {completed.length > 0 && (
        <section className="mb-8">
          <h2 className="text-base font-bold text-slate-900 mb-3">Recent tasks</h2>
          <ul className="rounded-2xl bg-white border border-slate-100 divide-y divide-slate-100 overflow-hidden">
            {completed.slice(0, 12).map((b) => (
              <li key={b.id} className="p-3 flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold text-slate-900 truncate">{b.service?.title ?? "Task"}</div>
                  <div className="text-[11px] text-slate-500 truncate">
                    {b.customer?.full_name ?? "Customer"} · <ClientDateTime iso={b.completed_at} />
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-bold text-slate-900">{formatMoney(b.payout_cents ?? 0, b.currency)}</div>
                  {(b.tip_cents ?? 0) > 0 && (
                    <div className="text-[10px] text-rose-600">+ {formatMoney(b.tip_cents ?? 0, b.currency)} tip</div>
                  )}
                </div>
              </li>
            ))}
          </ul>
          {completed.length > 12 && (
            <p className="mt-3 text-xs text-slate-500 text-center">
              Showing 12 of {completed.length} completed tasks · pagination ships with CSV export
            </p>
          )}
        </section>
      )}

      {/* Tax forms */}
      <section className="rounded-2xl bg-white border border-slate-100 p-4 sm:p-5">
        <h2 className="text-base font-bold text-slate-900 mb-2">Tax forms</h2>
        <p className="text-xs text-slate-500 leading-relaxed">
          U.S. helpers earning over $600 in a calendar year receive a 1099-NEC by January 31. Canadian helpers
          receive a T4A. Forms are issued through Stripe and emailed to your registered address.{" "}
          <Link href="/help/helper-payouts-and-earnings" className="text-brand-700 font-semibold hover:underline">
            Read the helper payout guide
          </Link>.
        </p>
        <button
          disabled
          title="Tax forms are issued automatically through Stripe Connect — UI ships with the same integration."
          className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 px-3 py-1.5 rounded-lg border border-slate-200 cursor-not-allowed"
        >
          <Download className="w-3 h-3" /> View past forms
        </button>
      </section>
    </div>
  );
}

function Stat({ icon, tone, label, value, sub }: {
  icon: React.ReactNode; tone: string; label: string; value: string; sub: string;
}) {
  return (
    <div className="rounded-2xl bg-white border border-slate-100 p-4">
      <span className={`inline-flex w-10 h-10 rounded-full ${tone} items-center justify-center mb-2`}>
        {icon}
      </span>
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-lg sm:text-xl font-bold text-slate-900 leading-tight mt-1">{value}</div>
      <div className="text-[11px] text-slate-500 mt-0.5">{sub}</div>
    </div>
  );
}

function formatMoney(cents: number, currency: string): string {
  const dollars = (cents ?? 0) / 100;
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(dollars);
}
