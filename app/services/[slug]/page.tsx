import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, CheckCircle2, Clock, ShieldCheck, Star, Users, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import { listServices, listCategories, getService } from "@/lib/data/services";
import { ServiceIcon } from "@/components/ServiceIcon";
import { LandingHeader } from "../../_landing-header";
import { CITIES } from "@/lib/marketing";

// One landing page per active service. Each emits Service + FAQPage +
// BreadcrumbList JSON-LD so AI engines and Google can rank the page for
// "<service name> near me" queries without us writing each by hand.

export const dynamic = "force-static";
export const revalidate = 3600; // 1h ISR — refreshes when admin adds/edits services

export async function generateStaticParams() {
  const services = await listServices();
  return services.map((s) => ({ slug: s.id }));
}

export async function generateMetadata({
  params,
}: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const service = await getService(slug);
  if (!service) return { title: "Service not found — Helpward" };
  const title = `${service.title} — Book a verified helper | Helpward`;
  const description = `${service.blurb} Helpers in your area, background-checked, insured, average response ${service.eta_label ?? "under 20 min"}. From $${(service.base_price_cents / 100).toFixed(0)}.`;
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
    getService(slug),
    listServices(),
    listCategories(),
  ]);
  if (!service) notFound();

  const related = allServices
    .filter((s) => s.category?.id === service.category?.id && s.id !== service.id)
    .slice(0, 6);
  const baseDollars = service.base_price_cents / 100;
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
    offers: {
      "@type": "Offer",
      price: baseDollars.toFixed(2),
      priceCurrency: "USD",
      availability: "https://schema.org/InStock",
      url: `https://helpward.com/new-request?service=${service.id}`,
    },
  };

  const SERVICE_FAQS = [
    {
      q: `What is ${service.title.toLowerCase()} on Helpward?`,
      a: `${service.blurb} Helpward matches your request with a nearby verified human helper, typically within ${service.eta_label ?? "20 minutes"}. Every helper is background-checked, identity-verified, and insured during the booking.`,
    },
    {
      q: `How much does ${service.title.toLowerCase()} cost?`,
      a: `Base price for ${service.title} on Helpward is $${baseDollars.toFixed(0)}. A flat $${serviceFee.toFixed(2)} service fee brings the total to about $${total.toFixed(2)}. Final pricing depends on distance, time, and any tip you add. You're only charged after the helper marks the task complete.`,
    },
    {
      q: `How fast can a helper arrive?`,
      a: `Average response time for ${service.title} is ${service.eta_label ?? "around 18 minutes"} during normal hours. The matching engine notifies all nearby qualified helpers at once; the first to accept becomes yours and you can track their ETA live.`,
    },
    {
      q: `Are Helpward helpers verified?`,
      a: `Yes. Every helper passes a government-ID verification through Stripe Identity, a background check through Checkr, and is covered by Helpward's platform insurance (up to $1M) while on the booking.`,
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
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-slate-900 leading-tight">
              {service.title}
            </h1>
            <p className="mt-3 text-base sm:text-lg text-slate-600 max-w-2xl leading-relaxed">
              {service.blurb}
            </p>

            <div className="mt-5 flex flex-wrap items-center gap-3 text-xs">
              <span className="inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-full font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Helpers available now
              </span>
              <span className="inline-flex items-center gap-1.5 bg-amber-50 text-amber-700 px-3 py-1.5 rounded-full font-semibold">
                <Clock className="w-3 h-3" /> {service.eta_label ?? "Avg 18 min"}
              </span>
              <span className="inline-flex items-center gap-1.5 bg-slate-100 text-slate-700 px-3 py-1.5 rounded-full font-semibold">
                <Star className="w-3 h-3 fill-amber-500 text-amber-500" /> 4.9 avg rating
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
                href="/services"
                className="inline-flex items-center gap-2 px-5 py-3.5 rounded-xl border border-slate-300 text-slate-900 font-semibold hover:bg-slate-50 transition"
              >
                Browse all services
              </Link>
            </div>

            {/* AI-friendly summary block — leads with a definition for snippet extraction */}
            <p className="mt-6 text-sm text-slate-500 leading-relaxed max-w-2xl">
              <strong className="text-slate-700">{service.title} on Helpward</strong> is an on-demand{" "}
              {service.category?.label.toLowerCase()} service that connects you with a verified, background-checked
              human in your city. Pricing starts at ${baseDollars.toFixed(0)}, a flat $4.50 service fee applies, and
              you only pay once the helper marks the task complete. Service is available across {CITIES.length} cities
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
                {[
                  "Verified, background-checked helper in your city",
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
              <h2 className="text-2xl font-bold text-slate-900">Why Helpward</h2>
              <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                <Trust icon={Users} title="Verified humans" sub="Every helper passes ID + background check" />
                <Trust icon={ShieldCheck} title="Fully insured" sub="Up to $1M coverage on every booking" />
                <Trust icon={Clock} title="Fast matching" sub="Average match in 2m 14s" />
                <Trust icon={Sparkles} title="Transparent pricing" sub="No surge, no hidden fees" />
              </div>
            </div>
          </div>
        </section>

        {/* Where it's available */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <h2 className="text-2xl font-bold text-slate-900">Where {service.title.toLowerCase()} is available</h2>
          <p className="text-sm text-slate-600 mt-1">{service.title} on Helpward is live in {CITIES.length} cities across the U.S. and Canada.</p>
          <ul className="mt-4 flex flex-wrap gap-2">
            {CITIES.map((c) => (
              <li key={c.slug}>
                <Link
                  href={`/cities/${c.slug}`}
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
                  <div className="text-[11px] text-slate-500 mt-0.5">From ${(r.base_price_cents / 100).toFixed(0)} · {r.eta_label}</div>
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
    </div>
  );
}
