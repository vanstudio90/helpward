import { listServices, listCategories } from "@/lib/data/services";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NewRequestView, type SavedAddressOption } from "./view";

export default async function NewRequestPage({
  searchParams,
}: { searchParams: Promise<{ service?: string; q?: string }> }) {
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
  return (
    <NewRequestView
      services={services}
      categories={categories}
      initialServiceId={initialServiceId}
      initialQuery={initialQuery}
      savedAddresses={savedAddresses}
    />
  );
}
