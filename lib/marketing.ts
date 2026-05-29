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

// 10 cities seed list — the metros where we have helper supply density.
// Order = display order in footer + sitemap + /cities index.
export const CITIES: City[] = [
  { slug: "vancouver", name: "Vancouver", region: "BC", country: "CA", metro: "Greater Vancouver",
    hero: "https://images.unsplash.com/photo-1559511260-66a654ae982a?auto=format&fit=crop&w=1200&q=70" },
  { slug: "toronto", name: "Toronto", region: "ON", country: "CA", metro: "Greater Toronto Area",
    hero: "https://images.unsplash.com/photo-1517090504586-fde19ea6066f?auto=format&fit=crop&w=1200&q=70" },
  { slug: "montreal", name: "Montreal", region: "QC", country: "CA", metro: "Greater Montreal",
    hero: "https://images.unsplash.com/photo-1519178614-68673b201f36?auto=format&fit=crop&w=1200&q=70" },
  { slug: "seattle", name: "Seattle", region: "WA", country: "US", metro: "Seattle metro",
    hero: "https://images.unsplash.com/photo-1502175353174-a7a1d2b8a2b3?auto=format&fit=crop&w=1200&q=70" },
  { slug: "san-francisco", name: "San Francisco", region: "CA", country: "US", metro: "Bay Area",
    hero: "https://images.unsplash.com/photo-1501594907352-04cda38ebc29?auto=format&fit=crop&w=1200&q=70" },
  { slug: "los-angeles", name: "Los Angeles", region: "CA", country: "US", metro: "Greater LA",
    hero: "https://images.unsplash.com/photo-1444723121867-7a241cacace9?auto=format&fit=crop&w=1200&q=70" },
  { slug: "austin", name: "Austin", region: "TX", country: "US", metro: "Austin metro",
    hero: "https://images.unsplash.com/photo-1531218150217-54595bc2b934?auto=format&fit=crop&w=1200&q=70" },
  { slug: "chicago", name: "Chicago", region: "IL", country: "US", metro: "Chicagoland",
    hero: "https://images.unsplash.com/photo-1494522855154-9297ac14b55f?auto=format&fit=crop&w=1200&q=70" },
  { slug: "new-york", name: "New York", region: "NY", country: "US", metro: "NYC metro",
    hero: "https://images.unsplash.com/photo-1496442226666-8d4d0e62e6e9?auto=format&fit=crop&w=1200&q=70" },
  { slug: "miami", name: "Miami", region: "FL", country: "US", metro: "Greater Miami",
    hero: "https://images.unsplash.com/photo-1535498730771-e735b998cd64?auto=format&fit=crop&w=1200&q=70" },
];

export function getCity(slug: string): City | null {
  return CITIES.find((c) => c.slug === slug) ?? null;
}

// Sample recent tasks for the homepage carousel. Replace with a real query
// (`select bookings where status='completed' order by completed_at desc limit 8`)
// once the platform has volume.
export const SAMPLE_RECENT_TASKS = [
  { id: "rt1", title: "Errand Runner", ago: "10 min ago", city: "San Francisco", region: "CA", price: 20,
    img: "https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=600&q=70" },
  { id: "rt2", title: "Furniture Assembly", ago: "25 min ago", city: "Los Angeles", region: "CA", price: 35,
    img: "https://images.unsplash.com/photo-1581235720704-06d3acfcb36f?auto=format&fit=crop&w=600&q=70" },
  { id: "rt3", title: "Ride to Airport", ago: "35 min ago", city: "Vancouver", region: "BC", price: 40,
    img: "https://images.unsplash.com/photo-1494976388531-d1058494cdd8?auto=format&fit=crop&w=600&q=70" },
  { id: "rt4", title: "Package Delivery", ago: "45 min ago", city: "Austin", region: "TX", price: 12,
    img: "https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=600&q=70" },
  { id: "rt5", title: "Wait in Line", ago: "1 hr ago", city: "New York", region: "NY", price: 25,
    img: "https://images.unsplash.com/photo-1521737604893-d14cc237f11d?auto=format&fit=crop&w=600&q=70" },
  { id: "rt6", title: "Elder Companion", ago: "1 hr ago", city: "Chicago", region: "IL", price: 30,
    img: "https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?auto=format&fit=crop&w=600&q=70" },
];

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
