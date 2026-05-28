import type { MetadataRoute } from "next";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { listServicesPublic } from "@/lib/data/services";
import { CITIES } from "@/lib/marketing";

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://helpward.com";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${BASE}/`,        lastModified: now, changeFrequency: "weekly",  priority: 1.0 },
    { url: `${BASE}/about`,   lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${BASE}/safety`,  lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${BASE}/help`,    lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${BASE}/terms`,   lastModified: now, changeFrequency: "yearly",  priority: 0.3 },
    { url: `${BASE}/privacy`, lastModified: now, changeFrequency: "yearly",  priority: 0.3 },
    { url: `${BASE}/login`,   lastModified: now, changeFrequency: "yearly",  priority: 0.4 },
    { url: `${BASE}/signup`,  lastModified: now, changeFrequency: "yearly",  priority: 0.5 },
  ];

  // Programmatic: one entry per city landing page (/cities/<slug>)
  const cityRoutes: MetadataRoute.Sitemap = CITIES.map((c) => ({
    url: `${BASE}/cities/${c.slug}`,
    lastModified: now,
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  // Programmatic: one entry per service landing page (/services/<slug>)
  let serviceRoutes: MetadataRoute.Sitemap = [];
  try {
    const services = await listServicesPublic();
    serviceRoutes = services.map((s) => ({
      url: `${BASE}/services/${s.id}`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: s.popular ? 0.9 : 0.7,
    }));
  } catch (e) {
    console.error("sitemap services fetch failed:", e);
  }

  // Dynamic: every approved provider gets a public profile URL
  let providerRoutes: MetadataRoute.Sitemap = [];
  try {
    const supabase = createSupabaseServiceClient();
    const { data: providers } = await supabase
      .from("provider_profiles")
      .select("user_id, created_at")
      .eq("status", "approved")
      .order("created_at", { ascending: false })
      .limit(5000);

    providerRoutes = (providers ?? []).map((p) => ({
      url: `${BASE}/providers/${p.user_id}`,
      lastModified: new Date(p.created_at),
      changeFrequency: "weekly",
      priority: 0.7,
    }));
  } catch (e) {
    console.error("sitemap providers fetch failed:", e);
  }

  return [...staticRoutes, ...cityRoutes, ...serviceRoutes, ...providerRoutes];
}
