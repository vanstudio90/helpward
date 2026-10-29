import { createSupabaseServerClient } from "@/lib/supabase/server";
import { listServices, listPricingRules } from "@/lib/data/services";
import { ProfileForm, ServicesForm, ProviderAvatarUpload } from "./forms";
import { SlugForm } from "./slug-form";
import { TimezoneCard } from "./timezone-card";
import { CitiesForm } from "./cities-form";
import { unitFor } from "@/lib/money";
import { priceTask } from "@/lib/pricing";
import { displayBaseCents } from "@/lib/country-price";
import { SERVICE_AREAS } from "@/lib/service-areas";
import { canAcceptWork, type ProviderReadiness } from "@/lib/provider-readiness";
import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/provider/ui";

export default async function ProviderProfilePage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: pp }, { data: profile }, allServices, { data: myServices }, rules] =
    await Promise.all([
      supabase.from("provider_profiles").select("*").eq("user_id", user.id).single(),
      supabase.from("profiles").select("avatar_url, full_name, country").eq("id", user.id).single(),
      listServices(),
      supabase.from("provider_services").select("service_id").eq("provider_id", user.id),
      listPricingRules(),
    ]);

  // Cities this helper accepts work in. No rows is a real state — every
  // account created before migration 0072 is in it — and means unrestricted,
  // so the card says so rather than rendering an ambiguous empty list.
  const { data: contact } = await supabase
    .from("profile_contacts")
    .select("phone")
    .eq("user_id", user.id)
    .maybeSingle();

  const { data: myCities } = await supabase
    .from("provider_cities")
    .select("area_id, municipality")
    .eq("provider_id", user.id);

  // Which market's prices this helper is actually paid in.
  //
  // The cities they chose are the better answer than profiles.country,
  // which is set from a signup field and never corrected: someone who
  // picked Lower Mainland cities is paid in CAD whatever their account
  // says. Falls back to the profile country, then to US.
  const workArea = SERVICE_AREAS.find((a) => a.id === myCities?.[0]?.area_id);
  const payCountry: "US" | "CA" =
    workArea?.country ?? (profile?.country === "CA" ? "CA" : "US");

  const mySelectedServices = (myServices ?? []).map((r) => r.service_id as string);

  // Whether this helper is still working through the setup list decides
  // where "done" should send them. Same readiness the dashboard and the
  // onboarding page use, so all three agree about what is outstanding.
  const readiness: ProviderReadiness = {
    status: pp?.status ?? "pending",
    serviceCount: mySelectedServices.length,
    transfersActive: !!pp?.stripe_transfers_active,
    hasBio: !!pp?.bio,
    isOnline: !!pp?.is_online,
  };
  const stillSettingUp = !canAcceptWork(readiness);


  return (
    <div className="space-y-5">
      {/* There was no way back from this page — not to the setup steps, not
          to the dashboard. A helper who arrived from "Complete your
          profile" on step 1, filled it in and saved was simply stranded. */}
      <Link
        href={stillSettingUp ? "/provider/onboard" : "/provider/dashboard"}
        className="inline-flex items-center gap-1.5 text-[15px] font-semibold text-brand-700 mb-3"
      >
        <ArrowLeft className="w-4 h-4" aria-hidden="true" />
        {stillSettingUp ? "Setup steps" : "Dashboard"}
      </Link>

      <PageHeader title="My profile" subtitle="Customers see this when matching tasks." />

      <div className="space-y-5">
        <ProviderAvatarUpload
          avatarUrl={profile?.avatar_url ?? null}
          fullName={profile?.full_name ?? ""}
        />

        <SlugForm initial={pp?.slug ?? null} />

        <TimezoneCard stored={pp?.timezone ?? "UTC"} />

        <ProfileForm initial={{
          full_name: profile?.full_name ?? "",
          phone: contact?.phone ?? "",
          base_address: pp?.base_address ?? "",
          bio: pp?.bio ?? "",
          service_radius_km: pp?.service_radius_km ?? 20,
          languages: (pp?.languages ?? []).join(", "),
        }} />

        <CitiesForm
          areaId={myCities?.[0]?.area_id ?? null}
          selected={(myCities ?? []).map((c) => c.municipality)}
        />

        <ServicesForm
          country={payCountry}
          allServices={allServices.map((s) => {
            // The local customer subtotal, from the same country rule the
            // database charges — not services.base_price_cents, which is
            // the legacy single number that made this card say "Base $15"
            // for a job billed at CA$40.
            const subtotal = displayBaseCents(
              s.base_price_cents, s.country_pricing ?? undefined, payCountry,
            );
            return {
              id: s.id, title: s.title, category: s.category.label, blurb: s.blurb,
              subtotalCents: subtotal,
              helperEarnsCents: priceTask(subtotal).helperPayoutCents,
              customerPaysCents: priceTask(subtotal).totalCents,
              unit: unitFor(rules[s.id] ?? null),
            };
          })}
          initialSelected={mySelectedServices}
        />

        {/* The way out, at the bottom where someone lands after saving the
            last card. Each card saves on its own, so this is navigation,
            not a submit — it must not look like one more thing to press
            before the work counts. */}
        <div className="rounded-card bg-brand-50 border border-brand-100 p-4 sm:p-5">
          <p className="text-[15px] text-slate-700">
            {stillSettingUp
              ? "Each card above saves on its own — there's nothing left to submit here."
              : "You're set up. Go online from your dashboard to start receiving offers."}
          </p>
          <Link
            href={stillSettingUp ? "/provider/onboard" : "/provider/dashboard"}
            className="mt-3 inline-flex items-center gap-2 px-4 py-2.5 rounded-field bg-brand-600 text-white text-[15px] font-semibold"
          >
            {stillSettingUp ? "Back to your setup steps" : "Back to dashboard"}
            <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </div>
  );
}
