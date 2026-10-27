import { CardManager, type CardRow } from "./card-form";
import { listMyBookings, listMyPaymentMethods, getMe } from "@/lib/data/customer";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import Link from "next/link";
import { CreditCard, Plus, Wallet, Gift, DollarSign, Download } from "lucide-react";
import { ClientDateTime } from "@/components/ClientDateTime";

export default async function PaymentsPage() {
  const me = await getMe();
  const [completed, methods] = await Promise.all([
    listMyBookings({ status: "completed" }),
    listMyPaymentMethods(),
  ]);

  // Spending is net of refunds.
  //
  // It used to sum total_cents alone, so a customer who had been refunded
  // $10 still saw the full $29.50 as "Total Spent" — the page told them
  // they had spent money that was back on their card.
  const supabase = await createSupabaseServerClient();
  const { data: refundRows } = await supabase
    .from("refunds")
    .select("booking_id, amount_cents")
    .in("booking_id", completed.map((b) => b.id));

  const refundedByBooking = new Map<string, number>();
  for (const r of (refundRows ?? []) as Array<{ booking_id: string; amount_cents: number }>) {
    refundedByBooking.set(r.booking_id, (refundedByBooking.get(r.booking_id) ?? 0) + r.amount_cents);
  }
  const netOf = (b: { id: string; total_cents: number }) =>
    Math.max(0, b.total_cents - (refundedByBooking.get(b.id) ?? 0));

  const grossSpentCents = completed.reduce((s, b) => s + b.total_cents, 0);
  const totalSpentCents = completed.reduce((s, b) => s + netOf(b), 0);
  const refundedCents = grossSpentCents - totalSpentCents;

  const startOfMonth = new Date();
  startOfMonth.setUTCDate(1);
  startOfMonth.setUTCHours(0, 0, 0, 0);
  const monthSpentCents = completed
    .filter((b) => b.completed_at && new Date(b.completed_at) >= startOfMonth)
    .reduce((s, b) => s + netOf(b), 0);

  return (
    <div className="px-4 lg:px-8 py-5 lg:py-8 max-w-[1500px] mx-auto">
      <h1 className="text-2xl lg:text-3xl font-bold text-slate-900">Payments</h1>
      <p className="text-sm text-slate-500 mt-1 mb-6">Track your spending, manage payments and download receipts.</p>

      <div className="grid grid-cols-3 gap-3 mb-5">
        <Stat
          label={refundedCents > 0 ? "Total Spent (net)" : "Total Spent"}
          value={`$${(totalSpentCents / 100).toFixed(2)}`}
          icon={<CreditCard className="w-5 h-5 text-brand-600" />}
          tint="bg-brand-50"
          sub={refundedCents > 0 ? `$${(refundedCents / 100).toFixed(2)} refunded` : undefined}
        />
        <Stat label="This Month" value={`$${(monthSpentCents / 100).toFixed(2)}`} icon={<DollarSign className="w-5 h-5 text-emerald-600" />} tint="bg-emerald-50" />
        <Stat label="Completed" value={String(completed.length)} icon={<CreditCard className="w-5 h-5 text-amber-600" />} tint="bg-amber-50" />

      </div>

      {/* A "Wallet Balance" card used to sit here with Add Credits and
          Send a Gift. wallet_balance_cents is read in three places and
          written by nothing, so the number was always $0.00 and could
          never be anything else — and the two buttons were disabled with
          "Paying by card isn't available yet", which stopped being true
          the day card entry shipped. Removed rather than re-labelled:
          there is no wallet. */}
      <h2 className="text-base font-bold text-slate-900 mb-3">Transactions</h2>
      {completed.length === 0 ? (
        <div className="rounded-2xl bg-white border border-slate-100 p-8 text-center">
          <p className="text-sm text-slate-500">No transactions yet — they'll appear here once you complete a booking.</p>
        </div>
      ) : (
        <ul className="rounded-2xl bg-white border border-slate-100 divide-y divide-slate-100 overflow-hidden">
          {completed.map((b) => (
            <li key={b.id} className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-brand-50 flex items-center justify-center"><CreditCard className="w-4 h-4 text-brand-600" /></div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-bold text-slate-900 truncate">{b.service.title}</div>
                <div className="text-[11px] text-slate-500"><ClientDateTime iso={b.completed_at} mode="date" /></div>
              </div>
              <div className="text-sm font-bold text-slate-900">${(b.total_cents / 100).toFixed(2)}</div>
              {/* Was an inert <button>: it rendered, it was clickable,
                  and nothing happened. Now it opens the Stripe-hosted
                  receipt, which already reflects any refunds. */}
              <a
                href={`/api/receipts/${b.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 rounded-lg border border-slate-200 hover:border-brand-300 inline-flex"
                aria-label={`Receipt for ${b.service.title}`}
              >
                <Download className="w-3.5 h-3.5 text-slate-500" />
              </a>
            </li>
          ))}
        </ul>
      )}

      <h2 className="text-base font-bold text-slate-900 mt-6 mb-3">Payment Methods</h2>
      <CardManager
        cards={methods as CardRow[]}
        publishableKey={process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? null}
      />
    </div>
  );
}

function Stat({ label, value, icon, tint, sub }: { label: string; value: string; icon: React.ReactNode; tint: string; sub?: string }) {
  return (
    <div className="rounded-2xl bg-white border border-slate-100 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="text-xs text-slate-500">{label}</div>
        <span className={`inline-flex w-9 h-9 ${tint} rounded-xl items-center justify-center shrink-0`}>{icon}</span>
      </div>
      <div className="mt-3 text-xl font-bold text-slate-900">{value}</div>
      {sub && <div className="text-[11px] text-slate-500 mt-0.5">{sub}</div>}
    </div>
  );
}
