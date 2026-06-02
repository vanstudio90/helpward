import { createSupabaseServerClient } from "@/lib/supabase/server";
import Link from "next/link";
import {
  AlertCircle, CheckCircle2, ArrowRight, DollarSign, Calendar, Star,
} from "lucide-react";
import { HelperNextStepsWidget } from "./next-steps";

export default async function ProviderDashboardPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [{ data: profile }, { data: pp }] = await Promise.all([
    supabase.from("profiles").select("full_name, avatar_url").single(),
    supabase.from("provider_profiles").select("*").single(),
  ]);

  const needsOnboarding = !pp?.id_verified_at || !pp?.stripe_connect_account_id;

  // Only fetch the next-steps inputs once we know the helper is past the
  // onboarding wall — pre-onboarding the only valid next step is "finish
  // onboarding" which the banner above already handles.
  let nextSteps: React.ReactNode = null;
  if (user && !needsOnboarding && pp?.status === "approved") {
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

      {needsOnboarding && (
        <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="text-sm font-bold text-slate-900">Finish setting up your account</div>
            <p className="text-xs text-slate-700 mt-1 leading-relaxed">
              You need to verify your ID, pass a background check, and connect a bank account before you can accept tasks.
            </p>
            <Link
              href="/provider/onboard"
              className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold"
            >
              Continue onboarding <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      )}

      {!needsOnboarding && pp?.status === "approved" && (
        <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 flex items-start gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          <div>
            <div className="text-sm font-bold text-slate-900">You're approved and ready to work</div>
            <p className="text-xs text-slate-700 mt-1">
              Toggle yourself online from <Link href="/provider/active" className="text-emerald-700 font-semibold underline">Active task</Link> to start receiving requests.
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
