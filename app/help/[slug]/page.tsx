import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, ArrowRight, ChevronRight, BookOpen, Info } from "lucide-react";
import { MarketingShell } from "@/components/MarketingShell";
import {
  HELP_ARTICLES,
  HELP_CATEGORIES,
  getArticle,
  getArticlesByCategory,
  type HelpBlock,
} from "@/lib/help-articles";

export const dynamic = "force-static";

export async function generateStaticParams() {
  return HELP_ARTICLES.map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({
  params,
}: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const article = getArticle(slug);
  if (!article) return { title: "Article not found — Helpward Help" };
  const title = `${article.title} — Helpward Help Center`;
  return {
    title,
    description: article.summary,
    alternates: { canonical: `https://helpward.com/help/${article.slug}` },
    openGraph: { title, description: article.summary, url: `https://helpward.com/help/${article.slug}`, type: "article" },
    twitter: { card: "summary_large_image", title, description: article.summary },
  };
}

export default async function HelpArticlePage({
  params,
}: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const article = getArticle(slug);
  if (!article) notFound();

  const category = HELP_CATEGORIES.find((c) => c.id === article.category);
  const related = getArticlesByCategory(article.category).filter((a) => a.slug !== article.slug).slice(0, 4);

  const ARTICLE_LD = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: article.title,
    description: article.summary,
    datePublished: article.updatedAt,
    dateModified: article.updatedAt,
    author: { "@type": "Organization", name: "Helpward", url: "https://helpward.com" },
    publisher: { "@id": "https://helpward.com/#organization" },
    mainEntityOfPage: `https://helpward.com/help/${article.slug}`,
    articleSection: category?.label ?? "Help",
  };

  const BREADCRUMB_LD = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "https://helpward.com" },
      { "@type": "ListItem", position: 2, name: "Help Center", item: "https://helpward.com/help" },
      { "@type": "ListItem", position: 3, name: article.title, item: `https://helpward.com/help/${article.slug}` },
    ],
  };

  const FAQ_LD = article.faqs && article.faqs.length > 0 ? {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: article.faqs.map((f) => ({
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

      <MarketingShell title={article.title} subtitle={article.summary}>
        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb" className="not-prose text-xs text-slate-500 mb-6 -mt-2">
          <ol className="flex items-center gap-1.5 flex-wrap">
            <li><Link href="/" className="hover:text-slate-900">Home</Link></li>
            <ChevronRight className="w-3 h-3 text-slate-300" />
            <li><Link href="/help" className="hover:text-slate-900">Help</Link></li>
            {category && (
              <>
                <ChevronRight className="w-3 h-3 text-slate-300" />
                <li><Link href={`/help#${category.id}`} className="hover:text-slate-900">{category.label}</Link></li>
              </>
            )}
            <ChevronRight className="w-3 h-3 text-slate-300" />
            <li className="text-slate-900 font-semibold truncate max-w-[40ch]">{article.title}</li>
          </ol>
        </nav>

        {/* Body — render blocks in order */}
        {article.body.map((block, i) => (
          <Block key={i} block={block} />
        ))}

        {/* FAQ — rendered visibly AND lifted into FAQPage schema above */}
        {article.faqs && article.faqs.length > 0 && (
          <>
            <h2>Frequently asked</h2>
            <dl className="not-prose space-y-3 my-4">
              {article.faqs.map((f) => (
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

        {/* Updated */}
        <div className="not-prose text-xs text-slate-500 mt-8 pt-6 border-t border-slate-100">
          Last updated <time dateTime={article.updatedAt}>{new Date(article.updatedAt).toLocaleDateString()}</time>
        </div>

        {/* Related */}
        {related.length > 0 && (
          <div className="not-prose mt-8">
            <div className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3 inline-flex items-center gap-1.5">
              <BookOpen className="w-3 h-3" /> More in {category?.label}
            </div>
            <ul className="grid sm:grid-cols-2 gap-3">
              {related.map((r) => (
                <li key={r.slug}>
                  <Link
                    href={`/help/${r.slug}`}
                    className="block h-full rounded-2xl border border-slate-100 bg-white p-4 hover:border-brand-300 transition"
                  >
                    <div className="text-sm font-bold text-slate-900">{r.title}</div>
                    <div className="text-xs text-slate-500 mt-1 line-clamp-2">{r.summary}</div>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Back link */}
        <div className="not-prose mt-8">
          <Link href="/help" className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:text-brand-800">
            <ArrowLeft className="w-4 h-4" /> All help articles
          </Link>
        </div>
      </MarketingShell>
    </>
  );
}

function Block({ block }: { block: HelpBlock }) {
  switch (block.type) {
    case "p": return <p>{block.text}</p>;
    case "h2": return <h2>{block.text}</h2>;
    case "h3": return <h3>{block.text}</h3>;
    case "ul": return <ul>{block.items.map((i) => <li key={i}>{i}</li>)}</ul>;
    case "ol": return <ol>{block.items.map((i) => <li key={i}>{i}</li>)}</ol>;
    case "note":
      return (
        <aside className="not-prose my-4 rounded-2xl bg-brand-50 border border-brand-100 p-4 flex items-start gap-3">
          <Info className="w-4 h-4 text-brand-600 shrink-0 mt-0.5" />
          <div className="text-sm text-slate-700 leading-relaxed">{block.text}</div>
        </aside>
      );
  }
}
