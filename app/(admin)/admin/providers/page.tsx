import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { ShieldCheck, Clock } from "lucide-react";
import { approveProviderAction, rejectProviderAction } from "./actions";

export default async function AdminProvidersPage() {
  const supabase = createSupabaseServiceClient();
  const { data: pending } = await supabase
    .from("provider_profiles")
    .select("*, profile:profiles!provider_profiles_user_id_fkey(full_name, phone, country, avatar_url, created_at)")
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 lg:py-8 max-w-6xl mx-auto">
      <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">Provider approval queue</h1>
      <p className="text-sm text-slate-500 mt-1">
        {pending?.length ?? 0} provider{(pending?.length ?? 0) === 1 ? "" : "s"} waiting for review.
      </p>

      <ul className="mt-6 space-y-3">
        {(pending ?? []).map((p) => {
          const prof = (p as { profile: { full_name: string; phone: string | null; country: string; avatar_url: string | null; created_at: string } | null }).profile;
          return (
            <li key={p.user_id} className="rounded-2xl bg-white border border-slate-100 p-4 flex items-start gap-4">
              {prof?.avatar_url ? (
                <img src={prof.avatar_url} alt="" className="w-12 h-12 rounded-full" />
              ) : (
                <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 font-bold">
                  {prof?.full_name?.[0] ?? "?"}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-slate-900">{prof?.full_name ?? "Unnamed"}</div>
                <div className="text-xs text-slate-500">{prof?.phone ?? "no phone"} · {prof?.country}</div>
                <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                  <Badge ok={!!p.id_verified_at} label="ID verified" />
                  <Badge ok={!!p.background_verified_at} label="Background checked" />
                  <Badge ok={!!p.stripe_connect_account_id} label="Bank connected" />
                </div>
              </div>
              <div className="flex flex-col gap-2 shrink-0">
                <form action={async () => { "use server"; await approveProviderAction(p.user_id); }}>
                  <button className="w-full px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700">
                    Approve
                  </button>
                </form>
                <form action={async () => { "use server"; await rejectProviderAction(p.user_id); }}>
                  <button className="w-full px-3 py-1.5 text-xs font-semibold text-rose-700 border border-rose-200 rounded-lg hover:bg-rose-50">
                    Reject
                  </button>
                </form>
              </div>
            </li>
          );
        })}
        {(pending?.length ?? 0) === 0 && (
          <li className="text-center py-12 text-sm text-slate-500">
            No pending applications.
          </li>
        )}
      </ul>

      <p className="mt-8 text-xs text-slate-400 text-center">
        Approving here sets status='approved' so the provider can go online and start
        accepting matches. Stripe Identity + Checkr webhook integration lands in Phase 4.
      </p>
    </div>
  );
}

function Badge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-semibold ${
      ok ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
    }`}>
      {ok ? <ShieldCheck className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
      {label}
    </span>
  );
}
