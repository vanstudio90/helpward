import Link from "next/link";
import type { Metadata } from "next";
import { TrendingUp, ShieldCheck, AlertOctagon, Clock, Info } from "lucide-react";
import { SafetyShell } from "../_safety-shell";

const TITLE = "Transparency report";
const INTRO =
  "Quarterly stats on how Helpward is actually operating: helper approval rates, response times, incident rates, refund rates. Updated every three months.";
const LAST_UPDATED = "2026-05-29";

export const metadata: Metadata = {
  title: `${TITLE} — Helpward Safety`,
  description: INTRO,
  alternates: { canonical: "https://helpward.com/safety/transparency-report" },
  openGraph: { title: TITLE, description: INTRO, type: "article" },
};

export default function Page() {
  return (
    <SafetyShell
      slug="transparency-report"
      title={TITLE}
      intro={INTRO}
      lastUpdated={LAST_UPDATED}
      faqs={[
        { q: "Why publish this?", a: "Marketplaces only earn trust when both sides can verify how the platform actually operates. Helpward chose to publish quarterly stats from launch so customers, helpers, and regulators can hold us to our own claims. The figures here come directly from our production database — no hand-curation, no PR spin." },
        { q: "Are these numbers audited?", a: "No, not yet. The aggregates come from production-database snapshots and the methodology is described below each table. Once Helpward crosses 50,000 quarterly bookings we'll commission an annual third-party SOC-2-style attestation of the figures." },
        { q: "Will law-enforcement requests show up here too?", a: "Yes, starting next quarter. Helpward will publish counts of law-enforcement information requests received, complied-with, and rejected — separated by jurisdiction and request type — using the same template as Cloudflare's transparency report." },
        { q: "What if a number looks bad?", a: "We publish it anyway. Refund rates that go up tell us something is breaking; incident rates that creep up are a signal to invest in vetting. Hiding bad numbers would defeat the purpose. We commit to a written explanation alongside any metric that worsens by more than 25% quarter-over-quarter." },
      ]}
    >
      <div className="not-prose my-6 rounded-2xl bg-brand-50 border border-brand-100 p-4 flex items-start gap-3">
        <Info className="w-4 h-4 text-brand-600 mt-0.5 shrink-0" />
        <div className="text-xs text-slate-700 leading-relaxed">
          <strong>Helpward is in its first quarter of public operation.</strong> Numbers below cover the launch
          quarter (Q2 2026). Figures will become more meaningful as volume builds; we publish them now to set a
          baseline. Next report ships on the first business day of October 2026.
        </div>
      </div>

      <h2>Helper supply &amp; approval</h2>
      <p>
        Helpers go through identity verification, background check, bank-account linking, and a human approval
        review before they can take a single task.
      </p>
      <div className="not-prose my-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KPI tone="bg-brand-50 text-brand-700" icon={<ShieldCheck className="w-4 h-4" />} value="—" label="Total approved helpers" sub="launching" />
        <KPI tone="bg-amber-50 text-amber-700" icon={<Clock className="w-4 h-4" />} value="—" label="Avg time to approval" sub="from application" />
        <KPI tone="bg-emerald-50 text-emerald-700" icon={<TrendingUp className="w-4 h-4" />} value="—%" label="Approval rate" sub="of applicants" />
        <KPI tone="bg-rose-50 text-rose-700" icon={<AlertOctagon className="w-4 h-4" />} value="—" label="Suspended this quarter" sub="for policy violations" />
      </div>
      <p className="not-prose text-[11px] text-slate-500">
        Approval rate = (approved applications + currently-in-review) / total applications. Background-check
        disqualifications and incomplete onboarding both count as rejections.
      </p>

      <h2>Booking outcomes</h2>
      <p>
        We define a &ldquo;successful&rdquo; booking as one marked Completed by both parties with no dispute filed
        in the 24-hour window. The metric we&apos;re most accountable for is the percentage of bookings that hit
        that bar.
      </p>
      <div className="not-prose my-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KPI tone="bg-brand-50 text-brand-700" icon={<TrendingUp className="w-4 h-4" />} value="—" label="Bookings this quarter" sub="cleared payment + completion" />
        <KPI tone="bg-emerald-50 text-emerald-700" icon={<ShieldCheck className="w-4 h-4" />} value="—%" label="Success rate" sub="completed, no dispute" />
        <KPI tone="bg-amber-50 text-amber-700" icon={<Clock className="w-4 h-4" />} value="—" label="Avg match time" sub="request → helper accepts" />
        <KPI tone="bg-rose-50 text-rose-700" icon={<AlertOctagon className="w-4 h-4" />} value="—%" label="Cancellation rate" sub="all reasons" />
      </div>

      <h2>Disputes &amp; refunds</h2>
      <p>
        Disputes split into categories tracked separately so we can see what&apos;s actually going wrong, not just
        a flat &ldquo;3% of bookings had issues&rdquo; figure.
      </p>
      <div className="not-prose my-4 rounded-2xl border border-slate-100 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="text-left px-4 py-2 text-[10px] uppercase tracking-wide text-slate-500">Category</th>
              <th className="text-right px-4 py-2 text-[10px] uppercase tracking-wide text-slate-500">Filed</th>
              <th className="text-right px-4 py-2 text-[10px] uppercase tracking-wide text-slate-500">% refunded</th>
              <th className="text-right px-4 py-2 text-[10px] uppercase tracking-wide text-slate-500">Avg resolution</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-xs">
            <DisputeRow cat="No-show" filed="—" refunded="—%" time="—" />
            <DisputeRow cat="Quality" filed="—" refunded="—%" time="—" />
            <DisputeRow cat="Damage" filed="—" refunded="—%" time="—" />
            <DisputeRow cat="Billing" filed="—" refunded="—%" time="—" />
            <DisputeRow cat="Safety" filed="—" refunded="—%" time="—" />
          </tbody>
        </table>
      </div>
      <p className="not-prose text-[11px] text-slate-500">
        % refunded = customers who received a partial or full refund / total disputes filed in the category.
        Avg resolution = hours from dispute submission to written decision.
      </p>

      <h2>Safety incidents</h2>
      <p>
        Helpward tracks every safety report on its own ledger separate from the dispute system. Categories
        published here mirror what Uber, Lyft, and Airbnb report in their respective transparency reports.
      </p>
      <div className="not-prose my-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KPI tone="bg-slate-50 text-slate-700" icon={<AlertOctagon className="w-4 h-4" />} value="—" label="Safety reports filed" sub="all severities" />
        <KPI tone="bg-amber-50 text-amber-700" icon={<AlertOctagon className="w-4 h-4" />} value="—" label="Severe incidents" sub="injuries, threats" />
        <KPI tone="bg-rose-50 text-rose-700" icon={<AlertOctagon className="w-4 h-4" />} value="—" label="Helpers removed" sub="for safety cause" />
        <KPI tone="bg-emerald-50 text-emerald-700" icon={<Clock className="w-4 h-4" />} value="—" label="Avg safety response" sub="from report to ack" />
      </div>

      <h2>Response times</h2>
      <p>
        Helpward&apos;s public commitment is a 4-hour acknowledgement on safety reports and a 24-hour acknowledgement
        on everything else. We measure ourselves against that bar.
      </p>
      <div className="not-prose my-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KPI tone="bg-brand-50 text-brand-700" icon={<Clock className="w-4 h-4" />} value="—%" label="Safety ack ≤4h" sub="commitment met" />
        <KPI tone="bg-brand-50 text-brand-700" icon={<Clock className="w-4 h-4" />} value="—%" label="Disputes ack ≤24h" sub="commitment met" />
        <KPI tone="bg-emerald-50 text-emerald-700" icon={<Clock className="w-4 h-4" />} value="—%" label="Refunds within 5 business days" sub="from approval" />
        <KPI tone="bg-emerald-50 text-emerald-700" icon={<Clock className="w-4 h-4" />} value="—%" label="Insurance claims acked ≤24h" sub="commitment met" />
      </div>

      <h2>Methodology</h2>
      <p>
        All figures are pulled directly from Helpward&apos;s production database at the close of business on the
        last day of the quarter. We do not pre-screen the numbers or excuse outliers — what&apos;s in this report
        is what the platform actually did. Definitions for every metric are pinned in the help centre under{" "}
        <Link href="/help" className="font-semibold">/help</Link>. Numbers are reported as raw counts and
        percentages; we do not weight or seasonally adjust.
      </p>

      <h2>What&apos;s coming next</h2>
      <ul>
        <li><strong>Law-enforcement requests.</strong> Counts of LE requests received, complied-with, and rejected by jurisdiction and request type.</li>
        <li><strong>Helper demographic transparency.</strong> Aggregate stats on helper geography and tenure — never individually identifiable.</li>
        <li><strong>Annual third-party attestation.</strong> Once we cross 50,000 quarterly bookings, an independent firm will verify the figures.</li>
      </ul>

      <p className="not-prose mt-6 text-xs text-slate-500">
        Spot something missing? Email{" "}
        <a href="mailto:hello@helpward.com" className="text-brand-700 font-semibold hover:underline">
          hello@helpward.com
        </a>{" "}
        — we&apos;d rather hear suggestions for what to publish next than discover after the fact that we omitted
        something material.
      </p>
    </SafetyShell>
  );
}

function KPI({ tone, icon, value, label, sub }: {
  tone: string; icon: React.ReactNode; value: string; label: string; sub: string;
}) {
  return (
    <div className="rounded-2xl bg-white border border-slate-100 p-3">
      <span className={`inline-flex w-7 h-7 rounded-lg ${tone} items-center justify-center mb-1.5`}>{icon}</span>
      <div className="text-lg font-bold text-slate-900 leading-tight">{value}</div>
      <div className="text-[10px] text-slate-700 font-semibold mt-0.5">{label}</div>
      <div className="text-[10px] text-slate-500">{sub}</div>
    </div>
  );
}

function DisputeRow({ cat, filed, refunded, time }: {
  cat: string; filed: string; refunded: string; time: string;
}) {
  return (
    <tr>
      <td className="px-4 py-2.5 text-slate-700 font-semibold">{cat}</td>
      <td className="px-4 py-2.5 text-right text-slate-700">{filed}</td>
      <td className="px-4 py-2.5 text-right text-slate-700">{refunded}</td>
      <td className="px-4 py-2.5 text-right text-slate-500">{time}</td>
    </tr>
  );
}
