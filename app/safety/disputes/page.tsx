import Link from "next/link";
import type { Metadata } from "next";
import { AlertOctagon, Clock, Scale, Mail, Shield } from "lucide-react";
import { SafetyShell } from "../_safety-shell";

const TITLE = "Disputes & refunds";
const INTRO =
  "If something goes wrong on a booking — quality, damage, no-show, billing, safety — you have 24 hours after task completion to open a dispute. Here's exactly what happens.";
const LAST_UPDATED = "2026-05-29";

export const metadata: Metadata = {
  title: `${TITLE} — Helpward Safety`,
  description: INTRO,
  alternates: { canonical: "https://helpward.com/safety/disputes" },
  openGraph: { title: TITLE, description: INTRO, type: "article" },
};

export default function Page() {
  return (
    <SafetyShell
      slug="disputes"
      title={TITLE}
      intro={INTRO}
      lastUpdated={LAST_UPDATED}
      faqs={[
        { q: "What if I notice the issue after the 24-hour window?", a: "Email safety@helpward.com directly. Edge-case exceptions exist (you were travelling, you only noticed the damage when you returned), and a real human at Helpward reviews late disputes. Property-damage and safety disputes are accepted for up to 30 days; quality and billing disputes have the hard 24-hour cap." },
        { q: "Can the helper retaliate by leaving me a bad review?", a: "Helpers don't write reviews — only customers rate helpers, not the other way around. Helpward's reviews are one-directional by design specifically to prevent this kind of retaliation." },
        { q: "Will the helper see what I wrote in the dispute?", a: "The helper sees the category (Quality / Damage / No-show / etc.) and is given a chance to respond, but they don't see your verbatim description unless you choose to share it. The full content goes to Helpward's ops team and stays there." },
        { q: "What's the difference between a dispute and a chargeback?", a: "A dispute is filed with Helpward and resolved by our ops team using the booking's full record. A chargeback is filed with your credit-card issuer and bypasses Helpward entirely. We strongly recommend disputes first — they're faster, free, and don't risk your helper losing already-issued payout. Filing a chargeback also pauses your Helpward account until the chargeback is resolved." },
        { q: "Does opening a dispute trigger an insurance claim?", a: "Disputes in the Damage and Safety categories are auto-flagged as insurance claims and routed to both the ops team and the underwriting carrier. Quality and billing disputes don't go through insurance — they're handled by Helpward operations only." },
        { q: "What if the helper says I broke something they didn't do?", a: "Helpward reviews evidence from both sides: photos, the in-app chat history, GPS location history during the task, and any prior-condition photos either side has on record. Our default in genuinely ambiguous cases is to favour the customer up to a reasonable amount (typically $500), beyond which we require photographic evidence." },
      ]}
    >
      <h2>When to open a dispute</h2>
      <p>
        Open a dispute any time something on a booking didn&apos;t go the way it should have. The categories on the
        form are:
      </p>
      <ul>
        <li><strong>No-show</strong> — the helper accepted the booking but never arrived or marked it complete without doing the task.</li>
        <li><strong>Quality</strong> — the task was done, but poorly. The TV was mounted crooked; the groceries arrived spoiled; the assembly looks wrong.</li>
        <li><strong>Damage</strong> — your property was damaged during the booking (also files an insurance claim — see <Link href="/safety/insurance" className="font-semibold">/safety/insurance</Link>).</li>
        <li><strong>Billing</strong> — you were charged the wrong amount, charged twice, or charged for a cancelled booking.</li>
        <li><strong>Safety</strong> — the helper behaved unsafely, made you feel unsafe, or violated Helpward&apos;s community standards.</li>
        <li><strong>Other</strong> — anything else. We&apos;d rather you over-report than not at all.</li>
      </ul>

      <h2>How to open a dispute</h2>
      <ol>
        <li>Open the booking from <Link href="/bookings">/bookings</Link>.</li>
        <li>Scroll to <em>Report an issue</em> (the link is also at the bottom of the booking detail).</li>
        <li>Pick the category. Disputes with the wrong category still go through — we re-route internally — so pick the closest match.</li>
        <li>Describe what happened. We require at least 20 characters so a real description is captured; longer is better. Attach photos if you have them.</li>
        <li>Submit. You&apos;ll get a dispute reference number immediately and an acknowledgement within 4 hours.</li>
      </ol>

      <div className="not-prose my-6 rounded-2xl bg-amber-50 border border-amber-200 p-4 flex items-start gap-3">
        <AlertOctagon className="w-4 h-4 text-amber-700 mt-0.5 shrink-0" />
        <div className="text-xs text-amber-900 leading-relaxed">
          <strong>Safety emergencies don&apos;t go through the dispute form.</strong> If you&apos;re in immediate
          danger, call <strong>911</strong> (US/Canada) first, then email{" "}
          <a href="mailto:safety@helpward.com" className="font-bold underline">safety@helpward.com</a> — we&apos;re
          on-call 24/7 for active safety incidents.
        </div>
      </div>

      <h2>What happens after you submit</h2>
      <div className="not-prose my-4 space-y-3">
        <Phase n={1} title="Acknowledgement (within 4 hours)" body="A real human at Helpward reads your dispute, assigns a reference number, and emails you the case ID. Damage and safety disputes are routed to a senior reviewer immediately." />
        <Phase n={2} title="Investigation (1–3 days for most cases)" body="The reviewer pulls the booking's full record: in-app chat, GPS history, photos, prior bookings between you and the helper, and any reviews. The helper gets a chance to respond — they see the category but not your verbatim description." />
        <Phase n={3} title="Decision" body="The reviewer makes a call: refund (partial or full), insurance claim opened (damage), warning to the helper, removal from the platform (severe), or no-fault-found with a written explanation. You can appeal any decision once." />
        <Phase n={4} title="Resolution (24-48h for refunds, 30 days for claims)" body="Refunds hit your card via Stripe within 5–10 business days. Insurance claims follow the claims process at /safety/insurance. Helper consequences are non-public." />
      </div>

      <h2>What gets refunded</h2>
      <p>
        Refund amounts are calibrated to the category and severity of the dispute:
      </p>
      <ul>
        <li><strong>No-show:</strong> 100% refund, including the service fee. Helper receives nothing.</li>
        <li><strong>Quality (minor):</strong> Partial refund (typically 20–50% of base) and a credit toward a future booking. Helper receives partial payout.</li>
        <li><strong>Quality (major):</strong> 100% refund. Helper receives nothing or partial depending on whether ops finds the task was attempted in good faith.</li>
        <li><strong>Billing error:</strong> 100% refund of the disputed amount. Service fee is also refunded if the error was on our end.</li>
        <li><strong>Damage:</strong> 100% refund of the booking + insurance claim opened. Repair costs/replacement value handled by the carrier.</li>
        <li><strong>Safety:</strong> 100% refund. Helper consequences (warning, suspension, removal) decided separately.</li>
      </ul>

      <h2>How the helper is involved</h2>
      <p>
        Helpward uses an <strong>asymmetric communication model</strong> for disputes — the customer&apos;s
        verbatim description stays private, but the helper is given the category and a chance to share their
        side of the story. The reviewer balances both. We do this because:
      </p>
      <ul>
        <li>Customers reasonably worry that their words could be used against them outside the dispute (in reviews, in retaliatory behaviour, in public posts). Keeping the description private removes that concern.</li>
        <li>Helpers reasonably need to know what they&apos;re being accused of so they can address it. The category and severity is enough information for a productive response.</li>
        <li>The reviewer needs both sides to make a fair call — neither verbatim transparency nor a one-sided process gets to a fair outcome.</li>
      </ul>

      <h2>Appeals</h2>
      <p>
        You can appeal any dispute decision once. Send a written appeal to{" "}
        <a href="mailto:safety@helpward.com" className="font-semibold">safety@helpward.com</a> within 14 days of the
        decision, including new information or evidence the original reviewer didn&apos;t have. Appeals are
        reviewed by a different person than the original decision-maker.
      </p>

      <h2>Talking to a human at any step</h2>
      <div className="not-prose my-4 grid sm:grid-cols-3 gap-3">
        <Contact icon={<Mail className="w-4 h-4 text-brand-600" />} title="General disputes" body="hello@helpward.com — 24/7 reply." />
        <Contact icon={<Shield className="w-4 h-4 text-rose-600" />} title="Safety hotline" body="safety@helpward.com — 4-hour priority response." />
        <Contact icon={<Scale className="w-4 h-4 text-amber-600" />} title="Appeals" body="safety@helpward.com with subject line APPEAL [case ID]." />
      </div>

      <p className="not-prose mt-6 text-xs text-slate-500">
        Read the customer-friendly version at{" "}
        <Link href="/help/refunds-and-disputes" className="text-brand-700 font-semibold hover:underline">
          help / refunds and disputes
        </Link>, or open a dispute right now from{" "}
        <Link href="/bookings" className="text-brand-700 font-semibold hover:underline">your bookings</Link>.
      </p>
    </SafetyShell>
  );
}

function Phase({ n, title, body }: { n: number; title: string; body: string }) {
  return (
    <div className="rounded-2xl bg-white border border-slate-100 p-4 flex items-start gap-3">
      <span className="inline-flex w-7 h-7 rounded-full bg-brand-600 text-white text-xs font-bold items-center justify-center shrink-0">
        {n}
      </span>
      <div className="min-w-0">
        <div className="text-sm font-bold text-slate-900">{title}</div>
        <div className="text-xs text-slate-600 mt-0.5 leading-relaxed">{body}</div>
      </div>
    </div>
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
