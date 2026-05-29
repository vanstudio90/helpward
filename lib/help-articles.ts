// Help-center article catalog. Pure data — no DB, no fetches. Each article is
// authored in code so writers can review diffs in PRs (and so AI engines see
// the entire knowledge base inlined in /help and /help/[slug] HTML).
//
// Each article gets its own programmatic page at /help/[slug], shows up in
// the sitemap, and emits Article + BreadcrumbList JSON-LD.

export type HelpCategory =
  | "getting-started"
  | "bookings"
  | "payments"
  | "safety"
  | "account"
  | "helpers";

export type HelpArticle = {
  slug: string;
  category: HelpCategory;
  title: string;
  summary: string; // 1-2 sentence opener — extracted by AI engines as the snippet
  // Body is structured so we can render headings + paragraphs + lists. Each
  // section is a block; the whole array renders in order.
  body: HelpBlock[];
  // Optional FAQ pairs appended at the bottom — fed into FAQPage JSON-LD.
  faqs?: { q: string; a: string }[];
  updatedAt: string; // YYYY-MM-DD
};

export type HelpBlock =
  | { type: "p"; text: string }
  | { type: "h2"; text: string }
  | { type: "h3"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  | { type: "note"; text: string };

export const HELP_CATEGORIES: { id: HelpCategory; label: string; blurb: string }[] = [
  { id: "getting-started", label: "Getting started", blurb: "How Helpward works, first booking, account setup." },
  { id: "bookings", label: "Bookings", blurb: "Cancelling, rescheduling, tracking, disputes." },
  { id: "payments", label: "Payments & refunds", blurb: "Pricing, fees, refunds, receipts, taxes." },
  { id: "safety", label: "Safety & insurance", blurb: "Background checks, insurance, what to do if something goes wrong." },
  { id: "account", label: "Account & privacy", blurb: "Password, notifications, data export, deletion." },
  { id: "helpers", label: "For helpers", blurb: "Becoming a helper, payouts, schedule, taxes." },
];

export const HELP_ARTICLES: HelpArticle[] = [
  {
    slug: "what-is-helpward",
    category: "getting-started",
    title: "What is Helpward?",
    summary:
      "Helpward is the Human Infrastructure Network — an on-demand marketplace that matches you with verified, background-checked humans for almost any real-world task in the U.S. and Canada.",
    body: [
      { type: "p", text:
        "Helpward connects people who need help with verified humans nearby. Customers (we call them askers) post a request, the matching engine notifies qualified helpers in their area, and the first to accept becomes your helper. Tasks are tracked end-to-end with live GPS and in-app chat, and payment is held until the task is marked complete." },
      { type: "h2", text: "How is it different from a regular gig app?" },
      { type: "ul", items: [
        "Every helper passes ID verification, a background check, and is insured during the booking.",
        "Pricing is published upfront — no surge fees, no after-the-fact markups.",
        "You only pay after the helper marks the task complete and you've had 24 hours to review.",
        "Real humans only. No autonomous bots or drones.",
      ] },
      { type: "h2", text: "What can I request?" },
      { type: "p", text:
        "The catalog covers six categories — Transportation, Home Help, Errands, Presence, Lifestyle, and Business — with dozens of specific services. If it's legal, safe, and a human nearby can do it, you can probably request it." },
    ],
    faqs: [
      { q: "Is Helpward a delivery service?", a: "Helpward includes delivery as one of many categories. We also offer transportation, errands, home tasks, presence visits, and business services — anything a verified human can do." },
      { q: "Is Helpward available in my city?", a: "Helpward operates across the U.S. and Canada with denser supply in Vancouver, Toronto, Montreal, Seattle, San Francisco, Los Angeles, Austin, Chicago, New York, and Miami. We add cities as helper-supply density meets quality thresholds." },
    ],
    updatedAt: "2026-05-28",
  },
  {
    slug: "creating-your-first-request",
    category: "getting-started",
    title: "Creating your first request",
    summary:
      "Pick a service, enter where and when you need it, and submit. The matching engine notifies nearby verified helpers; the first to accept becomes yours.",
    body: [
      { type: "ol", items: [
        "Open the /new-request page from your dashboard or the homepage.",
        "Tap the service that best matches what you need.",
        "Enter the address (real geocoding ships when our Mapbox integration is live).",
        "Choose ASAP or schedule for later.",
        "Add notes the helper should see — anything specific they need to bring or know.",
        "Submit. You'll see helpers' identities, ratings, and ETAs as they accept.",
      ] },
      { type: "note", text:
        "Tip: if you don't see a perfect service match, pick the closest one and describe the actual task in the notes. The matching engine is designed to route fuzzy requests to the right helper category." },
    ],
    updatedAt: "2026-05-28",
  },
  {
    slug: "cancel-or-reschedule-a-booking",
    category: "bookings",
    title: "Cancelling or rescheduling a booking",
    summary:
      "Cancel a pending request for free from /bookings. Once a helper has accepted, cancellation policies depend on how close you are to the scheduled time.",
    body: [
      { type: "h2", text: "Before a helper accepts" },
      { type: "p", text:
        "Open /bookings, find the Pending tab, and tap Cancel. There's no fee — your card is only authorised once a helper accepts." },
      { type: "h2", text: "After a helper accepts" },
      { type: "p", text:
        "Open the booking page and tap Cancel booking. A small cancellation fee may apply close to the scheduled time so we can fairly compensate the helper for time blocked off. The exact policy is shown on the cancel screen before you confirm." },
      { type: "h2", text: "Need to reschedule?" },
      { type: "p", text:
        "Right now the cleanest path is to cancel and re-submit. A real reschedule flow ships in the next release." },
    ],
    updatedAt: "2026-05-28",
  },
  {
    slug: "how-pricing-works",
    category: "payments",
    title: "How Helpward pricing works",
    summary:
      "Every service has a published base price. Helpward adds a flat $4.50 service fee. Total is shown before you submit. You're only charged after the task is marked complete.",
    body: [
      { type: "h2", text: "Base price" },
      { type: "p", text:
        "Each service has a base price published on the catalog page — for example, a designated driver might start at $29. The base price covers the helper's time for the typical task in that category." },
      { type: "h2", text: "Service fee" },
      { type: "p", text:
        "Helpward adds a flat $4.50 service fee to every booking. The fee funds platform insurance, 24/7 support, identity verification, and background checks. It's the same regardless of task size." },
      { type: "h2", text: "Distance, time, and tips" },
      { type: "p", text:
        "Long-distance or extended tasks may incur additional charges, always shown on the booking page before you confirm. Tipping is optional and goes 100% to the helper." },
      { type: "h2", text: "Currency" },
      { type: "p", text:
        "Bookings in the U.S. are priced in USD; bookings in Canada are priced in CAD. The current price is converted automatically based on your city." },
    ],
    faqs: [
      { q: "Why a flat service fee?", a: "We chose a flat fee over a percentage so a $20 errand isn't penalised vs a $200 booking. The fee covers fixed costs (insurance, verification, support) that don't scale with task size." },
      { q: "Is the service fee refundable?", a: "If the task is cancelled before a helper accepts, the service fee is not charged. If a dispute is resolved in your favour, the service fee is refunded along with the base price." },
    ],
    updatedAt: "2026-05-28",
  },
  {
    slug: "refunds-and-disputes",
    category: "payments",
    title: "Refunds and disputes",
    summary:
      "You have a 24-hour window after task completion to open a dispute. Helpward's support team reviews the case and can refund partial or full payment depending on what the evidence shows.",
    body: [
      { type: "ol", items: [
        "Open the booking page within 24 hours of completion.",
        "Tap Report an issue.",
        "Pick a category — quality, damage, safety, no-show, billing, or other.",
        "Describe what happened in at least 20 characters.",
        "Submit. Helpward's support team reviews within 24 hours and contacts both parties.",
      ] },
      { type: "p", text:
        "Refunds are issued back to the original payment method through Stripe. You'll see them on the Refunds tab on your /payments page and on your card statement within 5–10 business days." },
    ],
    updatedAt: "2026-05-28",
  },
  {
    slug: "background-checks-and-insurance",
    category: "safety",
    title: "How Helpward verifies helpers and what's insured",
    summary:
      "Every helper passes government-ID verification (Stripe Identity), a background check (Checkr/Triton), and is covered by Helpward's platform insurance — up to $1M per booking.",
    body: [
      { type: "h2", text: "Identity verification" },
      { type: "p", text:
        "Before a helper can accept any task, they must verify a government-issued ID through Stripe Identity. The face on the ID is matched against a live selfie. We re-verify if a helper's account is dormant for an extended period." },
      { type: "h2", text: "Background checks" },
      { type: "p", text:
        "U.S. helpers are screened via Checkr; Canadian helpers via Triton Canada. Both run county-level criminal record searches plus national sex-offender registries. A human at Helpward reviews any flagged report before approving." },
      { type: "h2", text: "Insurance" },
      { type: "p", text:
        "Every booking is covered by Helpward's platform insurance, up to $1M per incident. Coverage applies during the active booking window — from helper acceptance through task completion or cancellation." },
      { type: "note", text:
        "Insurance does not cover anything illegal, reckless, or outside the scope of the booking. Read /safety for the detailed policy." },
    ],
    updatedAt: "2026-05-28",
  },
  {
    slug: "what-to-do-if-something-goes-wrong",
    category: "safety",
    title: "What to do if something goes wrong",
    summary:
      "For active safety concerns during a task, end the booking and call 911 if needed. For everything else, open a dispute from the booking page or email safety@helpward.com.",
    body: [
      { type: "h2", text: "During the task — immediate safety concern" },
      { type: "ol", items: [
        "Get to a safe location.",
        "Call 911 (U.S.) or 911 (Canada) for emergencies.",
        "Use the in-app End booking button to stop tracking and flag the booking.",
        "Email safety@helpward.com — we respond within 4 hours.",
      ] },
      { type: "h2", text: "Property damage or theft" },
      { type: "p", text:
        "File a report at safety@helpward.com with photos and your booking ID within 24 hours. Helpward's insurance covers damage up to $1M; you'll be asked for documentation." },
      { type: "h2", text: "Helper no-show" },
      { type: "p", text:
        "Bookings auto-cancel 20 minutes past the scheduled time if the helper hasn't started. You'll receive a notification and your card is not charged." },
    ],
    updatedAt: "2026-05-28",
  },
  {
    slug: "manage-notifications",
    category: "account",
    title: "Managing your notifications",
    summary:
      "Open Settings → Notifications to pick which booking, message, receipt, and safety notifications you want by push, email, and SMS.",
    body: [
      { type: "p", text:
        "Helpward sends notifications across three channels: push (in-app + browser/native), email, and SMS. Each notification type can be toggled on or off independently." },
      { type: "ul", items: [
        "Booking updates: accepted, started, arriving soon, completed.",
        "Messages: a helper or customer sent you an in-app message.",
        "Receipts: a booking was charged or refunded.",
        "Safety: dispute updates and account-security alerts (cannot be disabled).",
      ] },
      { type: "note", text:
        "Critical safety + account-security notifications are always sent — you can't opt out. Everything else respects your preference." },
    ],
    updatedAt: "2026-05-28",
  },
  {
    slug: "change-your-password",
    category: "account",
    title: "Changing your password",
    summary:
      "Open Settings → Security and tap Change password. You'll need your current password plus a new one (8–128 characters).",
    body: [
      { type: "ol", items: [
        "Go to /settings.",
        "Find the Security section.",
        "Tap Change next to Password.",
        "Enter your current password.",
        "Pick a new password between 8 and 128 characters.",
        "Submit. You'll stay signed in on the current device; other sessions are signed out for safety.",
      ] },
      { type: "p", text:
        "Forgot your current password? Use the Forgot password link on the login page instead — we'll send a reset link to your email." },
    ],
    updatedAt: "2026-05-28",
  },
  {
    slug: "download-or-delete-your-data",
    category: "account",
    title: "Downloading or deleting your data",
    summary:
      "From Settings → Quick Actions, you can request a full export of your Helpward data, or permanently delete your account. Exports arrive by email within 48 hours.",
    body: [
      { type: "h2", text: "Download your data" },
      { type: "p", text:
        "Open Settings, tap Download my data, and confirm. We package everything your account holds — profile, bookings, messages, reviews, payment history — into a JSON archive and email it to your registered address within 48 hours." },
      { type: "h2", text: "Delete your account" },
      { type: "p", text:
        "From Settings, tap Delete account. You'll be asked to confirm with your password. Deletion is permanent: profile, messages, and personal data are removed within 30 days. Bookings and reviews you posted are anonymised but retained for the other party's records (required by our tax obligations)." },
      { type: "note", text:
        "If you have an active booking or unresolved dispute, you'll need to resolve it before deletion. Outstanding payouts to helpers are still processed after deletion." },
    ],
    updatedAt: "2026-05-28",
  },
  {
    slug: "become-a-helper",
    category: "helpers",
    title: "Becoming a Helpward helper",
    summary:
      "Sign up as a helper, complete ID verification + background check, link a bank for payouts, and once approved you can go online from /provider/active to start accepting tasks.",
    body: [
      { type: "ol", items: [
        "Sign up at /signup?role=provider with your full name, email, and password.",
        "Complete your basic profile — bio, languages, service radius.",
        "Pick the services you want to offer from the catalog.",
        "Verify your ID through Stripe Identity (takes 2–5 minutes).",
        "Pass the background check (typically 24–72 hours).",
        "Link your bank for payouts via Stripe Connect.",
        "A human at Helpward reviews and approves your application.",
        "Go online from /provider/active to start receiving offers.",
      ] },
      { type: "p", text:
        "Helpers keep 80% of the base + distance fee, plus 100% of any tip. Helpward takes 20% to cover insurance, support, identity verification, and platform costs." },
    ],
    updatedAt: "2026-05-28",
  },
  {
    slug: "recurring-bookings",
    category: "bookings",
    title: "Setting up a recurring booking",
    summary:
      "Schedule a weekly, biweekly, or monthly task once and Helpward materialises the next occurrence as a real booking 48 hours before it's due. Pause, resume, skip a single date, or cancel the whole series any time.",
    body: [
      { type: "h2", text: "Why use a recurring series" },
      { type: "p", text:
        "If you need the same thing on a predictable cadence — Tuesday dog walks, the third of the month elder check-in, biweekly grocery pickup — a recurring series saves you from re-entering the same details every time. You set the rule once; Helpward turns it into individual bookings on the right dates." },
      { type: "h2", text: "How to set one up" },
      { type: "ol", items: [
        "Open /new-request and pick a service.",
        "Enter the pickup address, time, and any notes — just like a one-shot booking.",
        "Scroll to the 'Repeat this task' toggle and turn it on.",
        "Pick the cadence (weekly, biweekly, or monthly).",
        "For weekly/biweekly, pick the weekday. For monthly, pick the day of the month.",
        "Optionally cap the series at a specific end date or a maximum number of occurrences.",
        "Submit. We'll create the series and materialise the first occurrence immediately.",
      ] },
      { type: "h2", text: "When the next occurrence becomes a real booking" },
      { type: "p", text:
        "Helpward's materialisation cron runs daily. It looks 48 hours ahead and turns each upcoming series occurrence into a regular request, which the matching engine then routes to a nearby helper just like a one-shot booking. You'll see the materialised occurrence on /bookings under Pending or Upcoming, and on the series detail page under History." },
      { type: "h2", text: "Pausing, skipping, cancelling" },
      { type: "ul", items: [
        "Pause: the series stops materialising new occurrences. Already-scheduled bookings still happen. Resume any time.",
        "Skip next: cancels the soonest pending request for this series; subsequent occurrences continue normally.",
        "Cancel: the series stops permanently. Already-scheduled bookings still happen — cancel each from its booking page if you want to skip those too.",
      ] },
      { type: "h2", text: "Timezones and daylight saving" },
      { type: "p", text:
        "Your local time of day is stored with the series. When the cron materialises an occurrence it converts to UTC using your registered timezone — including handling daylight-saving transitions, so 9am-every-Tuesday stays 9am after a clock change. If you move to a new timezone, update it in /settings before creating new series." },
      { type: "h2", text: "If the service is removed from the catalogue" },
      { type: "p", text:
        "We auto-pause your series and send you a notification. The historical occurrences stay intact; you can either resume after the service comes back or create a new series with a different service." },
    ],
    faqs: [
      { q: "Can I change the cadence after creating a series?", a: "Not directly — cancel the existing series and create a new one with the new cadence. We're working on in-place editing for v2." },
      { q: "What if I want to change a single occurrence's time?", a: "Skip the affected occurrence (it cancels the materialised request) and create a one-shot request at the new time. The series keeps running normally for subsequent dates." },
      { q: "Does each occurrence cost the same?", a: "Yes — the price is locked when you create the series, so future catalogue price changes don't retroactively reprice your existing occurrences. If we ever do increase prices, we'll surface it to you explicitly." },
      { q: "What's the maximum number of occurrences I can schedule?", a: "520 — about ten years of weekly bookings. If you need more, you can chain a follow-up series or contact support." },
    ],
    updatedAt: "2026-05-29",
  },
  {
    slug: "setting-up-2fa",
    category: "account",
    title: "Setting up two-factor authentication",
    summary:
      "Add a second layer to your sign-in: an authenticator app plus 10 single-use recovery codes. Setup takes 2 minutes. Storing the recovery codes properly is the part that matters.",
    body: [
      { type: "h2", text: "Why turn 2FA on" },
      { type: "p", text:
        "A leaked password isn't enough to sign in to your Helpward account once 2FA is on — an attacker would also need your phone (or one of your recovery codes). If you've ever reused a password across sites, or if you handle bookings involving children, elders, or your home, this is the change with the biggest security return per minute spent." },
      { type: "h2", text: "What you'll need" },
      { type: "ul", items: [
        "An authenticator app on your phone. We recommend 1Password, Bitwarden, or Authy — all three keep backups, so swapping phones doesn't lock you out. Google Authenticator and Microsoft Authenticator also work.",
        "Somewhere safe to store 10 recovery codes — a password manager works, a printed sheet in a drawer works, a sealed envelope in a fireproof box works.",
      ] },
      { type: "h2", text: "How to enroll" },
      { type: "ol", items: [
        "Go to /settings/security.",
        "Tap Set up 2FA. We'll show you a QR code.",
        "In your authenticator app, tap Add account and scan the QR code. If your camera can't scan it, tap Enter setup key in the app and paste the secret we show.",
        "Your app will start displaying a 6-digit code that refreshes every 30 seconds. Type the current code into Helpward and tap Verify.",
        "We'll show you 10 recovery codes. Save them right then — this is the only time we'll show them.",
        "Done. From the next sign-in onward, after your password we'll ask for a fresh 6-digit code from your app.",
      ] },
      { type: "h2", text: "What recovery codes are for" },
      { type: "p", text:
        "Recovery codes exist for the scenario where your phone is broken, stolen, lost, or you've changed device and didn't migrate the authenticator app. You'll use them once each — a recovery code that works once doesn't work again." },
      { type: "p", text:
        "After signing in with a recovery code, the best practice is to immediately go to /settings/security, disable 2FA, and re-enroll on your new device. That gives you a fresh set of recovery codes too." },
      { type: "h2", text: "If you've lost both" },
      { type: "p", text:
        "Email safety@helpward.com from the email address registered on your account. We'll verify your identity through a different channel (typically by texting a code to the phone on file, or by asking you to confirm details only you'd know) and remove the factor manually. Expect 24-72 hours." },
      { type: "h2", text: "Disabling 2FA" },
      { type: "p", text:
        "From /settings/security, tap Disable 2FA, verify a fresh code (or a recovery code), and confirm. We log the disable event to the audit trail so you can see when it happened. We don't recommend disabling 2FA unless you're about to re-enroll on a new device." },
    ],
    faqs: [
      { q: "Do helpers need 2FA too?", a: "It's optional for everyone today. We strongly recommend it for helpers given the access they have to customer addresses and the payouts in their account. We'll make it mandatory for helpers later this year." },
      { q: "Can I use SMS instead of an authenticator app?", a: "No. SMS-based 2FA is vulnerable to SIM-swap attacks where someone convinces a carrier to port your number to a new SIM. Authenticator apps don't have that exposure. We don't offer SMS even as an option for that reason." },
      { q: "What happens to my recovery codes when I regenerate?", a: "The previous set stops working immediately. The new set is the only valid set. Make sure you save the new ones before navigating away — we won't show them again unless you regenerate." },
      { q: "Does 2FA slow down my sign-in?", a: "By about 5 seconds — the time to open your authenticator app and type 6 digits. If you use a password manager that supports TOTP (1Password, Bitwarden), the code auto-fills and the extra step is closer to 1 second." },
    ],
    updatedAt: "2026-05-29",
  },
  {
    slug: "referring-friends",
    category: "account",
    title: "Referring friends — give $10, get $10",
    summary:
      "Share your unique Helpward code or link. Your friend gets $10 off their first booking; you get $10 in credit when they complete it.",
    body: [
      { type: "h2", text: "How the rewards work" },
      { type: "ol", items: [
        "Open /referrals to grab your code and shareable link.",
        "Send it to a friend — text, email, or any channel you'd like.",
        "Your friend signs up at helpward.com/signup?ref=YOURCODE (the link does this automatically).",
        "The moment they sign up they see a $10 credit on their first booking.",
        "When they complete that first task, you earn $10 in credit too. It applies automatically to your next booking once payment processing is wired.",
      ] },
      { type: "h2", text: "What's tracked" },
      { type: "p", text:
        "The /referrals dashboard shows everyone who signed up with your code, who has qualified (completed a first task), how much you've earned in total, and your current spendable balance." },
      { type: "h2", text: "Program rules" },
      { type: "ul", items: [
        "One referral per new account — codes cannot be applied retroactively.",
        "Self-referrals, multi-account abuse, and incentivised signups for accounts that never actually use Helpward are flagged and voided.",
        "Helpward reviews referrals showing high signup velocity from the same IP / device — legitimate referrals always sail through.",
        "Credit is non-cash and non-transferable. It applies to base + service fee, not to tips.",
        "Helpward may adjust the reward amount with notice, but already-earned credit is honoured at the rate it was earned.",
      ] },
      { type: "h2", text: "Custom share message" },
      { type: "p", text:
        "From the referrals dashboard you can replace the default share blurb with your own words — useful if you want to highlight a specific service or share why you like Helpward in your own voice." },
    ],
    faqs: [
      { q: "When does the credit actually apply?", a: "Credit applies automatically at checkout once payment processing is wired. Today the balance accumulates on your account; the moment Stripe integration ships, it draws down as you book." },
      { q: "Can I refer myself?", a: "No. Self-referrals and multi-account abuse are detected and voided. Helpward's anti-fraud check compares signup IPs and devices for attribution review." },
      { q: "Is there a limit to how many friends I can refer?", a: "No fixed cap — refer as many as you'd like. Helpward reviews accounts showing unusual referral patterns to protect the program for everyone." },
    ],
    updatedAt: "2026-05-29",
  },
  {
    slug: "setting-your-availability",
    category: "helpers",
    title: "Setting your availability",
    summary:
      "Use the Schedule tab to tell customers when you're typically available. The hours show on your public profile and shape the 'Available now' badge. You can still go online manually any time.",
    body: [
      { type: "h2", text: "Weekly hours" },
      { type: "p", text:
        "Open /provider/schedule and add a shift for each day you work. You can add multiple shifts on the same day (a split shift like 9-12 plus 5-9pm), and the editor totals your weekly hours so you can see at a glance how much you've scheduled." },
      { type: "h2", text: "One-off dates" },
      { type: "p", text:
        "Mark a single date as off (vacation, sick day) or add an extra shift outside your weekly hours. Overrides win over the weekly rule for that date, so a Tuesday-off override hides your normal Tuesday shifts only for that one Tuesday." },
      { type: "h2", text: "Vacation mode" },
      { type: "p", text:
        "Going away for a stretch? Toggle vacation mode and optionally pick a return date. Your weekly schedule stays saved — you just appear as Away on your public profile until you flip it back." },
      { type: "h2", text: "Does this auto-decline tasks I'm offered outside my hours?" },
      { type: "p", text:
        "Not yet. The schedule is currently informational — it shapes the badge on your public profile and helps customers see when you usually work. Wiring the matching engine to filter on schedule lands in a future release. For now, going Offline from /provider/active is what stops the offers." },
    ],
    faqs: [
      { q: "Can I have a different schedule each week?", a: "The weekly schedule represents your typical week. For exceptions — a one-off Saturday shift, a Wednesday off, a holiday — use the One-off dates section. Anything you add there wins over the weekly rule for that date." },
      { q: "Will customers see if I'm vacationing?", a: "Yes. The badge on your public profile flips to 'Away until [date]' so customers can either reach out for after-return scheduling or pick another helper. Your reviews and rating stay visible." },
    ],
    updatedAt: "2026-05-29",
  },
  {
    slug: "helper-payouts-and-earnings",
    category: "helpers",
    title: "How helper payouts work",
    summary:
      "Earnings are deposited via Stripe Connect once per week (Tuesday) for the previous Mon–Sun. Tips arrive the same week as the booking. Tax forms are issued in January.",
    body: [
      { type: "h2", text: "When you get paid" },
      { type: "p", text:
        "Every Tuesday, your previous week's earnings (Monday through Sunday) land in the bank account you linked at onboarding. Standard ACH takes 2–3 business days to settle." },
      { type: "h2", text: "What you keep" },
      { type: "ul", items: [
        "80% of the base price for the service.",
        "80% of any distance / time fees.",
        "100% of any tip the customer adds.",
        "Helpward keeps 20% of the base + distance to fund insurance, support, and platform costs.",
      ] },
      { type: "h2", text: "Tax forms" },
      { type: "p", text:
        "U.S. helpers who earn over $600 in a calendar year receive a 1099-NEC by January 31. Canadian helpers receive a T4A. Both are issued through Stripe and emailed to your registered address." },
    ],
    updatedAt: "2026-05-28",
  },
  {
    slug: "bundling-multiple-tasks",
    category: "bookings",
    title: "Bundling multiple tasks in one trip",
    summary:
      "Stack up to 5 tasks into a single request and pay one service fee. The helper completes each stop in order and you watch progress live as each item is marked done.",
    body: [
      { type: "p", text:
        "Bundling lets you put several related tasks — say, a grocery pickup, a pharmacy stop, and a dry-cleaning return — into one booking handled by one helper. You pay for each task plus a single flat service fee for the whole trip, not one fee per stop." },
      { type: "h2", text: "When bundling is worth it" },
      { type: "ul", items: [
        "You have 2–5 tasks that are reasonably close to each other geographically.",
        "All stops fit inside roughly the same time window (an hour or two).",
        "Each task is small enough that paying a full service fee for it on its own would feel wasteful.",
      ] },
      { type: "h2", text: "How to create a bundle" },
      { type: "ol", items: [
        "Open /new-request and pick the first service.",
        "Tick the \"Bundle multiple tasks in one trip\" box just below the recurrence options.",
        "Use \"Add another stop\" to add up to 5 stops in total. Each stop gets its own service selection and notes field.",
        "Review the price breakdown — items subtotal, single service fee, total — and submit.",
      ] },
      { type: "h2", text: "What the helper sees" },
      { type: "p", text:
        "When a helper accepts your bundle, their active-task screen shows a checklist with every stop. They tap each item to advance it from pending → in progress → done. You see the same statuses update live on your booking page so you always know which stop is happening right now." },
      { type: "note", text:
        "Helpers are paid per-stop plus a share of the bundle service fee, so they're rewarded for completing every item rather than rushing." },
    ],
    faqs: [
      { q: "What if my helper can't complete one of the stops?", a: "The helper can mark any individual stop as skipped from their checklist — for example if a store is closed or an item is out of stock. You're refunded for the skipped item's price (the bundle service fee is non-refundable as long as at least one stop completes)." },
      { q: "Can the stops be in different service categories?", a: "Yes. A bundle can mix categories — grocery pickup + dog walk + dry-cleaning return is fine. The matching engine routes the whole bundle to a helper qualified for the primary (first) service in the list." },
      { q: "Is there a discount for bundling?", a: "You pay one $4.50 service fee for the whole bundle instead of one per task. On a 3-stop bundle that's effectively a $9.00 saving versus three separate requests, before factoring in the helper's travel time." },
      { q: "What's the maximum bundle size?", a: "Five stops. We cap it there because past 5 the helper's time blows out our distance and ETA estimates, and the upfront price starts to feel less honest. If you need more, split into two bookings." },
      { q: "Can I add a stop after the booking starts?", a: "Not yet. Once a helper has accepted the bundle the list is locked so the helper can plan their route. You can always create a second small request and message your helper to ask if they're available right after." },
    ],
    updatedAt: "2026-05-29",
  },
];

export function getArticle(slug: string): HelpArticle | null {
  return HELP_ARTICLES.find((a) => a.slug === slug) ?? null;
}

export function getArticlesByCategory(category: HelpCategory): HelpArticle[] {
  return HELP_ARTICLES.filter((a) => a.category === category);
}
