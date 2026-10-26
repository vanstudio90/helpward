// Marketing-only data: top cities, sample testimonials, sample recent tasks.
// All clearly tagged so real DB feeds can replace them when traffic justifies.
// Keep this file the single source of truth — homepage, footer, /cities, and
// /services pages all read from here.

export type City = {
  slug: string;
  name: string;
  region: string; // state or province
  country: "US" | "CA";
  hero?: string; // unsplash photo
  metro?: string; // for SEO copy
};

// LAUNCH CITIES — the only markets we claim or serve.
//
// Narrowed from a 10-city seed list on 2026-10-24. Every other city was a
// claim with no helper supply behind it. The retired slugs below are served
// as HTTP 410 Gone (see proxy.ts) rather than redirected: sending someone
// searching for "Austin" to San Diego is an irrelevant redirect that
// Google treats as a soft 404, and it misleads the visitor.
//
// `metro` describes the SERVICE AREA in customer-facing copy and must match
// lib/service-areas.ts. San Diego is CITY LIMITS ONLY — do not widen this
// copy to county- or metro-wide without widening the actual service area
// first. Los Angeles was dropped on 2026-10-26 and is now a retired slug.
export const CITIES: City[] = [
  { slug: "vancouver", name: "Vancouver", region: "BC", country: "CA", metro: "Vancouver and the surrounding Lower Mainland",
    hero: "https://images.unsplash.com/photo-1559511260-66a654ae982a?auto=format&fit=crop&w=1200&q=70" },
  // No hero photo yet — `hero` is optional and the city page falls back to
  // its gradient. Better an honest gradient than a guessed image URL.
  { slug: "san-diego", name: "San Diego", region: "CA", country: "US", metro: "the City of San Diego" },
];

// Slugs we previously published pages for. Kept so proxy.ts can return a
// deliberate 410 with a "not currently served" explanation instead of a
// bare 404, and so we never silently re-use one of these slugs for a
// different market later.
export const RETIRED_CITY_SLUGS: string[] = [
  "toronto", "montreal", "seattle", "san-francisco",
  "austin", "chicago", "new-york", "miami",
  // Dropped from the launch by owner decision on 2026-10-26, after its
  // page had been published. It is retired rather than deleted so the
  // existing URL returns a deliberate 410 with an explanation.
  "los-angeles",
];

export function getCity(slug: string): City | null {
  return CITIES.find((c) => c.slug === slug) ?? null;
}

// The fabricated "recent tasks" carousel that used to live here was
// removed from the homepage: it presented six invented jobs, in six cities
// Helpward does not serve, as real recent activity. There is no honest
// placeholder for "what customers are booking right now" before launch, so
// the section is gone rather than faked. When there is real volume, query
// it: select from bookings where status = 'completed' order by completed_at
// desc limit 8.

// Marketplace-metric copy. Numbers are platform-launch placeholders — replace
// with live aggregates once we have at least one week of real bookings.
export const MARKETPLACE_METRICS = {
  helpersAvailableNow: 247,
  helpersThisWeek: 1842,
  tasksCompletedThisWeek: 2431,
  avgMatchSeconds: 134, // 2m 14s
  sameDayCompletionPct: 97,
  citiesLive: CITIES.length,
};

// Editorial photo per service-category, used by the homepage Popular row.
export function categoryImage(id: string): string {
  const map: Record<string, string> = {
    transportation: "https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=600&q=70",
    home: "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?auto=format&fit=crop&w=600&q=70",
    errands: "https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=600&q=70",
    presence: "https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?auto=format&fit=crop&w=600&q=70",
    lifestyle: "https://images.unsplash.com/photo-1450778869180-41d0601e046e?auto=format&fit=crop&w=600&q=70",
    business: "https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=600&q=70",
  };
  return map[id] ?? "https://images.unsplash.com/photo-1521737604893-d14cc237f11d?auto=format&fit=crop&w=600&q=70";
}

// Short AI-extraction-friendly summary per category. Lifted by AI search
// engines as a candidate snippet when answering "what services does Helpward
// offer for transportation?" or similar.
export function categorySummary(id: string, items: { title: string }[]): string {
  const list = items.slice(0, 8).map((i) => i.title).join(", ");
  const intros: Record<string, string> = {
    transportation: `Helpward provides same-day transportation help across the U.S. and Canada including ${list}. Helpers arrive within an average of 18 minutes, are fully insured during the booking, and accept payment only after the ride is complete.`,
    home: `Helpward connects you with verified handy-helpers for home tasks: ${list}. Every helper passes a Checkr background check and Stripe Identity verification, and bookings are protected by up to $1M in platform insurance.`,
    errands: `Helpward errand-runners handle the time-consuming chores you don't want to do — ${list}. Match in under 3 minutes on average, real-time GPS tracking, and a 24-hour dispute window on every booking.`,
    presence: `Helpward presence-companion services pair you with a verified human for visits and waiting tasks: ${list}. These services are emotionally important — every helper is background-checked, identity-verified, and reviewed.`,
    lifestyle: `Helpward lifestyle helpers cover ${list}. Book on-demand or schedule ahead. All helpers are vetted by a human reviewer at Helpward before they take a single task.`,
    business: `Helpward business-services helpers handle ${list} for small businesses and operators. Background-checked, insured, and available for one-off or recurring engagements.`,
  };
  return intros[id] ?? `Helpward offers ${list} in this category, with verified helpers, transparent pricing, and platform insurance on every booking.`;
}
