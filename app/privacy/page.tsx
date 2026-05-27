import { MarketingShell } from "@/components/MarketingShell";

export const metadata = { title: "Privacy Policy — Helpward" };

export default function Privacy() {
  return (
    <MarketingShell title="Privacy Policy" subtitle={`Last updated ${new Date().toLocaleDateString()}`}>
      <p className="text-xs text-rose-700 bg-rose-50 border border-rose-100 rounded-lg p-3">
        ⚠ Template language. Engage privacy counsel before launch to confirm CCPA / PIPEDA / GDPR compliance.
      </p>
      <h2>What we collect</h2>
      <ul>
        <li><strong>Account:</strong> name, email, phone, password hash, country</li>
        <li><strong>Profile:</strong> avatar, language, currency, time zone</li>
        <li><strong>Providers:</strong> government ID images (held by Stripe Identity, not Helpward), bank account details (held by Stripe Connect, not Helpward), background-check results</li>
        <li><strong>Tasks:</strong> request details, addresses, scheduled times, notes, photos</li>
        <li><strong>Messages:</strong> message content between Customer and Provider</li>
        <li><strong>Location:</strong> GPS coordinates while a task is in progress (deleted 30 days after task ends)</li>
        <li><strong>Payments:</strong> last 4 digits of cards (full numbers held by Stripe, not Helpward)</li>
        <li><strong>Device:</strong> IP, user-agent, push tokens</li>
      </ul>
      <h2>How we use it</h2>
      <ul>
        <li>To match Customers with Providers</li>
        <li>To process payments and payouts</li>
        <li>To send transactional emails and push notifications</li>
        <li>To investigate disputes and incidents</li>
        <li>To improve the platform (aggregated only)</li>
      </ul>
      <h2>Sharing</h2>
      <p>We share data only with:</p>
      <ul>
        <li><strong>The matched Provider</strong> (your name, photo, task details, pickup address)</li>
        <li><strong>Stripe</strong> (payments, identity verification, payouts)</li>
        <li><strong>Checkr / Triton</strong> (background checks for Providers — Customers don&apos;t go through these)</li>
        <li><strong>Twilio, OneSignal, Resend, Mapbox</strong> (operational service providers)</li>
        <li><strong>Law enforcement</strong> when legally required</li>
      </ul>
      <h2>Your rights</h2>
      <ul>
        <li><strong>Access:</strong> request a copy of your data at <a href="mailto:privacy@helpward.com">privacy@helpward.com</a></li>
        <li><strong>Deletion:</strong> delete your account from Settings → Quick Actions</li>
        <li><strong>Correction:</strong> update your profile any time</li>
        <li><strong>Do Not Sell:</strong> we do not sell personal data; California residents can confirm via Settings</li>
      </ul>
      <h2>Retention</h2>
      <p>
        Account data is retained while your account is active. Booking + payment records are kept
        for 7 years per tax law. Location pings are deleted 30 days after the task ends.
      </p>
      <h2>Contact</h2>
      <p>
        Privacy officer: <a href="mailto:privacy@helpward.com">privacy@helpward.com</a>
      </p>
    </MarketingShell>
  );
}
