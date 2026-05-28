import { listServices, listCategories } from "@/lib/data/services";
import { NewRequestView } from "./view";

export default async function NewRequestPage({
  searchParams,
}: { searchParams: Promise<{ service?: string; q?: string }> }) {
  const [services, categories, params] = await Promise.all([
    listServices(),
    listCategories(),
    searchParams,
  ]);
  // Honour ?service=<slug> deep links from the homepage catalog so a customer
  // who clicks a service card lands with that service already selected.
  // ?q=<text> from the hero search box pre-fills the notes textarea so the
  // helper sees what the customer typed/spoke verbatim.
  const initialServiceId = services.find((s) => s.id === params.service)?.id ?? null;
  const initialQuery = typeof params.q === "string" ? params.q.slice(0, 500) : null;
  return (
    <NewRequestView
      services={services}
      categories={categories}
      initialServiceId={initialServiceId}
      initialQuery={initialQuery}
    />
  );
}
