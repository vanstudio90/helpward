import type { MetadataRoute } from "next";

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://helpward.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/admin/",
          "/auth/",
          "/dashboard",
          "/messages",
          "/bookings",
          "/saved-providers",
          "/favorites",
          "/payments",
          "/analytics",
          "/settings",
          "/business",
          "/new-request",
          "/provider/",
        ],
      },
    ],
    sitemap: `${BASE}/sitemap.xml`,
    host: BASE,
  };
}
