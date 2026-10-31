import Link from "next/link";
import {
  Heart, Download, Info, Wallet, Landmark, CheckCircle2, Receipt,
  List as ListIcon,
} from "lucide-react";
import {
  PageHeader, SectionLabel, Card, IconChip, StatCard, StatusPill,
  RowGroup, Row, Action, EmptyState,
} from "@/components/ui/kit";
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

export default async function HelperEarningsPage() {
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
    <div className="space-y-5">
      <PageHeader title="Earnings" />

      {/* The week, given the room it deserves. Everything else on this
          screen is context for this number. */}
      <Card className="p-5">
        <div className="flex items-start gap-3.5">
          <IconChip icon={Wallet} />
          <div className="min-w-0">
            <div className="text-[12px] font-extrabold uppercase tracking-[0.09em] text-slate-400">This week</div>
            <div className="text-[34px] leading-none font-extrabold text-slate-900 tabular-nums mt-1.5">
              {formatMoney(thisWeek?.totalCents ?? 0, currency)}
            </div>
            <p className="mt-2 text-[14px] text-slate-500 leading-snug">
              Your earnings after Helpward&rsquo;s commission.
            </p>
          </div>
        </div>
        <div className="mt-4 pt-4 border-t border-slate-100 flex items-center gap-4">
          <span className="inline-flex items-center gap-2 text-[15px] text-slate-600">
            <ListIcon className="w-[18px] h-[18px] text-slate-400" aria-hidden="true" />
            <span className="font-bold text-slate-900 tabular-nums">{thisWeek?.count ?? 0}</span> tasks
          </span>
          <span className="w-px h-5 bg-slate-200" aria-hidden="true" />
          <span className="inline-flex items-center gap-2 text-[15px] text-slate-600">
            <Heart className="w-[18px] h-[18px] text-rose-400" aria-hidden="true" />
            <span className="font-bold text-slate-900 tabular-nums">{formatMoney(thisWeek?.tipsCents ?? 0, currency)}</span> tips included
          </span>
        </div>
      </Card>

      {/* Whether money can actually reach a bank account, read from this
          helper's own Stripe state rather than asserted. */}
      <Card className="p-4">
        <div className="flex items-start gap-3.5">
          <IconChip icon={Landmark} tone={payable && !payoutsPending ? "emerald" : "amber"} />
          <div className="min-w-0 flex-1">
            <div className="text-[17px] font-extrabold text-slate-900 leading-tight">Payouts</div>
            <div className="mt-1.5">
              <StatusPill tone={payable && !payoutsPending ? "good" : "warn"}>
                {payable && !payoutsPending
                  ? <><CheckCircle2 className="w-4 h-4" aria-hidden="true" /> Active</>
                  : payable ? "In review" : "Not set up"}
              </StatusPill>
            </div>
            <p className="mt-2 text-[14px] text-slate-500 leading-snug">
              {!payable
                ? "Stripe needs your bank and tax details before any of this can reach you."
                : payoutsPending
                  ? "Your earnings are held safely in your Stripe balance. Bank transfers begin once Stripe finishes checking your details."
                  : "Stripe manages your payout schedule."}
            </p>
            {!payable && (
              <Link href="/helper/onboard" className="inline-block mt-2.5 text-[14px] font-bold text-brand-700 underline underline-offset-2">
                Finish payout setup
              </Link>
            )}
          </div>
        </div>
      </Card>

      <section>
        <SectionLabel>Lifetime</SectionLabel>
        <div className="grid grid-cols-2 gap-3">
          <StatCard icon={Wallet} label="Earnings" value={formatMoney(lifetime, currency)}
            note={`${completed.length} task${completed.length === 1 ? "" : "s"}`} />
          <StatCard icon={Heart} tone="rose" label="Tips" value={formatMoney(lifetimeTips, currency)} note="100% yours" />
        </div>
      </section>

      <RowGroup>
        <Row
          icon={Info}
          href="/help"
          title="How earnings work"
          sub="You keep 80% of the service price, plus all tips. The customer's service fee goes to Helpward and never comes out of your share."
        />
      </RowGroup>

      {/* Weekly breakdown */}
      <section>
        <div className="flex items-center justify-between gap-3 mb-2.5 px-1">
          <h2 className="text-[20px] font-extrabold tracking-[-0.01em] text-slate-900">Recent earnings</h2>
          <a
            href="/api/helper/export/bookings?days=365"
            download
            className="shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full border border-slate-200 bg-white text-[13px] font-bold text-slate-700"
          >
            <Download className="w-[15px] h-[15px]" aria-hidden="true" /> Export CSV
          </a>
        </div>
        {weeks.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title="Your first task starts here"
            body="Completed tasks and tips will appear here, grouped by week."
          >
            <Action href="/helper/inbox">View offers</Action>
          </EmptyState>
        ) : (
          <ul className="bg-white rounded-card border border-slate-100 shadow-soft divide-y divide-slate-100 overflow-hidden">
            {weeks.map((w) => (
              <li key={w.key} className="p-4 flex items-center gap-4 flex-wrap sm:flex-nowrap">
                <div className="min-w-0 flex-1">
                  <div className="text-[15px] font-bold text-slate-900">{w.label}</div>
                  <div className="text-[13px] text-slate-500">
                    {/* "Pays Tuesday, Nov 3" was arithmetic, not a fact:
                        next Monday plus one day, with no Stripe payout
                        behind it. Stripe sets its own payout schedule and
                        tells us the arrival date when a payout exists —
                        until one does, there is no date to show. */}
                    {w.count} task{w.count === 1 ? "" : "s"}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-[12px] uppercase tracking-wide text-slate-500">Base + distance</div>
                  <div className="text-[15px] font-semibold text-slate-900">{formatMoney(w.basePayoutCents, currency)}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-[12px] uppercase tracking-wide text-slate-500">Tips</div>
                  <div className="text-[15px] font-semibold text-rose-700">+ {formatMoney(w.tipsCents, currency)}</div>
                </div>
                <div className="text-right shrink-0 sm:w-28">
                  <div className="text-[12px] uppercase tracking-wide text-slate-500">Total</div>
                  <div className="text-[18px] font-extrabold text-emerald-700">{formatMoney(w.totalCents, currency)}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Recent completed bookings */}
      {completed.length > 0 && (
        <section className="mb-8">
          <h2 className="text-[18px] font-extrabold text-slate-900 mb-3">Recent tasks</h2>
          <ul className="bg-white rounded-card border border-slate-100 shadow-soft divide-y divide-slate-100 overflow-hidden">
            {completed.slice(0, 12).map((b) => (
              <li key={b.id} className="p-3 flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-[15px] font-bold text-slate-900 truncate">{b.service?.title ?? "Task"}</div>
                  <div className="text-[13px] text-slate-500 truncate">
                    {b.customer?.full_name ?? "Customer"} · <ClientDateTime iso={b.completed_at} />
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-[15px] font-bold text-slate-900">{formatMoney(b.payout_cents ?? 0, b.currency)}</div>
                  {(b.tip_cents ?? 0) > 0 && (
                    <div className="text-[12px] text-rose-600">+ {formatMoney(b.tip_cents ?? 0, b.currency)} tip</div>
                  )}
                </div>
              </li>
            ))}
          </ul>
          {completed.length > 12 && (
            <p className="mt-3 text-[13px] text-slate-500 text-center">
              Showing 12 of {completed.length} completed tasks · pagination ships with CSV export
            </p>
          )}
        </section>
      )}

      {/* Tax forms */}
      <section className="bg-white rounded-card border border-slate-100 shadow-soft p-4 sm:p-5">
        <h2 className="text-[18px] font-extrabold text-slate-900 mb-2">Tax forms</h2>
        <p className="text-[13px] text-slate-500 leading-relaxed">
          U.S. helpers earning over $600 in a calendar year receive a 1099-NEC by January 31. Canadian helpers
          receive a T4A. Forms are issued through Stripe and emailed to your registered address.{" "}
          <Link href="/help/helper-payouts-and-earnings" className="text-brand-700 font-semibold hover:underline">
            Read the helper payout guide
          </Link>.
        </p>
        <button
          disabled
          title="Tax forms are issued automatically through Stripe Connect — UI ships with the same integration."
          className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-slate-400 px-3 py-1.5 rounded-field border border-slate-200 cursor-not-allowed"
        >
          <Download className="w-3 h-3" /> View past forms
        </button>
      </section>
    </div>
  );
}


function formatMoney(cents: number, currency: string): string {
  const dollars = (cents ?? 0) / 100;
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(dollars);
}
