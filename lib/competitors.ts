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
  {
    slug: "bellhop",
    brandName: "Bellhop",
    categoryLine: "Full-service moving company that bundles labor + trucks for whole-home relocations.",
    trafficContext: "Bellhop is the right call when you're moving a whole apartment with a truck and a crew. Helpward is the right call when the move is smaller, more frequent, or part of a stack of other life-admin tasks.",
    matrix: [
      {
        feature: "Category breadth",
        helpward: "Errands, deliveries, home help, transportation, presence, business",
        competitor: "Full-service moving + select labor-only options",
      },
      {
        feature: "Includes a truck + multi-person crew",
        helpward: "No — Helpward is single-helper trips",
        competitor: "Yes",
        notes: "If your move needs a truck and 3 movers, Bellhop is built for that; Helpward isn't.",
      },
      {
        feature: "Background-checked workers",
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
        competitor: "Limited",
      },
      {
        feature: "Bundle moving + grocery restock + cleaning in one trip",
        helpward: "Up to 5 stops across categories, one helper, one service fee",
        competitor: "Not advertised",
      },
      {
        feature: "Recurring weekly / biweekly / monthly bookings",
        helpward: "Native recurring series for any service",
        competitor: "Not advertised",
      },
      {
        feature: "Save favorite helper + re-book first",
        helpward: "Star helper → next request routes to them first for 2 minutes",
        competitor: "Limited",
      },
      {
        feature: "Photo proof of completion",
        helpward: "Up to 3 photos per booking; customer can revoke from portfolio",
        competitor: "Not advertised",
      },
    ],
    cta: "Pick Bellhop when you're moving a whole household with a truck and a crew. Pick Helpward for everything else around the move — the grocery restock at the new place, the recurring cleaning visits, the dog care during the chaos.",
  },
  {
    slug: "rover",
    brandName: "Rover",
    categoryLine: "Pet-care marketplace specialised in dog walking, boarding, drop-in visits, and house-sitting.",
    trafficContext: "Rover is the right call when the task is specifically dog walking or pet boarding and you want a sitter you can vet on profile pages. Helpward is the right call when pet care is part of a broader trip or one-off.",
    matrix: [
      {
        feature: "Category breadth",
        helpward: "Errands, deliveries, home help, transportation, presence, business — pet care is one category among many",
        competitor: "Pet care only (dog walking, boarding, sitting, daycare)",
      },
      {
        feature: "Multi-day overnight boarding in the sitter's home",
        helpward: "Not advertised",
        competitor: "Yes",
        notes: "If you need overnight boarding while you travel, Rover is built around that flow; Helpward is per-task bookings.",
      },
      {
        feature: "Background-checked workers",
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
        notes: "Both ship live walk tracking.",
      },
      {
        feature: "Photo proof of completion",
        helpward: "Up to 3 photos per booking; customer can revoke from portfolio",
        competitor: "Yes",
        notes: "Both ship walk-summary photos; Helpward additionally surfaces them as opt-in portfolio for repeat-booking trust.",
      },
      {
        feature: "Bundle dog walk + grocery + dry-cleaning in one trip",
        helpward: "Up to 5 stops across categories, one helper, one service fee",
        competitor: "Not advertised",
      },
      {
        feature: "Recurring weekly / biweekly bookings",
        helpward: "Native recurring series for any service",
        competitor: "Yes",
        notes: "Parity — both offer recurring walks/visits.",
      },
      {
        feature: "Save favorite helper + re-book first",
        helpward: "Star helper → next request routes to them first for 2 minutes",
        competitor: "Yes",
        notes: "Both support re-booking by name; Helpward also gives the favourite a 2-minute exclusive offer window before broader broadcast.",
      },
    ],
    cta: "Pick Rover when you specifically need a dedicated dog walker or overnight pet boarder. Pick Helpward when pet care is one of several errands on the same trip, or for a one-off check-in attached to a non-pet task.",
  },
  {
    slug: "wag",
    brandName: "Wag",
    categoryLine: "App-based on-demand dog walking + pet care marketplace.",
    trafficContext: "Wag's wheelhouse is the spur-of-the-moment dog walk you didn't plan on. Helpward overlaps on the convenience layer but extends to the rest of the day's tasks.",
    matrix: [
      {
        feature: "Category breadth",
        helpward: "Errands, deliveries, home help, transportation, presence, business — pet care is one of many",
        competitor: "Pet care only (walking, sitting, training, vet visits)",
      },
      {
        feature: "Vet telehealth integration",
        helpward: "No",
        competitor: "Yes",
        notes: "Wag bundles a vet-chat feature; Helpward is task-marketplace only.",
      },
      {
        feature: "Background-checked workers",
        helpward: "Required for every helper",
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
        helpward: "Up to 3 photos per booking; customer can revoke from portfolio",
        competitor: "Yes",
        notes: "Both ship walk-summary photos.",
      },
      {
        feature: "Bundle dog walk with non-pet errands in one trip",
        helpward: "Up to 5 stops across categories, one helper, one service fee",
        competitor: "Not advertised",
      },
      {
        feature: "Recurring weekly walks",
        helpward: "Native recurring series for any service",
        competitor: "Yes",
        notes: "Parity.",
      },
      {
        feature: "Insurance on every booking",
        helpward: "Included on every booking",
        competitor: "Yes",
        notes: "Parity.",
      },
    ],
    cta: "Pick Wag when you need a walker on 30 minutes notice and want the vet-chat bundle. Pick Helpward when the walk is part of a stack of other tasks or when you want a single helper for the whole day's life-admin.",
  },
  {
    slug: "care-com",
    brandName: "Care.com",
    categoryLine: "Broad home-services marketplace covering childcare, senior care, housekeeping, pet care, and tutoring.",
    trafficContext: "Care.com is built around recurring, relationship-based providers you vet yourself from profile pages. Helpward is on-demand single-task matching with platform vetting baked in.",
    matrix: [
      {
        feature: "Category breadth",
        helpward: "Errands, deliveries, home help, transportation, presence, business",
        competitor: "Childcare, senior care, pet care, housekeeping, tutoring",
      },
      {
        feature: "Long-term recurring nanny / senior-care relationships",
        helpward: "Not advertised",
        competitor: "Yes",
        notes: "Care.com's core flow is interview-and-hire ongoing caregivers; Helpward is per-task matching not multi-month employment.",
      },
      {
        feature: "Background checks included on every helper",
        helpward: "Required for every helper",
        competitor: "Yes",
        notes: "Care.com runs background checks on caregivers who opt in; both platforms ship verified providers.",
      },
      {
        feature: "On-demand single-task booking matched in minutes",
        helpward: "Yes — first verified helper to accept becomes yours",
        competitor: "Not advertised",
        notes: "Care.com optimises for slow-vetted long-term relationships; Helpward optimises for minutes-from-request to helper-en-route.",
      },
      {
        feature: "Real-time GPS tracking",
        helpward: "Yes — live map from accept to complete",
        competitor: "Not advertised",
      },
      {
        feature: "Photo proof of completion",
        helpward: "Up to 3 photos per booking; customer can revoke from portfolio",
        competitor: "Not advertised",
      },
      {
        feature: "Bundle errands + presence visit + home task in one trip",
        helpward: "Up to 5 stops across categories, one helper, one service fee",
        competitor: "Not advertised",
      },
      {
        feature: "Save favorite helper + re-book first",
        helpward: "Star helper → next request routes to them first for 2 minutes",
        competitor: "Yes",
        notes: "Care.com's whole model is repeat caregiver relationships; Helpward's preferred-routing layers on top of single-task matching.",
      },
    ],
    cta: "Pick Care.com when you're hiring a long-term nanny, senior caregiver, or recurring housekeeper you've personally interviewed. Pick Helpward for the in-between one-offs — the grocery run when the nanny's sick, the prescription pickup, the chair assembly.",
  },
];

export function getCompetitor(slug: string): Competitor | null {
  return COMPETITORS.find((c) => c.slug === slug) ?? null;
}
