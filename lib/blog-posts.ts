// Blog posts. Like help-articles, authored in code so:
//  - Writers review changes via PR (no CMS).
//  - The whole archive ships in the SSR HTML for AI search engines.
//  - We can attach BlogPosting + Author JSON-LD without a content-CMS gymnastics.
//
// Each post gets a programmatic page at /blog/[slug] and a sitemap entry.

export type BlogAuthor = {
  name: string;
  role: string;          // "Founder", "Head of Trust & Safety", etc.
  avatar?: string;       // optional pravatar id or hosted URL
};

export type BlogPost = {
  slug: string;
  title: string;
  // 1-2 sentence card subhead + meta description.
  excerpt: string;
  author: BlogAuthor;
  publishedAt: string;   // YYYY-MM-DD
  updatedAt?: string;    // optional
  // Tags drive the topic chips. Single source — we don't need a separate
  // categories table for v1.
  tags: string[];
  readingMinutes: number;
  heroImage?: string;    // unsplash URL
  body: BlogBlock[];
};

export type BlogBlock =
  | { type: "p"; text: string }
  | { type: "h2"; text: string }
  | { type: "h3"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  | { type: "quote"; text: string; attribution?: string }
  | { type: "note"; text: string };

const FOUNDER: BlogAuthor = { name: "The Helpward team", role: "Founders" };
const TS_TEAM: BlogAuthor = { name: "Trust & Safety", role: "Helpward T&S" };
const OPS_TEAM: BlogAuthor = { name: "Operations", role: "Helpward Ops" };

export const BLOG_POSTS: BlogPost[] = [
  {
    slug: "why-we-built-helpward",
    title: "Why we built Helpward",
    excerpt:
      "The on-demand economy already exists. We didn't need another marketplace — we needed a marketplace that earned the booking instead of optimising for it.",
    author: FOUNDER,
    publishedAt: "2026-05-29",
    tags: ["Founding story", "Mission"],
    readingMinutes: 6,
    heroImage: "https://images.unsplash.com/photo-1521737604893-d14cc237f11d?auto=format&fit=crop&w=1200&q=70",
    body: [
      { type: "p", text:
        "Helpward exists because the on-demand economy already solved logistics and left the harder problem on the table: trust. You can summon almost any service through a phone now. You cannot — most of the time — verify that the person showing up was vetted in a way that warrants letting them into your home, or into your car, or near a member of your family." },
      { type: "p", text:
        "We built Helpward to close that gap. Every helper passes Stripe Identity verification and a third-party criminal background check (Checkr in the US, Triton in Canada) before they can take a single task. Every booking is covered by $1M-per-incident platform insurance. Pricing is published before the booking; payment is held in escrow until the customer marks the task complete." },
      { type: "h2", text: "What the rest of the industry got right" },
      { type: "p", text:
        "We didn't start from a position that the existing players were stupid or lazy. They optimised brilliantly for the variables they cared about — supply liquidity, time-to-arrival, customer acquisition cost. The marketplaces are huge because those optimisations work; if you've ordered DoorDash this week you've seen them working." },
      { type: "p", text:
        "What got optimised at the same time — quietly, by accident in some cases and deliberately in others — was the worker side of the equation. Surge pricing turned into a worker pay cut. Background checks were outsourced to cheap providers with high error rates. Dispute systems were tilted heavily toward the customer because the customer has the credit card. The platforms got better; the workers got squeezed; the customers got dependable speed and unreliable safety." },
      { type: "h2", text: "Where we're trying to be different" },
      { type: "ul", items: [
        "Helpers keep 80% of base + distance fees and 100% of tips. The 20% we keep funds insurance, verification, support, and engineering — not customer-acquisition arms races.",
        "Pricing is flat. A $4.50 service fee plus the helper's base. No surge, no per-minute escalation, no 'priority queue' upcharge.",
        "Background-check adjudication is policy, not algorithm. A human reviewer reads every flagged record and writes the call. The policy is published at /safety/background-checks — we'll defend any disqualification or approval publicly.",
        "Disputes use an asymmetric communication model: the customer's verbatim description stays private, but the helper sees the category and is given a chance to respond. Neither side gets to bully the other through the dispute system.",
        "We publish a quarterly transparency report with stats pulled directly from the production database. If a number looks bad, we publish it anyway.",
      ] },
      { type: "h2", text: "What we're not trying to be" },
      { type: "p", text:
        "Helpward is not trying to be the cheapest option. We can't be — the costs of identity verification, background checks, insurance, and support are real. We pass them on at $4.50 a booking, and that's the deal. If you want the cheapest option, there are plenty of alternatives. If you want the worth-the-booking option, that's what we're building." },
      { type: "p", text:
        "We're also not trying to dispatch as much as possible. The matching engine doesn't push helpers tasks they don't want. The schedule editor exists so helpers can say when they're available — and have customers see it on their public profile. We'd rather have 500 helpers who love being on the platform than 5,000 who feel coerced by it." },
      { type: "h2", text: "What's next" },
      { type: "p", text:
        "Helpward is live in 10 metros: Vancouver, Toronto, Montreal, Seattle, San Francisco, Los Angeles, Austin, Chicago, New York, and Miami. We add cities as the verified-helper supply meets a quality threshold — typically when we can hold response time under 20 minutes during peak hours. We expect 5 more cities live by end of 2026." },
      { type: "p", text:
        "If you want to read the operational craft in more detail, the safety microsite at /safety is where we go deep. If you want to help build it, we're hiring across operations, trust & safety, engineering, design, and community at /careers. If you have feedback — even harsh feedback — hello@helpward.com reads everything." },
    ],
  },
  {
    slug: "how-we-vet-every-helper",
    title: "How we vet every helper",
    excerpt:
      "The end-to-end path from application to approved: identity verification, background checks, adjudication policy, and the human review that runs through all of it.",
    author: TS_TEAM,
    publishedAt: "2026-05-27",
    tags: ["Trust & Safety", "Operations"],
    readingMinutes: 7,
    heroImage: "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?auto=format&fit=crop&w=1200&q=70",
    body: [
      { type: "p", text:
        "This is the unglamorous part of running a marketplace. It's also the part that decides whether the marketplace is actually worth using. Here's the exact path every Helpward helper application takes from submission to either approval or a declined-with-reason." },
      { type: "h2", text: "Step 1: profile completion" },
      { type: "p", text:
        "A helper signs up at /signup?role=provider, completes their basic profile (full name, bio, languages, service radius), and selects the services they want to offer from the catalogue. None of this gates the next step — the substantive vetting is what's gated." },
      { type: "h2", text: "Step 2: Stripe Identity verification" },
      { type: "p", text:
        "Before any background check runs, the helper photographs a government-issued ID (US: driver's licence, state ID, or passport; Canada: provincial licence or passport) and submits a live selfie. Stripe's system matches the face on the ID against the selfie and validates the document against the issuing authority's records. If identity fails, the helper application halts here — we don't proceed to a criminal check using someone's unverified identity." },
      { type: "h2", text: "Step 3: criminal background check" },
      { type: "p", text:
        "US helpers run through Checkr; Canadian helpers run through Triton Canada. Both are FCRA-accredited (US) / PIPEDA-compliant (Canada) and used by major marketplaces. The check pulls: SSN/SIN trace, national sex-offender registry, federal criminal records, county-level criminal records for every county the helper has lived in over the past seven years, OFAC/sanctions screening, and a motor vehicle record if the helper is offering any transportation services." },
      { type: "h2", text: "Step 4: human adjudication" },
      { type: "p", text:
        "Every flagged record goes to a Helpward reviewer. Helpward operates a documented adjudication policy — at /safety/background-checks — that explains what triggers automatic disqualification (sexual offences, violent felonies in past 7 years, convictions involving minors, identity theft, open felony warrants) versus what gets reviewed individually (non-violent misdemeanours over 5 years old, minor traffic violations, expunged records). The policy is public so applicants know what to expect." },
      { type: "p", text:
        "We deliberately don't auto-disqualify on every record. A 12-year-old non-violent misdemeanour with no recent activity is the kind of thing a human reviewer can weigh in context. A recent violent offence is not. The line is published; the calls behind the line are made by people, not by an algorithm." },
      { type: "h2", text: "Step 5: bank linking via Stripe Connect" },
      { type: "p", text:
        "Once the background check clears, helpers link a bank account through Stripe Connect's onboarding flow. This is the lightest step procedurally but the most important for the helper economically — we don't activate the account until payouts can land." },
      { type: "h2", text: "Step 6: final human approval" },
      { type: "p", text:
        "A senior reviewer reads the complete application — profile, ID-verification status, background-check adjudication result, bank-link status — and either approves or declines with a written reason the helper can read and (if applicable) appeal. Approval flips the helper's status to 'approved' and they can go online from /provider/active." },
      { type: "h2", text: "Re-screening" },
      { type: "ul", items: [
        "Annual full re-check on the anniversary of approval.",
        "Continuous monitoring (US) — Checkr surfaces new records on existing helpers as they appear.",
        "On-report — any customer safety report triggers an immediate ad-hoc check.",
        "Status review on prolonged dormancy — helpers who haven't taken a task in 12 months go through identity re-verification before reactivation.",
      ] },
      { type: "h2", text: "Why we're transparent about this" },
      { type: "p", text:
        "Helpward only works if customers trust the bar. The bar is meaningless if it's a black box. So we publish what the bar is: the categories of records that disqualify, the categories that get reviewed, the third-party services we use, the response times we commit to. If your application is declined, you get a written reason and an appeal path. If we make a mistake, we own it." },
      { type: "note", text:
        "The customer-facing summary of this process lives at /help/background-checks-and-insurance. The deep operational detail is at /safety/background-checks. If you're considering applying as a helper, we recommend reading both before submitting." },
    ],
  },
  {
    slug: "transparency-as-a-feature",
    title: "Transparency as a feature, not a press release",
    excerpt:
      "Why we publish a quarterly transparency report from launch, what's in it, and what we'll commit to publishing even when the numbers look bad.",
    author: FOUNDER,
    publishedAt: "2026-05-25",
    tags: ["Transparency", "Operations"],
    readingMinutes: 5,
    body: [
      { type: "p", text:
        "Most marketplaces publish a transparency report when they get big enough that someone external is asking pointed questions. Uber's first one came in 2019, eight years after launch. Airbnb's followed under pressure from regulators. The pattern is: hide the numbers until you can't anymore, then publish a curated subset framed for damage control." },
      { type: "p", text:
        "We made an early call to publish the report from launch — the first one is live at /safety/transparency-report — and to publish the figures that come out of production directly, without curation. This post is why." },
      { type: "h2", text: "Numbers we'd rather not show, shown anyway" },
      { type: "p", text:
        "Helpward at launch will have ugly figures alongside good ones. Response time during the helper-supply ramp will be higher than we want. The cancellation rate in cities with thin supply will spike. Some quarterly disputes will resolve in ways our reviewers second-guess." },
      { type: "p", text:
        "Publishing those numbers anyway is the point. If we only publish when the figures flatter us, the report stops being useful — it becomes a marketing artefact. If we publish every quarter, including the ones where a metric got worse, the report becomes a contract between Helpward and the people using it." },
      { type: "h2", text: "What's in the launch baseline" },
      { type: "ul", items: [
        "Helper-supply pipeline: approved helpers, avg time to approval, approval rate, suspensions for cause.",
        "Booking outcomes: total bookings, success rate (completed with no dispute), avg match time, cancellation rate.",
        "Disputes: filed counts by category, % refunded, avg resolution time.",
        "Safety incidents: total reports, severe incidents, helpers removed for safety cause, avg response time.",
        "Commitment delivery: % of safety reports acked within 4h, % of disputes acked within 24h, % of refunds within 5 business days, % of insurance claims acked within 24h.",
      ] },
      { type: "h2", text: "Commitments we're making about future reports" },
      { type: "ol", items: [
        "Quarterly cadence. First business day of the new quarter, every quarter. If we miss a date, we publish the report alongside an explanation of why it was late.",
        "Production-direct figures. No hand-curation, no PR pre-screen. The methodology paragraph below every section explains exactly how the figure was computed.",
        "Written explanation for any metric that worsens by more than 25% quarter-over-quarter. Buried regressions are how trust dies; we'd rather name them.",
        "Adding law-enforcement transparency Q3 2026. Counts of LE information requests received, complied-with, and rejected, separated by jurisdiction and request type. Same format Cloudflare uses.",
        "Third-party attestation at 50,000 quarterly bookings. Once we cross that threshold an independent firm verifies the figures annually.",
      ] },
      { type: "h2", text: "What this gives us internally" },
      { type: "p", text:
        "There's a side benefit we didn't initially plan for. Publishing the report on a fixed cadence creates an internal forcing function — we can't ship a Q3 report with the same blanks as Q2. So the metrics become real operational targets, not vanity dashboards." },
      { type: "p", text:
        "When the next quarter's metrics are due, we either improved them or we wrote down why we didn't. Both are productive states; what's not productive is the state where the metric exists in a slide deck and nobody outside the company can challenge it." },
      { type: "h2", text: "Read the launch report" },
      { type: "p", text:
        "The Q2 2026 launch report is live at /safety/transparency-report. Most figures show '—' because we're publishing the table structure before we have a full quarter of data — Q3 is the first report with real numbers. We thought publishing the empty baseline first was more honest than waiting three months and showing up with a polished report nobody had any prior expectation of." },
    ],
  },
  {
    slug: "lessons-from-our-first-three-cities",
    title: "Lessons from launching our first three cities",
    excerpt:
      "Vancouver, Toronto, Montreal. What was harder than we expected, what was easier, and what we'd do differently in Seattle.",
    author: OPS_TEAM,
    publishedAt: "2026-05-22",
    tags: ["Operations", "Launches", "Cities"],
    readingMinutes: 8,
    body: [
      { type: "p", text:
        "Helpward launched its first three cities in tight succession: Vancouver, Toronto, Montreal. They share a country, a payment processor, and most of our operational tooling — and almost nothing else about the day-to-day work was the same. Below is what we learned in each, what we'd do differently, and what the next city will inherit." },
      { type: "h2", text: "Vancouver: the helper-supply ramp" },
      { type: "p", text:
        "Vancouver was the first city we'd built a real pipeline in. We expected the bottleneck to be customer acquisition; the actual bottleneck was helper supply. Every helper had to clear Stripe Identity + Checkr/Triton + bank link + human approval — and at the volumes we wanted, the human-approval step became the gating one within two weeks of opening applications." },
      { type: "p", text:
        "We solved it by tripling the review team and writing a tighter adjudication checklist that cut review time per application from 25 minutes to 8. Quality of decisions didn't change; we just stopped asking reviewers to re-derive the policy from scratch on every borderline case. The published policy at /safety/background-checks is the artefact." },
      { type: "h2", text: "Toronto: the density problem inverted" },
      { type: "p", text:
        "Toronto had the opposite problem to Vancouver. The city is geographically vast — driving from the western suburbs to the eastern ones can be 75 minutes — and helper supply concentrated in three neighbourhoods early. Response time was great in those three neighbourhoods and dreadful everywhere else, which was nearly invisible in the citywide average but very visible in the quarterly transparency report we were drafting." },
      { type: "p", text:
        "We shipped two things in response: a helper-supply ledger broken down by sub-neighbourhood (so it's harder to hide a weak corner of the city in the citywide average), and a recruiting push targeted explicitly at the neighbourhoods with thin supply. Response time outside the three core neighbourhoods is still worse than the average, but it's no longer invisible — and the recruitment push is moving the figure." },
      { type: "h2", text: "Montreal: the language reality" },
      { type: "p", text:
        "Helpward shipped in Montreal in English-only. We knew this was an undershoot and assumed the bilingual customer base would carry us until we shipped French. We underestimated how much of the helper applicant pool would self-select out because the application flow was English-only. Helper supply in Montreal was 40% behind plan in week 1; we attributed it to the launch novelty until reviewing it on week 3 told a clearer story." },
      { type: "p", text:
        "French localisation for the helper application + onboarding shipped on day 30; full French support across the customer flow is on the roadmap for Q3 (#17 on the in-house feature list). The lesson, generalised: shipping in a region's primary language is not a marketing nicety. It's a supply-side requirement." },
      { type: "h2", text: "What changed for Seattle" },
      { type: "ul", items: [
        "We started recruiting helpers 8 weeks before customer-facing launch (vs 4 weeks for the Canadian cities). By launch day, response time was at the citywide target in 80% of sub-neighbourhoods.",
        "Sub-neighbourhood supply ledger was built into city launch playbook from day one. Citywide averages aren't allowed to hide thin corners.",
        "Operational support for helpers was staffed locally in Seattle from day one, not from Vancouver. The community-management role at /careers/helper-community-manager is the formalisation of this.",
        "Insurance carrier was pre-cleared for Washington-state operations 12 weeks before launch (we'd discovered, the hard way in Montreal, that adding a new jurisdiction to the carrier policy can take 8+ weeks).",
      ] },
      { type: "h2", text: "What we still don't have a good answer for" },
      { type: "p", text:
        "Surge demand windows during weather events. When a major snowstorm closes Toronto, demand for grocery pickup and elder check-ins spikes 6x while helper availability drops 40%. We don't surge-price; that means we hold the published rate and the matching engine simply runs out of nearby helpers faster. Customers see longer ETAs in the badge; some give up." },
      { type: "p", text:
        "The honest answer is that small unpriced supply shocks expose the structural choice we made. We don't think surge is the answer (see /blog/why-we-built-helpward), but we don't yet have a satisfying alternative. We're testing pre-positioning incentives — paying helpers a flat top-up to be online during forecasted demand windows — and the results so far are modest. This is one of the hardest open problems in the business." },
      { type: "h2", text: "What's the same in every city" },
      { type: "p", text:
        "Tooling carries across cities almost completely. The matching engine, the dispute system, the helper schedule, the admin tooling — these are the same code path everywhere. The pieces that differ city-to-city are operational: language, neighbourhood density, weather, regulatory environment, insurance jurisdiction. Treating tooling as universal and operations as local was the cleanest framing we landed on, and the one we'd recommend to anyone launching a marketplace into a new geography." },
    ],
  },
  {
    slug: "the-case-against-surge-pricing",
    title: "The case against surge pricing",
    excerpt:
      "Surge solves a coordination problem cleverly. It also passes the cost of that problem from the platform to the customer at the moment they can least afford it. Here's why Helpward doesn't.",
    author: FOUNDER,
    publishedAt: "2026-05-20",
    tags: ["Pricing", "Mission"],
    readingMinutes: 6,
    body: [
      { type: "p", text:
        "Surge pricing is an elegant solution. When demand spikes and supply doesn't move, prices rise; some demand evaporates; supply gets pulled in by the higher rate; equilibrium is restored. It's the textbook market-clearing mechanism, working as designed." },
      { type: "p", text:
        "The argument against surge isn't that it's economically wrong. It's that the conditions under which it triggers tend to coincide with the moments customers are most vulnerable. Storm warnings. Concert end times. Bar close on New Year's Eve. These are exactly the moments where someone needs the service, and exactly the moments where dynamic pricing extracts the most. The mechanism is value-neutral; the timing isn't." },
      { type: "h2", text: "What surge is actually fixing" },
      { type: "p", text:
        "Surge is fixing a coordination problem on the platform's side. The platform can't reliably know who's available to work right now; the workers can't reliably know where demand will be; the platform's response is to use price as the signal that brings both sides into alignment." },
      { type: "p", text:
        "Price is a fast signal — it works immediately. It's also a regressive one. A surge multiplier hits a customer at 11pm in a snowstorm equally regardless of their ability to absorb it. The mechanism doesn't distinguish between a customer who can shrug at 2.5x pricing and one who'll forgo the booking and walk home in the cold. The mechanism doesn't try to distinguish." },
      { type: "h2", text: "What we do instead" },
      { type: "ul", items: [
        "Pre-position incentives for helpers. We pay a flat top-up for helpers who go online during forecasted demand windows — weather alerts, major event end times. The cost is borne by Helpward, not surfaced to customers as a higher booking price.",
        "Honest ETA badges. When supply is genuinely thin, the live ETA on our service cards shows it. 'Starts at 11pm' is a more honest signal than '2x surge in effect' — customers can decide whether to wait or to look elsewhere.",
        "Service-specific supply ramps. We over-recruit for services that show seasonal demand spikes (driving services in winter, errand-runners around the holidays). The marginal cost is real but bearable as a sustained operating expense.",
        "Cap on busy-day cancellation penalties. When supply is thin and helpers cancel because they were overcommitted, we waive the typical penalty. We'd rather hold the helper's enthusiasm for the platform than enforce a fee that suggests the platform's contract supersedes the helper's life.",
      ] },
      { type: "h2", text: "What we accept as the trade-off" },
      { type: "p", text:
        "These choices have a cost. Without surge, Helpward's response time during demand spikes is worse than competitors who do surge. We can see it in the operational metrics; we'll publish it in the quarterly transparency report at /safety/transparency-report. We don't think this is a hidden cost — we think it's the cost of the position." },
      { type: "p", text:
        "Some customers will book us during normal hours and book a competitor during a storm because the competitor can dispatch faster at the cost of a multiplier. That's a reasonable decision the customer can make. Our pitch isn't 'we're the fastest in every condition'; it's 'we won't extract from you at the moment you're most vulnerable, and the operational choices that make that promise true are visible'." },
      { type: "h2", text: "Is this sustainable?" },
      { type: "p", text:
        "We don't know yet. The honest answer is that no on-demand marketplace has run at scale without surge as a release valve, so we can't point to a 10-year case study and say 'yes, the economics hold'. What we can say is that the operational costs of running without surge are bounded — pre-positioning incentives and over-recruitment are line items with knowable budgets — and that the trust signal from running without surge has measurable value in the parts of the booking funnel we can observe." },
      { type: "p", text:
        "We'll know in a year. The transparency report will surface the data either way — if it turns out that running without surge isn't sustainable at our scale, we'll say so and revise the position publicly. The position itself isn't the point; the willingness to defend it with operational mechanics rather than press releases is." },
    ],
  },
];

export function getPost(slug: string): BlogPost | null {
  return BLOG_POSTS.find((p) => p.slug === slug) ?? null;
}

export function getAllTags(): string[] {
  const set = new Set<string>();
  for (const p of BLOG_POSTS) for (const t of p.tags) set.add(t);
  return Array.from(set).sort();
}
