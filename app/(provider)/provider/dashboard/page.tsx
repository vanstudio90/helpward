import { createSupabaseServerClient } from "@/lib/supabase/server";
import Link from "next/link";
import {
  outstandingRequirements, canAcceptWork, type ProviderReadiness,
} from "@/lib/provider-readiness";
import {
  AlertCircle, CheckCircle2, ArrowRight, DollarSign, Calendar, Star,
} from "lucide-react";
import { HelperNextStepsWidget } from "./next-steps";

export default async function ProviderDashboardPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  // The layout already redirects an unauthenticated visitor; this is the
  // narrowing the identity-filtered lookups below need.
  if (!user) return null;

  const [{ data: profile }, { data: pp }] = await Promise.all([
    supabase.from("profiles").select("full_name, avatar_url").eq("id", user.id).single(),
    supabase.from("provider_profiles").select("*").eq("user_id", user.id).maybeSingle(),
  ]);

  // Readiness comes from ONE definition shared with the onboarding page,
  // and that definition mirrors what the database enforces.
  //
  // This used to be `!pp?.id_verified_at || !pp?.stripe_transfers_active`.
  // Nothing writes id_verified_at — Stripe Identity is not wired — so it
  // is null for every helper who has ever signed up, which made this
  // banner show for ALL of them permanently. The approved, payable QA
  // helper that completed three paid jobs was still being told to verify
  // an ID and pass a background check before it could accept work.
  const { count: myServiceCount } = await supabase
    .from("provider_services")
    .select("service_id", { count: "exact", head: true })
    .eq("provider_id", user.id);

  const readiness: ProviderReadiness = {
    status: (pp?.status as string | null) ?? null,
    isOnline: pp?.is_online === true,
    serviceCount: myServiceCount ?? 0,
    transfersActive: pp?.stripe_transfers_active === true,
    hasBio: !!(pp?.bio && String(pp.bio).trim().length > 0),
  };
  const outstanding = outstandingRequirements(readiness);
  const ready = canAcceptWork(readiness);

  // Only fetch the next-steps inputs once we know the helper is past the
  // onboarding wall — pre-onboarding the only valid next step is "finish
  // onboarding" which the banner above already handles.
  let nextSteps: React.ReactNode = null;
  if (user && ready) {
    const [
      { count: serviceCount },
      { count: weeklyRuleCount },
      { count: completionPhotoCount },
      { count: featuredPortfolioCount },
    ] = await Promise.all([
      supabase.from("provider_services").select("service_id", { count: "exact", head: true }).eq("provider_id", user.id),
      supabase.from("provider_availability_rules").select("id", { count: "exact", head: true }).eq("provider_id", user.id),
      supabase.from("booking_completion_photos").select("id", { count: "exact", head: true }).eq("uploaded_by_user_id", user.id),
      supabase.from("booking_completion_photos").select("id", { count: "exact", head: true }).eq("uploaded_by_user_id", user.id).eq("is_portfolio", true),
    ]);
    nextSteps = (
      <HelperNextStepsWidget
        hasAvatar={!!profile?.avatar_url}
        hasBio={!!(pp?.bio && pp.bio.trim().length > 0)}
        serviceCount={serviceCount ?? 0}
        weeklyRuleCount={weeklyRuleCount ?? 0}
        completionPhotoCount={completionPhotoCount ?? 0}
        featuredPortfolioCount={featuredPortfolioCount ?? 0}
        slug={pp?.slug ?? null}
      />
    );
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 lg:py-8 max-w-5xl mx-auto">
      <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">
        Welcome, {profile?.full_name?.split(" ")[0] || "there"}
      </h1>
      <p className="text-sm text-slate-500 mt-1">Your provider control center.</p>

      {/* Each outstanding requirement, named, with the step that
          actually addresses it. "Finish setting up your account" over a
          list of three things — two of which were not requirements —
          told a helper neither what was wrong nor what to do. */}
      {outstanding.length > 0 && (
        <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold text-slate-900">
              {outstanding.length === 1
                ? outstanding[0].key === "approval"
                  ? "Your application is being reviewed"
                  : `One thing left: ${outstanding[0].label.toLowerCase()}`
                : "A couple of things before you can accept work"}
            </div>
            <ul className="mt-2 space-y-2">
              {outstanding.map((q) => (
                <li key={q.key} className="text-xs text-slate-700 leading-relaxed">
                  <span className="font-semibold">{q.label}.</span> {q.detail}
                  {q.href && q.action && (
                    <Link
                      href={q.href}
                      className="ml-1 inline-flex items-center gap-1 font-semibold text-amber-900 underline"
                    >
                      {q.action} <ArrowRight className="w-3 h-3" />
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {ready && (
        <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 flex items-start gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          <div>
            <div className="text-sm font-bold text-slate-900">
              {readiness.isOnline
                ? "You're online and receiving requests"
                : "You're approved and ready to work"}
            </div>
            <p className="text-xs text-slate-700 mt-1">
              {readiness.isOnline
                ? <>Offers appear on <Link href="/provider/active" className="text-emerald-700 font-semibold underline">Active task</Link>.</>
                : <>Toggle yourself online from <Link href="/provider/active" className="text-emerald-700 font-semibold underline">Active task</Link> to start receiving requests.</>}
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-6">
        <StatCard icon={<DollarSign className="w-5 h-5 text-emerald-600" />} tint="bg-emerald-50" label="Earnings this month" value="$0.00" />
        <StatCard icon={<Calendar className="w-5 h-5 text-brand-600" />} tint="bg-brand-50" label="Tasks completed" value={String(pp?.tasks_completed ?? 0)} />
        <StatCard icon={<Star className="w-5 h-5 text-amber-500" />} tint="bg-amber-50" label="Rating" value={pp?.rating_avg ? String(pp.rating_avg) : "—"} />
      </div>

      {nextSteps}
    </div>
  );
}

function StatCard({ icon, tint, label, value }: { icon: React.ReactNode; tint: string; label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white border border-slate-100 p-5">
      <div className="flex items-start justify-between">
        <div className="text-xs text-slate-500">{label}</div>
        <span className={`w-9 h-9 ${tint} rounded-xl inline-flex items-center justify-center`}>{icon}</span>
      </div>
      <div className="mt-3 text-2xl font-bold text-slate-900">{value}</div>
    </div>
  );
}
