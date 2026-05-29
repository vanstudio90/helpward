import Link from "next/link";
import type { Metadata } from "next";
import { Umbrella, CheckCircle2, XCircle, Phone, FileText } from "lucide-react";
import { SafetyShell } from "../_safety-shell";

const TITLE = "Insurance coverage";
const INTRO =
  "Every Helpward booking is covered by platform liability insurance — up to $1M per incident. What's covered, what's excluded, and exactly how a claim works.";
const LAST_UPDATED = "2026-05-29";

export const metadata: Metadata = {
  title: `${TITLE} — Helpward Safety`,
  description: INTRO,
  alternates: { canonical: "https://helpward.com/safety/insurance" },
  openGraph: { title: TITLE, description: INTRO, type: "article" },
};

export default function Page() {
  return (
    <SafetyShell
      slug="insurance"
      title={TITLE}
      intro={INTRO}
      lastUpdated={LAST_UPDATED}
      faqs={[
        { q: "Who pays for the insurance?", a: "Helpward funds the platform policy out of the service fee on every booking. You don't pay an extra insurance premium and there are no deductibles passed through to you." },
        { q: "Does the helper need their own insurance?", a: "Helpers offering driving services (designated driver, ride assistance, vehicle delivery, motorcycle taxi) must carry their own valid auto insurance — Helpward's platform policy is supplemental to the helper's primary auto coverage. For all other categories, Helpward's policy is primary." },
        { q: "What if my homeowner's or renter's insurance also covers the damage?", a: "If your own policy covers the incident, your insurer is typically primary and Helpward's policy applies to anything they don't cover. We coordinate directly with your insurer so you aren't left in the middle." },
        { q: "How long do claims take?", a: "Acknowledgement within 24 hours, initial review within 5 business days, resolution within 30 days on straightforward claims. Complex cases (witness statements, repair estimates from multiple shops) can take 60–90 days. We pay verified claims directly to your bank account or to the repair shop on your behalf." },
        { q: "Will filing a claim affect future bookings?", a: "No. Helpward doesn't share claims information with helpers, and the act of filing a claim has no effect on your customer rating or your ability to book future tasks." },
        { q: "Is the policy underwritten by a real insurance carrier?", a: "Yes. Helpward's platform policy is underwritten by a licensed commercial general-liability carrier with A.M. Best rating of A- (Excellent) or higher. The full carrier name appears on every claim acknowledgement." },
      ]}
    >
      <h2>What the policy covers</h2>
      <p>
        Helpward&apos;s platform policy is a <strong>commercial general liability + property-damage policy</strong>{" "}
        triggered automatically when a booking starts. Coverage applies from the moment the helper marks the task{" "}
        <em>In Progress</em> through to the booking being marked <em>Completed</em> or <em>Cancelled</em>.
      </p>
      <div className="not-prose my-4 grid sm:grid-cols-2 gap-3">
        <div className="rounded-2xl bg-emerald-50 border border-emerald-100 p-4">
          <div className="flex items-center gap-2 text-sm font-bold text-emerald-900 mb-2">
            <CheckCircle2 className="w-4 h-4" /> Covered
          </div>
          <ul className="text-xs text-emerald-900 space-y-1.5 leading-relaxed">
            <li>· Bodily injury to the customer caused by the helper&apos;s negligence (up to $1M)</li>
            <li>· Property damage at the booking address (up to $1M per incident)</li>
            <li>· Damaged items the helper was handling (furniture being assembled, packages being delivered)</li>
            <li>· Third-party injury — someone else hurt at the booking address during the task</li>
            <li>· Legal defence costs if you&apos;re sued related to the booking</li>
            <li>· Lost-key replacement for house-check-in bookings</li>
          </ul>
        </div>
        <div className="rounded-2xl bg-rose-50 border border-rose-100 p-4">
          <div className="flex items-center gap-2 text-sm font-bold text-rose-900 mb-2">
            <XCircle className="w-4 h-4" /> Not covered
          </div>
          <ul className="text-xs text-rose-900 space-y-1.5 leading-relaxed">
            <li>· Pre-existing damage to your property</li>
            <li>· Items the helper wasn&apos;t aware of or didn&apos;t handle</li>
            <li>· Damage caused intentionally by either party</li>
            <li>· Anything happening outside the booking window (helper&apos;s arrival/departure is covered; what they do an hour later is not)</li>
            <li>· Personal auto insurance gaps (the helper carries their own auto cover for driving bookings)</li>
            <li>· Cash, jewellery, or items over $5,000 declared value</li>
          </ul>
        </div>
      </div>

      <h2>Coverage limits at a glance</h2>
      <div className="not-prose my-4 rounded-2xl border border-slate-100 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <tbody className="divide-y divide-slate-100">
            <Row label="Bodily injury, per occurrence" value="$1,000,000" />
            <Row label="Property damage, per occurrence" value="$1,000,000" />
            <Row label="Aggregate, per booking" value="$2,000,000" />
            <Row label="Legal defence, included" value="Yes" />
            <Row label="Helper-handled items, per item" value="$10,000" />
            <Row label="Deductible passed to you" value="$0" />
          </tbody>
        </table>
      </div>

      <h2>How to file a claim</h2>
      <ol>
        <li>
          <strong>Document immediately.</strong> Take photos of any damage, get a copy of any incident report if one
          was filed, and save the booking ID — you&apos;ll need it for every step.
        </li>
        <li>
          <strong>Open a dispute on the booking page within 24 hours of completion.</strong> The dispute form is the
          fastest path to a claim — Helpward&apos;s ops team triages disputes within 4 hours and any property-damage
          dispute is auto-flagged as an insurance claim.
        </li>
        <li>
          <strong>Helpward acknowledges within 24 hours</strong> with a claim number and an introduction to the
          assigned reviewer at the underwriting carrier.
        </li>
        <li>
          <strong>You submit supporting documents</strong> directly to the carrier portal — photos, repair estimates,
          medical bills if applicable. Helpward&apos;s ops team coordinates and answers questions along the way.
        </li>
        <li>
          <strong>Resolution within 30 days for straightforward cases.</strong> Payment goes directly to your bank
          account, to the repair shop on your behalf, or to the medical provider — your choice.
        </li>
      </ol>

      <h2>Talking to a human</h2>
      <div className="not-prose my-4 grid sm:grid-cols-3 gap-3">
        <Contact icon={<Phone className="w-4 h-4 text-rose-600" />} title="Safety hotline" body="safety@helpward.com — 4-hour priority response." />
        <Contact icon={<FileText className="w-4 h-4 text-amber-600" />} title="Claim status" body="claims@helpward.com — file numbers, document submission." />
        <Contact icon={<Umbrella className="w-4 h-4 text-brand-600" />} title="Policy questions" body="legal@helpward.com — wording, coverage limits, carrier details." />
      </div>

      <h2>What our policy is not</h2>
      <p>
        Helpward&apos;s platform policy is <strong>liability insurance</strong> — it pays out when someone has a
        legitimate claim against a Helpward booking. It is <strong>not</strong> a substitute for the helper&apos;s
        personal insurance, your homeowner&apos;s/renter&apos;s policy, or auto insurance on a vehicle being driven
        as part of a booking. If you have a homeowner&apos;s policy and a booking-related incident occurs at home,
        your policy is typically primary and ours is excess; we coordinate directly with your insurer.
      </p>

      <p className="not-prose mt-6 text-xs text-slate-500">
        Customer-friendly summary lives at{" "}
        <Link href="/help/background-checks-and-insurance" className="text-brand-700 font-semibold hover:underline">
          help / background checks and insurance
        </Link>.{" "}
        Need to open a claim right now? Email{" "}
        <a href="mailto:safety@helpward.com" className="text-brand-700 font-semibold hover:underline">
          safety@helpward.com
        </a>.
      </p>
    </SafetyShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <tr>
      <td className="px-4 py-3 text-slate-600">{label}</td>
      <td className="px-4 py-3 text-right font-semibold text-slate-900">{value}</td>
    </tr>
  );
}

function Contact({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="rounded-2xl bg-white border border-slate-100 p-4">
      <div className="flex items-center gap-2 font-bold text-slate-900 text-xs mb-1.5">{icon}{title}</div>
      <div className="text-[11px] text-slate-600 leading-relaxed">{body}</div>
    </div>
  );
}
