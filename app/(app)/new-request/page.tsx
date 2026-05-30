import { listServices, listCategories } from "@/lib/data/services";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NewRequestView, type SavedAddressOption, type PreferredHelper } from "./view";

export default async function NewRequestPage({
  searchParams,
}: { searchParams: Promise<{ service?: string; q?: string; preferred_helper?: string }> }) {
  const supabase = await createSupabaseServerClient();
  const [services, categories, params, savedAddrRes] = await Promise.all([
    listServices(),
    listCategories(),
    searchParams,
    supabase
      .from("saved_addresses")
      .select("id, label, formatted, is_default")
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: false }),
  ]);
  // Honour ?service=<slug> deep links from the homepage catalog so a customer
  // who clicks a service card lands with that service already selected.
  // ?q=<text> from the hero search box pre-fills the notes textarea so the
  // helper sees what the customer typed/spoke verbatim.
  const initialServiceId = services.find((s) => s.id === params.service)?.id ?? null;
  const initialQuery = typeof params.q === "string" ? params.q.slice(0, 500) : null;
  const savedAddresses = (savedAddrRes.data as SavedAddressOption[] | null) ?? [];

  // ?preferred_helper=<uuid> from the favorites Book-again CTA. We fetch the
  // helper's name + avatar to render a banner so the customer knows the new
  // request is routed to them first. Action revalidates this id server-side
  // again before persisting; the UI just trusts the display fields.
  let preferredHelper: PreferredHelper | null = null;
  const phRaw = params.preferred_helper;
  if (typeof phRaw === "string" && /^[0-9a-f-]{36}$/i.test(phRaw)) {
    const { data: pp } = await supabase
      .from("provider_profiles")
      .select(`
        user_id,
        profile:profiles!provider_profiles_user_id_fkey(full_name, avatar_url)
      `)
      .eq("user_id", phRaw)
      .eq("status", "approved")
      .maybeSingle();
    const prof = (pp as { user_id: string; profile: { full_name: string; avatar_url: string | null } | null } | null);
    if (prof) {
      preferredHelper = {
        id: prof.user_id,
        full_name: prof.profile?.full_name ?? "Your helper",
        avatar_url: prof.profile?.avatar_url ?? null,
      };
    }
  }

  return (
    <NewRequestView
      services={services}
      categories={categories}
      initialServiceId={initialServiceId}
      initialQuery={initialQuery}
      savedAddresses={savedAddresses}
      preferredHelper={preferredHelper}
    />
  );
}
