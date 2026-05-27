import { listMyBookings, listMyPaymentMethods, getMe } from "@/lib/data/customer";
import Link from "next/link";
import { CreditCard, Plus, Wallet, Gift, DollarSign, Download } from "lucide-react";

export default async function PaymentsPage() {
  const me = await getMe();
  const [completed, methods] = await Promise.all([
    listMyBookings({ status: "completed" }),
    listMyPaymentMethods(),
  ]);

  const totalSpentCents = completed.reduce((s, b) => s + b.total_cents, 0);
  const startOfMonth = new Date();
  startOfMonth.setUTCDate(1);
  startOfMonth.setUTCHours(0, 0, 0, 0);
  const monthSpentCents = completed
    .filter((b) => b.completed_at && new Date(b.completed_at) >= startOfMonth)
    .reduce((s, b) => s + b.total_cents, 0);
  const walletCents = me?.customer?.wallet_balance_cents ?? 0;

  return (
    <div className="px-4 lg:px-8 py-5 lg:py-8 max-w-[1500px] mx-auto">
      <h1 className="text-2xl lg:text-3xl font-bold text-slate-900">Payments</h1>
      <p className="text-sm text-slate-500 mt-1 mb-6">Track your spending, manage payments and download receipts.</p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <Stat label="Total Spent" value={`$${(totalSpentCents / 100).toFixed(2)}`} icon={<CreditCard className="w-5 h-5 text-brand-600" />} tint="bg-brand-50" />
        <Stat label="This Month" value={`$${(monthSpentCents / 100).toFixed(2)}`} icon={<DollarSign className="w-5 h-5 text-emerald-600" />} tint="bg-emerald-50" />
        <Stat label="Completed" value={String(completed.length)} icon={<CreditCard className="w-5 h-5 text-amber-600" />} tint="bg-amber-50" />
        <Stat label="Your Balance" value={`$${(walletCents / 100).toFixed(2)}`} icon={<Wallet className="w-5 h-5 text-violet-600" />} tint="bg-violet-50" />
      </div>

      <div className="rounded-2xl bg-gradient-to-br from-brand-50 to-violet-50 border border-brand-100 p-5 mb-5">
        <div className="text-sm font-semibold text-slate-900">Wallet Balance</div>
        <div className="mt-2 text-3xl font-bold text-slate-900">${(walletCents / 100).toFixed(2)}</div>
        <div className="text-xs text-slate-500 mt-1">Available credits</div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <button disabled title="Coming once Stripe payments are wired (Phase 4)" className="py-2.5 rounded-xl bg-brand-600 text-white text-sm font-semibold disabled:opacity-50 cursor-not-allowed">
            Add Credits
          </button>
          <button disabled title="Coming once Stripe payments are wired (Phase 4)" className="py-2.5 rounded-xl bg-white border border-brand-200 text-brand-700 text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-50 cursor-not-allowed">
            <Gift className="w-4 h-4" /> Send a Gift
          </button>
        </div>
        <p className="text-[11px] text-slate-500 mt-3">Add Credits + Gift wired up in Phase 4 (Stripe).</p>
      </div>

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
                <div className="text-[11px] text-slate-500">{b.completed_at ? new Date(b.completed_at).toLocaleDateString() : "—"}</div>
              </div>
              <div className="text-sm font-bold text-slate-900">${(b.total_cents / 100).toFixed(2)}</div>
              <button className="p-2 rounded-lg border border-slate-200" aria-label="Download receipt">
                <Download className="w-3.5 h-3.5 text-slate-500" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <h2 className="text-base font-bold text-slate-900 mt-6 mb-3">Payment Methods</h2>
      {methods.length === 0 ? (
        <div className="rounded-2xl bg-white border border-slate-100 p-6 text-center">
          <p className="text-sm text-slate-500">No payment methods added yet.</p>
          <button disabled title="Coming once Stripe payments are wired (Phase 4)" className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-brand-700 border border-brand-200 px-3 py-2 rounded-lg disabled:opacity-50 cursor-not-allowed">
            <Plus className="w-3.5 h-3.5" /> Add Payment Method
          </button>
          <p className="text-[11px] text-slate-400 mt-2">Stripe-backed payment method UI ships in Phase 4.</p>
        </div>
      ) : (
        <ul className="rounded-2xl bg-white border border-slate-100 divide-y divide-slate-100 overflow-hidden">
          {methods.map((m) => (
            <li key={m.id} className="p-4 flex items-center gap-3">
              <span className="inline-flex w-10 h-7 rounded items-center justify-center text-white text-[10px] font-bold bg-blue-600">
                {m.brand?.slice(0, 4).toUpperCase() ?? "CARD"}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold">{m.brand} •••• {m.last4}</div>
                <div className="text-[11px] text-slate-500">Expires {m.exp_month}/{m.exp_year}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Stat({ label, value, icon, tint }: { label: string; value: string; icon: React.ReactNode; tint: string }) {
  return (
    <div className="rounded-2xl bg-white border border-slate-100 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="text-xs text-slate-500">{label}</div>
        <span className={`inline-flex w-9 h-9 ${tint} rounded-xl items-center justify-center shrink-0`}>{icon}</span>
      </div>
      <div className="mt-3 text-xl font-bold text-slate-900">{value}</div>
    </div>
  );
}
