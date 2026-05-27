import { MarketingShell } from "@/components/MarketingShell";
import Link from "next/link";
import { MessageSquare, Mail, Shield, BookOpen } from "lucide-react";

export const metadata = { title: "Help Center — Helpward" };

export default function Help() {
  return (
    <MarketingShell title="Help Center" subtitle="Find an answer, or reach a human in minutes.">
      <p>
        Most questions have a quick answer below. If you don&apos;t find what you need, our team
        is on email 24/7.
      </p>

      <h2>Quick answers</h2>
      <ul>
        <li><strong>How do I create a request?</strong> Open <Link href="/new-request">/new-request</Link>, pick a service, enter where + when, and tap <em>Submit</em>. We notify nearby verified providers — the first to accept gets the task.</li>
        <li><strong>How do I cancel?</strong> Go to <Link href="/bookings">/bookings</Link>, find the Pending tab, tap <em>Cancel</em>. Free before a provider accepts.</li>
        <li><strong>When am I charged?</strong> Your card is authorized when a provider accepts. You&apos;re only charged after the task is marked complete.</li>
        <li><strong>How do I rate a provider?</strong> From <Link href="/bookings">/bookings</Link>, tap <em>Rate</em> on any completed task.</li>
        <li><strong>How do I become a provider?</strong> Sign up and select &ldquo;I want to earn&rdquo;. Complete ID verification + background check, then you can accept tasks.</li>
        <li><strong>What countries do you serve?</strong> United States and Canada, starting with Vancouver, BC.</li>
        <li><strong>How are providers vetted?</strong> Every provider passes government-ID verification (via Stripe Identity) and a criminal background check (Checkr in the US, Triton in Canada). See <Link href="/safety">/safety</Link>.</li>
        <li><strong>What if something goes wrong?</strong> Open a dispute on the booking page or email <a href="mailto:safety@helpward.com">safety@helpward.com</a>. Every task is insured.</li>
      </ul>

      <h2>Talk to a human</h2>
      <ul>
        <li><Mail className="inline w-4 h-4" /> General: <a href="mailto:hello@helpward.com">hello@helpward.com</a></li>
        <li><Shield className="inline w-4 h-4" /> Safety: <a href="mailto:safety@helpward.com">safety@helpward.com</a> (priority response within 4 hours)</li>
        <li><MessageSquare className="inline w-4 h-4" /> Billing: <a href="mailto:billing@helpward.com">billing@helpward.com</a></li>
        <li><BookOpen className="inline w-4 h-4" /> Press / partnerships: <a href="mailto:press@helpward.com">press@helpward.com</a></li>
      </ul>
    </MarketingShell>
  );
}
