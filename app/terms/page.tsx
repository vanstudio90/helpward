import Link from "next/link";
import type { Metadata } from "next";
import {
  Scale, Percent, Ban, HandCoins, Mail, MapPin, ShieldCheck,
} from "lucide-react";
import { MarketingShell } from "@/components/MarketingShell";
import { LEGAL_DOCS, formatLegalDate } from "@/lib/legal";
import { Section, Sub, Callout, List, Table } from "@/components/legal/sections";
import { Toc } from "@/components/legal/toc";

export const metadata: Metadata = {
  title: "Terms of Service — Helpward",
  description:
    "The rules for using Helpward, requesting services and providing them: pricing and fees, " +
    "payment authorisation, cancellations, refunds, payouts and how disagreements are resolved.",
  alternates: { canonical: "/terms" },
};

const SECTIONS = [
  { id: "what", label: "What Helpward does" },
  { id: "who", label: "Who can use Helpward" },
  { id: "account", label: "Your account and security" },
  { id: "booking", label: "Requests, matching and confirmation" },
  { id: "customers", label: "Customer responsibilities" },
  { id: "helpers", label: "Helper responsibilities" },
  { id: "scope", label: "Service scope and safety" },
  { id: "prices", label: "Prices, currencies and fees" },
  { id: "changes-scope", label: "Scope changes and extra work" },
  { id: "payment", label: "Payment authorisation and charging" },
  { id: "tips", label: "Tips" },
  { id: "cancellations", label: "Cancellations and no-shows" },
  { id: "refunds", label: "Refunds and service disputes" },
  { id: "payouts", label: "Helper payouts and taxes" },
  { id: "recurring", label: "Recurring bookings" },
  { id: "communications", label: "Messages, calls, photos, reports" },
  { id: "content", label: "Reviews and user content" },
  { id: "verification", label: "Verification and insurance" },
  { id: "prohibited", label: "Prohibited activity" },
  { id: "termination", label: "Restrictions and termination" },
  { id: "availability", label: "Availability and responsibility" },
  { id: "complaints", label: "Complaints and disagreements" },
  { id: "law", label: "Governing law" },
  { id: "updates", label: "Changes to these Terms" },
  { id: "general", label: "General provisions" },
  { id: "contact", label: "Contact" },
];

/** The four things people most need to know before agreeing. */
const AT_A_GLANCE = [
  { icon: Percent, title: "80% goes to your helper",
    body: "Helpward keeps 20% of the subtotal plus a flat $4.50 fee. Tips are 100% the helper's." },
  { icon: HandCoins, title: "Charged on completion",
    body: "Your card is held when a helper accepts and charged when the task is marked complete." },
  { icon: Ban, title: "No cancellation fee",
    body: "We don't charge one today, and we won't add one retrospectively to an existing booking." },
  { icon: Scale, title: "No forced arbitration",
    body: "These Terms don't require arbitration or waive class or collective proceedings." },
];

export default function Terms() {
  const doc = LEGAL_DOCS.terms;

  return (
    <MarketingShell
      title="Terms of Service"
      subtitle={`Last updated ${formatLegalDate(doc.updated)}`}
      width="wide"
      prose={false}
      hero={
        <>
          <p className="mt-5 text-lg leading-relaxed text-slate-700 max-w-3xl">
            These Terms explain the rules for using Helpward, requesting services and providing
            them. By creating an account, submitting a request, accepting a booking, or
            otherwise accepting these Terms through the platform, you agree to them.
          </p>
          <Callout tone="good" title="Nothing here removes a right you cannot legally waive">
            Nothing in these Terms excludes rights, remedies or protections that cannot lawfully
            be excluded — including non-excludable consumer guarantees, employment and
            workplace-safety protections, and liability for fraud or personal injury. Our{" "}
            <Link href="/privacy">Privacy Policy</Link> explains how we handle personal
            information; it does not replace these Terms or remove privacy rights you hold.
          </Callout>

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

          <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-[14px] text-slate-700">
            <strong className="text-slate-900">Who these words mean.</strong>{" "}
            &ldquo;Helpward,&rdquo; &ldquo;we,&rdquo; &ldquo;us&rdquo; and &ldquo;our&rdquo; are
            HELPWARD, 7770 Regents Road, San Diego, CA 92122, United States.{" "}
            <strong className="text-slate-900">Customer</strong> means a person requesting a
            service. <strong className="text-slate-900">Helper</strong> means a person or
            business offering or performing one.
          </div>
        </>
      }
    >
      <div className="mt-12 lg:grid lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-12">
        <Toc items={SECTIONS} />

        <div className="space-y-14 min-w-0">
          <Section id="what" n={1} title="What Helpward does">
            <p>
              Helpward provides tools that let Customers and Helpers find one another, arrange
              services, communicate, manage bookings and process payments. Customers and Helpers
              are responsible for the arrangements they make — the agreed task, timing, access
              requirements and conduct during the booking.
            </p>
            <Callout>
              Helpward remains responsible for its own platform services and obligations under
              applicable law. Describing Helpward as a marketplace does not exclude
              responsibilities that legally apply to us.
            </Callout>
            <p>
              Available services depend on location, Helper availability, qualifications and
              other booking requirements. A service appearing in the catalogue does not guarantee
              a Helper is available for every address or requested time.
            </p>
          </Section>

          <Section id="who" n={2} title="Who can use Helpward">
            <p>You must:</p>
            <List items={[
              "Be at least 18 years old.",
              "Be legally able to enter into the relevant agreement.",
              "Provide accurate account information.",
              "Have authority to use the payment method, address, property, vehicle or other resources involved in a booking.",
              "Use Helpward only for lawful purposes.",
            ]} />
            <p>
              If you use Helpward for a business or another person, you must have authority to act
              for them. You may not create accounts to impersonate someone, evade a suspension,
              manipulate reviews or conceal fraudulent activity.
            </p>
          </Section>

          <Section id="account" n={3} title="Your account and security">
            <p>
              You are responsible for protecting your sign-in credentials and keeping your contact
              details current. Do not share an account in a way that misrepresents who is
              requesting or performing a service, and Helpers must not let an unapproved person
              work under their account.
            </p>
            <p>
              Tell us promptly if you suspect unauthorised access. We may require reasonable
              verification to protect an account, investigate suspicious activity, or meet payment
              and legal requirements.
            </p>
            <Callout tone="good">
              You are not automatically responsible for every action taken through a compromised
              account. Responsibility depends on the circumstances and applicable law.
            </Callout>
          </Section>

          <Section id="booking" n={4} title="Requests, matching and booking confirmation">
            <p>
              Submitting a request asks Helpward to find an eligible Helper. It does not mean
              anyone has accepted or started the task. Before submitting, review:
            </p>
            <div className="grid gap-x-8 sm:grid-cols-2">
              <List items={[
                "The selected service.",
                "The resolved service or collection address.",
                "Any destination or delivery address.",
                "The requested date and time.",
              ]} />
              <List items={[
                "Duration, quantities, staffing and other answers.",
                "The price, currency, service fee and payment explanation.",
                "Access instructions and relevant safety information.",
              ]} />
            </div>
            <Callout tone="warn" title="Check the whole resolved address">
              Similar street names, directional words and multiple entrances identify different
              places. If we ask you to confirm or choose an address, read all of it.
            </Callout>
            <Callout title="Work does not start before payment is in place">
              A Helper must not begin paid work until the platform shows the required payment
              authorisation and booking prerequisites are satisfied.
            </Callout>
            <p>
              A booking confirmation records the arrangement shown in the platform. It does not
              guarantee an exact arrival time, uninterrupted connectivity, or an outcome beyond
              the agreed service.
            </p>
          </Section>

          <Section id="customers" n={5} title="Customer responsibilities">
            <p>Customers must:</p>
            <List items={[
              "Describe the task accurately and provide the required information.",
              "Select a suitable duration, quantity and number of Helpers.",
              "Disclose access restrictions, hazards, animals, heavy items and other material conditions.",
              "Obtain permission from property owners, occupants, recipients or others affected.",
              "Provide a reasonably safe environment.",
              "Be reachable through the agreed method when needed.",
              "Treat Helpers respectfully.",
              "Pay the amounts properly agreed and due.",
            ]} />
            <p>
              Do not ask a Helper to perform materially different work without arranging an
              appropriate change, and do not pressure anyone to ignore safety requirements,
              licensing rules, platform payment controls or personal boundaries. If the task
              cannot be performed as described, contact the Helper and Helpward promptly.
            </p>
          </Section>

          <Section id="helpers" n={6} title="Helper responsibilities">
            <p>Helpers must:</p>
            <div className="grid gap-x-8 sm:grid-cols-2">
              <List items={[
                "Provide accurate profile, application, qualification and availability information.",
                "Accept only work they can perform safely and lawfully.",
                "Hold any licences, permissions, registrations or insurance the work requires.",
                "Review the task requirements before accepting.",
                "Keep availability and relevant location information current.",
              ]} />
              <List items={[
                "Attend accepted bookings, or communicate a problem promptly.",
                "Protect Customers' property, information, keys and access codes.",
                "Provide required reports or completion evidence honestly.",
                "Mark a task started or complete only when that is what happened.",
                "Follow applicable safety, employment, tax and business requirements.",
              ]} />
            </div>
            <p>
              Helpers may decline requests. Accepting one creates responsibilities to the Customer
              and to Helpward. Helpers must not arrange undisclosed substitutions or bring
              unapproved additional workers, and where a service requires a crew, the staffing
              must be in place before work begins.
            </p>
            <Sub title="Working relationship">
              <p>
                Helpers generally offer services as independent service providers and choose which
                available requests to accept.
              </p>
              <Callout tone="good" title="A label does not decide employment status">
                Employment status and related rights depend on applicable law and the actual
                working relationship. These Terms do not determine that status merely by using a
                particular label, and nothing here waives minimum-wage, employment,
                workplace-safety, workers&rsquo; compensation or other protections that legally
                apply.
              </Callout>
            </Sub>
          </Section>

          <Section id="scope" n={7} title="Service scope and safety">
            <p>
              A booking covers the service and requirements agreed through Helpward. A notes field
              cannot expand a service into work the platform does not support, or work that would
              be unlawful.
            </p>
            <Sub title="Work requiring professional qualifications">
              <p>
                Do not request or perform regulated work without the required qualifications and
                authorisation. A general property check, task report, companionship session or
                practical assistance service is not automatically a licensed inspection, medical
                service, legal service, therapy or other regulated professional service. If you
                need a particular certification, confirm it before booking and before work begins.
              </p>
            </Sub>
            <Sub title="Driving and vehicles">
              <p>
                Vehicle tasks require appropriate licences, insurance, permission to use the
                vehicle, and compliance with local transport law. Customers must disclose material
                vehicle requirements, including transmission type where asked, and must not provide
                an unsafe or unlawfully operated vehicle. Neither party may use a booking to avoid
                requirements that legally apply to passenger transport or commercial vehicle
                services.
              </p>
            </Sub>
            <Sub title="Delivery and errands">
              <p>
                Provide accurate collection and destination details and describe the items. You
                must not request delivery or purchase of prohibited, unlawfully obtained,
                dangerous or undisclosed restricted items. Do not include cash, unusually valuable
                property, hazardous materials or age-restricted goods unless the service expressly
                supports them and all legal requirements are met. Requests remain subject to the
                route, distance, item and service restrictions applied during booking.
              </p>
            </Sub>
            <Sub title="Companionship and personal boundaries">
              <Callout tone="warn" title="Companionship services are non-sexual">
                Any physical contact requires clear, ongoing consent from everyone involved. A
                booking, a payment or a prior agreement does not remove anyone&rsquo;s right to
                refuse or end physical contact. Either person may stop an interaction that feels
                unsafe, inappropriate or outside the agreed boundaries, and payment questions go
                through Helpward rather than through pressure to continue.
              </Callout>
              <p>
                Companionship and listening services are not emergency response and not a
                substitute for qualified healthcare.
              </p>
            </Sub>
            <Sub title="Emergencies">
              <Callout tone="warn">
                Helpward is not an emergency service. If there is an immediate threat to
                someone&rsquo;s safety, contact the appropriate emergency services.
              </Callout>
            </Sub>
          </Section>

          <Section id="prices" n={8} title="Prices, currencies and service fees">
            <p>
              The booking flow shows the price and currency for the selected service and confirmed
              pickup or service location. <strong>US$ means United States dollars. CA$ means
              Canadian dollars.</strong> Your payment provider may apply its own conversion rate
              or foreign-transaction fee, separate from Helpward&rsquo;s displayed price.
            </p>
            <p>
              Prices may depend on duration, quantity, crew size or other selected requirements. A
              &ldquo;From&rdquo; price is the starting price for the stated service unit — review
              the final booking summary for your own requirements.
            </p>
            <Sub title="Current fee structure">
              <Table
                head={["Who", "Gets what"]}
                rows={[
                  ["Customer pays", "The service subtotal plus the displayed Helpward service fee."],
                  ["Service fee", <>US$4.50 on USD bookings, CA$4.50 on CAD bookings. Retained by Helpward.</>],
                  ["Helper", <><strong>80% of the service subtotal</strong>, plus 100% of any tip.</>],
                  ["Helpward", <><strong>20% of the service subtotal</strong>, plus the service fee.</>],
                  ["Crew bookings", "The Helper allocation may be split among participating Helpers per the crew arrangement shown or agreed."],
                ]}
              />
              <p>
                Tips are separate and allocated entirely to the Helper, subject to any applicable
                refund or payment reversal. Required taxes or additional charges collected through
                Helpward are disclosed in the booking total.
              </p>
              <Callout tone="good">
                Fee changes apply prospectively. We will not silently change the agreed price of an
                existing booking.
              </Callout>
            </Sub>
          </Section>

          <Section id="changes-scope" n={9} title="Scope changes and additional work">
            <p>
              If the task changes, discuss it before additional work begins. Extra time, additional
              items, different destinations, more workers or a materially different service may
              require a revised booking or help from Helpward.
            </p>
            <Callout tone="warn">
              A private conversation does not change the amount Helpward is authorised to charge.
              Do not assume a Helper has agreed to work beyond the booked scope, or that a Customer
              has agreed to an additional charge. Any extra payment needs a clear basis and a
              supported process.
            </Callout>
          </Section>

          <Section id="payment" n={10} title="Payment authorisation and charging">
            <p>
              Payments are processed through Stripe. By confirming a booking and its payment
              details, you authorise Helpward and its payment provider to process the amounts
              disclosed and agreed for that booking.
            </p>
            <Sub title="When a Helper accepts">
              <p>
                Helpward attempts to authorise the booking amount on your payment method. An
                authorisation is a temporary hold — it may reduce your available balance even
                though nothing has been captured. Your bank may require an extra authentication
                step, so complete any &ldquo;Confirm your card&rdquo; action shown in the booking.
                Work should not begin while that remains incomplete.
              </p>
            </Sub>
            <Sub title="When the task is completed">
              <p>
                Helpward normally captures the authorised payment when the task is marked complete
                through the applicable workflow.
              </p>
              <Callout title="Capture does not wait for a 24-hour approval period">
                A completion status does not remove your right to report incomplete work, an
                incorrect charge or another service problem.
              </Callout>
              <p>
                If payment processing fails after work is completed, the issue may need review. A
                technical failure does not automatically mean a valid payment obligation has
                disappeared.
              </p>
            </Sub>
            <Sub title="Holds are not escrow">
              <p>
                A card authorisation is not an escrow account, a deposit account, or a guarantee
                that funds are immediately available to the Helper. The timing and display of
                holds, charges and releases depend partly on Stripe, the card networks and your
                bank.
              </p>
            </Sub>
            <Sub title="Payment problems">
              <p>
                Keep your payment details current. If a payment fails, follow the instructions in
                the booking or contact us. We will not use these Terms as authorisation for
                unrelated charges or undisclosed penalties.
              </p>
            </Sub>
          </Section>

          <Section id="tips" n={11} title="Tips">
            <p>
              Tips are optional. If you send one, the platform shows a confirmation before
              submitting the separate tip charge. Once charged, a tip cannot be edited through the
              booking controls — contact us if you made a mistake or believe it was unauthorised.
            </p>
            <Callout tone="warn">
              A refund of the service payment does not automatically refund a separately charged
              tip; that is considered separately. Nothing here limits your rights relating to an
              unauthorised or legally refundable payment.
            </Callout>
          </Section>

          <Section id="cancellations" n={12} title="Cancellations, no-shows and interruptions">
            <p>Cancel through the booking controls where available, rather than relying on a message alone.</p>
            <Sub title="Before a Helper accepts">
              <p>You may cancel a pending request. No service payment is captured merely because you submitted an unmatched request.</p>
            </Sub>
            <Sub title="After acceptance, before capture">
              <p>
                Helpward attempts to cancel the payment authorisation. Your bank determines when
                the released hold disappears from your balance or statement.
              </p>
              <Callout tone="good" title="Helpward does not currently apply a cancellation fee">
                And we will not introduce one retrospectively for a booking made without that fee
                being clearly disclosed.
              </Callout>
            </Sub>
            <Sub title="If work has already begun">
              <p>
                Contact us promptly. We may need to review work already performed, why the task
                stopped, any safety concerns, and what payment is legally due. We will not
                automatically treat every interrupted task as fully completed. Do not use
                cancellation or completion controls to create a false record of what happened.
              </p>
            </Sub>
            <Sub title="Helper cancellation or no-show">
              <p>
                Helpers should cancel promptly if they cannot attend. A cancelled or missed booking
                does not guarantee another Helper is available; Customers may submit a new request.
                Repeated or serious reliability problems may lead to account review.
              </p>
            </Sub>
            <Sub title="Completed or captured bookings">
              <p>
                Cancelling a request is different from refunding a captured payment. If the payment
                has been captured, use the refund or support process.
              </p>
            </Sub>
          </Section>

          <Section id="refunds" n={13} title="Refunds and service disputes">
            <p>
              Contact us through the Help area and identify the booking. Explain the issue and
              provide relevant evidence — messages, photos, reports, or a description of work not
              performed. We may ask both parties for information and review the agreed task, the
              work performed, booking and communication records, completion materials, payment
              records, and applicable consumer rights.
            </p>
            <p>
              A refund may be full or partial depending on the circumstances. We will tell you the
              outcome and the amount. Approved refunds normally return through the original payment
              method; your bank controls when the credit becomes visible.
            </p>
            <Callout tone="good" title="You keep every other route open">
              Helpward&rsquo;s support decision does not prevent you using rights available through
              your bank, a regulator, a court or consumer law. Nothing in these Terms requires you
              to give up a lawful payment dispute or chargeback right.
            </Callout>
          </Section>

          <Section id="payouts" n={14} title="Helper payouts and taxes">
            <p>
              Helpers must complete the payout setup and verification the payment provider requires
              before receiving work that needs an active payout account. Availability and timing may
              depend on successful capture, the connected account&rsquo;s readiness, bank schedules,
              verification requirements, and refunds, disputes, reversals or lawful restrictions.
            </p>
            <Callout tone="warn">
              The amount shown as earned is not a promise of immediate bank availability.
            </Callout>
            <p>
              Refunds and reversals may require corresponding adjustments to the Helper allocation,
              subject to applicable law and the payment-provider agreement. We will not treat every
              payment problem as automatically the Helper&rsquo;s responsibility.
            </p>
            <p>
              Helpers are responsible for tax obligations that legally apply to their earnings or
              business. Helpward or its payment provider will provide tax reporting information
              when legally required; which form applies, and who issues it, depends on the rules
              and the payment arrangement. These Terms do not promise every Helper a particular
              tax form.
            </p>
          </Section>

          <Section id="recurring" n={15} title="Recurring bookings">
            <p>
              Review the schedule, service details, price basis and cancellation controls before
              confirming a recurring service. A recurring arrangement lets future occurrences be
              created on the schedule you chose; availability and payment requirements still apply
              to each one, and the same Helper is not guaranteed to accept every occurrence.
            </p>
            <Callout tone="warn">
              Cancelling one occurrence may not cancel the whole series. Use the series-management
              controls, or contact us, to stop future occurrences.
            </Callout>
            <p>
              Changes to future pricing or material recurring terms are communicated and handled
              per applicable law. Existing bookings will not be silently repriced.
            </p>
          </Section>

          <Section id="communications" n={16} title="Messages, calls, photos and reports">
            <p>
              Use Helpward communications to coordinate the booking respectfully and lawfully. Do
              not send threats, harassment, discriminatory abuse, unwanted sexual content,
              fraudulent requests, or information you have no authority to disclose. Do not record
              another person&rsquo;s call or conversation without any consent applicable law
              requires.
            </p>
            <Callout tone="warn" title="Completion records must be true">
              Photos, reports, messages and completion records must accurately represent the task.
              Do not manufacture proof of delivery, work, attendance or completion, and a Helper
              must not mark a report-based service complete before supplying the required report.
            </Callout>
            <p>
              Our <Link href="/privacy">Privacy Policy</Link> explains how communications and
              related information are handled.
            </p>
          </Section>

          <Section id="content" n={17} title="Reviews and user content">
            <p>
              You keep ownership of content you submit, subject to rights held by others. You give
              Helpward a non-exclusive licence to host, reproduce, transmit and display it as
              reasonably necessary to operate the features you use, provide support, maintain
              security and meet legal obligations.
            </p>
            <Callout tone="good">
              This licence does not give Helpward ownership of your content, or permission to use
              private booking materials in advertising.
            </Callout>
            <p>
              Reviews should reflect a genuine experience. Do not create fake reviews, buy
              misleading feedback, threaten a negative review to obtain a benefit, or disclose
              someone&rsquo;s private information. You may express an honest opinion, including
              criticism. We may remove content that breaks these Terms, is unlawful, exposes
              private information, or is unrelated to a genuine platform interaction. Public
              portfolio features must be used consistently with the Privacy Policy and any
              permissions the material requires.
            </p>
          </Section>

          <Section id="verification" n={18} title="Verification, qualifications and insurance">
            <Callout tone="warn" title="A verification status describes one process, not a person">
              It is not a guarantee about every aspect of someone&rsquo;s history, conduct,
              qualifications or future performance. Customers and Helpers should still review task
              suitability, relevant qualifications and safety requirements.
            </Callout>
            <p>
              Do not assume a booking includes insurance, a financial guarantee, or compensation
              for every loss unless specific coverage terms have been expressly provided. Where a
              task legally requires insurance or a professional licence, the responsible person
              must obtain and maintain it — these Terms do not replace that.
            </p>
          </Section>

          <Section id="prohibited" n={19} title="Prohibited activity">
            <p>You must not use Helpward to:</p>
            <div className="grid gap-x-8 sm:grid-cols-2">
              <List items={[
                "Request, offer or facilitate unlawful services.",
                "Arrange sexual services, or pressure someone into sexual or unwanted physical contact.",
                "Transport, obtain, conceal or distribute unlawful goods.",
                "Commit fraud, theft, harassment, stalking, threats or discrimination.",
                "Expose someone to an undisclosed or unreasonable safety risk.",
                "Evade required licensing, screening, insurance or age restrictions.",
              ]} />
              <List items={[
                "Submit false booking, payment, identity or completion information.",
                "Misuse another person's account, payment method, property or personal information.",
                "Interfere with the website, bypass access controls, introduce malicious code, or extract data unlawfully.",
                "Manipulate prices, tips, refunds, reviews, eligibility or payout records.",
                "Claim an affiliation with Helpward that you do not have.",
              ]} />
            </div>
            <p>
              Helpward may decline or interrupt a task that creates a legal, safety, payment or
              platform-integrity concern.
            </p>
          </Section>

          <Section id="termination" n={20} title="Account restrictions and termination">
            <p>
              You may stop using Helpward and request account deletion through the available
              controls. Closing an account does not automatically cancel outstanding bookings,
              resolve disputes, or remove amounts lawfully owed.
            </p>
            <p>
              We may restrict features, pause bookings or suspend an account where reasonably
              necessary to address suspected fraud, safety risks, serious misconduct, payment
              problems, legal requirements or material breaches. Where appropriate and legally
              permitted we will explain the restriction and provide a way to ask us to review it.
              Urgent cases may need immediate action.
            </p>
            <Callout tone="good">
              We will not withhold amounts or restrict an account in retaliation for an honest
              review, a lawful complaint, or the exercise of a protected right.
            </Callout>
          </Section>

          <Section id="availability" n={21} title="Platform availability and responsibility">
            <p>
              We aim to provide a reliable platform but cannot promise uninterrupted access,
              continuous network coverage, or that every request receives a match. Maintenance,
              browser permissions, device problems, payment-provider issues and outages may affect
              availability. A website or connection problem does not justify entering false booking
              information or ignoring a known payment or safety issue.
            </p>
            <p>
              To the extent permitted by law, Helpward is not responsible for losses that were not
              reasonably foreseeable or that result solely from events outside its reasonable
              control.
            </p>
            <Callout tone="good" title="There is no US$100 cap on your remedies">
              Nothing in these Terms excludes or limits liability where doing so would be unlawful.
              That includes any non-excludable consumer guarantee, liability for fraud or deliberate
              misconduct, and responsibility for personal injury, negligence or other loss that
              applicable law does not permit us to exclude.
            </Callout>
          </Section>

          <Section id="complaints" n={22} title="Complaints and resolving disagreements">
            <p>
              For a booking problem, use the <Link href="/help">Help area</Link> and include the
              booking reference. For a formal legal complaint, email{" "}
              <a href="mailto:legal@helpward.com">legal@helpward.com</a> or write to the address
              below.
            </p>
            <Callout tone="good" title="No mandatory arbitration, no class-action waiver">
              We encourage a reasonable opportunity to discuss and resolve a disagreement, but
              contacting us first is not a condition that prevents you seeking urgent relief,
              contacting a regulator, or exercising a right under applicable law. These Terms do
              not require arbitration or waive a right to participate in a class or collective
              proceeding where that right is protected.
            </Callout>
          </Section>

          <Section id="law" n={23} title="Governing law and mandatory local protections">
            <p>
              To the extent permitted by applicable law, these Terms are governed by the laws of
              British Columbia and the federal laws of Canada applicable there.
            </p>
            <Callout>
              That choice does not deprive a Customer or Helper of mandatory protections under the
              laws that legally apply to their circumstances, including applicable California or
              other local law. Nothing here requires anyone to bring a claim in a location that
              consumer, employment or other law does not permit us to require.
            </Callout>
          </Section>

          <Section id="updates" n={24} title="Changes to these Terms">
            <p>
              We may update these Terms when our services, payment arrangements, legal obligations
              or operating practices change. The &ldquo;Last updated&rdquo; date identifies the
              current version, and we give notice of material changes through the platform, email
              or another appropriate method. Where renewed agreement is required we will ask for it
              before the change takes effect for you.
            </p>
            <Callout tone="good">
              Changes apply prospectively. They will not remove accrued rights or silently change
              the agreed price of an existing booking.
            </Callout>
          </Section>

          <Section id="general" n={25} title="General provisions">
            <p>
              If a provision is unenforceable, the rest continue to apply so far as the law allows.
              A delay in enforcing a provision does not automatically waive it. You may not transfer
              your account or booking obligations without appropriate approval, and any transfer by
              Helpward remains subject to applicable law and protections for existing users.
              Booking-specific requirements and separately accepted service terms apply to the
              relevant service and cannot override mandatory rights.
            </p>
          </Section>

          <Section id="contact" n={26} title="Contact">
            <div className="rounded-2xl border border-brand-200 bg-brand-50/70 p-5 sm:p-6">
              <div className="flex flex-wrap gap-8">
                <div>
                  <div className="flex items-center gap-2 text-sm font-bold text-brand-900">
                    <Mail className="w-4 h-4" aria-hidden="true" /> Email
                  </div>
                  <div className="mt-1 space-y-1 text-[15px]">
                    <div>
                      <span className="text-brand-900/70">Legal: </span>
                      <a href="mailto:legal@helpward.com" className="text-brand-800 font-semibold underline">legal@helpward.com</a>
                    </div>
                    <div>
                      <span className="text-brand-900/70">Privacy: </span>
                      <a href="mailto:privacy@helpward.com" className="text-brand-800 font-semibold underline">privacy@helpward.com</a>
                    </div>
                    <div>
                      <span className="text-brand-900/70">Bookings: </span>
                      <Link href="/help" className="text-brand-800 font-semibold underline">the Help area</Link>
                    </div>
                  </div>
                </div>
                <div>
                  <div className="flex items-center gap-2 text-sm font-bold text-brand-900">
                    <MapPin className="w-4 h-4" aria-hidden="true" /> Mail
                  </div>
                  <address className="mt-1 not-italic text-[15px] leading-relaxed text-brand-900/90">
                    HELPWARD<br />
                    7770 Regents Road<br />
                    San Diego, CA 92122<br />
                    United States
                  </address>
                </div>
              </div>
            </div>
          </Section>

          <div className="pt-4 border-t border-slate-100 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <span className="inline-flex items-center gap-1.5 text-slate-500">
              <ShieldCheck className="w-4 h-4" aria-hidden="true" />
              Last updated {formatLegalDate(doc.updated)}
            </span>
            <Link href="/privacy" className="text-brand-700 font-semibold hover:underline">Privacy Policy</Link>
            <Link href="/safety" className="text-brand-700 font-semibold hover:underline">Safety</Link>
            <Link href="/help" className="text-brand-700 font-semibold hover:underline">Help centre</Link>
          </div>
        </div>
      </div>
    </MarketingShell>
  );
}
