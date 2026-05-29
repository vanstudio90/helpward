import Link from "next/link";
import type { Metadata } from "next";
import {
  ShieldCheck, Umbrella, Scale, BarChart3, Phone, ChevronRight,
  Lock, MapPin, Eye,
} from "lucide-react";
import { MarketingShell } from "@/components/MarketingShell";
import { SAFETY_PAGES } from "./_safety-shell";

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  ShieldCheck, Umbrella, Scale, BarChart3,
};

const TITLE = "Safety";
const INTRO = "Trust is the entire product. Here's exactly how Helpward verifies helpers, protects bookings, and handles things when they go wrong.";

export const metadata: Metadata = {
  title: `${TITLE} — Helpward`,
  description: INTRO,
  alternates: { canonical: "https://helpward.com/safety" },
  openGraph: { title: `${TITLE} — Helpward`, description: INTRO },
};

// Hub-level JSON-LD: a CollectionPage that lists every safety topic as a
// CreativeWork. Helps Google understand the entire safety section as one
// authoritative cluster.
const HUB_LD = {
  "@context": "https://schema.org",
  "@type": "CollectionPage",
  "@id": "https://helpward.com/safety#hub",
  name: "Helpward Safety",
  description: INTRO,
  url: "https://helpward.com/safety",
  isPartOf: { "@id": "https://helpward.com/#website" },
  about: { "@id": "https://helpward.com/#organization" },
  hasPart: SAFETY_PAGES.map((p) => ({
    "@type": "CreativeWork",
    name: p.title,
    url: `https://helpward.com/safety/${p.slug}`,
    description: p.summary,
  })),
};

export default function Safety() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(HUB_LD) }} />

      <MarketingShell title={TITLE} subtitle={INTRO}>
        <h2>The four guarantees</h2>
        <p>
          Every Helpward booking is backed by four operational commitments. Click through to any topic for the
          full mechanics — what we screen, what the policy covers, how a dispute actually works.
        </p>

        <div className="not-prose my-6 grid sm:grid-cols-2 gap-4">
          {SAFETY_PAGES.map((p) => {
            const Icon = ICONS[p.icon];
            return (
              <Link
                key={p.slug}
                href={`/safety/${p.slug}`}
                className="group block rounded-2xl border border-slate-100 bg-white p-5 hover:border-brand-300 hover:shadow transition"
              >
                <div className="flex items-start gap-3">
                  <span className="w-10 h-10 rounded-xl bg-brand-50 text-brand-600 inline-flex items-center justify-center shrink-0">
                    {Icon && <Icon className="w-5 h-5" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-base font-bold text-slate-900 inline-flex items-center gap-1 group-hover:gap-2 transition-all">
                      {p.title}
                      <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-brand-600" />
                    </div>
                    <p className="text-xs text-slate-600 mt-1 leading-relaxed">{p.summary}</p>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>

        <h2>What protects every booking</h2>
        <p>
          Beyond the four major topics above, every Helpward booking is shaped by the same baseline of operational
          safeguards. None of these are optional or behind a premium tier.
        </p>
        <ul>
          <li><strong>Government ID verification.</strong> Every helper uploads a government-issued photo ID, verified by Stripe Identity with a live-selfie liveness check before any background check runs.</li>
          <li><strong>Real-time GPS tracking.</strong> Customers see their helper&apos;s position update every 15 seconds from acceptance through completion. The trail is retained for 90 days and is available to dispute reviewers.</li>
          <li><strong>End-to-end encrypted chat.</strong> In-app messages between customer and helper are encrypted in transit and at rest. Phone numbers stay private — relayed-call infrastructure ships with the Twilio integration.</li>
          <li><strong>Escrow payments.</strong> Funds are authorised at booking, held by Stripe, and released only after the customer confirms completion. A 24-hour dispute window keeps that release pausable.</li>
          <li><strong>Trip share.</strong> One tap sends a tracking link to a friend or family member. The link expires when the booking does.</li>
          <li><strong>24/7 safety hotline.</strong> Every active booking has a tap-to-reach safety hotline; the on-call team responds within 4 hours and routes urgent reports to a senior reviewer immediately.</li>
        </ul>

        <div className="not-prose my-6 grid sm:grid-cols-3 gap-3">
          <Guarantee icon={<Lock className="w-4 h-4 text-emerald-600" />} title="Escrow" body="Funds held until you mark complete." />
          <Guarantee icon={<MapPin className="w-4 h-4 text-brand-600" />} title="Live GPS" body="Helper's location updates every 15s." />
          <Guarantee icon={<Eye className="w-4 h-4 text-amber-600" />} title="24-hour dispute window" body="Open a case anytime in the first 24h." />
        </div>

        <h2>Active safety incidents</h2>
        <p>
          If you&apos;re in immediate danger, call <strong>911</strong> (US/Canada) first. Then email{" "}
          <a href="mailto:safety@helpward.com" className="font-semibold">safety@helpward.com</a> with the booking
          ID — the on-call safety reviewer responds within 4 hours, 24/7. Property damage and major safety incidents
          are auto-escalated to a senior reviewer; the dispute and insurance processes start the same hour the
          report arrives.
        </p>

        <div className="not-prose my-6 rounded-2xl bg-rose-50 border border-rose-200 p-4 flex items-start gap-3">
          <Phone className="w-4 h-4 text-rose-700 mt-0.5 shrink-0" />
          <div className="text-sm text-rose-900 leading-relaxed">
            <strong>Safety hotline:</strong>{" "}
            <a href="mailto:safety@helpward.com" className="font-bold underline">safety@helpward.com</a> — 4-hour
            priority response. <strong>Emergencies:</strong> call <strong>911</strong> first.
          </div>
        </div>

        <h2>Read deeper</h2>
        <p>
          Every claim Helpward makes on this page links to a topic page with the full mechanics — what we screen,
          what the policy covers, how a dispute actually works. We don&apos;t hide the details behind PR copy
          because the details are how the platform actually earns trust.
        </p>
        <ul>
          {SAFETY_PAGES.map((p) => (
            <li key={p.slug}>
              <Link href={`/safety/${p.slug}`} className="font-semibold">{p.title}</Link> — {p.summary}
            </li>
          ))}
        </ul>

        <p className="not-prose mt-6 text-xs text-slate-500">
          Customer-friendly summaries also live in the help centre under{" "}
          <Link href="/help" className="text-brand-700 font-semibold hover:underline">/help</Link>.
        </p>
      </MarketingShell>
    </>
  );
}

function Guarantee({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="rounded-2xl bg-white border border-slate-100 p-4">
      <div className="flex items-center gap-2 text-sm font-bold text-slate-900 mb-1">{icon}{title}</div>
      <div className="text-xs text-slate-600 leading-relaxed">{body}</div>
    </div>
  );
}
