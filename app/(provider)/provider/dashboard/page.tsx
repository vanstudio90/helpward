import { createSupabaseServerClient } from "@/lib/supabase/server";
import Link from "next/link";
import {
  outstandingRequirements, canAcceptWork, type ProviderReadiness,
} from "@/lib/provider-readiness";
import {
  AlertCircle, ArrowRight, Wallet, CalendarCheck, Star, Inbox,
  ListChecks, Calendar, MessageCircle, Info,
} from "lucide-react";
import { HelperNextStepsWidget } from "./next-steps";
import { OnlineCard } from "./online-card";
import {
  PageHeader, SectionLabel, Card, StatCard, RowGroup, Row, Action, TextAction, Hint,
} from "@/components/provider/ui";
import { formatMoney } from "@/lib/money";

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

  /* This tile read value="$0.00", hardcoded, for every helper.
   *
   * Someone who had completed paid work opened their home screen and was
   * told they had earned nothing. Same source as the Earnings page:
   * payout_cents on completed bookings, which is what accept_request
   * stores and what actually gets paid out. */
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const { data: monthRows } = await supabase
    .from("bookings")
    .select("payout_cents, currency")
    .eq("provider_id", user.id)
    .eq("status", "completed")
    .gte("completed_at", monthStart.toISOString());
  const monthCents = (monthRows ?? []).reduce((sum, r) => sum + (r.payout_cents ?? 0), 0);
  const currency = (monthRows ?? [])[0]?.currency ?? "USD";

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
    <div className="space-y-5">
      {/* Soft shapes bleeding off the corner. Purely atmospheric, and
          aria-hidden so a screen reader never meets them. */}
      <div className="relative">
        <div aria-hidden="true" className="pointer-events-none absolute -top-10 -right-6 w-44 h-44 rounded-full bg-brand-100/40 blur-[2px]" />
        <div aria-hidden="true" className="pointer-events-none absolute -top-2 right-28 w-20 h-20 rounded-full bg-brand-100/30" />
        <div className="relative">
          <PageHeader
            greeting={`Hi, ${profile?.full_name?.split(" ")[0] || "there"}`}
            title={ready ? "Ready for your next task?" : "Let's get you set up"}
          />
        </div>
      </div>

      {/* Each outstanding requirement, named, with the step that actually
          addresses it. "Finish setting up your account" over a list of
          three things — two of which were not requirements — told a
          helper neither what was wrong nor what to do. */}
      {outstanding.length > 0 && (
        <Card className="border-amber-200 bg-amber-50 p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" aria-hidden="true" />
          <div className="flex-1 min-w-0">
            <div className="text-[15px] font-bold text-slate-900">
              {outstanding.length === 1
                ? outstanding[0].key === "approval"
                  ? "Your application is under review"
                  : `One step remaining: ${outstanding[0].label.toLowerCase()}`
                : "Complete these steps to start accepting jobs"}
            </div>
            <ul className="mt-2 space-y-2">
              {outstanding.map((q) => (
                <li key={q.key} className="text-[13px] text-slate-700 leading-relaxed">
                  <span className="font-semibold">{q.label}.</span> {q.detail}
                  {q.href && q.action && (
                    <Link href={q.href} className="ml-1 inline-flex items-center gap-1 font-semibold text-amber-900 underline">
                      {q.action} <ArrowRight className="w-3 h-3" aria-hidden="true" />
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </Card>
      )}

      {ready && <OnlineCard initialOnline={readiness.isOnline} />}

      {ready && (
        <Action href="/provider/inbox" icon={Inbox} trailingChevron>
          View offers
        </Action>
      )}

      <section>
        <div className="flex items-center justify-between gap-3 mb-2.5 px-1">
          <h2 className="text-[20px] font-extrabold tracking-[-0.01em] text-slate-900">Your overview</h2>
          <TextAction href="/provider/earnings">View earnings</TextAction>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <StatCard icon={Wallet} label="This month" value={formatMoney(monthCents, currency)} note="Earnings" />
          <StatCard icon={CalendarCheck} label="Completed" value={String(pp?.tasks_completed ?? 0)} note="Tasks" />
        </div>
        <div className="mt-3">
          <RowGroup>
            <Row
              icon={Star}
              tone="amber"
              href="/provider/reviews"
              title={pp?.rating_avg ? `${pp.rating_avg} average` : "No ratings yet"}
              sub={pp?.rating_avg ? "From your completed tasks." : "Your rating appears after your first review."}
            />
          </RowGroup>
        </div>
      </section>

      <section>
        <SectionLabel>Quick access</SectionLabel>
        <RowGroup>
          <Row icon={ListChecks} href="/provider/profile" title="My services" sub="What you offer" />
          <Row icon={Calendar} href="/provider/schedule" title="Availability" sub="When you can work" />
          <Row icon={MessageCircle} href="/provider/messages" title="Messages" sub="Customer conversations" />
        </RowGroup>
      </section>

      {nextSteps}

      <Hint icon={Info}>
        New requests appear in Offers. Accepted work is in Active.
      </Hint>
    </div>
  );
}
