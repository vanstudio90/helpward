import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";
import { listServicesPublic, listCategoriesPublic } from "@/lib/data/services";
import { ServiceIcon } from "@/components/ServiceIcon";
import { LandingHeader } from "../_landing-header";
import { publicServiceName, publicServiceDescription } from "@/lib/public-service-copy";

/*
  THE PUBLIC SERVICE DIRECTORY.

  /services is the signed-in customer browse — `proxy.ts` gates it on
  purpose. But every public service page linked there from its
  breadcrumb and its "Browse all services" button, so the one journey a
  search visitor is most likely to take ended at a login form. Googlebot
  got the same 307.

  This is the public half: the same catalogue, no account needed.
  Booking still requires one, which is unchanged — browsing does not.

  Served statically and revalidated hourly, like the individual service
  pages, so an admin adding a service does not need a deploy.
*/

export const dynamic = "force-static";
export const revalidate = 3600;

export const metadata: Metadata = {
  title: "All Helpward Services — Browse Local Help You Can Book | Helpward",
  description:
    "Every service Helpward offers, from cleaning and moving help to errands and deliveries. "
    + "Approved local helpers, a quote before you request, and payment only after the task is done.",
  alternates: { canonical: "/our-services" },
  openGraph: {
    title: "All Helpward Services",
    description: "Browse everything you can book through Helpward.",
    url: "/our-services",
  },
};

export default async function OurServicesPage() {
  const [services, categories] = await Promise.all([
    listServicesPublic(),
    listCategoriesPublic(),
  ]);

  // Only categories that actually have something in them: an empty
  // heading on a directory reads as a service we removed.
  const grouped = categories
    .map((category) => ({
      category,
      items: services.filter((s) => s.category_id === category.id),
    }))
    .filter((g) => g.items.length > 0);

  return (
    <>
      <LandingHeader />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 lg:py-14">
        <nav aria-label="Breadcrumb" className="text-xs text-slate-500 mb-5">
          <ol className="flex items-center gap-1.5">
            <li><Link href="/" className="hover:text-slate-900">Home</Link></li>
            <li aria-hidden="true">/</li>
            <li className="text-slate-900 font-medium">Services</li>
          </ol>
        </nav>

        <header className="max-w-3xl">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900">
            Everything you can book through Helpward
          </h1>
          <p className="mt-3 text-base sm:text-lg text-slate-600">
            {services.length} services across {grouped.length} categories. Tell a helper
            what you need, see the full price before you request, and pay only once
            the task is done.
          </p>
          <p className="mt-3 text-sm text-slate-500">
            Choose a service, add your details, then review your price before sending a request.
          </p>
        </header>

        <div className="mt-10 space-y-12">
          {grouped.map(({ category, items }) => (
            <section key={category.id} id={category.id} className="scroll-mt-24">
              <div className="flex items-baseline justify-between gap-4">
                <h2 className="text-xl sm:text-2xl font-bold text-slate-900">
                  {category.label}
                </h2>
                <span className="text-xs text-slate-500 whitespace-nowrap">
                  {items.length} service{items.length === 1 ? "" : "s"}
                </span>
              </div>

              <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((service) => (
                  <li key={service.id}>
                    <Link
                      href={`/services/${service.id}`}
                      className="group flex h-full gap-3 rounded-2xl border border-slate-100 bg-white p-4 transition hover:border-brand-300 hover:shadow-lg"
                    >
                      <span className="shrink-0">
                        <ServiceIcon name={service.id} size="sm" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-bold text-slate-900">
                          {publicServiceName(service.id, service.title)}
                        </span>
                        {publicServiceDescription(service.id, service.blurb) && (
                          <span className="mt-1 block text-[13px] leading-snug text-slate-600">
                            {publicServiceDescription(service.id, service.blurb)}
                          </span>
                        )}
                        <span className="mt-2 inline-flex items-center gap-1 text-[13px] font-semibold text-brand-700">
                          See what&rsquo;s included
                          <ArrowRight className="w-3.5 h-3.5 transition group-hover:translate-x-0.5" />
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        {/*
          No price on this page, deliberately. What a job costs depends on
          the answers the booking form collects — duration, quantity, crew
          — so a figure here would be a floor dressed up as a price. The
          service pages explain how each one is worked out.
        */}
        <section className="mt-14 rounded-2xl bg-slate-50 border border-slate-100 p-6 sm:p-8">
          <h2 className="text-lg font-bold text-slate-900">How booking works</h2>
          <ol className="mt-4 grid gap-4 sm:grid-cols-3 text-sm text-slate-700">
            <li>
              <span className="block font-semibold text-slate-900">1. Choose a service</span>
              Tell us what you need and where.
            </li>
            <li>
              <span className="block font-semibold text-slate-900">2. Add your details</span>
              The questions that decide the price and who can take the job.
            </li>
            <li>
              <span className="block font-semibold text-slate-900">3. Review and request</span>
              See the full price before anything is sent to a helper.
            </li>
          </ol>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              href="/new-request"
              className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-3 text-sm font-semibold text-white hover:bg-brand-700"
            >
              Request help <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/safety"
              className="inline-flex items-center rounded-xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-white"
            >
              How we keep bookings safe
            </Link>
          </div>
        </section>
      </main>
    </>
  );
}
