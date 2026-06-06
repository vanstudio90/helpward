import Link from "next/link";
import type { Metadata } from "next";
import {
  ArrowRight, Sparkles, ShieldCheck, Camera, MapPin, ScrollText,
} from "lucide-react";
import { MarketingShell } from "@/components/MarketingShell";

export const metadata: Metadata = {
  title: "Trust + safety — how we built Helpward to be safe at every layer",
  description: "Letting a stranger into your home, your car, or near your dog is a trust transaction first and a task transaction second. Here's the layered model — verification, accountability, insurance, privacy — that makes the trust transaction work.",
  alternates: { canonical: "/vs/trust" },
  openGraph: {
    type: "article",
    title: "Trust + safety on Helpward",
    description: "ID verification, background checks, GPS tracking, photo proof, marketplace insurance, dispute process, data export.",
    url: "/vs/trust",
    siteName: "Helpward",
  },
};

const ld = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "@id": "https://helpward.com/vs/trust#article",
      headline: "Trust + safety — how we built Helpward to be safe at every layer",
      description: "Layered trust model on Helpward: verification, accountability, insurance, privacy.",
      author: { "@type": "Organization", name: "Helpward" },
      publisher: { "@type": "Organization", name: "Helpward" },
      datePublished: "2026-06-06",
      mainEntityOfPage: "https://helpward.com/vs/trust",
    },
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: "https://helpward.com/" },
        { "@type": "ListItem", position: 2, name: "Compare", item: "https://helpward.com/vs" },
        { "@type": "ListItem", position: 3, name: "Trust + safety", item: "https://helpward.com/vs/trust" },
      ],
    },
  ],
};

export default function TrustPage() {
  return (
    <MarketingShell
      title="Trust + safety on Helpward"
      subtitle="A layered model — verification, accountability, insurance, privacy."
    >
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />

      <p className="lead">
        Letting a stranger into your home, your car, or near your dog is a trust transaction first
        and a task transaction second. Marketplaces that treat the trust layer as an afterthought —
        a screening checkbox at signup, a star rating after the fact — end up either selecting for
        helpers who happen to be honest or losing customers the first time something goes wrong.
        Helpward&apos;s position is that trust has to be designed in layers, with each layer
        catching something the others miss.
      </p>

      <h2>Layer 1 — verification before the first task</h2>
      <p>
        Every helper goes through three checks before they can accept a single offer. We require all
        three, not opt-in tiers — there is no &ldquo;background-check verified&rdquo; badge on
        Helpward because it&apos;s the default state of every active account.
      </p>
      <ul>
        <li>
          <strong>Government ID verification.</strong> Photo of a real driver&apos;s license or
          passport matched against a selfie at signup. Stripe Identity runs the actual comparison.
        </li>
        <li>
          <strong>Criminal background check.</strong> Standard US/CA background screening through a
          vetted provider. Specific disqualifiers (violent offences, sex offences, fraud convictions
          in the last 10 years) are surfaced on{" "}
          <Link href="/safety/background-checks">our background-check policy page</Link>.
        </li>
        <li>
          <strong>Continuous re-screening.</strong> Every 12 months while a helper is active. The
          first check at signup is a snapshot; continuous re-screening keeps the snapshot honest.
        </li>
      </ul>

      <h2>Layer 2 — accountability during the task</h2>
      <p>
        Verification is a probability statement. It says &ldquo;this person has not been caught
        doing something disqualifying.&rdquo; Accountability is what catches what verification
        missed — by making the task itself observable.
      </p>
      <ul>
        <li>
          <strong>Real-time GPS.</strong> Live map from the moment the helper accepts to the moment
          they mark the task complete. Customer sees the route, the dwell times, the &ldquo;helper
          is 3 minutes away&rdquo; arc.
        </li>
        <li>
          <strong>Photo proof of completion.</strong> Up to 3 photos per booking, attached by the
          helper before they mark the task done. Customer sees them on the booking page within
          seconds of upload. Photos are eligible for the helper&apos;s public portfolio only if the
          customer doesn&apos;t revoke — full mechanic on{" "}
          <Link href="/help/photo-proof-of-completion">our photo-proof help article</Link>.
        </li>
        <li>
          <strong>Two-way ratings.</strong> Customer rates helper, helper rates customer. Bad
          customers are a real category we can&apos;t afford to ignore; the symmetric rating is how
          we screen them.
        </li>
      </ul>

      <h2>Layer 3 — insurance when something does go wrong</h2>
      <p>
        Designed-in layers catch most of what goes wrong. They don&apos;t catch everything.
        Helpward includes marketplace insurance on every booking — not an opt-in upgrade or a
        Plus-tier feature — so the moment a task crosses from &ldquo;done well&rdquo; to &ldquo;made
        an expensive mistake,&rdquo; there&apos;s a claims process instead of a refund argument.
      </p>
      <p>
        Coverage limits + claim mechanics + what&apos;s explicitly excluded live on{" "}
        <Link href="/safety/insurance">our insurance page</Link>. The summary:
      </p>
      <ul>
        <li>$1M aggregate marketplace policy in effect during every booking window.</li>
        <li>Claims go through Helpward support; we adjudicate then file with the underwriter.</li>
        <li>
          The dispute process at <Link href="/safety/disputes">/safety/disputes</Link> handles the
          adjudication stage when the customer and helper disagree on what happened.
        </li>
      </ul>

      <h2>Layer 4 — your data, your control</h2>
      <p>
        Trust is also about what we do with what we know about you. Helpward complies with CCPA,
        PIPEDA, and GDPR even where it&apos;s not legally required — same standard for every
        customer regardless of jurisdiction.
      </p>
      <ul>
        <li>
          <strong>Self-serve data export.</strong> Tap &ldquo;Download my data&rdquo; in{" "}
          <Link href="/settings/data">settings</Link>. We auto-assemble the archive within 30
          minutes and surface a 7-day signed download link. No support-ticket queue.
        </li>
        <li>
          <strong>Self-serve account deletion.</strong> Same screen. 30-day grace period to undo,
          then cron-driven permanent deletion via the Supabase Auth admin API. Cascading FK deletes
          handle the rest of your rows.
        </li>
        <li>
          <strong>Step-up auth before destructive actions.</strong> Password re-entry is required
          for both data export and account deletion. A leaked session cookie alone can&apos;t walk
          away with your archive or start the 30-day countdown.
        </li>
      </ul>

      <h2>Honest limits</h2>
      <p>
        Designed-in trust gets you a lot, but not everything. Things Helpward does NOT promise:
      </p>
      <ul>
        <li>
          <strong>We don&apos;t chaperone high-risk tasks.</strong> If the job needs a second-set-of-
          eyes — a babysitter for an infant overnight, a senior caregiver staying through the night,
          a dog handler for a reactive dog — that&apos;s outside our single-helper-per-trip model
          and you&apos;re better off with a long-term-relationship platform like Care.com (we say
          so on the <Link href="/vs/care-com">comparison page</Link>).
        </li>
        <li>
          <strong>We can&apos;t guarantee a specific helper.</strong> Even with saved favorites and
          preferred routing, we can only offer them a 2-minute exclusive window. If they&apos;re
          offline the request opens to the broader pool.
        </li>
        <li>
          <strong>We don&apos;t auto-decline customers who&apos;ve had a bad rating.</strong> The
          two-way rating gives helpers the signal to decline, but the model is opt-out at the helper
          level, not platform-wide bans for one bad data point.
        </li>
      </ul>

      <h2>One thing to do today</h2>
      <p>
        If you&apos;re thinking about trying Helpward, the most useful first move is to read the
        three pages this essay links to:{" "}
        <Link href="/safety/background-checks">background-check policy</Link>,{" "}
        <Link href="/safety/insurance">insurance coverage</Link>,{" "}
        <Link href="/safety/disputes">dispute process</Link>. They&apos;re the load-bearing ones.
        Everything else on the platform is built on top.
      </p>

      <div className="not-prose mt-6 flex flex-wrap gap-2">
        <Link
          href="/signup?next=/new-request"
          className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-brand-600 to-violet-600 text-white text-sm font-bold"
        >
          <Sparkles className="w-4 h-4" /> Sign up free <ArrowRight className="w-4 h-4" />
        </Link>
        <Link
          href="/safety"
          className="inline-flex items-center gap-2 px-5 py-3 rounded-xl border border-slate-200 text-slate-700 text-sm font-bold hover:bg-slate-50"
        >
          <ShieldCheck className="w-4 h-4" /> Safety hub
        </Link>
        <Link
          href="/vs/why"
          className="inline-flex items-center gap-2 px-5 py-3 rounded-xl border border-slate-200 text-slate-700 text-sm font-bold hover:bg-slate-50"
        >
          Why we built Helpward
        </Link>
      </div>
    </MarketingShell>
  );
}
