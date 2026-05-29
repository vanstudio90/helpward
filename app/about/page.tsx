import Link from "next/link";
import type { Metadata } from "next";
import {
  ShieldCheck, MapPin, Sparkles, Heart, ArrowRight, ChevronRight, Mail,
} from "lucide-react";
import { MarketingShell } from "@/components/MarketingShell";

const TITLE = "About Helpward";
const INTRO =
  "Helpward is the Human Infrastructure Network — an on-demand marketplace connecting people with verified, background-checked humans for real-world tasks across the U.S. and Canada.";
const LAST_UPDATED = "2026-05-29";

export const metadata: Metadata = {
  title: `${TITLE} — Helpward`,
  description: INTRO,
  alternates: { canonical: "https://helpward.com/about" },
  openGraph: { title: TITLE, description: INTRO, url: "https://helpward.com/about", type: "website" },
  twitter: { card: "summary_large_image", title: TITLE, description: INTRO },
};

// AboutPage + Organization JSON-LD links this page authoritatively to the
// brand entity Google's already built from the sitewide Organization schema.
// The mainEntity nesting reinforces "this page is *about* this organisation".
const ABOUT_LD = {
  "@context": "https://schema.org",
  "@type": "AboutPage",
  url: "https://helpward.com/about",
  name: TITLE,
  description: INTRO,
  isPartOf: { "@id": "https://helpward.com/#website" },
  mainEntity: { "@id": "https://helpward.com/#organization" },
  dateModified: LAST_UPDATED,
  breadcrumb: {
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "https://helpward.com" },
      { "@type": "ListItem", position: 2, name: "About", item: "https://helpward.com/about" },
    ],
  },
};

export default function About() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ABOUT_LD) }} />

      <MarketingShell title={TITLE} subtitle={INTRO}>
        <h2>What we believe</h2>
        <p>
          The on-demand economy was supposed to free up time and lower the friction of getting things done. Mostly,
          it built bigger versions of the same patterns: opaque pricing, hidden quality, algorithmic dispatch that
          treats the worker as a cost to be minimised. Helpward exists because there&apos;s a different version
          available: a marketplace where every helper is a real, verified person; pricing is published before the
          booking; payment is held until the customer says the task is done; and 80% of every dollar the customer
          pays goes to the helper.
        </p>
        <p>
          We&apos;re not trying to be cheaper than the alternatives — we&apos;re trying to be{" "}
          <em>worth</em> the booking. That means investing in identity verification, criminal background checks,
          $1M-per-incident platform insurance, real-time GPS tracking, encrypted in-app chat, and a 24/7 safety
          team that responds within four hours. None of these are premium upsells. They&apos;re the baseline on
          every booking, paid for out of the flat service fee.
        </p>

        <h2>How Helpward actually works</h2>
        <ol>
          <li>You describe what you need — a designated driver, a wait-in-line errand, a furniture assembly, a check-in on an elderly relative. Anything legal and safe that a human nearby can do.</li>
          <li>Our matching engine notifies nearby qualified helpers in real time. The first to accept becomes yours.</li>
          <li>You see their identity, rating, and live ETA before they arrive. In-app chat and live GPS run end-to-end.</li>
          <li>You confirm the task is complete. Only then is payment captured. A 24-hour dispute window keeps that capture pausable if something needs review.</li>
        </ol>

        <div className="not-prose my-6 grid sm:grid-cols-2 gap-4">
          <Card icon={<ShieldCheck className="w-5 h-5 text-emerald-600" />} title="Trust is the product">
            Every helper passes Stripe Identity verification and a Checkr (US) or Triton (Canada) background check
            before they can take a single task. Approval is reviewed by a human, not an algorithm.{" "}
            <Link href="/safety/background-checks" className="font-semibold">Read the background-check process</Link>.
          </Card>
          <Card icon={<MapPin className="w-5 h-5 text-brand-600" />} title="Real cities, real density">
            We launch one city at a time and don&apos;t move to the next until helper supply hits the density that
            keeps response times under 20 minutes. Currently live in 10 metros — see them on the{" "}
            <Link href="/" className="font-semibold">homepage</Link>.
          </Card>
          <Card icon={<Sparkles className="w-5 h-5 text-amber-600" />} title="Transparent economics">
            Helpers keep 80% of base + distance fees and 100% of tips. Helpward&apos;s 20% funds insurance,
            background checks, support, and platform engineering. No subscriptions, no setup fees.
          </Card>
          <Card icon={<Heart className="w-5 h-5 text-rose-600" />} title="Designed for the helper too">
            Helpers set their own hours via the schedule, see every task before accepting, and can decline anything
            that doesn&apos;t fit. The platform works only if helpers want to be on it.
          </Card>
        </div>

        <h2>The team</h2>
        <p>
          Helpward is built by a small team obsessed with reliability and operational craft. We&apos;re based in
          Vancouver, BC with helpers and customers across the U.S. and Canada. We&apos;re actively hiring across
          operations, trust &amp; safety, engineering, design, and community management —{" "}
          <Link href="/careers" className="font-semibold">open roles live at /careers</Link>.
        </p>

        <h2>Where we operate</h2>
        <p>
          Helpward is live in <strong>Vancouver, Toronto, Montreal</strong> (Canada) and{" "}
          <strong>Seattle, San Francisco, Los Angeles, Austin, Chicago, New York, and Miami</strong> (United
          States). We support USD and CAD natively with per-province / per-state tax handling and helper payouts
          via Stripe Connect. New cities are added as the verified-helper supply meets quality thresholds.
        </p>

        <h2>How we make money</h2>
        <p>
          A flat $4.50 service fee plus 20% of the helper&apos;s base + distance earnings on each completed
          booking. We chose a flat fee over a percentage so a $20 errand isn&apos;t disproportionately penalised
          versus a $200 booking — the fixed costs of running the marketplace (insurance, verification, support,
          engineering) don&apos;t scale with task size, and our pricing shouldn&apos;t either. The full economics
          live in the{" "}
          <Link href="/help/how-pricing-works" className="font-semibold">pricing guide</Link>.
        </p>

        <h2>What we publish</h2>
        <p>
          Helpward operates with operational transparency from launch. Three things we publish or commit to
          publishing:
        </p>
        <ul>
          <li>
            A <Link href="/safety/transparency-report" className="font-semibold">quarterly transparency report</Link>{" "}
            with marketplace stats (helper approval rate, response times, incident rate, refund rate) pulled
            directly from the production database — no PR curation.
          </li>
          <li>
            A complete <Link href="/safety" className="font-semibold">safety microsite</Link> documenting every
            mechanism: what we screen, what the insurance policy covers, how disputes work, what gets refunded.
          </li>
          <li>
            Quarterly law-enforcement requests starting Q3 2026 — counts of LE information requests received,
            complied-with, and rejected, by jurisdiction.
          </li>
        </ul>

        <h2>Get in touch</h2>
        <div className="not-prose my-6 grid sm:grid-cols-3 gap-3">
          <Contact href="mailto:hello@helpward.com" title="General" body="hello@helpward.com" />
          <Contact href="mailto:press@helpward.com" title="Press" body="press@helpward.com" />
          <Contact href="mailto:careers@helpward.com" title="Careers" body="careers@helpward.com" />
        </div>

        <div className="not-prose mt-8 rounded-2xl bg-brand-50 border border-brand-100 p-5 flex items-start gap-3">
          <ChevronRight className="w-4 h-4 text-brand-600 mt-0.5 shrink-0" />
          <div className="text-sm text-slate-700 leading-relaxed">
            <strong>Building something or want to partner?</strong>{" "}
            <Link href="/blog" className="font-semibold text-brand-700 hover:underline">Read what we&apos;re writing</Link>{" "}
            for our latest thinking on marketplace design, or email{" "}
            <a href="mailto:hello@helpward.com" className="font-semibold text-brand-700 hover:underline">hello@helpward.com</a>{" "}
            directly.
          </div>
        </div>

        <p className="not-prose mt-6 text-xs text-slate-500">
          Last updated <time dateTime={LAST_UPDATED}>{new Date(LAST_UPDATED).toLocaleDateString()}</time>.
        </p>
      </MarketingShell>
    </>
  );
}

function Card({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-white border border-slate-100 p-5">
      <div className="flex items-center gap-2 text-sm font-bold text-slate-900 mb-2">{icon}{title}</div>
      <p className="text-xs text-slate-600 leading-relaxed">{children}</p>
    </div>
  );
}

function Contact({ href, title, body }: { href: string; title: string; body: string }) {
  return (
    <a href={href} className="block rounded-2xl bg-white border border-slate-100 p-4 hover:border-brand-300 transition">
      <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
        <Mail className="w-4 h-4 text-brand-600" /> {title}
      </div>
      <div className="text-xs text-brand-700 font-semibold mt-1 truncate">{body}</div>
    </a>
  );
}
