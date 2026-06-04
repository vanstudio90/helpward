import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowRight, Check, Minus, Sparkles } from "lucide-react";
import { MarketingShell } from "@/components/MarketingShell";
import { COMPETITORS, getCompetitor } from "@/lib/competitors";

export function generateStaticParams() {
  return COMPETITORS.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({
  params,
}: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const c = getCompetitor(slug);
  if (!c) return { title: "Comparison — Helpward" };
  const title = `Helpward vs ${c.brandName} — side-by-side comparison`;
  const description = `Compare Helpward and ${c.brandName} on real-time GPS tracking, photo proof, recurring bookings, bundled trips, and saved-favorite-helper routing. Honest feature matrix, no marketing fluff.`;
  return {
    title,
    description,
    alternates: { canonical: `/vs/${c.slug}` },
    openGraph: {
      type: "article",
      title,
      description,
      url: `/vs/${c.slug}`,
      siteName: "Helpward",
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function VersusPage({
  params,
}: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const c = getCompetitor(slug);
  if (!c) notFound();

  // Article + BreadcrumbList JSON-LD. Honest meta — describedAt = the
  // matrix itself, comparisonRows count surfaces as an Article wordCount-ish
  // signal for Google's content-depth heuristics.
  const ld = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        "@id": `https://helpward.com/vs/${c.slug}#article`,
        headline: `Helpward vs ${c.brandName}`,
        description: c.categoryLine,
        author: { "@type": "Organization", name: "Helpward" },
        publisher: { "@type": "Organization", name: "Helpward" },
        datePublished: "2026-06-04",
        mainEntityOfPage: `https://helpward.com/vs/${c.slug}`,
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: "https://helpward.com/" },
          { "@type": "ListItem", position: 2, name: "Compare", item: "https://helpward.com/vs/" },
          { "@type": "ListItem", position: 3, name: `vs ${c.brandName}`, item: `https://helpward.com/vs/${c.slug}` },
        ],
      },
    ],
  };

  return (
    <MarketingShell title={`Helpward vs ${c.brandName}`} subtitle={c.categoryLine}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />

      <p className="lead">{c.trafficContext}</p>

      <h2>Feature-by-feature</h2>
      <p className="not-prose text-xs text-slate-500 mb-4">
        We only compare on feature presence — pricing and operational details change quarter to quarter and
        we don&apos;t want to publish anything we can&apos;t keep accurate. Rows where {c.brandName} doesn&apos;t
        publicly advertise a feature are marked &ldquo;Not advertised&rdquo; rather than &ldquo;No.&rdquo;
      </p>

      <div className="not-prose overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th scope="col" className="text-left py-3 px-4 font-bold text-slate-900 w-[40%]">Feature</th>
              <th scope="col" className="text-left py-3 px-4 font-bold text-brand-700">Helpward</th>
              <th scope="col" className="text-left py-3 px-4 font-bold text-slate-700">{c.brandName}</th>
            </tr>
          </thead>
          <tbody>
            {c.matrix.map((row) => (
              <tr key={row.feature} className="border-b border-slate-100 last:border-b-0 align-top">
                <td className="py-3 px-4 font-semibold text-slate-900">
                  {row.feature}
                  {row.notes && <div className="text-[11px] text-slate-500 font-normal mt-0.5 leading-snug">{row.notes}</div>}
                </td>
                <td className="py-3 px-4 text-slate-700">
                  <span className="inline-flex items-start gap-1.5">
                    <Check className="w-3.5 h-3.5 text-emerald-600 mt-0.5 shrink-0" />
                    <span>{row.helpward}</span>
                  </span>
                </td>
                <td className="py-3 px-4 text-slate-600">
                  <span className="inline-flex items-start gap-1.5">
                    {row.competitor.toLowerCase().startsWith("yes") ? (
                      <Check className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" />
                    ) : (
                      <Minus className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
                    )}
                    <span>{row.competitor}</span>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>So which one should you pick?</h2>
      <p>{c.cta}</p>

      <div className="not-prose mt-6 flex flex-wrap gap-2">
        <Link
          href="/signup?next=/new-request"
          className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-brand-600 to-violet-600 text-white text-sm font-bold"
        >
          <Sparkles className="w-4 h-4" /> Sign up free <ArrowRight className="w-4 h-4" />
        </Link>
        <Link
          href="/services"
          className="inline-flex items-center gap-2 px-5 py-3 rounded-xl border border-slate-200 text-slate-700 text-sm font-bold hover:bg-slate-50"
        >
          Browse services first
        </Link>
      </div>

      <h2>More comparisons</h2>
      <ul className="not-prose grid sm:grid-cols-2 gap-2">
        {COMPETITORS.filter((x) => x.slug !== c.slug).map((other) => (
          <li key={other.slug}>
            <Link
              href={`/vs/${other.slug}`}
              className="block rounded-xl border border-slate-100 bg-white p-3 hover:border-brand-200 hover:shadow-sm transition"
            >
              <div className="text-sm font-bold text-slate-900">Helpward vs {other.brandName}</div>
              <div className="text-xs text-slate-500 mt-0.5 line-clamp-2">{other.categoryLine}</div>
            </Link>
          </li>
        ))}
      </ul>
    </MarketingShell>
  );
}
