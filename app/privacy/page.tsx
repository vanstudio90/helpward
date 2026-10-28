import Link from "next/link";
import type { Metadata } from "next";
import {
  ShieldCheck, Ban, MicOff, DownloadCloud, Mail, MapPin, Clock,
} from "lucide-react";
import { MarketingShell } from "@/components/MarketingShell";
import { LEGAL_DOCS, formatLegalDate } from "@/lib/legal";
import { Section, Sub, Callout, List, Table } from "./sections";
import { Toc } from "./toc";

export const metadata: Metadata = {
  title: "Privacy Policy — Helpward",
  description:
    "What personal information Helpward collects, why, who receives it, how long we keep it, " +
    "and how to access, correct or delete it. We do not sell personal information.",
  alternates: { canonical: "/privacy" },
};

const SECTIONS = [
  { id: "collect", label: "Information we collect" },
  { id: "sources", label: "Where information comes from" },
  { id: "use", label: "How we use personal information" },
  { id: "visibility", label: "What other users can see" },
  { id: "disclose", label: "When we disclose information" },
  { id: "selling", label: "Selling information and advertising" },
  { id: "cookies", label: "Cookies and similar technologies" },
  { id: "international", label: "International processing" },
  { id: "retention", label: "How long we keep information" },
  { id: "choices", label: "Your choices and privacy requests" },
  { id: "california", label: "For California residents" },
  { id: "canada", label: "For Canadian users" },
  { id: "requests", label: "How we handle requests" },
  { id: "security", label: "Security" },
  { id: "children", label: "Children" },
  { id: "changes", label: "Changes to this policy" },
  { id: "contact", label: "Contact our Privacy Officer" },
];

/** The four promises a reader most wants, before seventeen sections of detail. */
const AT_A_GLANCE = [
  { icon: Ban, title: "We don't sell your information",
    body: "No sale, and no sharing for cross-context behavioural advertising." },
  { icon: MicOff, title: "We don't record calls",
    body: "In-app audio is never recorded or transcribed by Helpward." },
  { icon: DownloadCloud, title: "Export or delete, yourself",
    body: "Both are self-service in Settings, with a 30-day window to undo a deletion." },
  { icon: MapPin, title: "Exact addresses stay hidden",
    body: "Helpers see an area when deciding whether to accept — never your door until they have." },
];

export default function Privacy() {
  const doc = LEGAL_DOCS.privacy;

  return (
    <MarketingShell
      title="Privacy Policy"
      subtitle={`Last updated ${formatLegalDate(doc.updated)}`}
      width="wide"
      prose={false}
      hero={
        <>
          <p className="mt-5 text-lg leading-relaxed text-slate-700 max-w-3xl">
            HELPWARD operates helpward.com, a platform connecting customers with independent
            helpers who provide services. This policy explains what we collect, why, who
            receives it, how we protect it, and the choices you have. It applies to visitors,
            customers, helpers, applicants, and anyone who contacts us.
          </p>

          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {AT_A_GLANCE.map(({ icon: Icon, title, body }) => (
              <div key={title} className="rounded-2xl border border-slate-200 bg-white p-4">
                <span className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-brand-50 text-brand-600">
                  <Icon className="w-4.5 h-4.5" aria-hidden="true" />
                </span>
                <div className="mt-3 text-sm font-bold text-slate-900">{title}</div>
                <p className="mt-1 text-[13px] leading-relaxed text-slate-600">{body}</p>
              </div>
            ))}
          </div>
        </>
      }
    >
      <div className="mt-12 lg:grid lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-12">
        <Toc items={SECTIONS} />

        <div className="space-y-14 min-w-0">
          <Section id="collect" n={1} title="Information we collect">
            <p>
              What we collect depends on how you use Helpward. Browsing the site, booking a
              service, and working as a helper involve different information.
            </p>

            <Sub title="Account and profile">
              <List items={[
                "Your name, email address and telephone number.",
                "Sign-in credentials and authentication records.",
                "Your profile photo and anything you choose to add to your profile.",
                "Country, preferred language, currency and time zone.",
                "Saved addresses, favourite services or helpers, and account preferences.",
                "Notification and communication settings.",
              ]} />
              <p>
                Our authentication provider processes what is needed to create your account,
                verify you at sign-in, and keep the account secure.
              </p>
            </Sub>

            <Sub title="Requests and bookings">
              <List items={[
                "The service requested and the answers given in its booking form.",
                "Collection, service and delivery addresses.",
                "Requested dates, times, durations, quantities and staffing requirements.",
                "Access instructions and other details needed to perform the task.",
                "Booking notes, changes, cancellations and completion information.",
                "Photos, inspection reports, delivery instructions and other task materials.",
                "Reviews, ratings, disputes, refund requests and related evidence.",
              ]} />
              <Callout tone="warn" title="Please share only what the task needs">
                Avoid putting passwords, full payment-card numbers, government identification
                numbers or unrelated sensitive details into booking notes, messages or photos.
                If you provide information about someone else — a recipient&rsquo;s name,
                address or delivery instructions — you are responsible for having a proper
                basis to share it.
              </Callout>
            </Sub>

            <Sub title="Helper applications">
              <p>If you apply to provide services, we collect what is needed to assess the application and run your helper account:</p>
              <List items={[
                "Contact details, service areas, availability and services offered.",
                "Experience, qualifications, profile information and supporting materials.",
                "Identity-verification information, verification status and relevant screening information.",
                "Information about your eligibility to receive payouts.",
                "Booking history, earnings, ratings and performance records.",
              ]} />
              <p>
                Where verification or screening involves another organisation, further notices
                or authorisations may be provided during that process. What we receive back may
                include results, report references and status updates.
              </p>
            </Sub>

            <Sub title="Payments and payouts">
              <p>
                Stripe processes customer payments and helper payouts. Information submitted
                through Stripe-powered forms may include card details, bank-account information,
                billing details, and identity or tax information Stripe requires.
              </p>
              <p>Helpward receives what it needs to manage transactions:</p>
              <List items={[
                "Stripe customer, payment-method, payment and connected-account references.",
                "Card brand, expiration information and last four digits.",
                "Transaction amounts, currencies, authorisation and payment status.",
                "Tips, refunds, fees and payout information.",
                "Verification and payout-readiness status.",
              ]} />
              <Callout tone="good" title="Card numbers never reach our servers">
                Helpward does not store complete card numbers or security codes on its
                application servers. Stripe&rsquo;s own privacy notice also governs how it
                handles information.
              </Callout>
            </Sub>

            <Sub title="Messages, support and calls">
              <p>
                We collect messages exchanged through Helpward and what you provide when
                contacting support. For in-app audio calls we process what is needed to
                establish and manage the connection: participant identifiers, signalling
                information, call status, timestamps and duration.
              </p>
              <Callout tone="good" title="Helpward does not record or transcribe in-app calls">
                Calls use browser-based communication technology. Establishing a direct
                connection can reveal network information, including an IP address, to the other
                participant and to the services that help connect the call. Other participants
                may keep what you share with them, so take care with sensitive matters.
              </Callout>
            </Sub>

            <Sub title="Location">
              <p>
                We collect addresses and their coordinates to check service availability, match
                requests with nearby helpers, calculate distances and support bookings. If you
                use a device-location feature, your browser asks permission before providing
                precise location.
              </p>
              <p>
                For helpers, location features may collect updated coordinates while you are
                available for work or performing a task — depending on the feature and device,
                including accuracy, heading, speed and timestamps.
              </p>
              <p>
                Turning off the permission stops future collection through it. It does not
                remove addresses or location records already attached to your account or
                bookings.
              </p>
            </Sub>

            <Sub title="Website, device and technical">
              <List items={[
                "IP addresses and the approximate location derived from them.",
                "Browser, operating-system and device information.",
                "Pages requested, interaction events, timestamps and referring pages.",
                "Session identifiers, authentication cookies and saved preferences.",
                "Error reports, security events and operational logs.",
                "Push-notification subscription identifiers, if you enable push.",
              ]} />
            </Sub>
          </Section>

          <Section id="sources" n={2} title="Where information comes from">
            <List items={[
              "Directly from you — creating an account, completing forms, uploading materials, messaging, or contacting us.",
              "Automatically, when you use the website, location features or calling features.",
              "From other users involved in a request or booking.",
              "From payment, verification, screening, hosting, communication and other service providers.",
              "From reports, complaints, disputes and information submitted to protect users or investigate misuse.",
            ]} />
          </Section>

          <Section id="use" n={3} title="How we use personal information">
            <div className="grid gap-x-8 gap-y-2 sm:grid-cols-2">
              <List items={[
                "Create and maintain accounts.",
                "Review helper applications and manage eligibility.",
                "Check whether an address is in a supported service area.",
                "Match requests with eligible helpers.",
                "Present offers, manage schedules, coordinate bookings.",
                "Calculate prices, fees and payment amounts.",
                "Process authorisations, charges, tips, refunds and payouts.",
              ]} />
              <List items={[
                "Provide messaging, calls, notifications, receipts and support.",
                "Collect reviews and manage public helper profiles.",
                "Investigate complaints, disputes, suspected fraud and safety incidents.",
                "Protect accounts, prevent abuse and maintain security.",
                "Diagnose problems and improve usability and reliability.",
                "Maintain business, accounting, legal and compliance records.",
                "Respond to privacy requests and meet legal obligations.",
              ]} />
            </div>
            <Callout title="Automated decisions">
              Some of this runs on automated rules — checking service boundaries, deciding which
              helpers are eligible for an offer, calculating a price from the details you chose.
              If you think an automated result is wrong, contact us and we will review it.
            </Callout>
            <p>
              We do not treat this policy as permission to collect unrelated information or to
              use information for an incompatible purpose.
            </p>
          </Section>

          <Section id="visibility" n={4} title="What other users can see">
            <Sub title="Before a helper accepts">
              <p>
                Eligible helpers receive what they need to decide: the service, timing,
                approximate area, price or earnings, and relevant requirements.
              </p>
              <Callout tone="good" title="Exact addresses are withheld at the offer stage">
                Precise addresses and sensitive access instructions become available only after
                a helper accepts. Avoid putting an exact address, gate code or telephone number
                into a general notes field that is not meant for it.
              </Callout>
            </Sub>
            <Sub title="After a booking is accepted">
              <p>
                The customer and the accepted helper receive what they need to coordinate and
                complete the booking — names, profile details, task instructions, exact
                addresses, booking materials and contact options, depending on the service.
                Telephone links and live-location features are limited to the booking that
                provides them.
              </p>
              <p>
                Booking information may remain in each participant&rsquo;s history for
                recordkeeping, support or disputes. What another participant has already seen or
                copied cannot necessarily be recalled once a booking ends.
              </p>
            </Sub>
            <Sub title="Profiles, reviews and portfolio photos">
              <p>
                Helper profiles and published reviews may be visible to other users and to
                visitors. A helper may feature eligible completed-task photos in a public
                portfolio; customers can remove portfolio visibility for photos from their own
                bookings using the available controls, or by contacting us.
              </p>
              <p>
                Do not publish photographs, captions, reviews or profile details that reveal
                someone else&rsquo;s private information without permission. Write to{" "}
                <a href="mailto:privacy@helpward.com">privacy@helpward.com</a> if you believe
                content exposes yours improperly.
              </p>
            </Sub>
          </Section>

          <Section id="disclose" n={5} title="When we disclose information">
            <Sub title="Customers, helpers and other participants">
              <p>What is needed to request, accept, coordinate, perform and document a service, as described above.</p>
            </Sub>
            <Sub title="Service providers">
              <Table
                head={["Provider", "What they do for Helpward"]}
                rows={[
                  ["Supabase", "Application data, authentication, storage and related infrastructure."],
                  ["Vercel", "Website hosting and delivery."],
                  ["Stripe", "Payments, payouts and related verification."],
                  ["Mapbox", "Address search, geocoding and mapping."],
                  ["Resend, OneSignal", "Email and push notifications, where those features are enabled."],
                  ["Google STUN", "Helps browser-based calls establish a connection."],
                  ["Verification, screening, support and professional advisers", "Where needed for their identified purposes."],
                ]}
              />
              <p>
                Providers receive what is relevant to the work they do. Some also process
                information for their own legal, security or regulatory obligations under their
                own privacy notices.
              </p>
            </Sub>
            <Sub title="Legal, safety and disputes">
              <p>We may disclose relevant information where reasonably necessary to:</p>
              <List items={[
                "Comply with applicable law, a valid legal demand or binding legal process.",
                "Investigate fraud, threats, unlawful activity or violations of our terms.",
                "Protect the rights, safety or property of users, Helpward or others.",
                "Resolve a complaint, insurance matter, payment dispute or legal claim.",
                "Obtain advice from legal, accounting, insurance or other professional advisers.",
              ]} />
              <p>A request from another person or organisation does not automatically entitle them to your information.</p>
            </Sub>
            <Sub title="Business transactions and at your direction">
              <p>
                If Helpward is involved in a merger, acquisition, financing, reorganisation or
                sale of assets, relevant information may be disclosed to the parties and advisers
                involved, subject to confidentiality and legal requirements. We will give any
                notice required if responsibility for your information changes. We also disclose
                information when you ask us to.
              </p>
            </Sub>
          </Section>

          <Section id="selling" n={6} title="Selling information and advertising">
            <Callout tone="good" title="We do not sell personal information">
              We also do not share personal information for cross-context behavioural
              advertising, and we do not give booking messages, precise task locations or
              payment details to advertisers for their own advertising purposes.
            </Callout>
            <p>
              Disclosing information to a provider so it can process a payment, deliver a
              notification or operate the service is a different thing from selling it to an
              advertiser.
            </p>
            <p>
              If our advertising practices ever change, we will update these notices and provide
              any choice or consent required before starting.
            </p>
          </Section>

          <Section id="cookies" n={7} title="Cookies and similar technologies">
            <p>
              Helpward uses cookies and similar browser storage to keep you signed in, protect
              accounts, remember preferences and support site functionality. Our infrastructure
              and providers may also use technologies needed to deliver their services, detect
              fraud and maintain security.
            </p>
            <p>
              You can manage cookies in your browser. Blocking or deleting essential cookies may
              sign you out or stop parts of Helpward working. Push notifications need a separate
              browser or device permission, which you can revoke in those settings.
            </p>
            <p>
              Browser &ldquo;Do Not Track&rdquo; signals do not change essential site operation.
              Global Privacy Control is a separate signal — and because we neither sell personal
              information nor share it for cross-context behavioural advertising, there is
              currently no such activity for it to opt you out of.
            </p>
          </Section>

          <Section id="international" n={8} title="International processing">
            <p>
              Helpward is operated from the United States and serves users in the United States
              and Canada. Personal information may be stored, accessed or processed in those
              countries and others where our providers operate. Privacy laws and
              government-access rules differ between countries.
            </p>
            <p>
              We remain responsible for information under our control and use appropriate
              contractual, organisational and technical measures with providers. Canadian
              guidance explains that an organisation stays accountable for information
              transferred to a provider for processing — see the{" "}
              <a
                href="https://www.priv.gc.ca/en/privacy-topics/airports-and-borders/gl_dab_090127/"
                target="_blank" rel="noopener noreferrer"
                className="text-brand-700 underline font-semibold"
              >
                Privacy Commissioner of Canada&rsquo;s guidance on cross-border processing
              </a>.
            </p>
          </Section>

          <Section id="retention" n={9} title="How long we keep information">
            <p>Retention depends on the type of information, why it was collected, and what the law requires.</p>
            <Table
              head={["Information", "How long"]}
              rows={[
                ["Account and profile", "While needed to provide and secure your account, then assessed for deletion or anonymisation when the account closes."],
                ["Bookings, messages, reports and photos", "While needed to provide the service and handle support, disputes, safety matters, fraud prevention or legal claims."],
                ["Payment, payout, accounting and tax records", "For the periods required by applicable financial, tax and recordkeeping obligations."],
                ["Precise location updates and call-connection records", "While needed for their operational purpose, security, or investigating a specific incident."],
                ["Verification and screening", "According to the purpose of the review, applicable requirements, and the practices of the organisation holding the underlying records."],
                ["Security logs and privacy-request records", "While needed to protect the platform and show how a request or incident was handled."],
              ]}
            />
            <p>
              We may keep information longer where a specific dispute, investigation, legal hold
              or legal obligation requires it, and we follow any legal requirement to retain
              information used to make a decision about someone.
            </p>
            <p>
              When information is no longer needed it is deleted or anonymised. Backup copies may
              persist until they are overwritten or expire on their backup cycle. Closing an
              account does not delete records that must be kept for a lawful purpose, or copies
              other booking participants already hold.
            </p>
          </Section>

          <Section id="choices" n={10} title="Your choices and privacy requests">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 p-4">
                <div className="text-sm font-bold text-slate-900">Access and copies</div>
                <p className="mt-1.5 text-[14px] text-slate-700">
                  Request a copy of what we hold, subject to applicable exceptions. Use{" "}
                  <Link href="/settings/data" className="text-brand-700 font-semibold underline">
                    Settings → Your data
                  </Link>{" "}
                  or email us.
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 p-4">
                <div className="text-sm font-bold text-slate-900">Corrections</div>
                <p className="mt-1.5 text-[14px] text-slate-700">
                  Update most details in Settings. Contact us for anything you cannot correct
                  yourself.
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 p-4">
                <div className="text-sm font-bold text-slate-900">Account deletion</div>
                <p className="mt-1.5 text-[14px] text-slate-700">
                  Request it in{" "}
                  <Link href="/settings/data" className="text-brand-700 font-semibold underline">
                    Settings → Your data
                  </Link>
                  . There is a 30-day recovery window during which you can cancel it; that window
                  never overrides a shorter period the law requires.
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 p-4">
                <div className="text-sm font-bold text-slate-900">Permissions</div>
                <p className="mt-1.5 text-[14px] text-slate-700">
                  Change location, microphone and push permissions in your browser or device.
                  Withdrawing one may stop the related feature working — a helper cannot be
                  matched to nearby work without location.
                </p>
              </div>
            </div>
            <p>
              You can manage notification preferences in your account. Promotional email carries
              an unsubscribe link; necessary account, security, payment and booking messages are
              still sent. Where we rely on your consent you can withdraw it at any time — that
              applies going forward and does not invalidate what lawfully happened before. We
              will tell you if withdrawing consent prevents us providing something you asked for.
            </p>
          </Section>

          <Section id="california" n={11} title="Additional information for California residents">
            <p>Where the California Consumer Privacy Act applies, residents may have rights to:</p>
            <List items={[
              "Know the categories and specific pieces of personal information collected.",
              "Know the sources, purposes and categories of recipients involved.",
              "Request deletion, subject to applicable exceptions.",
              "Correct inaccurate personal information.",
              "Opt out of the sale or sharing of personal information.",
              "Limit certain uses and disclosures of sensitive personal information.",
              "Exercise these rights without unlawful discrimination.",
            ]} />
            <p>
              The categories in this policy include identifiers; account and transaction
              information; internet and device activity; geolocation; professional information;
              and audio, visual or communication-related information. Depending on what you
              provide, sensitive information may include account credentials, precise
              geolocation, and relevant identity, financial, screening or private communication
              information. We use it for the operational, security, payment and service purposes
              described here — not to infer characteristics for advertising.
            </p>
            <Callout tone="good">
              Our collection and disclosures over the preceding 12 months, or the shorter period
              Helpward has operated, follow the categories, sources, purposes and recipients
              described above. <strong>We do not sell personal information or share it for
              cross-context behavioural advertising.</strong>
            </Callout>
            <p>
              Submit a request through the account controls above, by email to{" "}
              <a href="mailto:privacy@helpward.com">privacy@helpward.com</a>, or by writing to
              our Privacy Officer. An authorised agent may act for you; we may ask for evidence
              of their authority and verify your identity where permitted. See the{" "}
              <a href="https://oag.ca.gov/privacy/ccpa" target="_blank" rel="noopener noreferrer"
                 className="text-brand-700 underline font-semibold">Attorney General&rsquo;s CCPA guidance</a>{" "}
              and the{" "}
              <a href="https://cppa.ca.gov/regulations/pdf/ccpa_statute_eff_20260101.pdf"
                 target="_blank" rel="noopener noreferrer"
                 className="text-brand-700 underline font-semibold">CPPA regulations</a>.
            </p>
          </Section>

          <Section id="canada" n={12} title="Additional information for Canadian users">
            <p>
              Canadian users may have rights to access personal information, request corrections,
              withdraw consent where applicable, and challenge how an organisation handles
              information. Which law applies depends on the circumstances, including provincial
              rules and whether information crosses provincial or national borders. British
              Columbia&rsquo;s{" "}
              <a href="https://www.bclaws.gov.bc.ca/civix/document/id/complete/statreg/03063_01"
                 target="_blank" rel="noopener noreferrer"
                 className="text-brand-700 underline font-semibold">Personal Information Protection Act</a>{" "}
              sets requirements on access, correction, safeguards and retention.
            </p>
            <p>
              Please contact our Privacy Officer first so we can look into your concern. You may
              also contact the applicable regulator — the Office of the Information and Privacy
              Commissioner for British Columbia, or the Office of the Privacy Commissioner of
              Canada.
            </p>
          </Section>

          <Section id="requests" n={13} title="How we handle requests">
            <p>
              We may ask for what is reasonably needed to verify your identity, find the right
              records, and avoid disclosing information to the wrong person.
            </p>
            <Callout tone="warn" title="Don't send documents in your first email">
              You do not need to send identity documents or full payment details to start. If
              more verification is needed, we will explain how to provide it securely.
            </Callout>
            <p>
              We respond within the time the law requires. If an extension is permitted and
              needed, we will explain why and when to expect a reply. Some requests are limited
              by legal obligations, another person&rsquo;s privacy, security requirements or
              other exceptions — we will explain a refusal or limitation where required, and we
              will not unlawfully discriminate against you for asking.
            </p>
          </Section>

          <Section id="security" n={14} title="Security">
            <p>
              We use technical, organisational and administrative measures designed to protect
              personal information, including access controls and protections provided by our
              infrastructure and payment providers. Access is limited according to operational
              responsibilities and what the service needs.
            </p>
            <Callout tone="warn">
              No website, device or transmission method is completely secure. Protect your
              sign-in credentials, use the account-security features available, and contact us if
              you suspect unauthorised access. If an incident creates a legal notification
              obligation, we will notify affected people and authorities as required.
            </Callout>
          </Section>

          <Section id="children" n={15} title="Children">
            <p>
              Helpward accounts are for people aged 18 or older, and we do not knowingly permit
              children to create one. An adult may provide limited information about another
              person where reasonably necessary for a permitted service, provided they have the
              authority to do so and share no more than needed.
            </p>
            <p>
              If you believe a child has created an account or provided information improperly,
              contact <a href="mailto:privacy@helpward.com">privacy@helpward.com</a>.
            </p>
          </Section>

          <Section id="changes" n={16} title="Changes to this policy">
            <p>
              We update this policy when our services, information practices or legal obligations
              change. The &ldquo;Last updated&rdquo; date identifies the current version, and we
              give additional notice of material changes where required. If a new use of
              information requires consent, we will obtain it before starting.
            </p>
          </Section>

          <Section id="contact" n={17} title="Contact our Privacy Officer">
            <div className="rounded-2xl border border-brand-200 bg-brand-50/70 p-5 sm:p-6">
              <div className="flex flex-wrap gap-8">
                <div>
                  <div className="flex items-center gap-2 text-sm font-bold text-brand-900">
                    <Mail className="w-4 h-4" aria-hidden="true" /> Email
                  </div>
                  <a href="mailto:privacy@helpward.com"
                     className="mt-1 block text-brand-800 font-semibold underline">
                    privacy@helpward.com
                  </a>
                </div>
                <div>
                  <div className="flex items-center gap-2 text-sm font-bold text-brand-900">
                    <MapPin className="w-4 h-4" aria-hidden="true" /> Mail
                  </div>
                  <address className="mt-1 not-italic text-[15px] leading-relaxed text-brand-900/90">
                    Privacy Officer<br />
                    HELPWARD<br />
                    7770 Regents Road<br />
                    San Diego, CA 92122<br />
                    United States
                  </address>
                </div>
                <div>
                  <div className="flex items-center gap-2 text-sm font-bold text-brand-900">
                    <Clock className="w-4 h-4" aria-hidden="true" /> Response
                  </div>
                  <p className="mt-1 text-[15px] text-brand-900/90 max-w-xs">
                    Within the time applicable law requires. We will explain any permitted
                    extension.
                  </p>
                </div>
              </div>
            </div>
          </Section>

          <div className="pt-4 border-t border-slate-100 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <span className="inline-flex items-center gap-1.5 text-slate-500">
              <ShieldCheck className="w-4 h-4" aria-hidden="true" />
              Last updated {formatLegalDate(doc.updated)}
            </span>
            <Link href="/terms" className="text-brand-700 font-semibold hover:underline">Terms of Service</Link>
            <Link href="/safety" className="text-brand-700 font-semibold hover:underline">Safety</Link>
            <Link href="/help" className="text-brand-700 font-semibold hover:underline">Help centre</Link>
          </div>
        </div>
      </div>
    </MarketingShell>
  );
}
