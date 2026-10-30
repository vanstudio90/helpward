import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, MapPin } from "lucide-react";
import { MarketingShell } from "@/components/MarketingShell";
import { CITIES } from "@/lib/marketing";
import { listServicesPublic, listCategoriesPublic } from "@/lib/data/services";
import { staticPriceLabel } from "@/lib/country-price";
import { formatMoney } from "@/lib/money";
import { serviceCopy } from "@/lib/service-copy";

/* The public way into the catalogue.
 *
 * /services sends a signed-out visitor to a login form, so there was no
 * crawlable route from the marketing site to any service page: they existed
 * only in the sitemap. A page reachable only from a sitemap is reachable
 * only by a crawler that already knows about it, and by no person at all.
 *
 * This is deliberately a directory rather than a second catalogue. It links
 * to the public information page for each service and to both region hubs,
 * and every CTA goes to the existing request flow — no app route is
 * unlocked, no booking logic is touched, and the signed-in /services
 * experience is unchanged.
 */

export const dynamic = "force-static";
export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Our Services — Everything You Can Book | Helpward",
  description:
    "Every service Helpward offers in San Diego and Vancouver's Lower Mainland, what each booking covers, "
    + "and what it costs before the service fee. Browse without an account.",
  alternates: { canonical: "/our-services" },
  openGraph: {
    type: "website",
    title: "Our Services | Helpward",
    description: "Every service Helpward offers, what each booking covers, and what it costs.",
    url: "/our-services",
    siteName: "Helpward",
  },
};

export default async function OurServicesPage() {
  const [services, categories] = await Promise.all([
    listServicesPublic(),
    listCategoriesPublic(),
  ]);

  const byCategory = categories
    .map((c) => ({ category: c, items: services.filter((s) => s.category?.id === c.id) }))
    .filter((g) => g.items.length > 0);

  const LD = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "Helpward services",
    description: `The ${services.length} services Helpward offers in its launch areas.`,
    url: "https://helpward.com/our-services",
    isPartOf: { "@id": "https://helpward.com/#website" },
    // The list is the page's real content, so it is described rather than
    // the page merely asserting that it is a collection.
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: services.length,
      itemListElement: services.map((s, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: s.title,
        url: `https://helpward.com/services/${s.id}`,
      })),
    },
  };

  return (
    <MarketingShell
      title="Our services"
      subtitle={`${services.length} things you can book, in San Diego and Vancouver's Lower Mainland.`}
    >
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(LD) }} />

      <p className="lead">
        Every service below has its own page explaining what the booking covers, what it does not, and
        what to put in your request. Prices are the service price before Helpward&apos;s flat{" "}
        {formatMoney(450, "USD")} service fee, and the two markets are priced independently rather than
        converted from one another.
      </p>

      <div className="not-prose mt-8 space-y-10">
        {byCategory.map(({ category, items }) => (
          /* An id so a category link from the home page lands on the
             right block rather than the top of a long list. */
          <section key={category.id} id={category.id} className="scroll-mt-24">
            <h2 className="text-xl font-bold text-slate-900">{category.label}</h2>
            <div className="mt-4 grid sm:grid-cols-2 gap-3">
              {items.map((s) => {
                const copy = serviceCopy(s.id);
                return (
                  <Link
                    key={s.id}
                    href={`/services/${s.id}`}
                    className="block rounded-2xl border border-slate-200 bg-white p-4 hover:border-brand-300 hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="text-sm font-bold text-slate-900">{s.title}</span>
                      <ArrowRight className="w-4 h-4 text-slate-300 shrink-0 mt-0.5" aria-hidden="true" />
                    </div>
                    <p className="mt-1 text-xs text-slate-600 leading-snug line-clamp-2">{s.blurb}</p>
                    <p className="mt-2 text-[11px] font-semibold text-slate-700">
                      From {staticPriceLabel(s.base_price_cents, s.country_pricing, formatMoney)}
                    </p>
                    {copy && (
                      <p className="mt-1 text-[11px] text-slate-500 leading-snug line-clamp-1">
                        Not included: {copy.excludes[0]}
                      </p>
                    )}
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      <h2>Where you can book</h2>
      <p>
        Helpward operates in two places. A request is checked against the exact address you give, so
        somewhere near the boundary is worth checking before you plan around it.
      </p>
      <div className="not-prose mt-4 grid sm:grid-cols-2 gap-3">
        {CITIES.map((c) => (
          <Link
            key={c.slug}
            href={`/cities/${c.slug}`}
            className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 hover:border-brand-300 hover:bg-slate-50 transition-colors"
          >
            <MapPin className="w-4 h-4 text-brand-600 shrink-0 mt-0.5" aria-hidden="true" />
            <span>
              <span className="block text-sm font-bold text-slate-900">{c.name}</span>
              <span className="block text-xs text-slate-600">{c.metro ?? c.region}</span>
            </span>
          </Link>
        ))}
      </div>
      <p className="mt-4">
        <Link href="/cities">See exactly which municipalities are covered →</Link>
      </p>
    </MarketingShell>
  );
}
