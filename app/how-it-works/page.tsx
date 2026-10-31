import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";
import { listServicesPublic } from "@/lib/data/services";
import { SERVICE_FEE_CENTS } from "@/lib/pricing";
import { LandingHeader } from "../_landing-header";

/*
  THE ACTUAL BOOKING JOURNEY.

  Each step below is a thing the product does, in the order it does it,
  including the two steps a marketing page would usually leave out: the
  bank challenge that sometimes follows a helper accepting, and the fact
  that a request can expire without anyone accepting it. Of the 67
  requests this platform has ever taken, every one ended cancelled or
  expired — a journey description that implies acceptance is automatic
  would be describing a different product.
*/

export const dynamic = "force-static";
export const revalidate = 3600;

export const metadata: Metadata = {
  title: "How Helpward Works — From Request to Completed Job | Helpward",
  description:
    "The eight steps of a Helpward booking: choose a service, add details, review the quote, "
    + "request help, a helper accepts, confirm your card if asked, coordinate, and pay on completion.",
  alternates: { canonical: "/how-it-works" },
  openGraph: {
    title: "How Helpward works",
    description: "From choosing a service to paying on completion.",
    url: "/how-it-works",
  },
};

const fee = (SERVICE_FEE_CENTS / 100).toFixed(2);

const STEPS: { title: string; body: string; note?: string }[] = [
  {
    title: "Choose a service",
    body:
      "Pick from the catalogue. Each service page says what it covers, what it does not, and "
      + "how its price is worked out, so you can decide before giving us anything.",
  },
  {
    title: "Add your location and details",
    body:
      "Where the job is, and the questions that actually matter for it — transmission and where "
      + "the car is parked for a driver, rooms and focus for a cleaner, crew size and access at "
      + "both ends for a move. Nothing is asked that does not change the price or who can take "
      + "the job.",
    note:
      "Access codes, keys and where to leave things go in the handover instructions, which are "
      + "saved with the booking and readable only by the helper who is actually booked.",
  },
  {
    title: "Review your quote",
    body:
      `The full figure: base price, any time or quantity beyond what is included, and the flat $${fee} `
      + "service fee. No card is needed to get this far, and nothing has been sent to a helper yet.",
  },
  {
    title: "Send the request",
    body:
      "It goes to approved helpers near you who can do that service. More than one can see it; "
      + "the first to accept becomes yours.",
    note:
      "A request can also expire without anyone accepting it, and nothing is charged if that "
      + "happens. Helper availability is real availability, not a promise.",
  },
  {
    title: "A helper accepts",
    body:
      "Your card is authorised for the total — held, not charged. You get the helper's name and "
      + "can message them from the booking.",
  },
  {
    title: "Confirm with your bank, if asked",
    body:
      "Sometimes a bank wants you to approve the hold yourself. If that happens the booking shows "
      + "you a confirm step and walks you through the bank's own check. Most bookings never see this.",
  },
  {
    title: "Coordinate while the job runs",
    body:
      "Message the helper from the booking, and call them if you need to. For services where "
      + "somebody travels you can see them on the way; for the ones delivered by phone call there "
      + "is nothing to track, because nobody is travelling.",
  },
  {
    title: "Completion and payment",
    body:
      "The helper marks the job complete and the hold is captured — this is the moment you are "
      + "charged. You can add a tip afterwards if you want to, and 100% of it goes to the helper.",
    note:
      "If something went wrong you have 24 hours to open a dispute, and a person at Helpward "
      + "reviews it.",
  },
];

export default async function HowItWorksPage() {
  const services = await listServicesPublic();

  return (
    <>
      <LandingHeader />
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10 lg:py-14">
        <nav aria-label="Breadcrumb" className="text-xs text-slate-500 mb-5">
          <ol className="flex items-center gap-1.5">
            <li><Link href="/" className="hover:text-slate-900">Home</Link></li>
            <li aria-hidden="true">/</li>
            <li className="text-slate-900 font-medium">How it works</li>
          </ol>
        </nav>

        <header className="max-w-3xl">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900">
            How booking a helper works
          </h1>
          <p className="mt-3 text-base sm:text-lg text-slate-600">
            Eight steps from choosing a service to paying for it. You can get all the way to a
            full quote without an account or a card — both are needed only once you want a
            helper to come.
          </p>
        </header>

        <ol className="mt-10 space-y-5">
          {STEPS.map((step, i) => (
            <li key={step.title} className="flex gap-4">
              <span
                aria-hidden="true"
                className="shrink-0 w-9 h-9 rounded-full bg-brand-50 text-brand-700 font-bold text-sm inline-flex items-center justify-center"
              >
                {i + 1}
              </span>
              <div className="min-w-0 pt-1">
                <h2 className="text-base font-bold text-slate-900">{step.title}</h2>
                <p className="mt-1 text-sm text-slate-700">{step.body}</p>
                {step.note && (
                  <p className="mt-2 text-[13px] text-slate-600 border-l-2 border-slate-200 pl-3">
                    {step.note}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ol>

        <section className="mt-12 rounded-2xl bg-slate-50 border border-slate-100 p-6 sm:p-8">
          <h2 className="text-lg font-bold text-slate-900">What we do and do not check</h2>
          <p className="mt-2 text-sm text-slate-700">
            Every helper is reviewed and approved by a person at Helpward before they can take
            work, and an unapproved helper is never offered a job. Automated ID verification and
            background checks are not running yet, and Helpward does not carry platform
            insurance — we will say so here when that changes, rather than before.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              href="/our-services"
              className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-3 text-sm font-semibold text-white hover:bg-brand-700"
            >
              Browse all {services.length} services <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/pricing"
              className="inline-flex items-center rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-100"
            >
              How pricing works
            </Link>
            <Link
              href="/safety"
              className="inline-flex items-center rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-100"
            >
              Safety and disputes
            </Link>
          </div>
        </section>
      </main>
    </>
  );
}
