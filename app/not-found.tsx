import Link from "next/link";
import { Compass, Home, ArrowRight } from "lucide-react";
import { listServicesPublic } from "@/lib/data/services";
import { publicServiceName } from "@/lib/public-service-copy";

/*
  THE 404, AND WHY IT LISTS THE CATALOGUE.

  Most 404s here are now a withdrawn service. Eighteen services came off
  the public site while the iOS app ships its first eight, and every one
  of those URLs had been published and indexed. Somebody arriving on
  /services/tv-mounting from a search is not lost — they wanted a
  specific thing, and we are not selling it this week.

  So this page answers that rather than shrugging.

  404 is the right status here: not available now, ask again later. 410
  would also be defensible and is NOT irreversible — either status can
  return 200 later — but 410 states that the resource is deliberately
  gone, which overstates a pause. 404 says less, and less is accurate.

  They are not redirected to another service either: that would answer a
  different question from the one the visitor asked.

  The list is read from the catalogue, so it cannot drift from what is
  actually on sale, and it needs no edit when the eighteen return.

  This is the ROOT not-found on purpose. A not-found.tsx inside
  /services/[slug] never runs: those routes are `force-static`, so an
  unknown slug is served a static 404 without the segment executing.
*/
export default async function NotFound() {
  const services = await listServicesPublic();

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-slate-100">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-brand-600 text-white flex items-center justify-center font-bold">H</div>
            <span className="text-lg font-bold tracking-tight">Helpward</span>
          </Link>
        </div>
      </header>

      <main className="flex-1 px-4 sm:px-6 py-14">
        <div className="max-w-3xl mx-auto">
          <span className="inline-flex w-14 h-14 rounded-2xl bg-brand-50 items-center justify-center mb-4">
            <Compass className="w-7 h-7 text-brand-600" />
          </span>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">
            We&rsquo;re not offering that one right now
          </h1>
          <p className="mt-2.5 text-sm sm:text-base text-slate-600 max-w-2xl">
            It may be a service we have paused while we concentrate on the ones below, or a
            page that moved or never existed. Here is everything you can book today.
          </p>

          {services.length > 0 && (
            <ul className="mt-7 grid gap-2 sm:grid-cols-2">
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
          )}

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/our-services"
              className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700"
            >
              Browse all services <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/"
              className="inline-flex items-center gap-2 px-5 py-3 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <Home className="w-4 h-4" /> Back to home
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
