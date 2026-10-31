import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { listServicesPublic } from "@/lib/data/services";
import { publicServiceName } from "@/lib/public-service-copy";
import { LandingHeader } from "../../../_landing-header";

/*
  A service URL that is not currently on sale.

  Two cases land here and both deserve better than a bare 404:

    * a service withdrawn while we concentrate on the launch set. It is
      coming back, so this does NOT say "gone" and the URL is not
      redirected to an unrelated service — that would answer a different
      question from the one the visitor asked.
    * a slug that never existed.

  404 is the right status for both: not available now, and ask again
  later. 410 would be a promise it is never returning, which is not
  true, and a redirect would be a lie about what the page is.

  Nothing here is hardcoded. The list of what IS offered is read from
  the catalogue, so this page cannot fall out of step with it.
*/
export default async function CityServiceNotFound() {
  const services = await listServicesPublic();

  return (
    <>
      <LandingHeader />
      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16 lg:py-24">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900">
          We&rsquo;re not offering that one right now
        </h1>
        <p className="mt-3 text-base text-slate-600">
          It may be a service we have paused while we concentrate on the ones below, or a
          page that never existed. Either way, here is everything you can book today.
        </p>

        <ul className="mt-8 grid gap-2 sm:grid-cols-2">
          {services.map((service) => (
            <li key={service.id}>
              <Link
                href={`/services/${service.id}`}
                className="block rounded-xl border border-slate-100 bg-white px-4 py-3 text-sm font-semibold text-slate-900 hover:border-brand-300 hover:shadow transition"
              >
                {publicServiceName(service.id, service.title)}
              </Link>
            </li>
          ))}
        </ul>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/our-services"
            className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-3 text-sm font-semibold text-white hover:bg-brand-700"
          >
            Browse all services <ArrowRight className="w-4 h-4" />
          </Link>
          <Link
            href="/help"
            className="inline-flex items-center rounded-xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Ask us about a service
          </Link>
        </div>
      </main>
    </>
  );
}
