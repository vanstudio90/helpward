import type { MetadataRoute } from "next";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { listServicesPublic } from "@/lib/data/services";
import { CITIES } from "@/lib/marketing";
import { HELP_ARTICLES } from "@/lib/help-articles";
import { SAFETY_PAGES } from "./safety/_safety-shell";
import { JOBS } from "@/lib/careers";
import { BLOG_POSTS } from "@/lib/blog-posts";
import { COMPETITORS } from "@/lib/competitors";

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://helpward.com";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {

  /* lastModified must mean "when this content last changed".
   *
   * Every static route used `now`, so the sitemap told Google that the
   * terms, the privacy policy and the login page had ALL been revised
   * on whatever day it happened to be fetched. A date that moves on its
   * own carries no information, and a crawler that learns the dates are
   * meaningless stops using them to prioritise — which is the whole
   * point of sending them.
   *
   * These are the dates the pages genuinely last changed. Update the
   * entry when you edit the page; do not reach for `new Date()`.
   *
   * /login and /signup are omitted entirely. They are utility pages with
   * nothing to rank, and a sitemap is a list of pages worth indexing. */
  const d = (iso: string) => new Date(iso);

  /* Programmatic pages share one content date.
   *
   * Service and city-service pages are generated from the catalogue, so
   * "when did this page last change" is "when did the catalogue or the
   * template last change" — 2026-10-28, when four services were activated
   * and the templates were revised. Bump this deliberately when the
   * catalogue or the templates change; do not wire it back to new Date(),
   * which is how every page came to claim it was edited today. */
  const CATALOGUE_UPDATED = d("2026-10-28");
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${BASE}/`,            lastModified: d("2026-10-28"), changeFrequency: "weekly",  priority: 1.0 },
    { url: `${BASE}/cities`,      lastModified: d("2026-10-28"), changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE}/about`,       lastModified: d("2026-10-24"), changeFrequency: "monthly", priority: 0.6 },
    { url: `${BASE}/safety`,      lastModified: d("2026-10-26"), changeFrequency: "monthly", priority: 0.7 },
    { url: `${BASE}/help`,        lastModified: d("2026-10-26"), changeFrequency: "monthly", priority: 0.5 },
    { url: `${BASE}/terms`,       lastModified: d("2026-10-28"), changeFrequency: "yearly",  priority: 0.3 },
    { url: `${BASE}/privacy`,     lastModified: d("2026-10-28"), changeFrequency: "yearly",  priority: 0.3 },
    { url: `${BASE}/careers`,     lastModified: d("2026-10-24"), changeFrequency: "weekly",  priority: 0.6 },
    { url: `${BASE}/blog`,        lastModified: d("2026-10-24"), changeFrequency: "weekly",  priority: 0.6 },
  ];


  // Programmatic: one entry per city landing page (/cities/<slug>)
  const cityRoutes: MetadataRoute.Sitemap = CITIES.map((c) => ({
    url: `${BASE}/cities/${c.slug}`,
    lastModified: CATALOGUE_UPDATED,
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
      lastModified: CATALOGUE_UPDATED,
      changeFrequency: "weekly",
      priority: s.popular ? 0.9 : 0.7,
    }));
    cityServiceRoutes = CITIES.flatMap((c) =>
      services.map((s) => ({
        url: `${BASE}/cities/${c.slug}/${s.id}`,
        lastModified: CATALOGUE_UPDATED,
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
    lastModified: CATALOGUE_UPDATED,
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

  const versusRoutes: MetadataRoute.Sitemap = [
    { url: `${BASE}/vs`, lastModified: CATALOGUE_UPDATED, changeFrequency: "monthly", priority: 0.7 },
    { url: `${BASE}/vs/why`, lastModified: CATALOGUE_UPDATED, changeFrequency: "monthly", priority: 0.7 },
    { url: `${BASE}/vs/trust`, lastModified: CATALOGUE_UPDATED, changeFrequency: "monthly", priority: 0.7 },
    { url: `${BASE}/vs/pricing`, lastModified: CATALOGUE_UPDATED, changeFrequency: "monthly", priority: 0.7 },
    ...COMPETITORS.map((c) => ({
      url: `${BASE}/vs/${c.slug}`,
      lastModified: CATALOGUE_UPDATED,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
  ];

  return [
    ...staticRoutes, ...cityRoutes, ...serviceRoutes, ...cityServiceRoutes,
    ...helpRoutes, ...safetyRoutes, ...careerRoutes, ...blogRoutes, ...providerRoutes,
    ...versusRoutes,
  ];
}
