// Job postings. Each role gets a programmatic page at /careers/[slug] with
// JobPosting JSON-LD (Google Jobs rich-result eligible — appears in the Jobs
// vertical when someone searches "marketplace operations job vancouver").
//
// Adding a role = adding an entry here + redeploying. No CMS, no migration.

export type JobLocation = {
  city: string;
  region: string; // state/province
  country: "US" | "CA";
  remote: boolean;
};

export type JobPosting = {
  slug: string;
  title: string;
  team: "Operations" | "Trust & Safety" | "Engineering" | "Design" | "Community" | "Finance";
  employmentType: "FULL_TIME" | "PART_TIME" | "CONTRACTOR";
  locations: JobLocation[];     // can list multiple
  remoteOk: boolean;
  // Salary range in USD, used in the JobPosting schema. Range is what we'd
  // realistically pay — Google's Jobs experience filters by salary so being
  // honest here gets us better-matched applicants.
  salaryMin: number;
  salaryMax: number;
  salaryCurrency: "USD" | "CAD";
  // Date posted — also feeds the schema. Old postings drop out of Google
  // Jobs after 90 days; refresh by bumping this.
  postedAt: string;             // YYYY-MM-DD
  validThrough: string;         // YYYY-MM-DD — when the listing closes
  summary: string;              // 1-2 sentence elevator pitch
  about: string;                // why this role exists (paragraph)
  responsibilities: string[];
  requirements: string[];
  niceToHaves?: string[];
  applyEmail: string;
};

export const JOBS: JobPosting[] = [
  {
    slug: "founding-operations-lead",
    title: "Founding Operations Lead",
    team: "Operations",
    employmentType: "FULL_TIME",
    locations: [
      { city: "Vancouver", region: "BC", country: "CA", remote: false },
    ],
    remoteOk: false,
    salaryMin: 110_000,
    salaryMax: 145_000,
    salaryCurrency: "CAD",
    postedAt: "2026-05-29",
    validThrough: "2026-08-27",
    summary:
      "Own the day-to-day reality of the marketplace. Helper supply, customer experience, response-time commitments, the lot. You'll be employee #8 and the person every customer-impacting metric ladders to.",
    about:
      "Helpward is a year-old marketplace launching in 10 metros. The matching engine is live, the helper pipeline is real, but the operational craft that turns 'a working product' into 'a marketplace customers reflexively trust' is the gap. You'll close it — owning supply planning per city, response-time SLAs, dispute throughput, and the playbooks the wider team will follow as we scale.",
    responsibilities: [
      "Own the helper-supply pipeline per city — applications, vetting velocity, approval rates.",
      "Hit the 4-hour-safety / 24-hour-disputes response-time commitments — and beat them.",
      "Run the dispute & insurance-claim queue end-to-end; coordinate with the underwriting carrier on claims.",
      "Build the playbooks (and eventually hire the teams) for ops at Helpward's next 10 cities.",
      "Publish the quarterly transparency report — own the figures, write the narrative.",
      "Sit one row from the founder; expect rapid context-switching and very few internal meetings.",
    ],
    requirements: [
      "5+ years operations experience at an on-demand marketplace, gig platform, or high-touch logistics company.",
      "Track record of owning a P&L-adjacent metric (response time, completion rate, NPS) and moving it materially.",
      "Comfort being on-call for genuinely urgent safety issues — this is the job some weeks.",
      "Vancouver-based or willing to relocate; first year is in-person at our Mt. Pleasant office.",
    ],
    niceToHaves: [
      "Previous founding-stage experience.",
      "Familiarity with Stripe Connect, Checkr/Triton, and the operational mechanics of two-sided marketplaces.",
      "Direct experience working through serious safety incidents and the post-incident review.",
    ],
    applyEmail: "careers@helpward.com",
  },
  {
    slug: "senior-trust-and-safety-manager",
    title: "Senior Trust & Safety Manager",
    team: "Trust & Safety",
    employmentType: "FULL_TIME",
    locations: [
      { city: "Vancouver", region: "BC", country: "CA", remote: false },
      { city: "Remote", region: "—", country: "CA", remote: true },
    ],
    remoteOk: true,
    salaryMin: 120_000,
    salaryMax: 160_000,
    salaryCurrency: "CAD",
    postedAt: "2026-05-29",
    validThrough: "2026-08-27",
    summary:
      "Lead the team that screens every helper, adjudicates every escalated case, and shapes the policies that make Helpward worth booking. T&S is the moat; you're its operator.",
    about:
      "Trust & Safety at Helpward is policy, operations, and engineering rolled into one role at this stage. You'll set the adjudication policy that drives our background-check decisions, run the team of reviewers handling escalated disputes, and partner with engineering on the tooling that makes the team's work auditable. The bar isn't 'comparable to other marketplaces'; it's 'verifiably better, and demonstrably so.'",
    responsibilities: [
      "Own the adjudication policy for Checkr/Triton results — write it, document it, defend it publicly.",
      "Manage a team of 4–6 dispute reviewers; carry the queue yourself for the first 90 days to calibrate.",
      "Partner with engineering on the admin tooling at /admin/reviews, /admin/disputes, and /admin/data-requests.",
      "Be the named contact for our insurance carrier on every claim that reaches them.",
      "Own the safety section of the transparency report — including the numbers we'd rather not publish.",
      "Mentor the ops team on cases where T&S and supply-growth pressures conflict.",
    ],
    requirements: [
      "7+ years T&S experience at a marketplace, social platform, or financial-services firm.",
      "Direct experience adjudicating escalated cases including violent-incident reports.",
      "Comfort writing policy that lives in public — your adjudication standards will be published.",
      "Ability to coordinate with law enforcement and counsel under pressure.",
    ],
    niceToHaves: [
      "JD or paralegal background.",
      "Prior experience working with Checkr / Triton or equivalent background-check providers.",
      "Public-speaking experience — we'll ask you to represent the program externally.",
    ],
    applyEmail: "careers@helpward.com",
  },
  {
    slug: "full-stack-engineer",
    title: "Full-stack Engineer (Next.js + Supabase)",
    team: "Engineering",
    employmentType: "FULL_TIME",
    locations: [
      { city: "Remote", region: "—", country: "CA", remote: true },
    ],
    remoteOk: true,
    salaryMin: 130_000,
    salaryMax: 175_000,
    salaryCurrency: "CAD",
    postedAt: "2026-05-29",
    validThrough: "2026-08-27",
    summary:
      "Ship features end-to-end across our Next.js 16 + Supabase + Stripe stack. You'll own a feature area, work directly with the founder, and have outsized leverage over the product the entire team uses.",
    about:
      "Helpward's stack is intentionally lean: Next.js 16 App Router, Supabase Postgres with RLS, Stripe Connect, edge geo, no microservices. We're hiring engineers who like that simplicity and want to ship features end-to-end without 9 stakeholders. Current open feature areas include the matching engine wiring to schedule, the recurring-bookings model, and the helper-payouts pipeline.",
    responsibilities: [
      "Own a feature area — recurring bookings, multi-task bundles, or matching-engine schedule integration.",
      "Write production-grade SQL — RLS policies, materialised views, the queries that back admin reports.",
      "Build server components that ship complete HTML for SEO + AI-search visibility.",
      "Pair with the founder on the trade-offs between speed and durability that show up daily.",
      "Take operational pages calls when your feature is in the path of an incident.",
    ],
    requirements: [
      "5+ years shipping production web applications at scale.",
      "Strong opinions about TypeScript, React server components, and Postgres performance.",
      "Comfort with on-call for the features you own.",
      "Bias toward shipping the simplest thing that's actually correct.",
    ],
    niceToHaves: [
      "Prior Next.js App Router experience (we're on 16).",
      "Supabase RLS / policy modeling experience.",
      "Marketplace experience — matching engines, supply optimisation, two-sided economics.",
    ],
    applyEmail: "careers@helpward.com",
  },
  {
    slug: "founding-designer",
    title: "Founding Designer",
    team: "Design",
    employmentType: "FULL_TIME",
    locations: [
      { city: "Vancouver", region: "BC", country: "CA", remote: false },
      { city: "Remote", region: "—", country: "CA", remote: true },
    ],
    remoteOk: true,
    salaryMin: 115_000,
    salaryMax: 155_000,
    salaryCurrency: "CAD",
    postedAt: "2026-05-29",
    validThrough: "2026-08-27",
    summary:
      "Own the design system, the marketing site, and the product surface. You'll set the visual + interaction bar for everything Helpward ships, customer-facing and helper-facing.",
    about:
      "We're hiring our first dedicated designer to take Helpward's current functional-but-utilitarian visual language and push it into a system that feels as deliberate as the operational mechanics. You'll work across marketing surfaces (homepage, help, safety, blog) and product surfaces (booking flow, helper onboarding, admin tooling). The design system will be public — every component documented and reusable.",
    responsibilities: [
      "Audit and rebuild the current design language across marketing and product surfaces.",
      "Ship a public, documented design system — every component, every token, with rationale.",
      "Own marketing-page design quality (homepage, safety microsite, service landing pages).",
      "Partner with engineering on every customer-facing feature from sketch through ship.",
      "Define and defend the brand voice in copy as much as in visual.",
    ],
    requirements: [
      "6+ years shipping product design at consumer-facing companies.",
      "Track record of building a design system that engineers actually use (not just a Figma library).",
      "Strong writing — you'll author marketing copy as often as you'll author components.",
      "Comfort in a small team where the line between 'designer' and 'PM' is whatever you say it is.",
    ],
    niceToHaves: [
      "Tailwind familiarity (we use Tailwind 4 with @theme tokens).",
      "Marketplace UX experience — particularly the asymmetric flows of customer vs supplier surfaces.",
      "Illustration or motion-design ability (the brand is currently visual-light; we'd like that to change).",
    ],
    applyEmail: "careers@helpward.com",
  },
  {
    slug: "helper-community-manager",
    title: "Helper Community Manager",
    team: "Community",
    employmentType: "FULL_TIME",
    locations: [
      { city: "Los Angeles", region: "CA", country: "US", remote: false },
      { city: "New York", region: "NY", country: "US", remote: false },
    ],
    remoteOk: false,
    salaryMin: 80_000,
    salaryMax: 110_000,
    salaryCurrency: "USD",
    postedAt: "2026-05-29",
    validThrough: "2026-08-27",
    summary:
      "Run the helper side of the marketplace — recruitment, onboarding support, retention, and the in-person community gatherings that turn a gig into a craft.",
    about:
      "Helpward only works if helpers want to be on the platform. This role owns that. You'll run helper recruitment in your city, host the monthly in-person community events, manage the helper-only Slack, and feed product + ops with the friction helpers actually experience day-to-day. We're hiring two of these — one in LA, one in NYC.",
    responsibilities: [
      "Hit weekly helper-recruitment targets in your city with low CAC.",
      "Onboard new helpers personally for the first 90 days — phone calls, not just chat.",
      "Run a monthly in-person event (coffee, dinner, training) for helpers in your city.",
      "Manage the helper-only Slack and the weekly helper newsletter for your region.",
      "Feed product + ops a weekly list of the top three friction points helpers are flagging.",
      "Be the named in-city escalation contact for any helper who needs to reach Helpward urgently.",
    ],
    requirements: [
      "3+ years community-management or customer-success experience at a marketplace or gig platform.",
      "You live in the city you'd staff — this is not a remote role.",
      "Excellent writing for emails and Slack at scale.",
      "Comfort hosting groups of 20–60 people in person.",
    ],
    niceToHaves: [
      "Prior experience as a gig worker yourself.",
      "Bilingual (Spanish for LA, multilingual welcome for NYC).",
    ],
    applyEmail: "careers@helpward.com",
  },
];

export function getJob(slug: string): JobPosting | null {
  return JOBS.find((j) => j.slug === slug) ?? null;
}
