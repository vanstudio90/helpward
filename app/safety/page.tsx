import { MarketingShell } from "@/components/MarketingShell";
import { Shield, ShieldCheck, MapPin, Phone, Lock } from "lucide-react";

export const metadata = { title: "Safety — Helpward" };

export default function Safety() {
  return (
    <MarketingShell title="Safety" subtitle="Trust is the entire product.">
      <p>
        Helpward is built around safety. Here's exactly what we do for both customers and
        providers.
      </p>

      <h2>For customers</h2>
      <ul>
        <li><strong>Government ID verification.</strong> Every provider uploads a government-issued photo ID, verified by Stripe Identity with liveness check.</li>
        <li><strong>Background checks.</strong> All providers pass a criminal background check (Checkr in the US, Triton in Canada) before they can accept tasks.</li>
        <li><strong>Per-task insurance.</strong> Every booking is covered by occurrence-based liability insurance.</li>
        <li><strong>Live GPS tracking.</strong> Watch your provider's route in real time once a task starts.</li>
        <li><strong>SOS button.</strong> One tap dials 911 and alerts our 24/7 safety team with your location and provider info.</li>
        <li><strong>Trip share.</strong> Text a tracking link to a friend so someone always knows where you are.</li>
        <li><strong>Escrow payments.</strong> Funds are held by Stripe and only released after you confirm the task is done.</li>
      </ul>

      <h2>For providers</h2>
      <ul>
        <li><strong>Choice.</strong> You see every task before accepting. Decline anything that doesn't fit.</li>
        <li><strong>Insurance.</strong> You're covered while working through our marketplace policy.</li>
        <li><strong>Same SOS button.</strong> Your safety matters too — emergency support is always one tap away.</li>
        <li><strong>Fast payouts.</strong> Earnings hit your bank within 2 business days, in USD or CAD.</li>
      </ul>

      <h2>Reporting an incident</h2>
      <p>
        If something happens during a task — anything from a damaged item to an unsafe situation —
        open a dispute from the booking page or email <a href="mailto:safety@helpward.com">safety@helpward.com</a>.
        Our team triages within 4 hours and pursues a full investigation.
      </p>
    </MarketingShell>
  );
}
