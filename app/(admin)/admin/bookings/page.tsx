import { createSupabaseServiceClient } from "@/lib/supabase/server";

const STATUS_TONE: Record<string, string> = {
  scheduled: "bg-brand-50 text-brand-700",
  in_progress: "bg-emerald-50 text-emerald-700",
  completed: "bg-slate-100 text-slate-700",
  cancelled: "bg-rose-50 text-rose-700",
  disputed: "bg-amber-50 text-amber-700",
};

export default async function AdminBookingsPage({
  searchParams,
}: { searchParams: Promise<{ status?: string }> }) {
  const params = await searchParams;
  const supabase = createSupabaseServiceClient();
  let q = supabase
    .from("bookings")
    .select(`
      id, status, total_cents, currency, scheduled_for, created_at, completed_at,
      service:services(title),
      customer:profiles!bookings_customer_id_fkey(full_name),
      provider:provider_profiles!bookings_provider_id_fkey(
        profile:profiles!provider_profiles_user_id_fkey(full_name)
      )
    `)
    .order("created_at", { ascending: false })
    .limit(100);
  if (params.status) q = q.eq("status", params.status);

  const { data: rows } = await q;

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 lg:py-8 max-w-6xl mx-auto">
      <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">Bookings</h1>
      <p className="text-sm text-slate-500 mt-1 mb-5">{rows?.length ?? 0} most recent</p>

      <form className="flex flex-wrap gap-2 mb-4" action="">
        {["", "scheduled", "in_progress", "completed", "cancelled", "disputed"].map((s) => {
          const active = (params.status ?? "") === s;
          return (
            <button
              key={s || "all"}
              type="submit"
              name="status"
              value={s}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold ${
                active ? "bg-slate-900 text-white" : "bg-white border border-slate-200 text-slate-700"
              }`}
            >
              {s || "All"}
            </button>
          );
        })}
      </form>

      <div className="rounded-2xl bg-white border border-slate-100 overflow-hidden">
        <ul className="divide-y divide-slate-100">
          {(rows ?? []).map((b) => {
            const customer = (b as { customer: { full_name: string } | null }).customer;
            const provider = (b as { provider: { profile: { full_name: string } | null } | null }).provider;
            return (
              <li key={b.id} className="p-4 flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-slate-900 truncate">
                    {(b as { service: { title: string } | null }).service?.title ?? "—"}
                  </div>
                  <div className="text-xs text-slate-500 truncate">
                    {customer?.full_name ?? "?"} → {provider?.profile?.full_name ?? "—"}
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono mt-0.5 truncate">#{b.id}</div>
                </div>
                <span className={`shrink-0 inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold ${STATUS_TONE[b.status]}`}>
                  {b.status === "in_progress" ? "In progress" : b.status[0].toUpperCase() + b.status.slice(1)}
                </span>
                <div className="text-sm font-bold text-slate-900 w-20 text-right">
                  ${(b.total_cents / 100).toFixed(2)}
                </div>
              </li>
            );
          })}
          {(rows?.length ?? 0) === 0 && (
            <li className="py-12 text-center text-sm text-slate-500">No bookings yet.</li>
          )}
        </ul>
      </div>
    </div>
  );
}
