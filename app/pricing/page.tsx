import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { listServicesPublic, listPricingRulesPublic } from "@/lib/data/services";
import { publicServiceName, pricingExplanation } from "@/lib/public-service-copy";
import { SERVICE_FEE_CENTS, COMMISSION_RATE } from "@/lib/pricing";
import { countryMoneyForService, bothCountries } from "@/lib/country-price";
import { formatMoney } from "@/lib/money";
import { CITIES } from "@/lib/marketing";
import { LandingHeader } from "../_landing-header";

/*
  HOW A HELPWARD PRICE IS PUT TOGETHER.

  Written from the code that charges the card, not from a marketing
  summary: SERVICE_FEE_CENTS and COMMISSION_RATE come from lib/pricing,
  every per-service figure comes from the service_pricing rules through
  pricingExplanation(), and the authorise/capture wording matches what
  lib/payments actually does.

  The one thing this page has to be unambiguous about is that distance
  does not enter a price. Nothing in the codebase computes a distance
  component; `bookings.distance_cents` defaults to zero and nothing sets
  it. Pages used to say the opposite.
*/

export const dynamic = "force-static";
export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Pricing — What You Pay and When | Helpward",
  description:
    "How a Helpward quote is worked out: base price, included time, the flat service fee, "
    + "currency, and when your card is authorised and charged.",
  alternates: { canonical: "/pricing" },
  openGraph: { title: "Helpward pricing", description: "What you pay, and when.", url: "/pricing" },
};

const fee = (SERVICE_FEE_CENTS / 100).toFixed(2);

export default async function PricingPage() {
  const [services, rules] = await Promise.all([
    listServicesPublic(),
    listPricingRulesPublic(),
  ]);

  // Real examples, generated from the rules that price the booking.
  /*
    Examples chosen from whatever is actually on sale, not a hardcoded
    list. Four ids were pinned here and two of them were withdrawn when
    the catalogue was cut to the app's launch set, which silently left
    this page with two examples instead of four.

    Picking one of each pricing SHAPE is what makes the section useful:
    a service with extra units, one with extra helpers, a plain
    time-priced one, and a flat-price visit. Falls back to filling from
    the top of the catalogue if a shape is not represented.
  */
  const shape = (id: string) => {
    const r = rules[id];
    if (!r) return "flat";
    if (r.perExtraUnitCents != null) return "units";
    if (r.perExtraCrewCents != null) return "crew";
    return "time";
  };
  const chosen: typeof services = [];
  for (const want of ["units", "crew", "time", "flat"]) {
    const hit = services.find((s) => shape(s.id) === want && !chosen.includes(s));
    if (hit) chosen.push(hit);
  }
  for (const s of services) {
    if (chosen.length >= 4) break;
    if (!chosen.includes(s)) chosen.push(s);
  }
  const examples = chosen
    .slice(0, 4)
    .map((service) => ({
      service,
      name: publicServiceName(service.id, service.title),
      pricing: (() => {
        const m = countryMoneyForService(
          service.base_price_cents,
          service.country_pricing ?? undefined,
          rules[service.id] ?? null,
        );
        return pricingExplanation({
          base: m.base,
          block: m.block,
          unit: m.unit,
          crew: m.crew,
          serviceFeeCents: SERVICE_FEE_CENTS,
          rule: rules[service.id] ?? null,
          amount: bothCountries(formatMoney),
        });
      })(),
    }));

  const timePriced = services.filter((s) => rules[s.id]?.includedMinutes != null).length;
  const flatPriced = services.length - timePriced;

  return (
    <>
      <LandingHeader />
      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 lg:py-14">
        <nav aria-label="Breadcrumb" className="text-xs text-slate-500 mb-5">
          <ol className="flex items-center gap-1.5">
            <li><Link href="/" className="hover:text-slate-900">Home</Link></li>
            <li aria-hidden="true">/</li>
            <li className="text-slate-900 font-medium">Pricing</li>
          </ol>
        </nav>

        <header className="max-w-3xl">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900">
            What you pay, and when
          </h1>
          <p className="mt-3 text-base sm:text-lg text-slate-600">
            Every quote is built from a base price for the service, the time or quantity you
            book, and one flat ${fee} service fee. You see the whole figure before the request
            reaches a helper, and your card is only charged once the job is done.
          </p>
        </header>

        <section className="mt-10">
          <h2 className="text-2xl font-bold text-slate-900">The parts of a quote</h2>
          <dl className="mt-4 grid gap-4 sm:grid-cols-2">
            {[
              ["Base price",
               `Set per service. It covers a stated amount of time or quantity — ${timePriced} of our ${services.length} services are priced by time booked, and ${flatPriced} are a flat price for the visit.`],
              ["Time beyond what's included",
               "Charged in whole blocks, not by the minute. A job that runs a minute into a block is charged for that block, because a helper's time is booked rather than metered."],
              ["Quantity or crew",
               "Only where the service has them: extra dogs, extra parcels, extra helpers. Each is a stated amount per unit, shown on the service's own page."],
              [`Service fee of $${fee}`,
               "Flat, once per booking, whatever the job costs. We chose a flat fee over a percentage so a small errand is not penalised against a large booking."],
              ["Tip",
               "Optional, decided after the job is done, and never added for you. Presets are offered but none is pre-selected, choosing an amount and sending it are separate taps, and 100% of a tip goes to the helper."],
              ["Distance",
               "Nothing. Distance does not change the price, there is no surge pricing, and there is no peak-hour or holiday markup."],
            ].map(([term, detail]) => (
              <div key={term} className="rounded-2xl border border-slate-100 bg-white p-5">
                <dt className="text-sm font-bold text-slate-900">{term}</dt>
                <dd className="mt-1.5 text-sm text-slate-700">{detail}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="mt-12">
          <h2 className="text-2xl font-bold text-slate-900">Which currency you are charged in</h2>
          <p className="mt-2 text-sm text-slate-700 max-w-3xl">
            Each service has its own price in each country — two prices, not one price with two
            symbols — and it is not only the base that differs. Extra time, extra helpers and extra
            parcels each have their own figure in each country. Nothing is converted between them:
            you are charged the figures for the city you book in.
          </p>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2 max-w-3xl">
            {CITIES.map((city) => (
              <li key={city.slug} className="rounded-2xl border border-slate-100 bg-white p-4 text-sm">
                <span className="font-bold text-slate-900">{city.name}, {city.region}</span>
                <span className="block text-slate-600 mt-0.5">
                  Charged in {city.country === "CA" ? "CA$ (Canadian dollars)" : "US$ (US dollars)"}.
                  {" "}
                  <Link href={`/cities/${city.slug}`} className="text-brand-700 font-semibold hover:underline">
                    What we cover there
                  </Link>
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-12">
          <h2 className="text-2xl font-bold text-slate-900">Four real examples</h2>
          <p className="mt-2 text-sm text-slate-600">
            Generated from the same pricing rules that quote your booking, so these cannot drift
            from what you are actually charged.
          </p>
          {/*
            Every figure below is one number in two currencies: a base of
            25 is CA$25 on a Vancouver booking and US$25 on a San Diego
            one. Saying so once, here, is the honest way to label a
            national page — the alternative is a bare "$" that means
            something different depending on where the job is.
          */}
          <p className="mt-1 text-sm font-semibold text-slate-900">
            Where two figures are shown as <span className="whitespace-nowrap">US$ · CA$</span>, they
            are the separate prices for San Diego and Vancouver.
          </p>
          <div className="mt-4 space-y-4">
            {examples.map(({ service, name, pricing }) => (
              <div key={service.id} className="rounded-2xl border border-slate-100 bg-white p-5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="text-base font-bold text-slate-900">
                    {name}{" "}
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      US$ / CA$
                    </span>
                  </h3>
                  <Link
                    href={`/services/${service.id}`}
                    className="text-[13px] font-semibold text-brand-700 hover:underline"
                  >
                    Full details
                  </Link>
                </div>
                <p className="mt-1 text-[13px] text-slate-500">{pricing.lead}</p>
                <ul className="mt-3 space-y-1.5 text-sm text-slate-700">
                  {pricing.points.slice(0, -1).map((point) => (
                    <li key={point} className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-12">
          <h2 className="text-2xl font-bold text-slate-900">When money actually moves</h2>
          <ol className="mt-4 space-y-3 text-sm text-slate-700 max-w-3xl">
            <li>
              <span className="font-semibold text-slate-900">You review the quote.</span>{" "}
              Nothing is charged, and nothing has gone to a helper yet. Browsing and quoting
              cost nothing and need no card.
            </li>
            <li>
              <span className="font-semibold text-slate-900">A helper accepts.</span>{" "}
              Your card is authorised for the total — held, not charged. Your bank may ask you
              to confirm it; if so, the booking will tell you.
            </li>
            <li>
              <span className="font-semibold text-slate-900">The job is marked complete.</span>{" "}
              The authorisation is captured. This is the point at which you are charged.
            </li>
            <li>
              <span className="font-semibold text-slate-900">If the booking is cancelled before that,</span>{" "}
              we release the card hold. Your bank may continue to show it as pending for a short
              time — that is the hold clearing, not a charge. Nothing has been taken.
            </li>
            <li>
              <span className="font-semibold text-slate-900">Releasing a hold is not a refund.</span>{" "}
              A hold that was never captured is released and the money never leaves your account.
              A payment already captured — a completed job — is refunded instead, which does appear
              on your statement and takes several days to clear.
            </li>
            <li>
              <span className="font-semibold text-slate-900">A tip is a separate charge,</span>{" "}
              made after completion if you choose to add one, and it is final once sent.
            </li>
          </ol>
        </section>

        <section className="mt-12">
          <h2 className="text-2xl font-bold text-slate-900">What the fee pays for</h2>
          <p className="mt-2 text-sm text-slate-700 max-w-3xl">
            Helpers keep {Math.round((1 - COMMISSION_RATE) * 100)}% of the service price and
            100% of any tip. Helpward keeps {Math.round(COMMISSION_RATE * 100)}% of the service
            price and the flat ${fee} fee, which funds support, payment processing and building
            the platform. There are no subscriptions, no setup fees and no membership tiers.
          </p>
        </section>

        <section className="mt-12 rounded-2xl bg-slate-50 border border-slate-100 p-6 sm:p-8">
          <h2 className="text-lg font-bold text-slate-900">Cancelling, refunds and disputes</h2>
          <p className="mt-2 text-sm text-slate-700">
            There is no cancellation fee. If something goes wrong with a completed job you have
            24 hours to open a dispute, and a person at Helpward reviews it.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              href="/terms#cancellations"
              className="inline-flex items-center rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-100"
            >
              Cancellation terms
            </Link>
            <Link
              href="/terms#refunds"
              className="inline-flex items-center rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-100"
            >
              Refunds and disputes
            </Link>
            <Link
              href="/how-it-works"
              className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-3 text-sm font-semibold text-white hover:bg-brand-700"
            >
              How booking works <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </section>
      </main>
    </>
  );
}
