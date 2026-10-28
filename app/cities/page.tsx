import Link from "next/link";
import type { Metadata } from "next";
import { MapPin, ArrowRight } from "lucide-react";
import { MarketingShell } from "@/components/MarketingShell";
import { CITIES } from "@/lib/marketing";
import { SERVICE_AREAS } from "@/lib/service-areas";
import { listServicesPublic } from "@/lib/data/services";

/* This page existed in the BreadcrumbList schema on every city page before
 * it existed on the site.
 *
 * /cities/vancouver published `"item": "https://helpward.com/cities"` as the
 * parent of its breadcrumb trail, and that URL returned 404. A breadcrumb is
 * a promise about the hierarchy; Google fetches the items in it, and a
 * missing parent makes the trail unverifiable. It was also a dead end for
 * anyone trying to find out where Helpward actually operates — /services
 * sends a signed-out visitor to a login form, so there was no public answer.
 *
 * The page says exactly which municipalities are covered, because the most
 * common real question is not "do you serve Vancouver" but "do you serve
 * Langley" — and the honest answer differs between Langley City and Langley
 * Township. The list is read from lib/service-areas.ts, the same source the
 * dispatch guard enforces, so this page cannot drift from what is actually
 * bookable. */

export const metadata: Metadata = {
  title: "Where Helpward operates — San Diego and Metro Vancouver",
  description:
    "Helpward is live in the City of San Diego and 17 municipalities across Metro Vancouver and the Lower Mainland. See the exact coverage before you book.",
  alternates: { canonical: "/cities" },
};

const AREA_FOR_CITY: Record<string, string> = {
  "san-diego": "san-diego-ca",
  vancouver: "lower-mainland-bc",
};

export default async function CitiesIndex() {
  const services = await listServicesPublic().catch(() => []);

  const ld = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "https://helpward.com/" },
      { "@type": "ListItem", position: 2, name: "Where we operate", item: "https://helpward.com/cities" },
    ],
  };

  return (
    <MarketingShell
      title="Where Helpward operates"
      subtitle="Two launch areas, and the exact municipalities inside each one."
      width="wide"
      prose={false}
      hero={
        <p className="mt-5 text-lg leading-relaxed text-slate-700 max-w-3xl">
          Helpward matches you with a local helper, so coverage is a real boundary
          rather than a marketing radius. If the address you enter falls outside one
          of these areas we tell you before you submit, instead of taking a request
          nobody can fill.
        </p>
      }
    >
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />

      <div className="mt-10 grid gap-6 lg:grid-cols-2">
        {CITIES.map((city) => {
          const area = SERVICE_AREAS.find((a) => a.id === AREA_FOR_CITY[city.slug]);
          const munis = area?.municipalities ?? [];
          const currency = area?.country === "CA" ? "CA$" : "US$";
          return (
            <section key={city.slug} className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
              <div className="flex items-start gap-3">
                <span className="w-10 h-10 rounded-xl bg-brand-50 text-brand-600 inline-flex items-center justify-center shrink-0">
                  <MapPin className="w-5 h-5" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <h2 className="text-xl font-bold text-slate-900">
                    <Link href={`/cities/${city.slug}`} className="hover:text-brand-700">
                      {city.name}, {city.region}
                    </Link>
                  </h2>
                  <p className="mt-1 text-[15px] text-slate-600">
                    {city.metro ?? city.name} · prices in {currency}
                  </p>
                </div>
              </div>

              <div className="mt-5">
                <div className="text-xs font-bold uppercase tracking-wide text-slate-400">
                  {munis.length === 1 ? "Covered area" : `Covered municipalities (${munis.length})`}
                </div>
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {munis.map((m) => (
                    <li key={m} className="text-[13px] px-2 py-1 rounded-lg bg-slate-50 text-slate-700">
                      {m}
                    </li>
                  ))}
                </ul>
                {city.slug === "san-diego" && (
                  <p className="mt-3 text-[13px] leading-relaxed text-slate-600">
                    City limits only. Neighbouring incorporated cities — Chula Vista,
                    National City, La Mesa, Coronado, El Cajon — and unincorporated
                    San Diego County are <strong>not</strong> covered.
                  </p>
                )}
                {city.slug === "vancouver" && (
                  <p className="mt-3 text-[13px] leading-relaxed text-slate-600">
                    North Vancouver covers both the City and the District; Langley
                    covers both the City and the Township. Abbotsford, Chilliwack,
                    Mission and Squamish are <strong>not</strong> covered.
                  </p>
                )}
              </div>

              <Link
                href={`/cities/${city.slug}`}
                className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 hover:underline"
              >
                {services.length > 0 ? `All ${services.length} services in ${city.name}` : `Services in ${city.name}`}
                <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </Link>
            </section>
          );
        })}
      </div>

      <p className="mt-8 text-[15px] text-slate-600 max-w-3xl">
        More areas open as real helper supply grows, not before. Helpward does not
        advertise a city it cannot staff — a request we cannot fill wastes your time
        and tells you nothing useful.
      </p>
    </MarketingShell>
  );
}
