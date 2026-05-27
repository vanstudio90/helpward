import { MarketingShell } from "@/components/MarketingShell";

export const metadata = { title: "About — Helpward" };

export default function About() {
  return (
    <MarketingShell title="About Helpward" subtitle="The Human Infrastructure Network.">
      <p>
        Helpward connects people who need real-world help with verified humans who can show up,
        do the work, and disappear when it's done. Driving you home after a long night. Sitting
        in a DMV line. Assembling that IKEA dresser you've been avoiding. Walking your dog when
        you're stuck in a meeting.
      </p>
      <p>
        Every provider on Helpward is ID-verified, background-checked and covered by per-task
        liability insurance. Every booking is paid securely through Stripe with funds held in
        escrow until you confirm the task is done.
      </p>
      <h2>Where we operate</h2>
      <p>
        Helpward is launching first in <strong>Vancouver, BC</strong>, then expanding across
        Canada and the United States. We support USD and CAD natively, tax compliance per
        province / state, and provider payouts in both countries via Stripe Connect.
      </p>
      <h2>How we make money</h2>
      <p>
        Helpward keeps 20% of each completed booking as the platform fee. 80% goes directly to
        the provider as payout. No subscriptions, no setup fees — we only earn when work happens.
      </p>
      <h2>Built by humans for humans</h2>
      <p>
        We're a small team obsessed with reliability. If you have feedback, suggestions, or
        you'd like to join us — drop us a line at <a href="mailto:hello@helpward.com">hello@helpward.com</a>.
      </p>
    </MarketingShell>
  );
}
