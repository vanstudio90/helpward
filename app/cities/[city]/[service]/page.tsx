import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowRight, CheckCircle2, Clock, ShieldCheck, Star, MapPin, Users, Sparkles,
} from "lucide-react";
import type { Metadata } from "next";
import { listServicesPublic, listCategoriesPublic, getServicePublic } from "@/lib/data/services";
import { ServiceIcon } from "@/components/ServiceIcon";
import { LandingHeader } from "../../../_landing-header";
import { CITIES, getCity } from "@/lib/marketing";

// 270 programmatic landing pages (10 cities × 27 services) — each ranks for
// the long-tail query "<service> in <city>". Generated at build time with
// service-role fetches; ISR refresh every hour so admin-added services land
// without a deploy.

export const dynamic = "force-static";
export const revalidate = 3600;

export async function generateStaticParams() {
  const services = await listServicesPublic();
  // Cartesian product: every city × every service.
  return CITIES.flatMap((c) => services.map((s) => ({ city: c.slug, service: s.id })));
}

export async function generateMetadata({
  params,
}: { params: Promise<{ city: string; service: string }> }): Promise<Metadata> {
  const { city: citySlug, service: serviceSlug } = await params;
  const city = getCity(citySlug);
  const service = await getServicePublic(serviceSlug);
  if (!city || !service) return { title: "Not found — Helpward" };

  const title = `${service.title} in ${city.name}, ${city.region} | Helpward`;
  const description = `Book a verified ${service.title.toLowerCase()} in ${city.name} via Helpward. Background-checked helpers, $${(service.base_price_cents / 100).toFixed(0)} base, average arrival ${service.eta_label ?? "under 20 min"}, $1M insurance per booking.`;
  const url = `https://helpward.com/cities/${city.slug}/${service.id}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, type: "website" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function CityServicePage({
  params,
}: { params: Promise<{ city: string; service: string }> }) {
  const { city: citySlug, service: serviceSlug } = await params;
  const city = getCity(citySlug);
  if (!city) notFound();

  const [service, allServices, categories] = await Promise.all([
    getServicePublic(serviceSlug),
    listServicesPublic(),
    listCategoriesPublic(),
  ]);
  if (!service) notFound();

  const related = allServices
    .filter((s) => s.category?.id === service.category?.id && s.id !== service.id)
    .slice(0, 6);
  const baseDollars = service.base_price_cents / 100;
  const serviceFee = 4.5;
  const total = baseDollars + serviceFee;

  // JSON-LD: Service scoped to this one city, LocalBusiness for the city,
  // FAQPage with location-aware Q&A, and BreadcrumbList for the deep path.
  const SERVICE_LD = {
    "@context": "https://schema.org",
    "@type": "Service",
    name: `${service.title} in ${city.name}`,
    description: `${service.blurb} Available across ${city.metro ?? city.name}, ${city.region}.`,
    serviceType: service.category?.label,
    provider: { "@id": "https://helpward.com/#organization" },
    areaServed: {
      "@type": "City",
      name: city.name,
      containedInPlace: {
        "@type": city.country === "CA" ? "AdministrativeArea" : "State",
        name: city.region,
      },
    },
    offers: {
      "@type": "Offer",
      price: baseDollars.toFixed(2),
      priceCurrency: city.country === "CA" ? "CAD" : "USD",
      availability: "https://schema.org/InStock",
      url: `https://helpward.com/new-request?service=${service.id}`,
    },
  };

  const LOCAL_LD = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    "@id": `https://helpward.com/cities/${city.slug}/${service.id}#localbusiness`,
    name: `Helpward ${service.title} — ${city.name}`,
    description: `On-demand ${service.title.toLowerCase()} service in ${city.name}, ${city.region}. Verified helpers, transparent pricing, $1M insurance per booking.`,
    url: `https://helpward.com/cities/${city.slug}/${service.id}`,
    parentOrganization: { "@id": "https://helpward.com/#organization" },
    areaServed: {
      "@type": "City",
      name: city.name,
      containedInPlace: { "@type": city.country === "CA" ? "AdministrativeArea" : "State", name: city.region },
    },
    priceRange: "$$",
    openingHours: "Mo-Su 00:00-23:59",
  };

  const FAQS = [
    {
      q: `How do I book ${service.title.toLowerCase()} in ${city.name}?`,
      a: `Tap "Find a helper" on Helpward, pick ${service.title}, enter your ${city.name} address, and submit. The matching engine notifies nearby verified helpers in ${city.metro ?? city.name} in real time — the first to accept becomes yours and you can track their ETA live.`,
    },
    {
      q: `How fast can a helper arrive in ${city.name}?`,
      a: `Average response time for ${service.title} in ${city.name} is ${service.eta_label ?? "around 18 minutes"} during normal hours. Helper supply is densest in ${city.metro ?? city.name} so ${city.name}-based requests typically match faster than the platform-wide average.`,
    },
    {
      q: `How much does ${service.title.toLowerCase()} cost in ${city.name}?`,
      a: `Base price for ${service.title} on Helpward is $${baseDollars.toFixed(0)} (${city.country === "CA" ? "CAD" : "USD"}). A flat $${serviceFee.toFixed(2)} service fee brings the total to about $${total.toFixed(2)}. Pricing is the same across ${city.name} — no surge fees, no per-block markup. You're only charged after the helper marks the task complete.`,
    },
    {
      q: `Are Helpward helpers in ${city.name} background-checked?`,
      a: `Yes. Every ${city.name} helper passes government-ID verification through Stripe Identity, a Checkr/Triton background check, and is covered by Helpward's platform insurance (up to $1M) during the booking. Approval is human-reviewed before any helper can take a task.`,
    },
  ];

  const FAQ_LD = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQS.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };

  const BREADCRUMB_LD = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "https://helpward.com" },
      { "@type": "ListItem", position: 2, name: "Cities", item: "https://helpward.com/cities" },
      { "@type": "ListItem", position: 3, name: city.name, item: `https://helpward.com/cities/${city.slug}` },
      { "@type": "ListItem", position: 4, name: service.title, item: `https://helpward.com/cities/${city.slug}/${service.id}` },
    ],
  };

  return (
    <div className="min-h-screen bg-white">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(SERVICE_LD) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(LOCAL_LD) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_LD) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(BREADCRUMB_LD) }} />
      <LandingHeader />

      <main>
        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 text-xs text-slate-500">
          <ol className="flex items-center gap-1.5 flex-wrap">
            <li><Link href="/" className="hover:text-slate-900">Home</Link></li>
            <li className="text-slate-300">/</li>
            <li><Link href={`/cities/${city.slug}`} className="hover:text-slate-900">{city.name}</Link></li>
            <li className="text-slate-300">/</li>
            <li><Link href={`/services/${service.id}`} className="hover:text-slate-900">{service.title}</Link></li>
            <li className="text-slate-300">/</li>
            <li className="text-slate-900 font-semibold">in {city.name}</li>
          </ol>
        </nav>

        {/* Hero */}
        <section className="relative">
          {city.hero && (
            <div className="absolute inset-0 -z-10">
              <img src={city.hero} alt="" loading="lazy" className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-white via-white/90 to-white/40" />
            </div>
          )}
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-12 lg:pt-14 lg:pb-16 grid lg:grid-cols-[1.2fr_1fr] gap-8 lg:gap-12 items-start">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold text-brand-700 mb-3">
                <ServiceIcon name={service.category?.icon ?? "spark"} size="sm" />
                {service.category?.label}
                <span className="text-slate-300">·</span>
                <Link href={`/cities/${city.slug}`} className="inline-flex items-center gap-1 hover:text-brand-800">
                  <MapPin className="w-3 h-3" /> {city.name}, {city.region}
                </Link>
              </div>

              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-slate-900 leading-tight">
                {service.title} in {city.name}
              </h1>
              <p className="mt-3 text-base sm:text-lg text-slate-700 max-w-2xl leading-relaxed">
                Book a verified, background-checked {service.title.toLowerCase()} in {city.metro ?? city.name} via
                Helpward. {service.blurb} Pricing is upfront, payment is held until the task is marked complete,
                and every helper is insured during the booking.
              </p>

              <div className="mt-5 flex flex-wrap items-center gap-3 text-xs">
                <span className="inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-full font-semibold">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Helpers available in {city.name} now
                </span>
                <span className="inline-flex items-center gap-1.5 bg-amber-50 text-amber-700 px-3 py-1.5 rounded-full font-semibold">
                  <Clock className="w-3 h-3" /> {service.eta_label ?? "Avg 18 min"}
                </span>
                <span className="inline-flex items-center gap-1.5 bg-slate-100 text-slate-700 px-3 py-1.5 rounded-full font-semibold">
                  <Star className="w-3 h-3 fill-amber-500 text-amber-500" /> 4.9 avg in {city.name}
                </span>
              </div>

              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  href={`/new-request?service=${service.id}`}
                  className="inline-flex items-center gap-2 px-5 py-3.5 rounded-xl bg-brand-600 text-white font-semibold hover:bg-brand-700 transition"
                >
                  Book {service.title} in {city.name} — from ${baseDollars.toFixed(0)} <ArrowRight className="w-4 h-4" />
                </Link>
                <Link
                  href={`/cities/${city.slug}`}
                  className="inline-flex items-center gap-2 px-5 py-3.5 rounded-xl border border-slate-300 text-slate-900 font-semibold hover:bg-slate-50 transition"
                >
                  All services in {city.name}
                </Link>
              </div>
            </div>

            {/* Pricing card */}
            <aside className="rounded-2xl border border-slate-100 bg-white shadow-xl shadow-brand-900/5 overflow-hidden">
              {service.image_url && (
                <img src={service.image_url} alt={`${service.title} in ${city.name}`} loading="lazy" className="w-full aspect-[5/3] object-cover" />
              )}
              <div className="p-5">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Price estimate · {city.country === "CA" ? "CAD" : "USD"}</div>
                <dl className="text-sm space-y-1.5">
                  <div className="flex justify-between"><dt className="text-slate-500">Base fare</dt><dd className="font-semibold text-slate-900">${baseDollars.toFixed(2)}</dd></div>
                  <div className="flex justify-between"><dt className="text-slate-500">Service fee</dt><dd className="font-semibold text-slate-900">${serviceFee.toFixed(2)}</dd></div>
                  <div className="flex justify-between pt-2 border-t border-slate-100"><dt className="font-bold text-slate-900">Total estimate</dt><dd className="font-bold text-brand-700">${total.toFixed(2)}</dd></div>
                </dl>
                <p className="text-[11px] text-slate-400 mt-2 leading-snug">
                  Final price depends on distance, time, and any tip. You&apos;re only charged after the task is marked complete.
                </p>
                <Link
                  href={`/new-request?service=${service.id}`}
                  className="mt-4 w-full inline-flex items-center justify-center gap-2 py-3 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800"
                >
                  Get a helper in {city.name} <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </aside>
          </div>
        </section>

        {/* What's included + Why Helpward */}
        <section className="bg-slate-50 border-y border-slate-100 py-12">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid md:grid-cols-2 gap-8 lg:gap-12">
            <div>
              <h2 className="text-2xl font-bold text-slate-900">What&apos;s included for every {city.name} booking</h2>
              <ul className="mt-4 space-y-3 text-sm text-slate-700">
                {[
                  `Verified, background-checked helper in ${city.name}`,
                  "Real-time GPS tracking and in-app chat",
                  "Platform insurance up to $1M during the booking",
                  "Payment held until you confirm the task is complete",
                  "24-hour dispute window with human support review",
                  "24/7 customer support — call, chat, or email",
                ].map((i) => (
                  <li key={i} className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" /> {i}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h2 className="text-2xl font-bold text-slate-900">Why Helpward in {city.name}</h2>
              <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                <Trust icon={Users} title="Local helpers" sub={`Verified humans in ${city.metro ?? city.name}`} />
                <Trust icon={ShieldCheck} title="Fully insured" sub="Up to $1M coverage on every booking" />
                <Trust icon={Clock} title="Fast matching" sub="Average match in 2m 14s" />
                <Trust icon={Sparkles} title="Transparent pricing" sub="No surge, no hidden fees" />
              </div>
            </div>
          </div>
        </section>

        {/* Same service, other cities */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <h2 className="text-xl font-bold text-slate-900">{service.title} in other cities</h2>
          <p className="text-sm text-slate-600 mt-1">Helpward offers {service.title.toLowerCase()} across {CITIES.length} cities in the U.S. and Canada.</p>
          <ul className="mt-4 flex flex-wrap gap-2">
            {CITIES.filter((c) => c.slug !== city.slug).map((c) => (
              <li key={c.slug}>
                <Link
                  href={`/cities/${c.slug}/${service.id}`}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white border border-slate-200 text-xs font-semibold text-slate-700 hover:border-brand-300 hover:text-brand-700"
                >
                  <MapPin className="w-3 h-3" /> {service.title} in {c.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>

        {/* Other services in this city */}
        {related.length > 0 && (
          <section className="bg-slate-50 border-t border-slate-100 py-12">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <h2 className="text-xl font-bold text-slate-900">More {service.category?.label.toLowerCase()} services in {city.name}</h2>
              <div className="mt-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                {related.map((r) => (
                  <Link
                    key={r.id}
                    href={`/cities/${city.slug}/${r.id}`}
                    className="rounded-xl bg-white border border-slate-100 p-3 hover:border-brand-300 hover:shadow transition"
                  >
                    <div className="text-sm font-bold text-slate-900 truncate">{r.title}</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">in {city.name} · from ${(r.base_price_cents / 100).toFixed(0)}</div>
                  </Link>
                ))}
              </div>
              <p className="mt-6 text-xs text-slate-500">
                Browse <Link href={`/cities/${city.slug}`} className="text-brand-700 font-semibold hover:underline">all {allServices.length} services in {city.name}</Link>.
              </p>
            </div>
          </section>
        )}

        {/* FAQ */}
        <section className="bg-white border-t border-slate-100 py-12">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-2xl font-bold text-slate-900 mb-6">Frequently asked about {service.title.toLowerCase()} in {city.name}</h2>
            <dl className="space-y-3">
              {FAQS.map((f) => (
                <details key={f.q} className="group rounded-2xl bg-slate-50 border border-slate-100 p-4 sm:p-5 open:shadow-md transition">
                  <summary className="cursor-pointer list-none flex items-start justify-between gap-4">
                    <dt className="text-sm sm:text-base font-bold text-slate-900">{f.q}</dt>
                    <span className="shrink-0 text-slate-400 text-xl leading-none transition group-open:rotate-45">+</span>
                  </summary>
                  <dd className="mt-3 text-sm text-slate-700 leading-relaxed">{f.a}</dd>
                </details>
              ))}
            </dl>
          </div>
        </section>

        {/* CTA */}
        <section className="bg-gradient-to-br from-brand-600 to-violet-700 text-white">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 text-center">
            <h2 className="text-2xl sm:text-3xl font-bold">Need {service.title.toLowerCase()} in {city.name} right now?</h2>
            <p className="mt-2 text-sm sm:text-base text-white/90">A verified helper is probably online within a few blocks.</p>
            <Link
              href={`/new-request?service=${service.id}`}
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

function Trust({ icon: Icon, title, sub }: { icon: React.ComponentType<{ className?: string }>; title: string; sub: string }) {
  return (
    <div className="rounded-xl bg-white border border-slate-100 p-3">
      <Icon className="w-4 h-4 text-brand-600 mb-1.5" />
      <div className="font-bold text-slate-900">{title}</div>
      <div className="text-slate-500 mt-0.5 leading-snug">{sub}</div>
    </div>
  );
}
