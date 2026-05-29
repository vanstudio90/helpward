import Link from "next/link";
import type { Metadata } from "next";
import { CheckCircle2, XCircle, Clock, FileSearch } from "lucide-react";
import { SafetyShell } from "../_safety-shell";

const TITLE = "Background checks";
const INTRO =
  "Every Helpward helper passes a third-party criminal background check before they can take a single task. Here's exactly what we screen, what we don't, and how often we re-check.";
const LAST_UPDATED = "2026-05-29";

export const metadata: Metadata = {
  title: `${TITLE} — Helpward Safety`,
  description: INTRO,
  alternates: { canonical: "https://helpward.com/safety/background-checks" },
  openGraph: { title: TITLE, description: INTRO, type: "article" },
};

export default function Page() {
  return (
    <SafetyShell
      slug="background-checks"
      title={TITLE}
      intro={INTRO}
      lastUpdated={LAST_UPDATED}
      faqs={[
        { q: "How long does the background check take?", a: "Most checks complete in 24–72 hours. A small number take longer (up to 10 days) when county-level records need to be pulled manually or a name match needs to be disambiguated. You'll see the status on your /provider/onboard page; the matching engine doesn't activate your account until the check clears." },
        { q: "Can I see the full report?", a: "Yes. Both Checkr and Triton give you copies of your own report under the Fair Credit Reporting Act (US) and PIPEDA (Canada). You can request the report directly from the provider, and you have the right to dispute any inaccuracy before Helpward makes an approval decision." },
        { q: "What's an example of something that wouldn't disqualify me?", a: "Helpward's adjudication policy doesn't auto-disqualify on every record. A 12-year-old non-violent misdemeanour with no recent activity, for example, gets reviewed individually and is often approved with the helper's context. Recent violent offences, sexual offences, or convictions involving children always disqualify." },
        { q: "Will my background check show up in my customer-facing profile?", a: "No. The check result is private to Helpward's approval team. Customers see a 'Background checked' badge once you're approved; the underlying record is never displayed." },
        { q: "What happens if something appears on a re-check?", a: "Helpward re-runs background checks annually and on any reported safety concern. If new information disqualifies you under our adjudication policy, your account is paused while you're notified and given a chance to respond. Open bookings are reassigned or refunded." },
      ]}
    >
      <h2>The third parties we use</h2>
      <p>
        Helpward partners with <strong>Checkr</strong> for U.S. helpers and <strong>Triton Canada</strong> for
        Canadian helpers. Both are FCRA-accredited (US) / PIPEDA-compliant (Canada) and are used by major
        marketplaces including Uber, DoorDash, Instacart, and Airbnb. We don't run our own checks because
        accredited providers are required by law to give helpers transparency and dispute rights that an in-house
        check could not guarantee.
      </p>

      <h2>What we screen</h2>
      <p>
        Every helper application runs through the same baseline screen before a human at Helpward reviews the result:
      </p>
      <ul>
        <li><strong>Identity verification</strong> — Social Security number trace (US) or SIN trace (Canada) to confirm the helper is who they say they are.</li>
        <li><strong>Criminal record search</strong> — National sex-offender registry, federal criminal records, and county-level criminal records for every county the helper has lived in over the past seven years.</li>
        <li><strong>Motor vehicle record</strong> — Pulled for any helper offering transportation services (designated driver, ride assistance, vehicle delivery, motorcycle taxi). Includes license validity, accident history, and major violations.</li>
        <li><strong>Global watchlist screening</strong> — OFAC (US Treasury Sanctions) and equivalent Canadian terrorism-financing lists.</li>
      </ul>

      <h2>What we don't screen</h2>
      <p>
        Transparency matters. Helpward&apos;s standard check intentionally does not include:
      </p>
      <ul>
        <li><strong>Credit reports.</strong> Credit history isn&apos;t predictive of safety, and we don&apos;t want to penalise helpers who&apos;ve been through financial hardship.</li>
        <li><strong>Civil litigation records.</strong> Lawsuits aren&apos;t convictions; we only screen for adjudicated criminal cases.</li>
        <li><strong>Education or employment verification.</strong> Helpward&apos;s services don&apos;t require formal credentials. A helper&apos;s rating and reviews are how customers evaluate competence.</li>
        <li><strong>Social media monitoring.</strong> We don&apos;t scrape Twitter, Facebook, or any other platform.</li>
      </ul>

      <h2>What disqualifies a helper</h2>
      <p>
        Helpward operates an <em>adjudication policy</em> — meaning a real human reviews every record before
        making a decision. Some categories trigger automatic disqualification regardless of context:
      </p>
      <div className="not-prose my-4 grid sm:grid-cols-2 gap-3">
        <div className="rounded-2xl bg-rose-50 border border-rose-100 p-4">
          <div className="flex items-center gap-2 text-sm font-bold text-rose-900 mb-2">
            <XCircle className="w-4 h-4" /> Auto-disqualify
          </div>
          <ul className="text-xs text-rose-900 space-y-1 leading-relaxed">
            <li>· Any sexual offence or registry listing</li>
            <li>· Violent felony in the past 7 years</li>
            <li>· Conviction involving a minor</li>
            <li>· Identity theft / financial fraud conviction</li>
            <li>· Open felony warrant</li>
            <li>· Driving services: DUI in past 7 years</li>
          </ul>
        </div>
        <div className="rounded-2xl bg-emerald-50 border border-emerald-100 p-4">
          <div className="flex items-center gap-2 text-sm font-bold text-emerald-900 mb-2">
            <CheckCircle2 className="w-4 h-4" /> Reviewed individually
          </div>
          <ul className="text-xs text-emerald-900 space-y-1 leading-relaxed">
            <li>· Non-violent misdemeanours &gt;5 years old</li>
            <li>· Single minor traffic violation</li>
            <li>· Records that have been expunged</li>
            <li>· Records resolved with rehabilitation</li>
            <li>· Mistaken-identity matches the helper has disputed</li>
          </ul>
        </div>
      </div>

      <h2>Identity verification</h2>
      <p>
        Before the background check even runs, every helper completes <strong>Stripe Identity</strong> verification:
        the helper photographs a government-issued ID (US: driver&apos;s licence, state ID, or passport; Canada:
        provincial licence or passport) and submits a live selfie. Stripe&apos;s system matches the face on the ID
        to the selfie and validates the document against the issuing authority&apos;s public records. We don&apos;t
        proceed to the criminal check until identity is confirmed — that&apos;s how we prevent someone from passing
        a check using a different person&apos;s identity.
      </p>

      <h2>Re-screening</h2>
      <div className="not-prose my-4 grid sm:grid-cols-3 gap-3 text-xs">
        <Cell icon={<Clock className="w-4 h-4 text-brand-600" />} title="Annual" body="Every helper re-runs the full check on the anniversary of approval." />
        <Cell icon={<FileSearch className="w-4 h-4 text-amber-600" />} title="On report" body="Any customer safety report triggers an immediate ad-hoc check." />
        <Cell icon={<Clock className="w-4 h-4 text-emerald-600" />} title="Continuous (US)" body="Checkr continuously monitors new records and flags any update on file." />
      </div>

      <h2>What happens between you and the check</h2>
      <p>
        We treat criminal-record data with the same care as financial data. Helpward&apos;s ops team only sees the
        adjudication result (approved / disqualified / pending review), not the underlying record. The full report
        stays at Checkr or Triton, encrypted, accessible only to the helper themselves and to a small number of
        named compliance reviewers who handle appeals.
      </p>

      <p className="not-prose mt-6 text-xs text-slate-500">
        Want the customer-side view? Read the help-centre article on{" "}
        <Link href="/help/background-checks-and-insurance" className="text-brand-700 font-semibold hover:underline">
          background checks and insurance
        </Link>{" "}
        for a customer-friendly summary.
      </p>
    </SafetyShell>
  );
}

function Cell({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="rounded-2xl bg-white border border-slate-100 p-4">
      <div className="flex items-center gap-2 font-bold text-slate-900 mb-1.5">{icon}{title}</div>
      <div className="text-slate-600 leading-relaxed">{body}</div>
    </div>
  );
}
