import type { MetadataRoute } from "next";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://helpward.com";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${BASE}/`,        lastModified: now, changeFrequency: "weekly",  priority: 1.0 },
    { url: `${BASE}/about`,   lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${BASE}/safety`,  lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${BASE}/help`,    lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${BASE}/terms`,   lastModified: now, changeFrequency: "yearly",  priority: 0.3 },
    { url: `${BASE}/privacy`, lastModified: now, changeFrequency: "yearly",  priority: 0.3 },
    { url: `${BASE}/login`,   lastModified: now, changeFrequency: "yearly",  priority: 0.4 },
    { url: `${BASE}/signup`,  lastModified: now, changeFrequency: "yearly",  priority: 0.5 },
  ];

  // Dynamic: every approved provider gets a public profile URL
  try {
    const supabase = createSupabaseServiceClient();
    const { data: providers } = await supabase
      .from("provider_profiles")
      .select("user_id, created_at")
      .eq("status", "approved")
      .order("created_at", { ascending: false })
      .limit(5000);

    const providerRoutes: MetadataRoute.Sitemap = (providers ?? []).map((p) => ({
      url: `${BASE}/providers/${p.user_id}`,
      lastModified: new Date(p.created_at),
      changeFrequency: "weekly",
      priority: 0.7,
    }));

    return [...staticRoutes, ...providerRoutes];
  } catch (e) {
    console.error("sitemap providers fetch failed:", e);
    return staticRoutes;
  }
}
