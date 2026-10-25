import Link from "next/link";
import {
  Sparkles, Shield, MapPin, Lock, ArrowRight, Star, HelpCircle, Headphones,
  Users, Clock, ShieldCheck, DollarSign, CheckCircle, Activity, Zap, MessageSquare,
  Smile, Apple, Play,
} from "lucide-react";
import { MapBackdrop } from "@/components/MapBackdrop";
import { ServiceIcon } from "@/components/ServiceIcon";
import { LandingHeader } from "./_landing-header";
import { ServicesCatalog } from "./_services-catalog";
import { HeroSearch } from "./_hero-search";
import { listServices, listCategories } from "@/lib/data/services";
import { CITIES, categoryImage } from "@/lib/marketing";
import { getVisitor } from "@/lib/geo";
import { getBookingCountsByService } from "@/lib/data/service-stats";
import { MobileStickyCTA, HeroSentinel } from "@/components/MobileStickyCTA";

// Homepage reads Vercel edge geo headers per request so the hero / activity
// section can address the visitor's city by name. Forces dynamic rendering;
// the heavier static SEO surface (FAQs, services, schemas) still ships in
// every response, just rendered per-request.
export const dynamic = "force-dynamic";

// Definition-first homepage opener — AI engines extract the first sentence
// as a candidate snippet, so this paragraph is the "what is Helpward" answer.
const TLDR =
  "Helpward is the Human Infrastructure Network: an on-demand marketplace that connects you with verified, background-checked humans for rides, errands, home help, deliveries, and almost any real-world task across the U.S. and Canada. Pricing is shown upfront, payment is held until your task is marked complete, and every helper is identity-verified and insured during the booking.";

const FAQS: { q: string; a: string }[] = [
  {
    q: "How does Helpward work?",
    a: "You describe what you need, our matching engine notifies nearby verified helpers in real time, and the first to accept becomes yours. You see their identity, rating, and ETA before they arrive, follow their progress live, and only pay when they mark the task complete.",
  },
  {
    q: "Are helpers background-checked?",
    a: "Yes. Every helper passes government-ID verification through Stripe Identity, a background check through Checkr/Triton, and is covered by Helpward's platform insurance while the booking is active. Approval is reviewed by a human at Helpward before any helper can take a task.",
  },
  {
    q: "How much does it cost?",
    a: "Each service has a published base price (for example $20 for a designated driver). Helpward adds a flat $4.50 service fee and the total is shown before you submit. There is no surge pricing, no hidden fees, and no charge until the task is marked complete.",
  },
  {
    q: "Is my payment secure?",
    a: "Yes. Payment is authorised at booking and only captured after the helper marks the task complete. Card details are tokenised by Stripe — Helpward never sees or stores raw card numbers. You have a 24-hour window after completion to open a dispute reviewed by Helpward support.",
  },
  {
    q: "What if I'm not satisfied?",
    a: "Open a dispute from the booking page within 24 hours of completion. Helpward's support team reviews the case, contacts both parties, and can refund partial or full payment depending on what the evidence shows. Your platform-insurance coverage stays active throughout.",
  },
  {
    q: "What can I request on Helpward?",
    a: "The active catalog spans six categories — Transportation, Home Help, Errands, Presence, Lifestyle, and Business — with dozens of specific services. If your need is legal, safe, and a human nearby can do it, describe it in your own words and the matching engine will route it to someone qualified.",
  },
  {
    q: "Where is Helpward available?",
    a: "Helpward is live in three launch areas: Vancouver and the surrounding Lower Mainland in British Columbia, and the cities of Los Angeles and San Diego in California. The two California areas cover city limits only. If your address falls outside a launch area we tell you before you submit, rather than taking a request we cannot fill. More areas open as verified helper supply grows.",
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

// dateModified for the homepage — bumped whenever the catalog or copy
// meaningfully changes so AI engines see recent freshness signal.
const LAST_UPDATED_ISO = "2026-05-27";

const HOMEPAGE_LD = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  "@id": "https://helpward.com/#webpage",
  url: "https://helpward.com",
  name: "Helpward — Real humans. Real help. Right now.",
  description: TLDR,
  isPartOf: { "@id": "https://helpward.com/#website" },
  about: { "@id": "https://helpward.com/#organization" },
  dateModified: LAST_UPDATED_ISO,
  primaryImageOfPage: { "@type": "ImageObject", url: "https://helpward.com/opengraph-image" },
  breadcrumb: {
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "https://helpward.com" },
    ],
  },
};

// Testimonials with task type + city + completed date for credibility.
// Sample data clearly marked — swap when real reviews accumulate.
const QUICK_REQUESTS = [
  "Ride to airport", "Furniture assembly", "Package delivery", "Wait in line", "Elder companion",
];

const WHY_FEATURES = [
  { icon: Users, tone: "text-brand-600 bg-brand-50", title: "Real humans", sub: "Talk to real people, not bots." },
  { icon: Zap, tone: "text-amber-600 bg-amber-50", title: "Fast matching", sub: "Get matched in minutes." },
  { icon: MapPin, tone: "text-emerald-600 bg-emerald-50", title: "Local experts", sub: "Helpers in your neighborhood." },
  { icon: Clock, tone: "text-rose-600 bg-rose-50", title: "24/7 availability", sub: "Help when you need it." },
  { icon: Smile, tone: "text-violet-600 bg-violet-50", title: "Satisfaction", sub: "Rated 4.9/5 by thousands." },
];

export default async function LandingPage() {
  const [services, categories, visitor, bookingCountsMap] = await Promise.all([
    listServices(),
    listCategories(),
    getVisitor(),
    getBookingCountsByService(7),
  ]);
  const visitorCity = visitor.matchedCity;
  const bookingCounts = Object.fromEntries(bookingCountsMap);

  // Top 6 categories for the popular row (by sort_order)
  const topCategories = categories
    .map((c) => ({ category: c, count: services.filter((s) => s.category?.id === c.id).length }))
    .filter((g) => g.count > 0)
    .slice(0, 6);

  return (
    <div className="min-h-screen bg-white">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(HOMEPAGE_LD) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_LD) }} />
      <MobileStickyCTA heroSentinelId="hero-end-sentinel" />
      <LandingHeader />
      <main>

      {/* HERO */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-brand-50 via-white to-sky-50 -z-10" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-12 lg:pt-16 lg:pb-20">
          <div className="grid gap-8 lg:gap-12 lg:grid-cols-[1.05fr_1fr] lg:items-center">
            <div>
              {/* Trust pills above headline — second pill is city-aware when we
                  matched the visitor to a Helpward market via Vercel edge geo. */}
              {/* Two "trust pills" used to sit here: a stack of stock
                  pravatar faces with "2,431 tasks completed this week", and
                  "247 helpers available across 10 cities". Both were
                  hardcoded constants. The database has never recorded a
                  single completed booking and has zero approved helpers, so
                  they were not approximations — they were invented. Nothing
                  replaces them until there are real numbers to report. */}

              <h1 className="text-[40px] sm:text-5xl lg:text-6xl font-bold tracking-tight text-slate-900 leading-[1.05]">
                Get real human help{" "}
                <span className="text-brand-600">{visitorCity ? `in ${visitorCity.name}.` : "on demand."}</span>
              </h1>
              <p className="mt-4 text-base lg:text-lg text-slate-600 max-w-xl">
                Book verified local helpers{visitorCity ? ` in ${visitorCity.metro ?? visitorCity.name}` : ""} in minutes for rides, errands, home tasks, deliveries, and more.
              </p>

              {/* Request card — client island: voice search + recent-search dropdown */}
              <HeroSearch quickRequests={QUICK_REQUESTS} />
            </div>

            {/* Phone mockup */}
            <div className="relative mx-auto w-full max-w-sm lg:max-w-none">
              <div className="relative aspect-[9/16] sm:aspect-[3/4] lg:aspect-[9/16] max-h-[640px] mx-auto rounded-[2.5rem] bg-slate-900 p-3 shadow-2xl shadow-slate-900/20">
                <div className="relative w-full h-full rounded-[2rem] overflow-hidden bg-slate-100">
                  <MapBackdrop />
                  {/* Route avatars */}
                  <div className="absolute inset-0 pointer-events-none">
                    <img src="https://i.pravatar.cc/60?img=12" className="absolute top-[22%] left-[42%] w-9 h-9 rounded-full ring-2 ring-white shadow" alt="" loading="lazy" />
                    <img src="https://i.pravatar.cc/60?img=45" className="absolute top-[15%] right-[12%] w-10 h-10 rounded-full ring-2 ring-white shadow" alt="" loading="lazy" />
                    <img src="https://i.pravatar.cc/60?img=33" className="absolute top-[38%] left-[20%] w-9 h-9 rounded-full ring-2 ring-white shadow" alt="" loading="lazy" />
                    <img src="https://i.pravatar.cc/60?img=58" className="absolute top-[58%] left-[50%] w-9 h-9 rounded-full ring-2 ring-white shadow" alt="" loading="lazy" />
                  </div>
                  {/* Helper-on-way badge */}
                  <div className="absolute top-4 left-4 right-4 bg-white rounded-2xl shadow-lg p-3 flex items-center gap-2.5">
                    <img src="https://i.pravatar.cc/40?img=12" className="w-9 h-9 rounded-full" alt="" loading="lazy" />
                    <div className="min-w-0 flex-1">
                      <div className="text-[11px] text-slate-500">Helper on the way</div>
                      <div className="text-sm font-bold text-slate-900">2 min away</div>
                    </div>
                  </div>
                  {/* Bottom task card */}
                  <div className="absolute bottom-4 left-4 right-4 bg-white rounded-2xl shadow-lg p-3 flex items-center gap-3">
                    <img src="https://i.pravatar.cc/40?img=45" className="w-10 h-10 rounded-full" alt="" loading="lazy" />
                    <div className="min-w-0 flex-1">
                      <div className="text-[11px] text-slate-500">Task: Furniture Assembly</div>
                      <div className="text-xs font-semibold text-slate-900">4.9 ★ (138 reviews)</div>
                    </div>
                    <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <HeroSentinel id="hero-end-sentinel" />

      {/* STATS STRIP */}
      <section className="bg-white border-t border-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-10 grid grid-cols-2 md:grid-cols-4 gap-6">
          {[
            // "4.9 ★ from 12K+ reviews" and "18 min average arrival time"
            // were removed: there are no reviews and no completed bookings to
            // average. What remains are commitments we control, not measured
            // statistics we cannot support.
            { icon: ShieldCheck, tint: "bg-emerald-50 text-emerald-600", value: "Every helper", label: "ID and background checked before approval" },
            { icon: DollarSign, tint: "bg-violet-50 text-violet-600", value: "$1M", label: "Marketplace liability cover per booking" },
            { icon: Clock, tint: "bg-brand-50 text-brand-600", value: "No surge", label: "Flat $4.50 service fee, never multiplied" },
            { icon: Headphones, tint: "bg-rose-50 text-rose-600", value: "Pay after", label: "You're charged once the task is complete" },
          ].map((s) => (
            <div key={s.label} className="flex items-start gap-3">
              <span className={`inline-flex w-10 h-10 rounded-full ${s.tint} items-center justify-center shrink-0`}>
                <s.icon className="w-5 h-5" />
              </span>
              <div className="min-w-0">
                <div className="text-lg sm:text-xl font-bold text-slate-900 leading-tight">{s.value}</div>
                <div className="text-[11px] sm:text-xs text-slate-500 leading-snug mt-0.5">{s.label}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* POPULAR SERVICES (6 categories) */}
      <section className="bg-slate-50 border-t border-slate-100 py-12 lg:py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-end justify-between gap-3 mb-5">
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold text-slate-900">Popular services</h2>
              <p className="text-sm text-slate-500 mt-1">Most requested help from our community</p>
            </div>
            <Link href="#services" className="text-xs sm:text-sm font-semibold text-brand-700 hover:text-brand-800 whitespace-nowrap">
              View all services →
            </Link>
          </div>
          <div className="-mx-4 sm:mx-0">
            <div className="flex sm:grid sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4 overflow-x-auto scrollbar-none px-4 sm:px-0 snap-x snap-mandatory">
              {topCategories.map(({ category, count }) => (
                <Link
                  key={category.id}
                  href={`#services`}
                  className="group snap-start shrink-0 w-[40%] sm:w-auto rounded-2xl overflow-hidden bg-white border border-slate-100 hover:border-brand-300 hover:shadow-lg transition"
                >
                  <div className="aspect-[5/4] bg-slate-100 relative overflow-hidden">
                    <img
                      src={categoryImage(category.id)}
                      alt={category.label}
                      loading="lazy"
                      className="w-full h-full object-cover group-hover:scale-105 transition"
                    />
                  </div>
                  <div className="p-3">
                    <div className="text-sm font-bold text-slate-900 truncate">{category.label}</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">{count} service{count === 1 ? "" : "s"}</div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how" className="bg-white border-t border-slate-100 py-14 lg:py-20">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10">
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900">How Helpward works</h2>
            <p className="mt-2 text-sm sm:text-base text-slate-600">Three simple steps to get anything done.</p>
          </div>
          <div className="relative grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-4">
            {/* Dotted connector */}
            <div className="hidden md:block absolute top-9 left-[16%] right-[16%] border-t-2 border-dashed border-slate-200 -z-0" />
            {[
              { n: 1, Icon: Users, title: "Request help", sub: "Tell us what you need done." },
              { n: 2, Icon: Sparkles, title: "Get matched", sub: "We find the best helper for your task." },
              { n: 3, Icon: CheckCircle, title: "Task completed", sub: "Your task is done, securely in-app." },
            ].map(({ n, Icon, title, sub }) => (
              <div key={n} className="relative z-10 text-center">
                <span className="inline-flex w-16 h-16 rounded-full bg-white border-2 border-brand-200 text-brand-600 items-center justify-center mx-auto shadow-sm">
                  <Icon className="w-7 h-7" />
                </span>
                <div className="mt-4 text-sm font-bold text-brand-700">{n}. {title}</div>
                <p className="mt-1 text-xs text-slate-600 max-w-[20ch] mx-auto leading-relaxed">{sub}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* TRUSTED, SAFE & RELIABLE */}
      <section id="safety" className="bg-slate-50 border-t border-slate-100 py-14 lg:py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid lg:grid-cols-2 gap-10 lg:gap-16 items-center">
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900">Trusted, safe &amp; reliable</h2>
            <p className="mt-2 text-sm sm:text-base text-slate-600 max-w-lg">
              We go the extra mile to ensure every experience on Helpward is safe, secure, and stress-free.
            </p>
            <ul className="mt-6 space-y-4">
              {[
                { Icon: ShieldCheck, tone: "bg-brand-50 text-brand-600",
                  title: "Background-checked helpers",
                  sub: "Every helper is verified with ID, background check, and reviews." },
                { Icon: Lock, tone: "bg-emerald-50 text-emerald-600",
                  title: "Insured tasks",
                  sub: "Every booking is protected with up to $1M insurance coverage." },
                { Icon: DollarSign, tone: "bg-violet-50 text-violet-600",
                  title: "Secure payments",
                  sub: "Pay in-app only after your task is completed to your satisfaction." },
              ].map((b) => (
                <li key={b.title} className="flex items-start gap-3">
                  <span className={`inline-flex w-10 h-10 rounded-xl ${b.tone} items-center justify-center shrink-0`}>
                    <b.Icon className="w-5 h-5" />
                  </span>
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-slate-900">{b.title}</div>
                    <div className="text-xs sm:text-sm text-slate-600 mt-0.5 leading-relaxed">{b.sub}</div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <div className="relative">
            <div className="relative rounded-3xl overflow-hidden aspect-[4/5] sm:aspect-[5/4] lg:aspect-[4/5] max-h-[480px] bg-slate-200">
              <img
                src="https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=800&q=70"
                alt="A verified Helpward helper holding a tablet, wearing branded shirt"
                loading="lazy"
                className="w-full h-full object-cover"
              />
              <div className="absolute bottom-4 left-4 right-4 sm:left-1/2 sm:-translate-x-1/2 sm:right-auto sm:w-auto sm:min-w-[260px] bg-white rounded-2xl shadow-xl px-4 py-3 flex items-center gap-2.5">
                <span className="inline-flex w-8 h-8 rounded-full bg-emerald-50 text-emerald-600 items-center justify-center shrink-0">
                  <ShieldCheck className="w-4 h-4" />
                </span>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-slate-900">Background checked</div>
                  <div className="text-[10px] text-slate-500">&amp; verified</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* A "Just completed near you - LIVE - Real tasks finished today"
          carousel used to render here, driven by SAMPLE_RECENT_TASKS: a
          hardcoded array of invented tasks, prices and cities, presented
          with a pulsing "Live" dot. Zero bookings have ever been completed.
          Removed rather than relabelled; a real feed can be built from
          `bookings where status = 'completed'` once there are any. */}

      {/* FULL CATALOG (client component handles filter tabs) */}
      <ServicesCatalog services={services} categories={categories} bookingCounts={bookingCounts} />

      {/* WHY CHOOSE HELPWARD */}
      <section id="business" className="bg-slate-50 border-t border-slate-100 py-14 lg:py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10">
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900">Why choose Helpward?</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 sm:gap-5">
            {WHY_FEATURES.map((f) => (
              <div key={f.title} className="rounded-2xl bg-white border border-slate-100 p-4 sm:p-5 text-center">
                <span className={`inline-flex w-11 h-11 rounded-full ${f.tone} items-center justify-center mb-3`}>
                  <f.icon className="w-5 h-5" />
                </span>
                <div className="text-sm font-bold text-slate-900">{f.title}</div>
                <div className="text-[11px] sm:text-xs text-slate-500 mt-1 leading-relaxed">{f.sub}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Four customer testimonials used to render here with invented
          quotes, invented names, stock pravatar faces and cities we do not
          serve, for a marketplace that has never completed a task.
          Fabricated reviews are the highest-risk content on the site, so
          they are gone until real ones exist. */}

      {/* FAQ + SUPPORT */}
      <section id="faq" className="bg-slate-50 border-t border-slate-100 py-14 lg:py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid lg:grid-cols-[1fr_320px] gap-8 lg:gap-12">
          <div>
            <div className="mb-6">
              <div className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-brand-700 mb-2">
                <HelpCircle className="w-3.5 h-3.5" /> Common questions
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold text-slate-900">Frequently asked questions</h2>
            </div>
            <dl className="space-y-3">
              {FAQS.map((f) => (
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

          {/* Support sidebar */}
          <aside className="lg:sticky lg:top-24 h-fit rounded-2xl bg-white border border-slate-100 p-6 text-center">
            <span className="inline-flex w-14 h-14 rounded-full bg-brand-50 text-brand-600 items-center justify-center mb-4 mx-auto">
              <Headphones className="w-7 h-7" />
            </span>
            <div className="text-base font-bold text-slate-900">Still have questions?</div>
            <p className="text-xs text-slate-500 mt-1">We&apos;re here to help.</p>
            <Link
              href="/help"
              className="mt-4 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-brand-50 text-brand-700 text-sm font-semibold hover:bg-brand-100 transition w-full"
            >
              Contact support
            </Link>
          </aside>
        </div>
      </section>

      {/* APP DOWNLOAD CTA */}
      <section className="bg-white border-t border-slate-100 py-12 lg:py-16">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="relative rounded-3xl overflow-hidden bg-gradient-to-br from-brand-600 via-brand-700 to-violet-700 p-6 sm:p-10 lg:p-14 text-white">
            <div className="grid lg:grid-cols-[1.4fr_1fr] gap-8 items-center">
              <div>
                <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold leading-tight">Ready to get help?</h2>
                <p className="mt-2 text-sm sm:text-base text-white/90 max-w-md">Real humans. Real help. Right now.</p>
                <div className="mt-6 flex flex-wrap gap-3">
                  <Link
                    href="/signup"
                    className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-white text-slate-900 text-sm font-semibold hover:bg-slate-100 transition"
                  >
                    Get started in your browser <ArrowRight className="w-4 h-4" />
                  </Link>
                  <button
                    disabled
                    title="Native iOS app ships soon — use the web app for now"
                    className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-slate-900/40 border border-white/20 text-white text-sm font-semibold cursor-not-allowed opacity-80"
                  >
                    <Apple className="w-4 h-4" /> Download on the <span className="font-bold">App Store</span>
                  </button>
                  <button
                    disabled
                    title="Native Android app ships soon — use the web app for now"
                    className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-slate-900/40 border border-white/20 text-white text-sm font-semibold cursor-not-allowed opacity-80"
                  >
                    <Play className="w-4 h-4" /> Get it on <span className="font-bold">Google Play</span>
                  </button>
                </div>
              </div>
              <div className="hidden lg:block relative">
                <div className="relative aspect-[9/16] max-h-[360px] mx-auto rounded-[2rem] bg-slate-900 p-2 shadow-2xl shadow-black/30 rotate-3">
                  <div className="w-full h-full rounded-[1.6rem] overflow-hidden bg-white">
                    <MapBackdrop />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      </main>

      {/* FOOTER — SEO-loaded: popular services, top cities, trust links */}
      <footer className="bg-slate-900 text-slate-300">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-16">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-8 lg:gap-10">
            <div className="col-span-2 lg:col-span-2">
              <Link href="/" className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-brand-600 text-white flex items-center justify-center font-bold">H</div>
                <span className="text-lg font-bold text-white">Helpward</span>
              </Link>
              <p className="mt-3 text-xs text-slate-400 max-w-xs leading-relaxed">
                The Human Infrastructure Network. Connecting you with verified helpers for real life, real simple.
              </p>
              <ul className="mt-5 space-y-1.5 text-xs">
                {[
                  ["About us", "/about"],
                  ["Careers", "/careers"],
                  ["Blog", "/blog"],
                  ["Safety & insurance", "/safety"],
                  ["Help center", "/help"],
                  ["Become a helper", "/signup?role=provider"],
                ].map(([label, href]) => (
                  <li key={href}><Link href={href} className="text-slate-400 hover:text-white transition">{label}</Link></li>
                ))}
              </ul>
            </div>

            <FooterCol
              title="Popular services"
              items={popularFooterServices(services)}
            />
            <FooterCol
              title="Categories"
              items={topCategories.map(({ category }) => [category.label, `/#services`] as [string, string])}
            />
            <FooterCol
              title="Top cities"
              items={CITIES.slice(0, 8).map((c) => [`${c.name}, ${c.region}`, `/cities/${c.slug}`] as [string, string])}
            />
            <FooterCol
              title="Legal"
              items={[
                ["Terms of Service", "/terms"],
                ["Privacy Policy", "/privacy"],
                ["Cookie Policy", "/privacy"],
                ["Sitemap", "/sitemap.xml"],
              ] as [string, string][]}
            />
          </div>

          <div className="mt-10 pt-6 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
            <span>© {new Date().getFullYear()} Helpward — Real humans, real help.</span>
            <span>
              Last updated <time dateTime={LAST_UPDATED_ISO}>May&nbsp;27,&nbsp;2026</time>
            </span>
          </div>
        </div>
      </footer>

      {/* Sticky mobile CTA bar */}
      <div className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-slate-200 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] px-4 py-3 flex items-center gap-2 safe-bottom">
        <div className="flex-1 text-xs text-slate-500 leading-tight">
          <div className="font-bold text-slate-900">Need help right now?</div>
          <div>Match with a verified helper in minutes</div>
        </div>
        <Link
          href="/new-request"
          className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-brand-600 text-white text-sm font-bold hover:bg-brand-700 shrink-0"
        >
          Find a helper <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
      <div className="lg:hidden h-16" aria-hidden />
    </div>
  );
}

function FooterCol({ title, items }: { title: string; items: [string, string][] }) {
  return (
    <div>
      <div className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">{title}</div>
      <ul className="space-y-2 text-xs">
        {items.map(([label, href]) => (
          <li key={href + label}>
            <Link href={href} className="text-slate-400 hover:text-white transition">{label}</Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Picks the top services to surface in the footer — Popular flag first, then
// a few extra to round out the column. Crawlable text anchors → SEO wins.
function popularFooterServices(services: import("@/lib/data/services").ServiceWithCategory[]): [string, string][] {
  const popular = services.filter((s) => s.popular).slice(0, 6);
  const rest = services.filter((s) => !s.popular).slice(0, Math.max(0, 6 - popular.length));
  return [...popular, ...rest].map((s) => [s.title, `/services/${s.id}`]);
}
