import Link from "next/link";
import { ChevronRight, ShieldCheck, ArrowLeft } from "lucide-react";
import { MarketingShell } from "@/components/MarketingShell";

export type SafetyFAQ = { q: string; a: string };

export type SafetyShellProps = {
  slug: string;
  title: string;
  intro: string;
  lastUpdated: string;     // YYYY-MM-DD — fed into Article schema + visible footer
  faqs?: SafetyFAQ[];
  children: React.ReactNode;
};

// Shared shell for every page under /safety. Standardises the breadcrumb,
// Article + BreadcrumbList + FAQPage JSON-LD, and "last updated" footer so
// each topic page is just content. Pages render through MarketingShell so
// the visual frame matches the rest of the marketing routes.
export function SafetyShell({
  slug, title, intro, lastUpdated, faqs, children,
}: SafetyShellProps) {
  const url = `https://helpward.com/safety/${slug}`;

  const ARTICLE_LD = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: title,
    description: intro,
    datePublished: lastUpdated,
    dateModified: lastUpdated,
    author: { "@type": "Organization", name: "Helpward", url: "https://helpward.com" },
    publisher: { "@id": "https://helpward.com/#organization" },
    mainEntityOfPage: url,
    articleSection: "Safety",
  };

  const BREADCRUMB_LD = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "https://helpward.com" },
      { "@type": "ListItem", position: 2, name: "Safety", item: "https://helpward.com/safety" },
      { "@type": "ListItem", position: 3, name: title, item: url },
    ],
  };

  const FAQ_LD = faqs && faqs.length > 0 ? {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  } : null;

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ARTICLE_LD) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(BREADCRUMB_LD) }} />
      {FAQ_LD && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_LD) }} />
      )}

      <MarketingShell title={title} subtitle={intro}>
        <nav aria-label="Breadcrumb" className="not-prose text-xs text-slate-500 mb-6 -mt-2">
          <ol className="flex items-center gap-1.5 flex-wrap">
            <li><Link href="/" className="hover:text-slate-900">Home</Link></li>
            <ChevronRight className="w-3 h-3 text-slate-300" />
            <li><Link href="/safety" className="hover:text-slate-900 inline-flex items-center gap-1">
              <ShieldCheck className="w-3 h-3" /> Safety
            </Link></li>
            <ChevronRight className="w-3 h-3 text-slate-300" />
            <li className="text-slate-900 font-semibold">{title}</li>
          </ol>
        </nav>

        {children}

        {faqs && faqs.length > 0 && (
          <>
            <h2>Frequently asked</h2>
            <dl className="not-prose space-y-3 my-4">
              {faqs.map((f) => (
                <details key={f.q} className="group rounded-2xl border border-slate-100 bg-white p-4 sm:p-5 open:shadow-md transition">
                  <summary className="cursor-pointer list-none flex items-start justify-between gap-4">
                    <dt className="text-sm font-bold text-slate-900">{f.q}</dt>
                    <span className="shrink-0 text-slate-400 text-xl leading-none transition group-open:rotate-45">+</span>
                  </summary>
                  <dd className="mt-3 text-sm text-slate-700 leading-relaxed">{f.a}</dd>
                </details>
              ))}
            </dl>
          </>
        )}

        <div className="not-prose text-xs text-slate-500 mt-8 pt-6 border-t border-slate-100 flex items-center justify-between">
          <span>
            Last updated <time dateTime={lastUpdated}>{new Date(lastUpdated).toLocaleDateString()}</time>
          </span>
          <Link href="/safety" className="inline-flex items-center gap-1 font-semibold text-brand-700 hover:text-brand-800">
            <ArrowLeft className="w-3.5 h-3.5" /> All safety topics
          </Link>
        </div>
      </MarketingShell>
    </>
  );
}

// Registry of safety sub-pages — single source of truth for the hub list,
// the sitemap, and the cross-link bar at the bottom of each topic page.
// THREE PAGES ARE OUT OF LAUNCH, and the reason is the same for all of
// them: each described a process that does not exist.
//
//   background-checks  Checkr/Triton screening. Not wired. Nothing ever
//                      writes background_verified_at except that
//                      webhook, so no helper has one.
//   insurance          "$1M platform insurance", with an underwriter,
//                      coverage tiers and exclusions.
//                      insurance_active_until is written by NOTHING.
//                      There is no policy and no carrier.
//   transparency-report  Quarterly marketplace statistics. There are no
//                      quarters, no bookings and no statistics.
//
// There is no honest edit to a page describing cover that was never
// bought, so they are delisted rather than reworded: gone from this
// index, from the sitemap, and from the safety hub. The files are kept —
// the decision to retire them permanently or to build what they describe
// is the owner's, and deleting the text would make that decision harder,
// not easier. /safety/insurance etc. are served as 410 Gone meanwhile
// (lib/retired-pages.ts), because they were published.
export const SAFETY_PAGES = [
  {
    slug: "disputes",
    title: "Disputes & refunds",
    summary:
      "If something goes wrong on a task, open a dispute within 24 hours. Step-by-step on what happens, who reviews it, and how refunds work.",
    icon: "Scale",
  },
] as const;

export type SafetySlug = (typeof SAFETY_PAGES)[number]["slug"];
