import { MarketingShell } from "@/components/MarketingShell";

export const metadata = { title: "Terms of Service — Helpward" };

export default function Terms() {
  return (
    <MarketingShell title="Terms of Service" subtitle={`Last updated ${new Date().toLocaleDateString()}`}>
      <p className="text-xs text-rose-700 bg-rose-50 border border-rose-100 rounded-lg p-3">
        ⚠ This is template language. Get a real lawyer to review before launch. Marketplace ToS has
        nuances around AB5 / contractor classification / IC vs. employee that need professional review.
      </p>
      <h2>1. Who we are</h2>
      <p>
        Helpward (&ldquo;we,&rdquo; &ldquo;us&rdquo;) operates a two-sided marketplace at <a href="https://helpward.com">helpward.com</a>
        that connects customers seeking real-world help (&ldquo;Customers&rdquo;) with independent service
        providers (&ldquo;Providers&rdquo;). Helpward is a technology platform; we do not employ Providers
        and are not a party to the agreements formed between Customers and Providers for the
        provision of services.
      </p>
      <h2>2. Eligibility</h2>
      <p>You must be at least 18 years old and legally able to contract to use Helpward.</p>
      <h2>3. Customer terms</h2>
      <p>You agree to provide accurate task details, pay all amounts shown at booking, and treat Providers with respect.</p>
      <h2>4. Provider terms</h2>
      <p>
        Providers are independent contractors, not employees. You control your own hours, accept or
        decline tasks at your discretion, and are responsible for your own taxes. Helpward will
        issue a 1099-K (US) or T4A (Canada) for earnings above the applicable threshold.
      </p>
      <h2>5. Payments and fees</h2>
      <p>
        Customers pay the full task price plus Helpward&apos;s service fee at the time of booking via
        Stripe. Funds are held in escrow and released to the Provider when the task is marked
        complete and confirmed by the Customer (or auto-confirmed after 24 hours). Helpward retains
        a 20% platform fee from each booking.
      </p>
      <h2>6. Cancellations and refunds</h2>
      <p>
        Customers may cancel free of charge before a Provider has been matched. After matching,
        cancellation fees may apply. Refund disputes are resolved by Helpward Support after
        reviewing both parties&apos; evidence.
      </p>
      <h2>7. Prohibited tasks</h2>
      <p>
        You may not request or accept any task that involves illegal activity, weapons, illicit
        substances, sex work, or that places either party at unreasonable risk.
      </p>
      <h2>8. Limitation of liability</h2>
      <p>
        Helpward&apos;s aggregate liability under these Terms is limited to the greater of (a) fees you
        paid us in the 12 months preceding the claim, or (b) US$100. Helpward is not liable for any
        indirect or consequential damages.
      </p>
      <h2>9. Governing law</h2>
      <p>These Terms are governed by the laws of British Columbia, Canada.</p>
      <h2>10. Changes</h2>
      <p>We may update these Terms; we&apos;ll notify you of material changes by email.</p>
      <p className="mt-8 text-xs text-slate-500">
        Questions? <a href="mailto:legal@helpward.com">legal@helpward.com</a>
      </p>
    </MarketingShell>
  );
}
