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
];

export function getArticle(slug: string): HelpArticle | null {
  return HELP_ARTICLES.find((a) => a.slug === slug) ?? null;
}

export function getArticlesByCategory(category: HelpCategory): HelpArticle[] {
  return HELP_ARTICLES.filter((a) => a.category === category);
}
