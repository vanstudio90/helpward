import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowRight, ClipboardCheck, CheckCircle2, Clock, ShieldCheck, Star, MapPin, Users, Sparkles,
} from "lucide-react";
import type { Metadata } from "next";
import {
  listServicesPublic,
  listCategoriesPublic,
  getServicePublic,
  listCallDeliveredServiceIds,
} from "@/lib/data/services";
import {
  PUBLIC_SERVICE_COPY,
  publicServiceName,
  publicServiceDescription,
  includedPoints,
  relatedPrompt,
} from "@/lib/public-service-copy";
import { cityCopy } from "@/lib/public-city-copy";
import { servicePrep, prepHeading, HANDOVER_LINE } from "@/lib/public-service-prep";
import { SERVICE_SCOPE } from "@/lib/public-service-pages";
import { ServiceIcon } from "@/components/ServiceIcon";
import { LandingHeader } from "../../../_landing-header";
import { CITIES, getCity } from "@/lib/marketing";

// One landing page per city × service — each ranks for
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

  const name = publicServiceName(service.id, service.title);
  const title = `${name} in ${city.name}, ${city.region} | Helpward`;
  const local = cityCopy(city.slug);
  const money = local?.currency ?? (city.country === "CA" ? "CAD" : "USD");
  const description = `Book ${name.toLowerCase()} in ${city.name}. From $${(service.base_price_cents / 100).toFixed(0)} ${money}, approved local helpers, paid only once the job is done.`;
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

  const [service, allServices, categories, callDelivered] = await Promise.all([
    getServicePublic(serviceSlug),
    listServicesPublic(),
    listCategoriesPublic(),
    listCallDeliveredServiceIds(),
  ]);
  if (!service) notFound();

  const name = publicServiceName(service.id, service.title);
  const blurb = publicServiceDescription(service.id, service.blurb);
  const deliveredByCall = callDelivered.has(service.id);
  const scope = SERVICE_SCOPE[service.id];
  const prep = servicePrep(service.id);
  const local = cityCopy(city.slug);
  const currency = local?.currency ?? (city.country === "CA" ? "CAD" : "USD");

  /*
    The same need-based map the main pages use, kept local: a San Diego
    moving page points at San Diego furniture assembly, not the national
    one. The category list stays as a fallback.
  */
  const curated = (PUBLIC_SERVICE_COPY[service.id]?.related ?? [])
    .map((id) => allServices.find((s) => s.id === id))
    .filter((s): s is NonNullable<typeof s> => Boolean(s));
  const related = curated.length > 0
    ? curated
    : allServices
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
    name: `${name} in ${city.name}`,
    alternateName: name === service.title ? undefined : `${service.title} in ${city.name}`,
    description: `${blurb} Available across ${city.metro ?? city.name}, ${city.region}.`,
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
      // Base price, labelled as such, in the currency actually charged
      // here. No `availability`: InStock would claim a helper is free,
      // which nothing measures.
      "@type": "Offer",
      price: baseDollars.toFixed(2),
      priceCurrency: currency,
      description: `Base price in ${currency}, before the flat $${serviceFee.toFixed(2)} service fee. Final total depends on the answers given when booking.`,
      url: `https://helpward.com/new-request?service=${service.id}`,
    },
  };

  /*
    NO LocalBusiness NODE.

    Each of these 52 pages used to emit its own LocalBusiness: no
    address, priceRange "$$", and openingHours "Mo-Su 00:00-23:59".
    Together they asserted fifty-two around-the-clock physical branches
    that do not exist, and Google's own LocalBusiness rich-result
    requirements want an address — which is exactly the thing never to
    fabricate to satisfy a validator.

    Helpward is one marketplace organisation, declared once in the root
    layout. Where it operates belongs on the Service node's areaServed,
    which is what it now says and all it says.
  */

  const FAQS = [
    {
      q: `How do I book ${name.toLowerCase()} in ${city.name}?`,
      a: `Tap "Find a helper" on Helpward, pick ${service.title}, enter your ${city.name} address, and submit. The matching engine notifies nearby verified helpers in ${city.metro ?? city.name} in real time — the first to accept becomes yours and you can track their ETA live.`,
    },
    deliveredByCall
      ? {
          q: `How soon will a helper call in ${city.name}?`,
          a: `${service.title} is delivered by phone call, so no helper travels to your ${city.name} address. Requests are offered to approved helpers straight away and typically answered in ${service.eta_label ?? "around 18 minutes"} during normal hours, and the call itself happens at the time you booked.`,
        }
      : {
          q: `How fast can a helper arrive in ${city.name}?`,
          a: `Average response time for ${service.title} in ${city.name} is ${service.eta_label ?? "around 18 minutes"} during normal hours. Helper supply is densest in ${city.metro ?? city.name} so ${city.name}-based requests typically match faster than the platform-wide average.`,
        },
    {
      q: `How much does ${name.toLowerCase()} cost in ${city.name}?`,
      a: `Base price for ${service.title} on Helpward is $${baseDollars.toFixed(0)} (${currency}). A flat $${serviceFee.toFixed(2)} service fee brings the total to about $${total.toFixed(2)}. Pricing is the same across ${city.name} — no surge fees, no per-block markup. You're only charged after the helper marks the task complete.`,
    },
    ...(local
      ? [
          {
            q: `Which areas of ${city.name} are covered?`,
            a: local.notCovered.length > 0
              ? `${local.coverage} Neighbouring places are separate incorporated cities and are not covered: ${local.notCovered.join(", ")}. A ${city.name} mailing address is not proof an address sits inside the line, so where a job has two ends it is worth checking both before booking.`
              : `${local.coverage}`,
          },
          {
            q: `Which currency will I be charged in ${city.name}?`,
            a: `${local.currency}. Every figure shown on this page is in ${local.currency}, and that is what your card is charged. The address form asks for a ${local.regionWord} and a postal code here.`,
          },
        ]
      : []),
    {
      q: `Are Helpward helpers in ${city.name} approved?`,
      a: `Every ${city.name} helper is reviewed and approved by a person at Helpward before they can take a task, and an unapproved helper is never offered work. Automated ID verification and background checks are not running yet, and Helpward does not currently carry platform insurance — we'll say so here when that changes.`,
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
            <li><Link href={`/services/${service.id}`} className="hover:text-slate-900">{name}</Link></li>
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
                {name} in {city.name}
              </h1>
              <p className="mt-3 text-base sm:text-lg text-slate-700 max-w-2xl leading-relaxed">
                Book {name.toLowerCase()} in {city.metro ?? city.name} via
                Helpward. {blurb} Pricing is upfront, your card is authorised when a helper accepts and charged once the job is marked complete,
                and payment is held until the task is marked complete.
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
                <img src={service.image_url} alt="" loading="lazy" className="w-full aspect-[5/3] object-cover" />
              )}
              <div className="p-5">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Price estimate · {city.country === "CA" ? "CAD" : "USD"}</div>
                <dl className="text-sm space-y-1.5">
                  <div className="flex justify-between"><dt className="text-slate-500">Base fare</dt><dd className="font-semibold text-slate-900">${baseDollars.toFixed(2)}</dd></div>
                  <div className="flex justify-between"><dt className="text-slate-500">Service fee</dt><dd className="font-semibold text-slate-900">${serviceFee.toFixed(2)}</dd></div>
                  <div className="flex justify-between pt-2 border-t border-slate-100"><dt className="font-bold text-slate-900">Total estimate</dt><dd className="font-bold text-brand-700">${total.toFixed(2)}</dd></div>
                </dl>
                <p className="text-[11px] text-slate-400 mt-2 leading-snug">
                  Distance does not change the price. You&apos;re only charged after the task is marked complete, and the figure above is in {currency}.
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
                {includedPoints({ cityName: city.name, deliveredByCall }).map((i) => (
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
                <Trust icon={ShieldCheck} title="Approved helpers" sub="Reviewed by a person at Helpward before taking work" />
                <Trust icon={Clock} title="Fast matching" sub="Average match in 2m 14s" />
                <Trust icon={Sparkles} title="Transparent pricing" sub="No surge, no hidden fees" />
              </div>
            </div>
          </div>
        </section>

        {/*
          WHAT IS DIFFERENT ABOUT BOOKING HERE.

          These 52 pages were the same page with a city name swapped in.
          This is the part that genuinely differs: the service area and
          what sits just outside it, the currency a card is charged in,
          and one real consequence of the local geography. No invented
          helper counts, no neighbourhood lists pretending to be
          coverage.
        */}
        {local && (
          <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
            <h2 className="text-2xl font-bold text-slate-900">
              Booking {name.toLowerCase()} in {city.name}
            </h2>
            <div className="mt-4 grid gap-4 md:grid-cols-3 max-w-5xl text-sm">
              <div className="rounded-2xl border border-slate-100 bg-white p-5">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Service area
                </div>
                <p className="mt-2 text-slate-700">{local.coverage}</p>
                {local.notCovered.length > 0 && (
                  <p className="mt-2 text-slate-600">
                    Not covered, because they are separate incorporated cities:{" "}
                    {local.notCovered.join(", ")}.
                  </p>
                )}
              </div>
              <div className="rounded-2xl border border-slate-100 bg-white p-5">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Currency and address
                </div>
                <p className="mt-2 text-slate-700">
                  Your card is charged in {local.currency}, and every figure on this page is
                  in {local.currency}. The address form asks for a {local.regionWord} and a
                  postal code here.
                </p>
              </div>
              <div className="rounded-2xl border border-slate-100 bg-white p-5">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {deliveredByCall ? "Nobody travels" : "Getting there"}
                </div>
                <p className="mt-2 text-slate-700">
                  {deliveredByCall ? local.remoteNote : local.travelNote}
                </p>
              </div>
            </div>
          </section>
        )}

        {/*
          WHAT TO HAVE READY.

          Grounded in what the booking form asks and what a job actually
          stalls on — a lead nobody can find, a bracket never bought, a
          password in somebody's head. The PRIVATE half is deliberately
          absent: codes and key locations go in the handover instructions
          on the booking, which only the booked helper can read.
        */}
        {prep && (
          <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
            <h2 className="text-2xl font-bold text-slate-900">
              {prepHeading(deliveredByCall)} in {city.name}
            </h2>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2 max-w-4xl text-sm text-slate-700">
              {prep.map((item) => (
                <li key={item} className="flex items-start gap-2.5 rounded-xl border border-slate-100 bg-white p-4">
                  <ClipboardCheck className="w-4 h-4 text-brand-600 shrink-0 mt-0.5" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            {!deliveredByCall && (
              <p className="mt-4 max-w-3xl text-[13px] text-slate-600 border-l-2 border-slate-200 pl-3">
                {HANDOVER_LINE}
              </p>
            )}
          </section>
        )}

        {/*
          WHAT IS AND IS NOT INCLUDED, in the body rather than inside an
          FAQ. An exclusion a customer first meets on their doorstep is
          an exclusion that was published in the wrong place.
        */}
        {scope && (
          <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
            <h2 className="text-2xl font-bold text-slate-900">
              What {name.toLowerCase()} covers in {city.name}
            </h2>
            <div className="mt-4 grid gap-5 md:grid-cols-2 max-w-5xl">
              <div className="rounded-2xl border border-slate-100 bg-white p-5">
                <h3 className="text-sm font-bold text-slate-900">Included</h3>
                <ul className="mt-3 space-y-2 text-sm text-slate-700">
                  {scope.includes.map((item) => (
                    <li key={item} className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-2xl border border-amber-100 bg-amber-50/50 p-5">
                <h3 className="text-sm font-bold text-slate-900">Not included</h3>
                <ul className="mt-3 space-y-2 text-sm text-slate-700">
                  {scope.excludes.map((item) => (
                    <li key={item} className="flex items-start gap-2">
                      <span aria-hidden="true" className="mt-0.5 text-amber-700 font-bold leading-none">&times;</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>
        )}

        {/*
          Trust statements get a path here too — the same gap the main
          pages had.
        */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-2">
          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-5 sm:p-6 max-w-4xl">
            <h2 className="text-base font-bold text-slate-900">Before you book in {city.name}</h2>
            <ul className="mt-3 grid gap-2 sm:grid-cols-3 text-sm">
              <li>
                <Link href="/safety" className="font-semibold text-brand-700 hover:underline">
                  How we keep bookings safe
                </Link>
                <span className="block text-slate-600 text-[13px]">
                  Who gets approved, and what happens if something goes wrong.
                </span>
              </li>
              <li>
                <Link href="/terms" className="font-semibold text-brand-700 hover:underline">
                  Cancellations and refunds
                </Link>
                <span className="block text-slate-600 text-[13px]">
                  When you can cancel, and the 24-hour dispute window.
                </span>
              </li>
              <li>
                <Link href="/pricing" className="font-semibold text-brand-700 hover:underline">
                  How pricing works
                </Link>
                <span className="block text-slate-600 text-[13px]">
                  What affects a quote, and the currency you are charged in.
                </span>
              </li>
              <li>
                <Link href={`/cities/${city.slug}`} className="font-semibold text-brand-700 hover:underline">
                  Everything we cover in {city.name}
                </Link>
                <span className="block text-slate-600 text-[13px]">
                  The full service area, and the services available in it.
                </span>
              </li>
            </ul>
          </div>
        </section>

        {/* Same service, other cities */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <h2 className="text-xl font-bold text-slate-900">{name} in other cities</h2>
          <p className="text-sm text-slate-600 mt-1">Helpward offers {name.toLowerCase()} across {CITIES.length} cities in the U.S. and Canada.</p>
          <ul className="mt-4 flex flex-wrap gap-2">
            {CITIES.filter((c) => c.slug !== city.slug).map((c) => (
              <li key={c.slug}>
                <Link
                  href={`/cities/${c.slug}/${service.id}`}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white border border-slate-200 text-xs font-semibold text-slate-700 hover:border-brand-300 hover:text-brand-700"
                >
                  <MapPin className="w-3 h-3" /> {name} in {c.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>

        {/* Other services in this city */}
        {related.length > 0 && (
          <section className="bg-slate-50 border-t border-slate-100 py-12">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <h2 className="text-xl font-bold text-slate-900">What people book next in {city.name}</h2>
              <div className="mt-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                {related.map((r) => (
                  <Link
                    key={r.id}
                    href={`/cities/${city.slug}/${r.id}`}
                    className="rounded-xl bg-white border border-slate-100 p-3 hover:border-brand-300 hover:shadow transition"
                  >
                    {relatedPrompt(r.id) && (
                      <div className="text-[11px] font-semibold text-brand-700 leading-snug">
                        {relatedPrompt(r.id)}
                      </div>
                    )}
                    <div className="text-sm font-bold text-slate-900 mt-0.5">{publicServiceName(r.id, r.title)}</div>
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
            <h2 className="text-2xl font-bold text-slate-900 mb-6">Frequently asked about {name.toLowerCase()} in {city.name}</h2>
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
            <h2 className="text-2xl sm:text-3xl font-bold">Need {name.toLowerCase()} in {city.name} right now?</h2>
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
