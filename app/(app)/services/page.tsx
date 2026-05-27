import { listServices, listCategories } from "@/lib/data/services";
import { listFavoritesByKind } from "@/lib/data/customer";
import { ServicesView } from "./view";

export default async function ServicesPage() {
  const [services, categories, favs] = await Promise.all([
    listServices(),
    listCategories(),
    listFavoritesByKind("service"),
  ]);
  const favoritedIds = favs.map((f) => f.target_id);
  return <ServicesView services={services} categories={categories} initialFavoritedIds={favoritedIds} />;
}
