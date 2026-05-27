import { listServices, listCategories } from "@/lib/data/services";
import { NewRequestView } from "./view";

export default async function NewRequestPage() {
  const [services, categories] = await Promise.all([listServices(), listCategories()]);
  return <NewRequestView services={services} categories={categories} />;
}
