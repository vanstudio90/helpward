import Link from "next/link";
import type { Metadata } from "next";
import {
  ArrowRight, Sparkles, DollarSign, Layers, Heart, AlertTriangle,
} from "lucide-react";
import { MarketingShell } from "@/components/MarketingShell";

export const metadata: Metadata = {
  title: "Pricing — how Helpward charges, and why our comparison pages don't quote competitor prices",
  description: "Per-service base + one flat $4.50 service fee per booking + optional tip. 80% to helper, 20% to platform, tips 100% to helper. No surge pricing. Here's the honest breakdown — including why we don't publish competitor prices in our matrix pages.",
  alternates: { canonical: "/vs/pricing" },
  openGraph: {
    type: "article",
    title: "Helpward pricing — honest model + why we don't quote competitors",
    description: "$4.50 flat service fee, 80/20 split, tips 100% to helper, no surge. Plus the case for excluding competitor prices from our comparison matrices.",
    url: "/vs/pricing",
    siteName: "Helpward",
  },
};

const ld = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "@id": "https://helpward.com/vs/pricing#article",
      headline: "Helpward pricing — and why our comparison pages don't quote competitors",
      description: "Pricing structure: per-service base + flat service fee + optional tip; 80/20 split; tips 100% to helper; no surge pricing.",
      author: { "@type": "Organization", name: "Helpward" },
      publisher: { "@type": "Organization", name: "Helpward" },
      datePublished: "2026-06-06",
      mainEntityOfPage: "https://helpward.com/vs/pricing",
    },
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: "https://helpward.com/" },
        { "@type": "ListItem", position: 2, name: "Compare", item: "https://helpward.com/vs" },
        { "@type": "ListItem", position: 3, name: "Pricing", item: "https://helpward.com/vs/pricing" },
      ],
    },
  ],
};

export default function PricingPage() {
  return (
    <MarketingShell
      title="Pricing on Helpward"
      subtitle="Per-service base + flat fee + optional tip. No surge. No tiers."
    >
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />

      <p className="lead">
        Our comparison matrix pages don&apos;t have a pricing row. That&apos;s deliberate — and the
        reason is the same anti-fabrication posture that runs through everything else on{" "}
        <Link href="/vs">/vs</Link>. This essay lays out what Helpward charges, what helpers keep,
        and why we won&apos;t publish competitor prices we can&apos;t keep accurate quarter by
        quarter.
      </p>

      <h2>What you pay</h2>
      <p>
        Every booking has three line items. You see all three before you confirm — there&apos;s no
        post-task pricing surprise.
      </p>
      <ul>
        <li>
          <strong>Base service price.</strong> Set per-service on our catalog. You see it on the
          service tile before you book. For a one-shot booking, this is whatever the catalog says
          for that service in your city. For a multi-task bundle, it&apos;s the sum of every stop&apos;s
          base price.
        </li>
        <li>
          <strong>Flat $4.50 service fee per booking.</strong> One fee per booking, regardless of how
          many stops the helper makes. This covers dispatch, payment processing, marketplace
          insurance, and platform support. It does not change with demand, time of day, weather, or
          how many other people are booking nearby.
        </li>
        <li>
          <strong>Optional tip.</strong> Set by you, after the task ends. Defaults to 0% with
          suggested options of 10 / 15 / 20% on the rating screen. There is no &ldquo;recommended
          tip&rdquo; pre-checked. You can also add or change a tip later from the booking detail
          page within the dispute window.
        </li>
      </ul>

      <h2>What helpers keep</h2>
      <ul>
        <li>
          <strong>80% of the base service price.</strong> Same split on every booking, no tier
          gates, no &ldquo;Pro&rdquo; bump for hitting volume targets.
        </li>
        <li>
          <strong>20% to the platform.</strong> Fixed. Funds dispatch, payments, support, insurance,
          and platform engineering.
        </li>
        <li>
          <strong>100% of the tip.</strong> We don&apos;t take a cut of tips. The helper gets every
          cent.
        </li>
      </ul>

      <h2>What we don&apos;t do</h2>
      <ul>
        <li>
          <strong>No surge pricing.</strong> Saturday at 6pm costs the same as Tuesday at 2pm. If
          you book the same service in the same city next week, the line items will be the same.
        </li>
        <li>
          <strong>No per-stop fees on bundles.</strong> Five stops in one trip is one $4.50 fee,
          not five. The bundle is genuinely cheaper than booking five one-shots — that&apos;s the
          whole point of the bundling feature.
        </li>
        <li>
          <strong>No platform-fee hikes during demand spikes.</strong> If supply tightens, helpers
          may be slower to accept, but the price quoted at booking is the price you pay. We won&apos;t
          quietly raise the service fee on holiday weekends.
        </li>
        <li>
          <strong>No minimums.</strong> No &ldquo;you must book $20 of services to start.&rdquo; A
          $9 dog walk is a fine first booking.
        </li>
        <li>
          <strong>No premium tier.</strong> There is no &ldquo;Helpward Plus&rdquo; that gives you a
          larger pool of helpers or faster matching. Every customer hits the same engine.
        </li>
      </ul>

      <h2>The bundling math</h2>
      <p>
        Concrete example. Three errands on the same Saturday: grocery pickup ($18 base), dry-cleaning
        return ($8 base), pharmacy run ($12 base). Booked as three separate one-shot requests, you
        pay the $4.50 service fee on each: $38 base + $13.50 in fees = <strong>$51.50</strong>
        before tip.
      </p>
      <p>
        Booked as one three-stop bundle, you pay the $4.50 service fee once: $38 base + $4.50 fee
        = <strong>$42.50</strong> before tip. Same three errands, $9 cheaper, AND one helper does all
        three on one trip so you tip one person instead of three.
      </p>

      <h2>Why we don&apos;t publish competitor prices on the matrix pages</h2>
      <p>
        Every comparison page in the <Link href="/vs">/vs</Link> catalog deliberately excludes
        pricing rows. Three reasons:
      </p>
      <ol>
        <li>
          <strong>Competitor prices drift fast.</strong> Service fees, delivery fees, minimum-order
          thresholds, surge multipliers — these change quarterly at the platforms we&apos;d be
          comparing against. The day we publish a comparison page with their numbers, the
          comparison is already aging.
        </li>
        <li>
          <strong>Apples-to-apples is harder than it looks.</strong> A $1.99 delivery fee with a
          required $10 minimum, a $1 markup per item, and a tip suggestion default of 20% is not the
          same shape as a flat $4.50 service fee. Forcing both into a single &ldquo;average price
          per task&rdquo; row would be misleading either direction.
        </li>
        <li>
          <strong>Anti-fabrication.</strong> We don&apos;t publish numbers we can&apos;t verify each
          quarter, and we don&apos;t want a matrix page to subtly drift from honest into stale into
          wrong. So we excluded the pricing axis entirely and wrote this essay instead.
        </li>
      </ol>
      <p>
        How to compare prices yourself: open the apps. Pick one task you actually need to do. Get
        the all-in quote from each platform — including delivery fees, service fees, minimums, and
        the platform&apos;s default-suggested tip. That&apos;s the only comparison that&apos;s
        honest at the moment you&apos;re making the decision, because that&apos;s the only
        comparison that&apos;s up to date.
      </p>

      <h2>One thing to do today</h2>
      <p>
        Pick the service you book to most often. Drop the address. The price you see before
        confirming is the price you pay — no surge, no Plus tier, no surprise. First booking is free
        to sign up.
      </p>

      <div className="not-prose mt-6 flex flex-wrap gap-2">
        <Link
          href="/signup?next=/new-request"
          className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-brand-600 to-violet-600 text-white text-sm font-bold"
        >
          <Sparkles className="w-4 h-4" /> Sign up free <ArrowRight className="w-4 h-4" />
        </Link>
        <Link
          href="/services"
          className="inline-flex items-center gap-2 px-5 py-3 rounded-xl border border-slate-200 text-slate-700 text-sm font-bold hover:bg-slate-50"
        >
          See all services + prices
        </Link>
        <Link
          href="/vs/why"
          className="inline-flex items-center gap-2 px-5 py-3 rounded-xl border border-slate-200 text-slate-700 text-sm font-bold hover:bg-slate-50"
        >
          Why we built Helpward
        </Link>
        <Link
          href="/vs/trust"
          className="inline-flex items-center gap-2 px-5 py-3 rounded-xl border border-slate-200 text-slate-700 text-sm font-bold hover:bg-slate-50"
        >
          Trust + safety
        </Link>
      </div>
    </MarketingShell>
  );
}
