import { listServices, listCategories } from "@/lib/data/services";
import { ServicesView } from "./view";

export default async function ServicesPage() {
  const [services, categories] = await Promise.all([
    listServices(),
    listCategories(),
  ]);
  return <ServicesView services={services} categories={categories} />;
}
