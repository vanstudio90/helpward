import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, Scale, ShoppingCart, Truck, Wrench, Soup, PawPrint } from "lucide-react";
import { MarketingShell } from "@/components/MarketingShell";
import { COMPETITORS } from "@/lib/competitors";

export const metadata: Metadata = {
  title: "Helpward comparisons — vs TaskRabbit, Instacart, DoorDash, Dolly, Bellhop, Rover, Wag, Care.com",
  description: "Honest side-by-side comparisons. Real-time GPS, photo proof, multi-task bundles, recurring bookings, favorite-helper routing — see how Helpward stacks against the apps you already use.",
  alternates: { canonical: "/vs" },
};

// Categorise each competitor by vertical so the index reads as a "pick your
// own adventure" instead of a flat list. Hardcoded mapping rather than
// adding a `vertical` field to lib/competitors so the catalog stays focused
// on facts about competitors, not opinions about grouping them.
const VERTICAL: Record<string, { label: string; icon: typeof Wrench }> = {
  taskrabbit: { label: "Handyman + errands",   icon: Wrench },
  handy:      { label: "Handyman + errands",   icon: Wrench },
  "care-com": { label: "Home + caregivers",    icon: Wrench },
  thumbtack:  { label: "Pro contractors",      icon: Wrench },
  angi:       { label: "Pro contractors",      icon: Wrench },
  instacart:  { label: "Grocery delivery",     icon: ShoppingCart },
  doordash:   { label: "Restaurant delivery",  icon: Soup },
  "uber-eats": { label: "Restaurant delivery", icon: Soup },
  dolly:      { label: "Moving + heavy haul",  icon: Truck },
  bellhop:    { label: "Moving + heavy haul",  icon: Truck },
  rover:      { label: "Pet care",             icon: PawPrint },
  wag:        { label: "Pet care",             icon: PawPrint },
};

export default function VersusIndexPage() {
  // Group competitors by vertical label, preserving insertion order. Avoids
  // pulling in a sort dep — handful of items, plain Map does fine.
  const buckets = new Map<string, { icon: typeof Wrench; items: typeof COMPETITORS }>();
  for (const c of COMPETITORS) {
    const v = VERTICAL[c.slug] ?? { label: "Other", icon: Scale };
    if (!buckets.has(v.label)) buckets.set(v.label, { icon: v.icon, items: [] });
    buckets.get(v.label)!.items.push(c);
  }

  const ld = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": "https://helpward.com/vs#collection",
    name: "Helpward comparisons",
    description: "Side-by-side comparisons of Helpward versus other gig-economy and delivery apps.",
    url: "https://helpward.com/vs",
    hasPart: COMPETITORS.map((c) => ({
      "@type": "Article",
      "@id": `https://helpward.com/vs/${c.slug}#article`,
      name: `Helpward vs ${c.brandName}`,
      url: `https://helpward.com/vs/${c.slug}`,
    })),
  };

  return (
    <MarketingShell
      title="Helpward vs…"
      subtitle="Honest side-by-side comparisons. We only compare on features we can verify."
    >
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />

      <p className="lead">
        Most gig apps own a single vertical — groceries, restaurants, moving, handyman tasks. Helpward
        does all of those AND lets one helper bundle up to 5 stops across categories in a single trip.
        Below is a fair, feature-by-feature look at how we line up against the apps you probably
        already have on your phone. For the long-form arguments, read{" "}
        <Link href="/vs/why" className="font-semibold text-brand-700 hover:underline">why we built Helpward</Link>{" "}
        and{" "}
        <Link href="/vs/trust" className="font-semibold text-brand-700 hover:underline">how the trust layers work</Link>.
      </p>

      <div className="not-prose space-y-8 mt-6">
        {[...buckets.entries()].map(([label, bucket]) => {
          const Icon = bucket.icon;
          return (
            <section key={label}>
              <div className="flex items-center gap-2 mb-3">
                <span className="w-7 h-7 rounded-lg bg-brand-50 text-brand-700 inline-flex items-center justify-center">
                  <Icon className="w-4 h-4" />
                </span>
                <h2 className="text-base font-bold text-slate-900">{label}</h2>
              </div>
              <ul className="grid sm:grid-cols-2 gap-3">
                {bucket.items.map((c) => (
                  <li key={c.slug}>
                    <Link
                      href={`/vs/${c.slug}`}
                      className="block h-full rounded-2xl border border-slate-100 bg-white p-4 hover:border-brand-200 hover:shadow-sm transition"
                    >
                      <div className="text-sm font-bold text-slate-900">
                        Helpward vs {c.brandName}
                      </div>
                      <p className="text-xs text-slate-600 mt-1 leading-relaxed line-clamp-3">
                        {c.categoryLine}
                      </p>
                      <div className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-brand-700">
                        Read comparison <ArrowRight className="w-3 h-3" />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>

      <h2>How we run these comparisons</h2>
      <ul>
        <li><strong>Feature presence only.</strong> We don&apos;t publish competitor pricing or operational specifics because those drift quarter to quarter and we can&apos;t keep them accurate.</li>
        <li><strong>&ldquo;Not advertised&rdquo; never &ldquo;No.&rdquo;</strong> If a competitor doesn&apos;t publicly document a feature, we say so. We never make negative factual claims about a company we can&apos;t verify each quarter.</li>
        <li><strong>Parity is called out.</strong> Where both platforms ship the same feature (background checks, insurance, pay-after-completion), we say &ldquo;Parity&rdquo; so the page reads fair, not one-sided.</li>
        <li><strong>Honest CTAs.</strong> Every page closes with a &ldquo;pick the other one when…&rdquo; line. Some tasks are genuinely a better fit for a single-vertical app, and we&apos;ll tell you when.</li>
      </ul>

      <h2>Don&apos;t see your usual app?</h2>
      <p>
        Email <a href="mailto:hello@helpward.com">hello@helpward.com</a> and tell us which app you compare Helpward to most. We add comparison pages in batches.
      </p>
    </MarketingShell>
  );
}
