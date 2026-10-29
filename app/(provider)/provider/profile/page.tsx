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

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 lg:py-8 max-w-3xl mx-auto pb-12">
      <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">My helper profile</h1>
      <p className="text-sm text-slate-500 mt-1 mb-6">
        Customers see this on your public profile when matching tasks.
      </p>

      <div className="space-y-5">
        <ProviderAvatarUpload
          avatarUrl={profile?.avatar_url ?? null}
          fullName={profile?.full_name ?? ""}
        />

        <SlugForm initial={pp?.slug ?? null} />

        <TimezoneCard stored={pp?.timezone ?? "UTC"} />

        <ProfileForm initial={{
          full_name: profile?.full_name ?? "",
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
      </div>
    </div>
  );
}
