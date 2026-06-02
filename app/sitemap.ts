import type { MetadataRoute } from "next";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { listServicesPublic } from "@/lib/data/services";
import { CITIES } from "@/lib/marketing";
import { HELP_ARTICLES } from "@/lib/help-articles";
import { SAFETY_PAGES } from "./safety/_safety-shell";
import { JOBS } from "@/lib/careers";
import { BLOG_POSTS } from "@/lib/blog-posts";

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
    { url: `${BASE}/careers`, lastModified: now, changeFrequency: "weekly",  priority: 0.6 },
    { url: `${BASE}/blog`,    lastModified: now, changeFrequency: "weekly",  priority: 0.6 },
  ];

  // Programmatic: one entry per city landing page (/cities/<slug>)
  const cityRoutes: MetadataRoute.Sitemap = CITIES.map((c) => ({
    url: `${BASE}/cities/${c.slug}`,
    lastModified: now,
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  // Programmatic: one entry per service landing (/services/<slug>) AND one
  // per city-service combo (/cities/<city>/<service>) — the cartesian gives
  // us ~270 long-tail URLs for "<service> in <city>" queries.
  let serviceRoutes: MetadataRoute.Sitemap = [];
  let cityServiceRoutes: MetadataRoute.Sitemap = [];
  try {
    const services = await listServicesPublic();
    serviceRoutes = services.map((s) => ({
      url: `${BASE}/services/${s.id}`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: s.popular ? 0.9 : 0.7,
    }));
    cityServiceRoutes = CITIES.flatMap((c) =>
      services.map((s) => ({
        url: `${BASE}/cities/${c.slug}/${s.id}`,
        lastModified: now,
        changeFrequency: "weekly" as const,
        priority: s.popular ? 0.7 : 0.5,
      }))
    );
  } catch (e) {
    console.error("sitemap services fetch failed:", e);
  }

  // Dynamic: every approved provider gets a public profile URL
  let providerRoutes: MetadataRoute.Sitemap = [];
  try {
    const supabase = createSupabaseServiceClient();
    const { data: providers } = await supabase
      .from("provider_profiles")
      .select("user_id, slug, created_at")
      .eq("status", "approved")
      .order("created_at", { ascending: false })
      .limit(5000);

    // Prefer slug URL when present — the loader 301s UUID → slug anyway,
    // so emitting the canonical form keeps Google from chasing redirects.
    providerRoutes = (providers ?? []).map((p) => ({
      url: `${BASE}/providers/${p.slug ?? p.user_id}`,
      lastModified: new Date(p.created_at),
      changeFrequency: "weekly",
      priority: 0.7,
    }));
  } catch (e) {
    console.error("sitemap providers fetch failed:", e);
  }

  const helpRoutes: MetadataRoute.Sitemap = HELP_ARTICLES.map((a) => ({
    url: `${BASE}/help/${a.slug}`,
    lastModified: new Date(a.updatedAt),
    changeFrequency: "monthly",
    priority: 0.6,
  }));

  const safetyRoutes: MetadataRoute.Sitemap = SAFETY_PAGES.map((p) => ({
    url: `${BASE}/safety/${p.slug}`,
    lastModified: now,
    changeFrequency: "monthly",
    priority: 0.7,
  }));

  const careerRoutes: MetadataRoute.Sitemap = JOBS.map((j) => ({
    url: `${BASE}/careers/${j.slug}`,
    lastModified: new Date(j.postedAt),
    changeFrequency: "weekly",
    priority: 0.6,
  }));

  const blogRoutes: MetadataRoute.Sitemap = BLOG_POSTS.map((p) => ({
    url: `${BASE}/blog/${p.slug}`,
    lastModified: new Date(p.updatedAt ?? p.publishedAt),
    changeFrequency: "monthly",
    priority: 0.6,
  }));

  return [
    ...staticRoutes, ...cityRoutes, ...serviceRoutes, ...cityServiceRoutes,
    ...helpRoutes, ...safetyRoutes, ...careerRoutes, ...blogRoutes, ...providerRoutes,
  ];
}
