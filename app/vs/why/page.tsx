import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, Sparkles, Layers, Compass, AlertTriangle, CheckCircle2 } from "lucide-react";
import { MarketingShell } from "@/components/MarketingShell";
import { COMPETITORS } from "@/lib/competitors";

export const metadata: Metadata = {
  title: "Why we built Helpward — the case against single-vertical task apps",
  description: "The average urban household runs life-admin across 5-7 single-vertical task apps. Each works fine in isolation; together they fragment what is conceptually one job — getting through Saturday — into a stack of separate transactions. Here's the case for one verified helper across the whole stack.",
  alternates: { canonical: "/vs/why" },
  openGraph: {
    type: "article",
    title: "Why we built Helpward",
    description: "The single-vertical task-app fragmentation problem — and a one-helper answer.",
    url: "/vs/why",
    siteName: "Helpward",
  },
};

const ld = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "@id": "https://helpward.com/vs/why#article",
      headline: "Why we built Helpward",
      description: "The case against single-vertical task apps and the multi-task-bundle alternative.",
      author: { "@type": "Organization", name: "Helpward" },
      publisher: { "@type": "Organization", name: "Helpward" },
      datePublished: "2026-06-06",
      mainEntityOfPage: "https://helpward.com/vs/why",
    },
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: "https://helpward.com/" },
        { "@type": "ListItem", position: 2, name: "Compare", item: "https://helpward.com/vs" },
        { "@type": "ListItem", position: 3, name: "Why Helpward", item: "https://helpward.com/vs/why" },
      ],
    },
  ],
};

export default function WhyPage() {
  return (
    <MarketingShell
      title="Why we built Helpward"
      subtitle="The case against single-vertical task apps."
    >
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />

      <p className="lead">
        Open the apps tray on a typical urban-renter phone and count the task apps. Grocery delivery.
        Restaurant delivery. Dog walker. Moving. Cleaning. Handyman. The bid-quote app you used once
        for the leaky sink. Maybe a babysitter app and a senior-care app for parents who don&apos;t
        live nearby. Each one works fine in isolation. Stacked, they fragment what is conceptually
        one job — <strong>getting through Saturday</strong> — into half a dozen separate transactions
        with half a dozen separate verifications and half a dozen separate strangers in your space.
      </p>

      <h2>The fragmentation toll</h2>
      <p>
        Picture a normal Saturday morning. You need to: pick up groceries, drop off dry-cleaning,
        return a package to the post office, take the dog on a long-overdue walk, and assemble the
        IKEA shelf that&apos;s been leaning against the wall for three weeks. That&apos;s five tasks.
        Across single-vertical apps it&apos;s also:
      </p>
      <ul>
        <li>Five separate match windows where you wait to see who accepts.</li>
        <li>Five separate strangers arriving at your apartment within a 3-hour window.</li>
        <li>Five separate service fees stacked on top of five separate base prices.</li>
        <li>Five separate ratings and tip prompts in your bell at the end of the day.</li>
        <li>Five separate "vetted by" claims you have to trust independently.</li>
      </ul>
      <p>
        None of that is anyone&apos;s fault. Each app is doing its job. The problem is structural:
        the apps were built before the assumption that a task is a transaction and not part of a
        larger errand-day. So they each won their vertical and stopped, leaving the integration
        problem on the customer.
      </p>

      <h2>The Helpward thesis</h2>
      <p>
        <strong>One verified helper across the whole stack.</strong> That&apos;s the entire pitch.
        Saturday-morning Maya picks up the groceries, drops off the dry-cleaning, returns the
        package, walks the dog, and assembles the shelf — five stops, one helper, one trip, one
        service fee. She did the same five stops for you last Saturday and we routed this week&apos;s
        request to her first before broadcasting to anyone else. You see her on a live map between
        stops. She sends photo proof of each completion. You rate her once at the end.
      </p>
      <p>
        Three things make that work:
      </p>
      <ol>
        <li>
          <strong>Multi-task bundles.</strong> Up to 5 stops in a single request. We invented the
          bundling layer because none of the single-vertical apps offered it natively — they would
          have had to step outside their category.
        </li>
        <li>
          <strong>Save-favorite + preferred routing.</strong> Star Maya and her next-Saturday
          request gets a 2-minute exclusive window before broadcast. Repeat relationships form
          naturally over a few weeks. Most other platforms let you re-book by name but don&apos;t
          give the preferred helper an actual head-start in the matching engine.
        </li>
        <li>
          <strong>Real-time everything.</strong> Live GPS the whole trip. Photo proof at each stop.
          Customer-side bell + email digest + push notification on every state change. The Saturday
          you booked is something you can watch, not just submit and wait.
        </li>
      </ol>

      <h2>Where single-vertical apps still win</h2>
      <p>
        We&apos;d be lying if we said Helpward is the right answer for every task. There are
        scenarios where the dedicated single-vertical tool is genuinely better:
      </p>
      <ul>
        <li>
          <strong>Project work with real budget variance.</strong> If you&apos;re hiring a plumber
          for a $1,500 line repair, you want competing quotes before you commit. Apps like Thumbtack
          and Angi are built around that quote-and-vet flow on purpose. Helpward is built around
          predictable-scope tasks where the price is set up front.
        </li>
        <li>
          <strong>Whole-house moves with a truck and crew.</strong> Bellhop bundles the truck and a
          multi-person crew. Helpward is single-helper trips. If your move requires furniture
          loading by three people, Bellhop is the right tool.
        </li>
        <li>
          <strong>Overnight pet boarding.</strong> Rover&apos;s sitter-home boarding model is built
          for the case where you&apos;re travelling for a week and your dog needs a real home, not a
          per-visit drop-in.
        </li>
        <li>
          <strong>Long-term recurring caregivers.</strong> Care.com&apos;s interview-and-hire model
          is built for the nanny you&apos;re hiring for 18 months, not the one-off coverage when
          your usual sitter cancels.
        </li>
      </ul>
      <p>
        That&apos;s the framing on every page in our <Link href="/vs">comparison index</Link>: we
        tell you when the other tool is the right pick. We&apos;re trying to win the integration
        layer, not the single-vertical apps&apos; turf.
      </p>

      <h2>Honest claims about Helpward</h2>
      <ul>
        <li>
          We require background checks on <em>every</em> helper, not just opt-in tiers.
        </li>
        <li>
          We ship marketplace insurance on every booking — same baseline as any reputable platform
          in this space.
        </li>
        <li>
          We&apos;re an on-demand single-task marketplace. We are not a contractor directory, a
          quote-bidding platform, a vet-telehealth bundle, or a 18-month-nanny-hiring service.
          Those are different problems with different right answers.
        </li>
        <li>
          We don&apos;t publish a comparison without a row where the other tool wins. If a
          competitor genuinely does something we don&apos;t, we say so on their comparison page.
        </li>
      </ul>

      <h2>If Saturday morning sounds familiar</h2>
      <p>
        Try one Saturday on Helpward and see if Maya saves you the integration work. First task is
        free to sign up. We don&apos;t require payment until the task is marked complete.
      </p>

      <div className="not-prose mt-6 flex flex-wrap gap-2">
        <Link
          href="/signup?next=/new-request"
          className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-brand-600 to-violet-600 text-white text-sm font-bold"
        >
          <Sparkles className="w-4 h-4" /> Sign up free <ArrowRight className="w-4 h-4" />
        </Link>
        <Link
          href="/vs"
          className="inline-flex items-center gap-2 px-5 py-3 rounded-xl border border-slate-200 text-slate-700 text-sm font-bold hover:bg-slate-50"
        >
          See all {COMPETITORS.length} comparisons
        </Link>
      </div>

      <h2>How we run our comparison framework</h2>
      <p className="not-prose text-xs text-slate-500 mt-2">
        For full process notes on how we keep the matrix pages honest — feature presence only, never
        competitor pricing, parity rows called out, &ldquo;Not advertised&rdquo; never &ldquo;No&rdquo;
        — see the &ldquo;How we run these comparisons&rdquo; section on the <Link href="/vs">comparison index</Link>.
      </p>
    </MarketingShell>
  );
}
