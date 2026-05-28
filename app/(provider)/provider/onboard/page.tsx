import { createSupabaseServerClient } from "@/lib/supabase/server";
import Link from "next/link";
import { listServices } from "@/lib/data/services";
import { Check, Clock } from "lucide-react";

export default async function ProviderOnboardPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: pp } = await supabase
    .from("provider_profiles")
    .select("*")
    .single();
  const services = await listServices();
  const { count: providerServiceCount } = user
    ? await supabase
        .from("provider_services")
        .select("service_id", { count: "exact", head: true })
        .eq("provider_id", user.id)
    : { count: 0 };

  const steps = [
    { key: "profile", title: "Basic profile", done: !!pp?.bio },
    { key: "services", title: "Pick services you offer", done: (providerServiceCount ?? 0) > 0 },
    { key: "id", title: "Verify your ID", done: !!pp?.id_verified_at, blocked: "Pending Stripe Identity wiring" },
    { key: "background", title: "Background check", done: !!pp?.background_verified_at, blocked: "Pending Checkr / Triton wiring" },
    { key: "payouts", title: "Connect a bank account", done: !!pp?.stripe_connect_account_id, blocked: "Pending Stripe Connect wiring" },
  ];

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 max-w-3xl mx-auto">
      <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">Provider onboarding</h1>
      <p className="text-sm text-slate-500 mt-1">Complete every step to start accepting tasks.</p>

      <ol className="mt-6 space-y-3">
        {steps.map((s, i) => (
          <li key={s.key} className="rounded-2xl bg-white border border-slate-100 p-4 flex items-start gap-3">
            <span className={`w-8 h-8 rounded-full inline-flex items-center justify-center text-sm font-bold shrink-0 ${
              s.done ? "bg-emerald-500 text-white" :
              s.blocked ? "bg-slate-100 text-slate-400" :
              "bg-brand-600 text-white"
            }`}>
              {s.done ? <Check className="w-4 h-4" /> : i + 1}
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold text-slate-900">{s.title}</div>
              {s.blocked && (
                <div className="text-xs text-amber-700 mt-0.5 inline-flex items-center gap-1">
                  <Clock className="w-3 h-3" /> {s.blocked}
                </div>
              )}
              {s.done && (
                <div className="text-xs text-emerald-700 mt-0.5">Completed</div>
              )}
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-8 rounded-2xl bg-slate-50 border border-slate-100 p-5">
        <div className="text-sm font-bold text-slate-900 mb-3">Services you can offer ({services.length})</div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
          {services.map((s) => (
            <label key={s.id} className="flex items-center gap-2 p-2 rounded-lg bg-white border border-slate-100">
              <input type="checkbox" className="w-4 h-4 rounded text-brand-600" />
              <span className="truncate">{s.title}</span>
            </label>
          ))}
        </div>
        <p className="text-[11px] text-slate-500 mt-3">
          We'll save your selection in <code>provider_services</code> on the next iteration (Phase 2.2).
        </p>
      </div>

      <Link
        href="/provider/dashboard"
        className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-brand-700"
      >
        ← Back to dashboard
      </Link>
    </div>
  );
}
