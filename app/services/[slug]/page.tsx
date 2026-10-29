import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, CheckCircle2, Clock, ShieldCheck, Star, Users, Sparkles, XCircle} from "lucide-react";
import type { Metadata } from "next";
import { listServicesPublic, listCategoriesPublic, getServicePublic } from "@/lib/data/services";
import { ServiceIcon } from "@/components/ServiceIcon";
import { LandingHeader } from "../../_landing-header";
import { CITIES } from "@/lib/marketing";
import { formatMoney } from "@/lib/money";
import { staticPriceLabel } from "@/lib/country-price";
import { serviceCopy, UNIVERSAL_FAQS } from "@/lib/service-copy";
import { SiteFooter } from "@/components/SiteFooter";

// One landing page per active service. Each emits Service + FAQPage +
// BreadcrumbList JSON-LD so AI engines and Google can rank the page for
// "<service name> near me" queries without us writing each by hand.

export const dynamic = "force-static";
export const revalidate = 3600; // 1h ISR — refreshes when admin adds/edits services

export async function generateStaticParams() {
  const services = await listServicesPublic();
  return services.map((s) => ({ slug: s.id }));
}

export async function generateMetadata({
  params,
}: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const service = await getServicePublic(slug);
  if (!service) return { title: "Service not found — Helpward" };
  const copyForMeta = serviceCopy(slug);
  // Problem-led where we have written one, the catalogue title otherwise.
  const title = copyForMeta
    ? `${copyForMeta.title} | Helpward`
    : `${service.title} — Book a Local Helper | Helpward`;
  // Both markets' prices, because this page is force-static and served to
  // San Diego and Vancouver alike — there is no request to read a country
  // from, and picking one would advertise a number half the visitors will
  // not be charged.
  const priceLabel = staticPriceLabel(
    service.base_price_cents, service.country_pricing, (c, cur) => formatMoney(c, cur),
  );
  const description = `${service.blurb} Approved local helpers. From ${priceLabel}, paid only after the task is complete.`;
  return {
    title,
    description,
    alternates: { canonical: `https://helpward.com/services/${service.id}` },
    openGraph: { title, description, url: `https://helpward.com/services/${service.id}`, type: "website" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function ServiceDetailPage({
  params,
}: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [service, allServices, categories] = await Promise.all([
    getServicePublic(slug),
    listServicesPublic(),
    listCategoriesPublic(),
  ]);
  if (!service) notFound();

  const related = allServices
    .filter((s) => s.category?.id === service.category?.id && s.id !== service.id)
    .slice(0, 6);
  // Every price on this page comes from these two, never from
  // base_price_cents directly. A service priced differently per market has
  // to say both, and this page is force-static so it cannot pick one.
  const usCents = service.country_pricing?.find((c) => c.country === "US")?.base_price_cents
    ?? service.base_price_cents;
  const caCents = service.country_pricing?.find((c) => c.country === "CA")?.base_price_cents
    ?? service.base_price_cents;
  const copy = serviceCopy(service.id);
  const bothPrices = staticPriceLabel(service.base_price_cents, service.country_pricing, formatMoney);
  const differsByCountry = usCents !== caCents;

  const baseDollars = usCents / 100;
  const serviceFee = 4.5;
  const total = baseDollars + serviceFee;

  const SERVICE_LD = {
    "@context": "https://schema.org",
    "@type": "Service",
    name: service.title,
    description: service.blurb,
    serviceType: service.category?.label,
    provider: { "@id": "https://helpward.com/#organization" },
    areaServed: CITIES.map((c) => ({ "@type": "City", name: c.name })),
    // One Offer per market where they differ. A single USD offer would be
    // wrong for every Canadian reader, and structured data that contradicts
    // the page is worse than none.
    offers: (differsByCountry
      ? [
          { currency: "USD", cents: usCents, area: "US" },
          { currency: "CAD", cents: caCents, area: "CA" },
        ]
      : [{ currency: "USD", cents: usCents, area: null }]
    ).map((o) => ({
      "@type": "Offer",
      price: (o.cents / 100).toFixed(2),
      priceCurrency: o.currency,
      ...(o.area ? { eligibleRegion: { "@type": "Country", name: o.area } } : {}),
      availability: "https://schema.org/InStock",
      url: `https://helpward.com/new-request?service=${service.id}`,
    })),
  };

  // Service-specific first, then the three that are true of every booking.
  //
  // The response-time and matching figures below are owner-set marketing
  // claims, restored at the owner's instruction on 2026-10-29 after I had
  // removed them. They are not computed from booking data — there are no
  // completed bookings yet — and the owner's position is that they will be
  // met before the site takes orders. If they change, they change HERE and
  // in the Trust tile below, which are the only two places they appear.
  const SERVICE_FAQS = [
    {
      q: `What is ${service.title.toLowerCase()} on Helpward?`,
      a: `${service.blurb} Your request is offered to nearby helpers who offer this service, and one of them has to `
        + `accept it before there is a booking.`,
    },
    {
      q: `How much does ${service.title.toLowerCase()} cost?`,
      a: differsByCountry
        ? `${formatMoney(usCents, "USD")} in San Diego and ${formatMoney(caCents, "CAD")} in the Lower Mainland, plus a `
          + `flat ${formatMoney(450, "USD")} service fee. What you pay depends on what you ask for — longer bookings, `
          + `extra quantities and larger crews change the price, and the total is shown before you submit.`
        : `${formatMoney(usCents, "USD")} plus a flat ${formatMoney(450, "USD")} service fee. What you pay depends on `
          + `what you ask for, and the total is shown before you submit.`,
    },
    {
      q: `How fast can a helper arrive?`,
      a: `Average response time for ${service.title} is ${service.eta_label ?? "around 18 minutes"} during normal hours. The matching engine notifies all nearby qualified helpers at once; the first to accept becomes yours and you can track their ETA live.`,
    },
    ...(copy?.faqs ?? []),
    ...UNIVERSAL_FAQS,
  ];

  const FAQ_LD = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: SERVICE_FAQS.map((f) => ({
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
      { "@type": "ListItem", position: 2, name: "Services", item: "https://helpward.com/services" },
      { "@type": "ListItem", position: 3, name: service.title, item: `https://helpward.com/services/${service.id}` },
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
            <li><Link href="/services" className="hover:text-slate-900">Services</Link></li>
            <li className="text-slate-300">/</li>
            <li className="text-slate-900 font-semibold">{service.title}</li>
          </ol>
        </nav>

        {/* Hero */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-14 grid lg:grid-cols-[1.2fr_1fr] gap-8 lg:gap-12 items-start">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-brand-700 mb-3">
              <ServiceIcon name={service.category?.icon ?? "spark"} size="sm" />
              {service.category?.label}
            </div>
            {/* The outcome, not the service name. Someone recognises
                their own evening long before they recognise a category. */}
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-slate-900 leading-tight">
              {copy?.headline ?? service.title}
            </h1>
            <p className="mt-3 text-base sm:text-lg text-slate-600 max-w-2xl leading-relaxed">
              {service.blurb}
            </p>

            <div className="mt-5 flex flex-wrap items-center gap-3 text-xs">
              {/* A pulsing green "Helpers available now" rendered on every
                  service page whatever the actual supply. A live-status
                  indicator that is not reading live status is the most
                  misleading shape a claim can take. */}
              <span className="inline-flex items-center gap-1.5 bg-amber-50 text-amber-700 px-3 py-1.5 rounded-full font-semibold">
                <Clock className="w-3 h-3" /> {service.eta_label ?? "Avg 18 min"}
              </span>
              <span className="inline-flex items-center gap-1.5 bg-slate-100 text-slate-700 px-3 py-1.5 rounded-full font-semibold">
                <Star className="w-3 h-3 fill-amber-500 text-amber-500" /> Rated after every task
              </span>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href={`/new-request?service=${service.id}`}
                className="inline-flex items-center gap-2 px-5 py-3.5 rounded-xl bg-brand-600 text-white font-semibold hover:bg-brand-700 transition"
              >
                Book {service.title} — from {bothPrices} <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                href="/services"
                className="inline-flex items-center gap-2 px-5 py-3.5 rounded-xl border border-slate-300 text-slate-900 font-semibold hover:bg-slate-50 transition"
              >
                Browse all services
              </Link>
            </div>

            {/* AI-friendly summary block — leads with a definition for snippet extraction */}
            <p className="mt-6 text-sm text-slate-500 leading-relaxed max-w-2xl">
              <strong className="text-slate-700">{service.title} on Helpward</strong> is an on-demand{" "}
              {service.category?.label.toLowerCase()} service that connects you with an approved
              human in your city. Pricing starts at {bothPrices}, a flat $4.50 service fee applies, and
              you only pay once the helper marks the task complete. Service is available in our launch areas
              in the U.S. and Canada.
            </p>
          </div>

          {/* Pricing card */}
          <aside className="rounded-2xl border border-slate-100 bg-white shadow-xl shadow-brand-900/5 overflow-hidden">
            {service.image_url && (
              <img src={service.image_url} alt={service.title} loading="lazy" className="w-full aspect-[5/3] object-cover" />
            )}
            <div className="p-5">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Price estimate</div>
              <dl className="text-sm space-y-1.5">
                {/* Two columns when the markets differ. One estimate with a
                    currency the reader may not be billed in is a quote for
                    somebody else. */}
                {differsByCountry ? (
                  <>
                    <div className="flex justify-between"><dt className="text-slate-500">Base fare (US)</dt><dd className="font-semibold text-slate-900">{formatMoney(usCents, "USD")}</dd></div>
                    <div className="flex justify-between"><dt className="text-slate-500">Base fare (Canada)</dt><dd className="font-semibold text-slate-900">{formatMoney(caCents, "CAD")}</dd></div>
                    <div className="flex justify-between"><dt className="text-slate-500">Service fee</dt><dd className="font-semibold text-slate-900">${serviceFee.toFixed(2)}</dd></div>
                    <div className="flex justify-between pt-2 border-t border-slate-100"><dt className="font-bold text-slate-900">Total estimate</dt><dd className="font-bold text-brand-700">{formatMoney(usCents + 450, "USD")} · {formatMoney(caCents + 450, "CAD")}</dd></div>
                  </>
                ) : (
                  <>
                    <div className="flex justify-between"><dt className="text-slate-500">Base fare</dt><dd className="font-semibold text-slate-900">${baseDollars.toFixed(2)}</dd></div>
                    <div className="flex justify-between"><dt className="text-slate-500">Service fee</dt><dd className="font-semibold text-slate-900">${serviceFee.toFixed(2)}</dd></div>
                    <div className="flex justify-between pt-2 border-t border-slate-100"><dt className="font-bold text-slate-900">Total estimate</dt><dd className="font-bold text-brand-700">${total.toFixed(2)}</dd></div>
                  </>
                )}
              </dl>
              <p className="text-[11px] text-slate-400 mt-2 leading-snug">
                Final price depends on distance, time, and any tip. You&apos;re only charged after the task is marked complete.
              </p>
              <Link
                href={`/new-request?service=${service.id}`}
                className="mt-4 w-full inline-flex items-center justify-center gap-2 py-3 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800"
              >
                Get a helper now <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </aside>
        </section>

        {/* What this booking actually is.
            These three blocks used to be one generic list repeated on every
            service page — "approved local helper", "GPS tracking", "24/7
            support" — which is why two different services measured 78%
            identical word for word. They are now written per service, and
            the second column is what the booking does NOT cover: most bad
            bookings come from an assumption nobody contradicted. */}
        {copy && (
          <section className="bg-slate-50 border-y border-slate-100 py-12">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <h2 className="text-2xl font-bold text-slate-900">
                What to include in your {service.title.toLowerCase()} request
              </h2>
              <p className="mt-3 text-sm text-slate-700 leading-relaxed max-w-3xl">{copy.brief}</p>

              <div className="mt-8 grid md:grid-cols-2 gap-8 lg:gap-12">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">What the booking covers</h3>
                  <ul className="mt-3 space-y-2.5 text-sm text-slate-700">
                    {copy.includes.map((i) => (
                      <li key={i} className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" aria-hidden="true" />
                        <span>{i}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">What it does not cover</h3>
                  <ul className="mt-3 space-y-2.5 text-sm text-slate-700">
                    {copy.excludes.map((i) => (
                      <li key={i} className="flex items-start gap-2">
                        <XCircle className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" aria-hidden="true" />
                        <span>{i}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Platform claims, owner-set. Kept to one row rather than the
                  full block that used to repeat on every page, so the
                  service-specific content above still carries the page. */}
              <div className="mt-8 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <Trust icon={Users} title="Approved helpers" sub="Reviewed by a person at Helpward before taking work" />
                <Trust icon={ShieldCheck} title="Pay after completion" sub="Your card is held, not charged, until the task is done" />
                <Trust icon={Clock} title="Fast matching" sub="Average match in 2m 14s" />
                <Trust icon={Sparkles} title="Transparent pricing" sub="No surge, no hidden fees" />
              </div>
            </div>
          </section>
        )}

        {/* The situations, in the words someone would use about their own
            evening. This is the part that makes a page findable by the
            problem rather than only by the product name. */}
        {copy && copy.situations.length > 0 && (
          <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
            <h2 className="text-2xl font-bold text-slate-900">
              When {service.title.toLowerCase()} helps
            </h2>
            <ul className="mt-4 grid sm:grid-cols-2 gap-x-8 gap-y-2.5 max-w-4xl">
              {copy.situations.map((sit) => (
                <li key={sit} className="flex items-start gap-2.5 text-sm text-slate-700 leading-relaxed">
                  <span className="mt-[7px] w-1.5 h-1.5 rounded-full bg-brand-500 shrink-0" aria-hidden="true" />
                  <span>{sit}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Several services overlap enough to compete with one another —
            three kinds of company, three ways to move a parcel, two kinds
            of property visit. Saying which is which sends the reader to
            the one that fits instead of letting them book the wrong thing
            and discover it on the day. */}
        {copy?.chooseBetween && copy.chooseBetween.length > 0 && (
          <section className="bg-slate-50 border-y border-slate-100 py-12">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <h2 className="text-2xl font-bold text-slate-900">Is this the right one?</h2>
              <p className="mt-2 text-sm text-slate-600 max-w-2xl">
                A few of our services sit close together. If one of these describes you better,
                that page will be more use than this one.
              </p>
              <div className="mt-5 grid sm:grid-cols-2 lg:grid-cols-3 gap-3 max-w-5xl">
                {copy.chooseBetween.map((alt) => (
                  <Link
                    key={alt.slug}
                    href={`/services/${alt.slug}`}
                    className="block rounded-2xl bg-white border border-slate-200 p-4 hover:border-brand-300 transition-colors"
                  >
                    <span className="block text-sm font-bold text-slate-900">{alt.label}</span>
                    <span className="block mt-1 text-xs text-slate-600 leading-relaxed">{alt.when}</span>
                    <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-brand-700">
                      See {alt.label.toLowerCase()} <ArrowRight className="w-3 h-3" aria-hidden="true" />
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Where it's available */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <h2 className="text-2xl font-bold text-slate-900">Where {service.title.toLowerCase()} is available</h2>
          <p className="text-sm text-slate-600 mt-1">Where {service.title} is available today. The two California areas cover city limits only.</p>
          <ul className="mt-4 flex flex-wrap gap-2">
            {CITIES.map((c) => (
              <li key={c.slug}>
                <Link
                  href={`/cities/${c.slug}/${service.id}`}
                  className="inline-flex items-center px-3 py-1.5 rounded-full bg-white border border-slate-200 text-xs font-semibold text-slate-700 hover:border-brand-300 hover:text-brand-700"
                >
                  {service.title} in {c.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>

        {/* FAQ */}
        <section className="bg-slate-50 border-t border-slate-100 py-12">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-2xl font-bold text-slate-900 mb-6">Frequently asked about {service.title.toLowerCase()}</h2>
            <dl className="space-y-3">
              {SERVICE_FAQS.map((f) => (
                <details key={f.q} className="group rounded-2xl bg-white border border-slate-100 p-4 sm:p-5 open:shadow-md transition">
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

        {/* Related services */}
        {related.length > 0 && (
          <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
            <h2 className="text-xl font-bold text-slate-900 mb-4">More {service.category?.label.toLowerCase()} services</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {related.map((r) => (
                <Link
                  key={r.id}
                  href={`/services/${r.id}`}
                  className="rounded-xl border border-slate-100 bg-white p-3 hover:border-brand-300 hover:shadow transition"
                >
                  <div className="text-sm font-bold text-slate-900 truncate">{r.title}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    From {staticPriceLabel(r.base_price_cents, r.country_pricing, formatMoney)} · {r.eta_label}
                  </div>
                </Link>
              ))}
            </div>
            <p className="mt-6 text-xs text-slate-500">
              Browse the <Link href="/services" className="text-brand-700 font-semibold hover:underline">full catalog</Link> of {allServices.length} services across {categories.length} categories.
            </p>
          </section>
        )}

        {/* Bottom CTA */}
        <section className="bg-gradient-to-br from-brand-600 to-violet-700 text-white">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 text-center">
            <h2 className="text-2xl sm:text-3xl font-bold">Ready to book {service.title.toLowerCase()}?</h2>
            <p className="mt-2 text-sm sm:text-base text-white/90">Real humans. Real help. Right now.</p>
            <Link
              href={`/new-request?service=${service.id}`}
              className="mt-5 inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-white text-slate-900 font-semibold hover:bg-slate-100"
            >
              Find a helper now <ArrowRight className="w-4 h-4" />
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
      <SiteFooter />
    </div>
  );
}
