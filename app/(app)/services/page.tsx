import { listServices, listCategories, listPricingRules } from "@/lib/data/services";
import { listFavoritesByKind, getMe } from "@/lib/data/customer";
import { ServicesView } from "./view";

export default async function ServicesPage() {
  const [services, categories, pricingRules, favs, me] = await Promise.all([
    listServices(),
    listCategories(),
    listPricingRules(),
    listFavoritesByKind("service"),
    getMe(),
  ]);
  const favoritedIds = favs.map((f) => f.target_id);
  return (
    <ServicesView
      services={services}
      categories={categories}
      initialFavoritedIds={favoritedIds}
      pricingRules={pricingRules}
      // Browsing, so there is no pickup address yet. The booking's real
      // currency comes from the pickup country at acceptance (0052).
      currency={me?.profile?.country === "CA" ? "CAD" : "USD"}
    />
  );
}
