import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, ShieldCheck, Clock, Users, MapPin } from "lucide-react";
import type { Metadata } from "next";
import { listServicesPublic, listCategoriesPublic } from "@/lib/data/services";
import { ServiceIcon } from "@/components/ServiceIcon";
import { LandingHeader } from "../../_landing-header";
import { CITIES, getCity } from "@/lib/marketing";

// One landing page per city. Lists every service available in that city
// (currently the same catalog everywhere — switch to per-city when supply
// data lands). Each city page emits LocalBusiness JSON-LD so AI engines and
// Google can rank "<service> in <city>" queries.

export const dynamic = "force-static";
export const revalidate = 3600;

export async function generateStaticParams() {
  return CITIES.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({
  params,
}: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const city = getCity(slug);
  if (!city) return { title: "City not found — Helpward" };
  const title = `On-demand help in ${city.name}, ${city.region} | Helpward`;
  const description = `Book verified, background-checked helpers in ${city.name} for rides, errands, home help, deliveries, and more. Pricing upfront, payment after completion, $1M insurance per booking.`;
  return {
    title,
    description,
    alternates: { canonical: `https://helpward.com/cities/${city.slug}` },
    openGraph: { title, description, url: `https://helpward.com/cities/${city.slug}`, type: "website" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function CityPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const city = getCity(slug);
  if (!city) notFound();

  const [services, categories] = await Promise.all([listServicesPublic(), listCategoriesPublic()]);
  const grouped = categories
    .map((c) => ({ category: c, items: services.filter((s) => s.category?.id === c.id) }))
    .filter((g) => g.items.length > 0);

  const LOCAL_LD = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    "@id": `https://helpward.com/cities/${city.slug}#localbusiness`,
    name: `Helpward — ${city.name}`,
    description: `On-demand verified humans for rides, errands, home help, and more across ${city.metro ?? city.name}, ${city.region}.`,
    url: `https://helpward.com/cities/${city.slug}`,
    image: city.hero ?? "https://helpward.com/opengraph-image",
    parentOrganization: { "@id": "https://helpward.com/#organization" },
    areaServed: { "@type": "City", name: city.name, containedInPlace: { "@type": city.country === "CA" ? "AdministrativeArea" : "State", name: city.region } },
    priceRange: "$$",
    openingHours: "Mo-Su 00:00-23:59",
  };

  const BREADCRUMB_LD = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "https://helpward.com" },
      { "@type": "ListItem", position: 2, name: "Cities", item: "https://helpward.com/cities" },
      { "@type": "ListItem", position: 3, name: city.name, item: `https://helpward.com/cities/${city.slug}` },
    ],
  };

  return (
    <div className="min-h-screen bg-white">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(LOCAL_LD) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(BREADCRUMB_LD) }} />
      <LandingHeader />

      <main>
        {/* Hero */}
        <section className="relative">
          <div className="absolute inset-0 -z-10">
            {city.hero && <img src={city.hero} alt="" loading="lazy" className="w-full h-full object-cover" />}
            <div className="absolute inset-0 bg-gradient-to-t from-white via-white/85 to-white/40" />
          </div>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 pb-12 lg:pt-20 lg:pb-16">
            <nav aria-label="Breadcrumb" className="text-xs text-slate-500 mb-4">
              <ol className="flex items-center gap-1.5 flex-wrap">
                <li><Link href="/" className="hover:text-slate-900">Home</Link></li>
                <li className="text-slate-300">/</li>
                <li><Link href="/" className="hover:text-slate-900">Cities</Link></li>
                <li className="text-slate-300">/</li>
                <li className="text-slate-900 font-semibold">{city.name}</li>
              </ol>
            </nav>

            <div className="inline-flex items-center gap-1.5 bg-white border border-slate-200 rounded-full px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm mb-4">
              <MapPin className="w-3.5 h-3.5 text-brand-600" /> {city.metro ?? city.name}, {city.region}
            </div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-slate-900 leading-tight max-w-3xl">
              On-demand help in {city.name}.<br />Verified humans, anywhere in {city.metro ?? city.name}.
            </h1>
            <p className="mt-4 text-base sm:text-lg text-slate-700 max-w-2xl leading-relaxed">
              Helpward connects {city.name} residents with verified, background-checked helpers for rides, errands,
              home tasks, deliveries, and almost any real-world request. Match in minutes, track in real time, pay
              only when the task is complete.
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="/new-request"
                className="inline-flex items-center gap-2 px-5 py-3.5 rounded-xl bg-brand-600 text-white font-semibold hover:bg-brand-700"
              >
                Find a helper in {city.name} <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                href="/signup?role=provider"
                className="inline-flex items-center gap-2 px-5 py-3.5 rounded-xl border border-slate-300 text-slate-900 font-semibold hover:bg-slate-50"
              >
                Become a helper in {city.name}
              </Link>
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-4 text-xs text-slate-600">
              <span className="inline-flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5 text-emerald-600" /> All helpers background-checked</span>
              <span className="inline-flex items-center gap-1.5"><Clock className="w-3.5 h-3.5 text-amber-600" /> Avg arrival 18 min</span>
              <span className="inline-flex items-center gap-1.5"><Users className="w-3.5 h-3.5 text-brand-600" /> 24/7 support</span>
            </div>
          </div>
        </section>

        {/* All services in this city */}
        <section className="bg-slate-50 border-y border-slate-100 py-12">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-2xl font-bold text-slate-900">All Helpward services in {city.name}</h2>
            <p className="text-sm text-slate-600 mt-1">{services.length} services across {grouped.length} categories — available right now.</p>

            <div className="mt-8 space-y-8">
              {grouped.map(({ category, items }) => (
                <div key={category.id}>
                  <div className="flex items-center gap-3 mb-3">
                    <ServiceIcon name={category.icon ?? "spark"} size="md" />
                    <h3 className="text-base sm:text-lg font-bold text-slate-900">{category.label} in {city.name}</h3>
                  </div>
                  <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 text-sm">
                    {items.map((s) => (
                      <li key={s.id}>
                        <Link
                          href={`/services/${s.id}`}
                          className="block rounded-xl bg-white border border-slate-100 p-3 hover:border-brand-300 hover:shadow transition"
                        >
                          <div className="font-bold text-slate-900 truncate">{s.title} in {city.name}</div>
                          <div className="text-[11px] text-slate-500 mt-0.5">From ${(s.base_price_cents / 100).toFixed(0)} · {s.eta_label ?? "fast match"}</div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Other cities */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <h2 className="text-xl font-bold text-slate-900 mb-4">Helpward in other cities</h2>
          <ul className="flex flex-wrap gap-2">
            {CITIES.filter((c) => c.slug !== city.slug).map((c) => (
              <li key={c.slug}>
                <Link
                  href={`/cities/${c.slug}`}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white border border-slate-200 text-xs font-semibold text-slate-700 hover:border-brand-300 hover:text-brand-700"
                >
                  <MapPin className="w-3 h-3" /> {c.name}, {c.region}
                </Link>
              </li>
            ))}
          </ul>
        </section>

        {/* CTA */}
        <section className="bg-gradient-to-br from-brand-600 to-violet-700 text-white">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 text-center">
            <h2 className="text-2xl sm:text-3xl font-bold">Need help in {city.name} right now?</h2>
            <p className="mt-2 text-sm sm:text-base text-white/90">A verified helper is probably online within a few blocks.</p>
            <Link
              href="/new-request"
              className="mt-5 inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-white text-slate-900 font-semibold hover:bg-slate-100"
            >
              Find a helper in {city.name} <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
