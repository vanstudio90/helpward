import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, ClipboardCheck, CheckCircle2, Clock, ShieldCheck, Star, Users, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import {
  listServicesPublic,
  listCategoriesPublic,
  getServicePublic,
  listCallDeliveredServiceIds,
  listPricingRulesPublic,
} from "@/lib/data/services";
import {
  PUBLIC_SERVICE_COPY,
  publicServiceName,
  publicServiceDescription,
  includedPoints,
  coverageNote,
  pricingExplanation,
  relatedPrompt,
} from "@/lib/public-service-copy";
import { servicePrep, prepHeading, HANDOVER_LINE } from "@/lib/public-service-prep";
import { SERVICE_PAGE_COPY, SERVICE_SCOPE, servicePageFaqs } from "@/lib/public-service-pages";
import { ServiceIcon } from "@/components/ServiceIcon";
import { LandingHeader } from "../../_landing-header";
import { CITIES } from "@/lib/marketing";

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
  const page = SERVICE_PAGE_COPY[service.id];
  const name = publicServiceName(service.id, service.title);
  const title = page?.title ?? `${name} — Book a verified helper | Helpward`;
  /*
    A preview, not a paragraph. The audit measured these at 170-285
    characters with the same generic ending; the distinct half was being
    buried by the shared half. Trimmed to the service's own sentence plus
    the one fact a searcher is weighing.
  */
  const blurb = publicServiceDescription(service.id, service.blurb);
  const firstSentence = blurb.split(/(?<=\.)\s/)[0] ?? blurb;
  const description = `${firstSentence} From $${(service.base_price_cents / 100).toFixed(0)}, paid only once the job is done.`;
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
  const [service, allServices, categories, callDelivered, pricingRules] = await Promise.all([
    getServicePublic(slug),
    listServicesPublic(),
    listCategoriesPublic(),
    listCallDeliveredServiceIds(),
    listPricingRulesPublic(),
  ]);
  if (!service) notFound();

  // The public name, and the catalogue title it belongs to. Both appear:
  // the search phrase leads, the product is named once so the page and
  // the app are plainly the same thing.
  const page = SERVICE_PAGE_COPY[service.id];
  const name = publicServiceName(service.id, service.title);
  const description = publicServiceDescription(service.id, service.blurb);
  const deliveredByCall = callDelivered.has(service.id);
  const scope = SERVICE_SCOPE[service.id];
  const prep = servicePrep(service.id);

  /*
    Chosen by what someone books next, with the category as a fallback
    for a service nobody has mapped yet. Dog Walking used to offer Date
    Companion and Wedding Guest because all three sit under Companionship.
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

  const pricing = pricingExplanation({
    baseCents: service.base_price_cents,
    serviceFeeCents: Math.round(serviceFee * 100),
    rule: pricingRules[service.id] ?? null,
  });

  const SERVICE_LD = {
    "@context": "https://schema.org",
    "@type": "Service",
    name,
    alternateName: name === service.title ? undefined : service.title,
    description,
    serviceType: service.category?.label,
    provider: { "@id": "https://helpward.com/#organization" },
    areaServed: CITIES.map((c) => ({ "@type": "City", name: c.name })),
    offers: {
      "@type": "Offer",
      /*
        The BASE price, and it says so. It is not an all-in total: a
        flat service fee is added, and time, units or crew can be added
        on top by the answers on the booking form.

        No `availability`. Emitting InStock is a claim that a helper is
        available, which nothing here measures — the honest shape is to
        omit it rather than publish a supply promise.
      */
      price: baseDollars.toFixed(2),
      priceCurrency: "USD",
      description:
        `Base price before the flat $${serviceFee.toFixed(2)} service fee`
        + `${pricingRules[service.id]?.includedMinutes != null ? `, covering the first booked period` : ``}`
        + `. Final total depends on the answers given when booking.`,
      url: `https://helpward.com/new-request?service=${service.id}`,
    },
  };

  /*
    THE SERVICE'S OWN QUESTIONS FIRST.

    These four were asked on all twenty-six pages with the name slotted
    in — questions nobody searches, answered identically every time, and
    on a service delivered by phone call one of them asked about an
    arrival that never happens. The per-service set in
    lib/public-service-pages.ts leads; these two survive after it because
    they are genuinely the same answer everywhere, and the arrival
    question is gone.
  */
  // Figures resolved from this service's live base price and pricing
  // rule, so the copy cannot outlive a rate-card change.
  const serviceFaqs = servicePageFaqs(service.id, {
    baseCents: service.base_price_cents,
    serviceFeeCents: Math.round(serviceFee * 100),
    rule: pricingRules[service.id] ?? null,
  });

  const SERVICE_FAQS = [
    ...(serviceFaqs.length > 0
      ? serviceFaqs
      : [
          {
            q: `What is ${name.toLowerCase()} on Helpward?`,
            a: `${description} Helpward matches your request with a nearby helper who has been reviewed and approved by a person at Helpward before they can take work.`,
          },
        ]),
    {
      q: `How much does ${name.toLowerCase()} cost?`,
      a: `Base price for ${service.title} on Helpward is $${baseDollars.toFixed(0)}. A flat $${serviceFee.toFixed(2)} service fee brings the total to about $${total.toFixed(2)}. ${pricing.points.slice(0, -1).join(" ")}`,
    },
    {
      q: `Are Helpward helpers verified?`,
      a: `Every helper is reviewed and approved by a person at Helpward before they can take a task, and no unapproved helper is ever offered work. Automated ID verification and background checks are not running yet — we will say so here when they are, rather than before. Helpward does not currently carry platform insurance.`,
    },
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
            <li><Link href="/our-services" className="hover:text-slate-900">Services</Link></li>
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
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-slate-900 leading-tight">
              {page?.h1 ?? service.title}
            </h1>
            <p className="mt-3 text-base sm:text-lg text-slate-600 max-w-2xl leading-relaxed">
              {page?.intro ?? description}
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
                Book {service.title} — from ${baseDollars.toFixed(0)} <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                href="/our-services"
                className="inline-flex items-center gap-2 px-5 py-3.5 rounded-xl border border-slate-300 text-slate-900 font-semibold hover:bg-slate-50 transition"
              >
                Browse all services
              </Link>
            </div>

            {/* AI-friendly summary block — leads with a definition for snippet extraction */}
            <p className="mt-6 text-sm text-slate-500 leading-relaxed max-w-2xl">
              <strong className="text-slate-700">{service.title} on Helpward</strong> is an on-demand{" "}
              {service.category?.label.toLowerCase()} service that connects you with an approved
              human {deliveredByCall ? "by phone" : "in your city"}. Pricing starts at ${baseDollars.toFixed(0)}, a flat $4.50 service fee applies, and
              you only pay once the helper marks the task complete. Service is available in our launch areas
              in the U.S. and Canada.
            </p>
          </div>

          {/* Pricing card */}
          <aside className="rounded-2xl border border-slate-100 bg-white shadow-xl shadow-brand-900/5 overflow-hidden">
            {/*
              DECORATIVE, so alt="".

              Stock photographs, with a heading beside each one that
              already names the service, so they carry nothing a screen
              reader needs. Describing them would be worse than silence:
              all 26 were reviewed against the actual files on
              2026-10-31 and 14 do not show the service at all — a
              humanoid robot on Car Battery Jump, a fulfilment warehouse
              on a page that says there is no postal network behind it, a
              clinical white coat on a service that states it provides no
              medical care, a television on a stand on the page about
              mounting one to a wall. Announcing those as the page's
              content would publish the mismatch, not fix it.

              The descriptions and the replacement list went to the
              designer. Give a photograph real alt text once it genuinely
              shows the work.
            */}
            {service.image_url && (
              <img src={service.image_url} alt="" loading="lazy" className="w-full aspect-[5/3] object-cover" />
            )}
            <div className="p-5">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Price estimate</div>
              <dl className="text-sm space-y-1.5">
                <div className="flex justify-between"><dt className="text-slate-500">Base fare</dt><dd className="font-semibold text-slate-900">${baseDollars.toFixed(2)}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-500">Service fee</dt><dd className="font-semibold text-slate-900">${serviceFee.toFixed(2)}</dd></div>
                <div className="flex justify-between pt-2 border-t border-slate-100"><dt className="font-bold text-slate-900">Total estimate</dt><dd className="font-bold text-brand-700">${total.toFixed(2)}</dd></div>
              </dl>
              <p className="text-[11px] text-slate-400 mt-2 leading-snug">
                {pricing.lead} Distance does not change it. You&apos;re only charged after the task is marked complete.
                Shown in USD; Canadian bookings are charged the same figure in CAD.
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

        {/* What's included */}
        <section className="bg-slate-50 border-y border-slate-100 py-12">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid md:grid-cols-2 gap-8 lg:gap-12">
            <div>
              <h2 className="text-2xl font-bold text-slate-900">What&apos;s included</h2>
              <ul className="mt-4 space-y-3 text-sm text-slate-700">
                {includedPoints({ deliveredByCall }).map((i) => (
                  <li key={i} className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" /> {i}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h2 className="text-2xl font-bold text-slate-900">Why Helpward</h2>
              <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                <Trust icon={Users} title="Approved helpers" sub="Reviewed by a person at Helpward before taking work" />
                <Trust icon={ShieldCheck} title="Pay after completion" sub="Your card is held, not charged, until the task is done" />
                <Trust icon={Clock} title="Fast matching" sub="Average match in 2m 14s" />
                <Trust icon={Sparkles} title="Transparent pricing" sub="No surge, no hidden fees" />
              </div>
            </div>
          </div>
        </section>

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
              {prepHeading(deliveredByCall)}
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
              What {name.toLowerCase()} covers
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
          TRUST STATEMENTS NEED SOMEWHERE TO GO.

          None of the 78 service pages linked to /safety or /help, on
          pages that discuss screening, support and disputes. A trust
          claim with no path to the explanation behind it is a dead end.
        */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-2">
          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-5 sm:p-6 max-w-4xl">
            <h2 className="text-base font-bold text-slate-900">Before you book</h2>
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
                <Link href="/how-it-works" className="font-semibold text-brand-700 hover:underline">
                  How booking works
                </Link>
                <span className="block text-slate-600 text-[13px]">
                  The eight steps, including when your card is charged.
                </span>
              </li>
              <li>
                <Link href="/help" className="font-semibold text-brand-700 hover:underline">
                  Help and contact a person
                </Link>
                <span className="block text-slate-600 text-[13px]">
                  Support by call, chat or email, answered by a human.
                </span>
              </li>
            </ul>
          </div>
        </section>

        {/*
          HOW THE PRICE IS WORKED OUT.

          The pricing card shows three numbers; this says what moves
          them. Built from the service's own pricing rule, so it cannot
          promise an arithmetic the server does not perform.
        */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <h2 className="text-2xl font-bold text-slate-900">
            How {name.toLowerCase()} is priced
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            {pricing.lead}{" "}
            <Link href="/pricing" className="text-brand-700 font-semibold hover:underline">
              How every Helpward price is worked out
            </Link>
            .
          </p>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2 max-w-4xl text-sm text-slate-700">
            {pricing.points.map((point) => (
              <li key={point} className="flex items-start gap-2 rounded-xl bg-slate-50 border border-slate-100 p-3.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* Where it's available */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <h2 className="text-2xl font-bold text-slate-900">Where {name.toLowerCase()} is available</h2>
          <p className="text-sm text-slate-600 mt-1">Where {service.title} is available today. {coverageNote()}</p>
          <ul className="mt-4 flex flex-wrap gap-2">
            {CITIES.map((c) => (
              <li key={c.slug}>
                <Link
                  href={`/cities/${c.slug}/${service.id}`}
                  className="inline-flex items-center px-3 py-1.5 rounded-full bg-white border border-slate-200 text-xs font-semibold text-slate-700 hover:border-brand-300 hover:text-brand-700"
                >
                  {name} in {c.name}
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
                  {/* The reason first: a name and a price is not a reason. */}
                  {relatedPrompt(r.id) && (
                    <div className="text-[11px] font-semibold text-brand-700 leading-snug">
                      {relatedPrompt(r.id)}
                    </div>
                  )}
                  <div className="text-sm font-bold text-slate-900 mt-0.5">{publicServiceName(r.id, r.title)}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">From ${(r.base_price_cents / 100).toFixed(0)} · {r.eta_label}</div>
                </Link>
              ))}
            </div>
            <p className="mt-6 text-xs text-slate-500">
              Browse the <Link href="/our-services" className="text-brand-700 font-semibold hover:underline">full catalog</Link> of {allServices.length} services across {categories.length} categories.
            </p>
          </section>
        )}

        {/* Bottom CTA */}
        <section className="bg-gradient-to-br from-brand-600 to-violet-700 text-white">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 text-center">
            <h2 className="text-2xl sm:text-3xl font-bold">Ready to book {name.toLowerCase()}?</h2>
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
    </div>
  );
}
