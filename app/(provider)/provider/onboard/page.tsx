import { createSupabaseServerClient } from "@/lib/supabase/server";
import Link from "next/link";
import { listServices } from "@/lib/data/services";
import { Check } from "lucide-react";
import { ProviderServicesForm } from "./services-form";
import { PayoutStep, type PayoutState } from "./payout-step";

export default async function ProviderOnboardPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: pp } = await supabase
    .from("provider_profiles")
    .select("*")
    .eq("user_id", user?.id ?? "")
    .maybeSingle();
  const services = await listServices();
  const { data: myServiceRows } = user
    ? await supabase
        .from("provider_services")
        .select("service_id")
        .eq("provider_id", user.id)
    : { data: [] };
  const selectedServiceIds = (myServiceRows ?? []).map((r) => r.service_id as string);
  const providerServiceCount = selectedServiceIds.length;

  // ONLY the steps a helper can actually finish, and that actually bear on
  // whether they can work.
  //
  // "Verify your ID" and "Background check" used to sit in this list
  // marked "Pending Stripe Identity wiring" / "Pending Checkr / Triton
  // wiring" — steps nobody can ever complete, in a checklist headed
  // "Complete every step to start accepting tasks". So a helper was told
  // that finishing an unfinishable list was the condition of working,
  // while the real condition (approved, offering a service, online) might
  // already be met and they might already be taking jobs. Neither check
  // is wired, so neither is a requirement, so neither belongs here.
  const steps = [
    { key: "profile", title: "Basic profile", done: !!pp?.bio },
    { key: "services", title: "Pick services you offer", done: providerServiceCount > 0 },
    // Started is not done: an account can exist with Stripe still waiting on
    // a document. stripe_transfers_active is the flag that means a
    // destination charge to this helper will actually land.
    { key: "payouts", title: "Connect a bank account", done: !!pp?.stripe_transfers_active },
  ];

  const allStepsDone = steps.every((s) => s.done);
  const approved = pp?.status === "approved";

  const payoutState: PayoutState = {
    started: !!pp?.stripe_connect_account_id,
    payable: !!pp?.stripe_transfers_active,
    detailsSubmitted: !!pp?.stripe_details_submitted,
    requirementsDue: Array.isArray(pp?.stripe_requirements_due)
      ? (pp.stripe_requirements_due as string[])
      : [],
    disabledReason: (pp?.stripe_disabled_reason as string | null) ?? null,
  };

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 max-w-3xl mx-auto">
      <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">Provider onboarding</h1>
      {/* What the helper is actually waiting on, which is not always this
          list. Approval is a decision a person at Helpward makes; the
          page used to imply the checklist alone decided it. */}
      <p className="text-sm text-slate-500 mt-1">
        {approved
          ? allStepsDone
            ? "You're approved and set up. Go online from your dashboard to start receiving offers."
            : "You're approved. Finish the steps below so offers can reach you and so you can be paid."
          : allStepsDone
            ? "Everything on your side is done. A person at Helpward reviews your application before you can accept work — we'll email you when that's decided."
            : "Finish these steps, then a person at Helpward reviews your application before you can accept work."}
      </p>

      <ol className="mt-6 space-y-3">
        {steps.map((s, i) => (
          <li key={s.key} className="rounded-2xl bg-white border border-slate-100 p-4 flex items-start gap-3">
            {/* The "blocked" styling that was here served the two
                unwireable steps, which are gone, so it served nothing. */}
            <span className={`w-8 h-8 rounded-full inline-flex items-center justify-center text-sm font-bold shrink-0 ${
              s.done ? "bg-emerald-500 text-white" : "bg-brand-600 text-white"
            }`}>
              {s.done ? <Check className="w-4 h-4" /> : i + 1}
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold text-slate-900">{s.title}</div>
              {s.done && s.key !== "payouts" && (
                <div className="text-xs text-emerald-700 mt-0.5">Completed</div>
              )}
              {s.key === "payouts" && <PayoutStep state={payoutState} />}
            </div>
          </li>
        ))}
      </ol>

      <p className="mt-4 text-xs text-slate-500 leading-relaxed">
        Helpward does not currently run ID verification or criminal background
        checks. Applications are read and approved by a person. If that changes,
        you&rsquo;ll be asked for them here before it applies to you.
      </p>

      <ProviderServicesForm services={services} initialSelected={selectedServiceIds} />

      <Link
        href="/provider/dashboard"
        className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-brand-700"
      >
        ← Back to dashboard
      </Link>
    </div>
  );
}
