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
  {
    slug: "instacart",
    brandName: "Instacart",
    categoryLine: "Grocery-focused delivery marketplace with deep store partnerships.",
    trafficContext: "Instacart is the right call if your only need is a grocery run from a specific store catalog. If you also want a helper who can pick up the dry-cleaning, take the dog out, and assemble the IKEA shelf on the same trip, you're looking at the wrong vertical.",
    matrix: [
      {
        feature: "Category breadth",
        helpward: "Errands, deliveries, home help, transportation, presence, business — one helper across categories",
        competitor: "Grocery + a few partner-retail categories",
        notes: "Helpward's headline advantage; Instacart deliberately specializes in groceries.",
      },
      {
        feature: "ID + background-checked workers",
        helpward: "Required for every helper",
        competitor: "Yes",
        notes: "Parity.",
      },
      {
        feature: "Real-time GPS tracking",
        helpward: "Yes — live map from accept to complete",
        competitor: "Yes",
        notes: "Parity — both ship live shopper tracking.",
      },
      {
        feature: "Photo proof of completion",
        helpward: "Up to 3 photos per booking; customer can revoke from helper portfolio later",
        competitor: "Limited",
        notes: "Instacart shows delivery confirmation photos in some markets but not the curated, revocable portfolio model.",
      },
      {
        feature: "Multi-category bundles in one trip",
        helpward: "Up to 5 stops, one helper, one service fee — mix grocery + dry-cleaning + post office freely",
        competitor: "Not advertised",
      },
      {
        feature: "Recurring bookings (weekly / biweekly / monthly)",
        helpward: "Native recurring series with pause / skip-next / cadence editing",
        competitor: "Yes",
        notes: "Both offer recurring grocery; only Helpward extends recurring to errands + presence visits.",
      },
      {
        feature: "Save favorite helper + re-book first",
        helpward: "Star helper → next request routes to them first for 2 minutes",
        competitor: "Limited",
      },
      {
        feature: "Pay after task completes",
        helpward: "Authorize upfront, charged only after task ends",
        competitor: "Yes",
        notes: "Parity.",
      },
    ],
    cta: "Pick Instacart when your trip is groceries-only and the store is in their partner network. Pick Helpward when you want a single helper across multiple stops or task categories.",
  },
  {
    slug: "doordash",
    brandName: "DoorDash",
    categoryLine: "Restaurant delivery marketplace with growing convenience-store coverage.",
    trafficContext: "DoorDash is great when the task is a single restaurant order. The moment you need a non-restaurant errand attached — grocery run, prescription pickup, dry-cleaning return — you're juggling two apps.",
    matrix: [
      {
        feature: "Category breadth",
        helpward: "Errands, deliveries, home help, transportation, presence, business",
        competitor: "Restaurants + convenience + a few grocery categories",
      },
      {
        feature: "Real-time GPS tracking",
        helpward: "Yes — live map from accept to complete",
        competitor: "Yes",
        notes: "Parity.",
      },
      {
        feature: "ID + background-checked workers",
        helpward: "Required for every helper",
        competitor: "Yes",
        notes: "Parity.",
      },
      {
        feature: "Insurance on every booking",
        helpward: "Included on every booking",
        competitor: "Yes",
        notes: "Parity — marketplace insurance is table stakes.",
      },
      {
        feature: "Bundle restaurant + errand + home task in one trip",
        helpward: "Up to 5 stops, one helper, one service fee",
        competitor: "Not advertised",
      },
      {
        feature: "Recurring same-task bookings",
        helpward: "Native recurring series for any service",
        competitor: "Limited",
      },
      {
        feature: "Photo proof of completion",
        helpward: "Helpers attach up to 3 photos; customer can revoke from portfolio",
        competitor: "Yes",
        notes: "Both ship delivery photos; Helpward also surfaces them as opt-in portfolio content for repeat-booking trust.",
      },
      {
        feature: "Save favorite helper + re-book first",
        helpward: "Star helper → next request routes to them first for 2 minutes",
        competitor: "Limited",
      },
    ],
    cta: "Pick DoorDash when the task is takeout from a specific restaurant. Pick Helpward when you need a helper who can stop by three places on one trip or do a non-food task.",
  },
  {
    slug: "uber-eats",
    brandName: "Uber Eats",
    categoryLine: "Restaurant + select grocery delivery inside the Uber app ecosystem.",
    trafficContext: "Uber Eats wins on app convenience for existing Uber riders. The trade-off is the same as other delivery-only apps: you can't ask the same helper to also pick up your prescription.",
    matrix: [
      {
        feature: "Category breadth",
        helpward: "Errands, deliveries, home help, transportation, presence, business",
        competitor: "Restaurants + select grocery + alcohol in some markets",
      },
      {
        feature: "Lives inside an existing rideshare app",
        helpward: "No — Helpward is its own dedicated app",
        competitor: "Yes",
        notes: "If your phone is full of Uber rides this is a real convenience win for Uber Eats.",
      },
      {
        feature: "Real-time GPS tracking",
        helpward: "Yes — live map from accept to complete",
        competitor: "Yes",
        notes: "Parity.",
      },
      {
        feature: "Photo proof of completion",
        helpward: "Up to 3 photos per booking; customer can revoke from portfolio",
        competitor: "Limited",
      },
      {
        feature: "Bundle delivery + errand + home task in one trip",
        helpward: "Up to 5 stops, one helper, one service fee",
        competitor: "Not advertised",
      },
      {
        feature: "Native recurring bookings",
        helpward: "Yes — recurring series with pause / skip-next / cadence editing",
        competitor: "Not advertised",
      },
      {
        feature: "Save favorite worker + re-book first",
        helpward: "Star helper → next request routes to them first for 2 minutes",
        competitor: "Limited",
      },
    ],
    cta: "Pick Uber Eats when you want a restaurant order and you already use Uber every day. Pick Helpward when you want a helper across multiple stops or non-food categories.",
  },
  {
    slug: "dolly",
    brandName: "Dolly",
    categoryLine: "On-demand moving + heavy delivery marketplace.",
    trafficContext: "Dolly is built for the move-the-couch / pick-up-from-IKEA single-task vertical. If your move ALSO needs grocery restocking after, dog care during, or recurring cleaning visits to the new place, you're looking at a single-vertical tool.",
    matrix: [
      {
        feature: "Category breadth",
        helpward: "Errands, deliveries, home help, transportation, presence, business",
        competitor: "Moving + heavy delivery only",
      },
      {
        feature: "ID + background-checked workers",
        helpward: "Required for every helper",
        competitor: "Yes",
        notes: "Parity.",
      },
      {
        feature: "Insurance on every booking",
        helpward: "Included on every booking",
        competitor: "Yes",
        notes: "Parity.",
      },
      {
        feature: "Real-time GPS tracking",
        helpward: "Yes — live map from accept to complete",
        competitor: "Yes",
        notes: "Parity.",
      },
      {
        feature: "Photo proof of completion",
        helpward: "Helpers attach up to 3 photos; customer can revoke from portfolio",
        competitor: "Not advertised",
      },
      {
        feature: "Multi-task bundles across categories",
        helpward: "Up to 5 stops, mix moving + grocery + errands freely",
        competitor: "Not advertised",
      },
      {
        feature: "Recurring weekly / biweekly / monthly bookings",
        helpward: "Native recurring series for any service",
        competitor: "Not advertised",
      },
      {
        feature: "Pay after task completes",
        helpward: "Authorize upfront, charged only after task ends",
        competitor: "Yes",
        notes: "Parity.",
      },
    ],
    cta: "Pick Dolly when the entire task is moving an object from A to B. Pick Helpward when the move is part of a bigger life-admin trip you'd rather hand to one person.",
  },
];

export function getCompetitor(slug: string): Competitor | null {
  return COMPETITORS.find((c) => c.slug === slug) ?? null;
}
