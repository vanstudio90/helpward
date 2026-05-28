import { listServices, listCategories } from "@/lib/data/services";
import { NewRequestView } from "./view";

export default async function NewRequestPage({
  searchParams,
}: { searchParams: Promise<{ service?: string }> }) {
  const [services, categories, params] = await Promise.all([
    listServices(),
    listCategories(),
    searchParams,
  ]);
  // Honour ?service=<slug> deep links from the homepage catalog so a customer
  // who clicks a service card lands with that service already selected.
  const initialServiceId = services.find((s) => s.id === params.service)?.id ?? null;
  return (
    <NewRequestView
      services={services}
      categories={categories}
      initialServiceId={initialServiceId}
    />
  );
}
