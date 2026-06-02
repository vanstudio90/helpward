import { createSupabaseServerClient } from "@/lib/supabase/server";
import { listServices } from "@/lib/data/services";
import { ProfileForm, ServicesForm, ProviderAvatarUpload } from "./forms";
import { SlugForm } from "./slug-form";

export default async function ProviderProfilePage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: pp }, { data: profile }, allServices, { data: myServices }] = await Promise.all([
    supabase.from("provider_profiles").select("*").eq("user_id", user.id).single(),
    supabase.from("profiles").select("avatar_url, full_name").eq("id", user.id).single(),
    listServices(),
    supabase.from("provider_services").select("service_id, custom_price_cents").eq("provider_id", user.id),
  ]);

  const myServiceMap = new Map(
    (myServices ?? []).map((r) => [r.service_id, r.custom_price_cents as number | null] as const)
  );

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 lg:py-8 max-w-3xl mx-auto pb-12">
      <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">My provider profile</h1>
      <p className="text-sm text-slate-500 mt-1 mb-6">
        Customers see this on your public profile when matching tasks.
      </p>

      <div className="space-y-5">
        <ProviderAvatarUpload
          avatarUrl={profile?.avatar_url ?? null}
          fullName={profile?.full_name ?? ""}
        />

        <SlugForm initial={pp?.slug ?? null} />

        <ProfileForm initial={{
          bio: pp?.bio ?? "",
          service_radius_km: pp?.service_radius_km ?? 20,
          languages: (pp?.languages ?? []).join(", "),
        }} />

        <ServicesForm
          allServices={allServices.map((s) => ({
            id: s.id, title: s.title, category: s.category.label, blurb: s.blurb,
            basePriceCents: s.base_price_cents,
          }))}
          initialSelected={Array.from(myServiceMap.keys())}
          initialCustomPrices={Object.fromEntries(myServiceMap)}
        />
      </div>
    </div>
  );
}
