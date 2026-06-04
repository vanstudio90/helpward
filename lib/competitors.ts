// Competitor comparison catalog. Powers /vs/[slug] pages — high-intent
// search traffic ("taskrabbit vs", "uber vs", etc.) lands on a fair
// side-by-side feature matrix.
//
// Posture: only compare on FEATURE PRESENCE, not on specific competitor
// pricing or operational details that change frequently and we can't
// keep fresh. Each row is binary "Helpward / Competitor / Notes". When
// Helpward has a feature the competitor doesn't publicly advertise, the
// competitor column says "Not advertised" — never "No". Avoiding factual
// claims about other companies we can't verify each quarter.

export type ComparisonRow = {
  feature: string;
  helpward: string;       // What Helpward offers — facts about our own product
  competitor: string;     // Competitor column — "Yes" / "Not advertised" / "Limited"
  notes?: string;         // Optional one-line context
};

export type Competitor = {
  slug: string;
  brandName: string;      // Display name with correct casing
  categoryLine: string;   // 1-line positioning of what they do
  trafficContext: string; // What customers typically search for; helps copy hit the intent
  matrix: ComparisonRow[];
  cta: string;            // Closing pitch tailored to why you'd switch
};

export const COMPETITORS: Competitor[] = [
  {
    slug: "taskrabbit",
    brandName: "TaskRabbit",
    categoryLine: "On-demand handyman + errand marketplace owned by IKEA.",
    trafficContext: "If you're searching for a TaskRabbit alternative you usually want either lower fees, faster matching, or a service category they don't cover in your city.",
    matrix: [
      {
        feature: "ID + background-checked helpers",
        helpward: "Required for every helper",
        competitor: "Yes",
        notes: "Parity — table stakes for both.",
      },
      {
        feature: "Insurance on every booking",
        helpward: "Included on every booking",
        competitor: "Yes",
        notes: "Both platforms ship marketplace insurance.",
      },
      {
        feature: "Real-time GPS tracking",
        helpward: "Yes — live map from accept to complete",
        competitor: "Not advertised",
      },
      {
        feature: "Photo proof of completion",
        helpward: "Helpers attach up to 3 photos; customer can revoke from portfolio",
        competitor: "Not advertised",
      },
      {
        feature: "Recurring bookings (weekly / biweekly / monthly)",
        helpward: "Native recurring series with pause / skip-next / cadence editing",
        competitor: "Not advertised",
      },
      {
        feature: "Multi-task bundles in one trip",
        helpward: "Up to 5 stops, one helper, one service fee",
        competitor: "Not advertised",
      },
      {
        feature: "Save favorite helper + re-book first",
        helpward: "Star helper → next request routes to them first for 2 minutes",
        competitor: "Limited",
        notes: "Most competitors let you re-book by name; preferred-routing for 2 min is a Helpward specific.",
      },
      {
        feature: "Helper portfolio gallery on public profile",
        helpward: "Helpers feature past work photos with customer veto",
        competitor: "Not advertised",
      },
      {
        feature: "Pay after task completes",
        helpward: "Authorize upfront, charged only after task ends",
        competitor: "Yes",
        notes: "Parity.",
      },
      {
        feature: "Customer data export (GDPR / CCPA / PIPEDA)",
        helpward: "Self-serve, auto-assembled within 30 min, 7-day signed download link",
        competitor: "Yes — manual request",
        notes: "Both comply with the law; Helpward automates the turnaround.",
      },
    ],
    cta: "If you want photo proof, live GPS, recurring bookings, and bundled trips in one app, Helpward is built around all four. Free to sign up — first task gets matched in minutes.",
  },
];

export function getCompetitor(slug: string): Competitor | null {
  return COMPETITORS.find((c) => c.slug === slug) ?? null;
}
