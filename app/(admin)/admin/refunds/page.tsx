import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { RefreshCw } from "lucide-react";

const TONE: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700",
  succeeded: "bg-emerald-50 text-emerald-700",
  failed: "bg-rose-50 text-rose-700",
};

export default async function AdminRefundsPage() {
  const supabase = createSupabaseServiceClient();
  const { data } = await supabase
    .from("refunds")
    .select(`
      id, amount_cents, reason, status, stripe_refund_id, created_at,
      booking:bookings(id, service:services(title), customer:profiles!bookings_customer_id_fkey(full_name)),
      initiator:profiles!refunds_initiated_by_fkey(full_name, role)
    `)
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 lg:py-8 max-w-5xl mx-auto">
      <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 inline-flex items-center gap-2">
        <RefreshCw className="w-6 h-6 text-rose-600" /> Refunds
      </h1>
      <p className="text-sm text-slate-500 mt-1 mb-5">{data?.length ?? 0} total</p>

      {(data?.length ?? 0) === 0 ? (
        <div className="rounded-2xl bg-white border border-slate-100 p-12 text-center">
          <p className="text-sm text-slate-500">No refunds yet.</p>
          <p className="text-xs text-slate-400 mt-2">Refunds will appear here once Stripe webhooks fire <code>charge.refunded</code> events.</p>
        </div>
      ) : (
        <ul className="rounded-2xl bg-white border border-slate-100 divide-y divide-slate-100 overflow-hidden">
          {(data ?? []).map((r) => {
            const booking = (r as { booking: { id: string; service: { title: string } | null; customer: { full_name: string } | null } | null }).booking;
            const initiator = (r as { initiator: { full_name: string; role: string } | null }).initiator;
            return (
              <li key={r.id} className="p-4 flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold text-slate-900">${(r.amount_cents / 100).toFixed(2)}</span>
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold ${TONE[r.status] ?? "bg-slate-100 text-slate-700"}`}>
                      {r.status.toUpperCase()}
                    </span>
                    {booking && (
                      <span className="text-xs text-slate-500">
                        {booking.service?.title ?? "—"} · {booking.customer?.full_name ?? "?"}
                      </span>
                    )}
                  </div>
                  {r.reason && (
                    <div className="text-xs text-slate-600 mt-1">{r.reason}</div>
                  )}
                  <div className="text-[10px] text-slate-400 mt-1">
                    {new Date(r.created_at).toLocaleString()}
                    {initiator && ` · by ${initiator.full_name} (${initiator.role})`}
                    {r.stripe_refund_id && ` · ${r.stripe_refund_id.slice(0, 14)}…`}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
