import Link from "next/link";
import type { Metadata } from "next";
import { Tag, Clock, ArrowRight } from "lucide-react";
import { MarketingShell } from "@/components/MarketingShell";
import { BLOG_POSTS, getAllTags } from "@/lib/blog-posts";

const TITLE = "Helpward Blog";
const INTRO =
  "Operational thinking from the team building the Human Infrastructure Network. Marketplace design, trust & safety craft, city launches, the case against surge pricing.";

export const metadata: Metadata = {
  title: `${TITLE}`,
  description: INTRO,
  alternates: { canonical: "https://helpward.com/blog" },
  openGraph: { title: TITLE, description: INTRO, url: "https://helpward.com/blog", type: "website" },
  twitter: { card: "summary_large_image", title: TITLE, description: INTRO },
};

const BLOG_LD = {
  "@context": "https://schema.org",
  "@type": "Blog",
  "@id": "https://helpward.com/blog#blog",
  name: TITLE,
  description: INTRO,
  url: "https://helpward.com/blog",
  publisher: { "@id": "https://helpward.com/#organization" },
  blogPost: BLOG_POSTS.map((p) => ({
    "@type": "BlogPosting",
    headline: p.title,
    url: `https://helpward.com/blog/${p.slug}`,
    datePublished: p.publishedAt,
    dateModified: p.updatedAt ?? p.publishedAt,
    author: { "@type": "Organization", name: "Helpward" },
  })),
};

export default function BlogIndex() {
  const tags = getAllTags();
  const posts = [...BLOG_POSTS].sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1));
  const featured = posts[0];
  const rest = posts.slice(1);

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(BLOG_LD) }} />

      <MarketingShell title={TITLE} subtitle={INTRO}>
        {/* Tag chips */}
        {tags.length > 0 && (
          <div className="not-prose mb-8 flex flex-wrap gap-1.5">
            {tags.map((t) => (
              <span
                key={t}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 text-[10px] font-semibold uppercase tracking-wide"
              >
                <Tag className="w-2.5 h-2.5" /> {t}
              </span>
            ))}
          </div>
        )}

        {/* Featured */}
        {featured && (
          <Link href={`/blog/${featured.slug}`} className="not-prose block mb-8 group">
            <article className="rounded-3xl overflow-hidden border border-slate-100 bg-white hover:border-brand-300 hover:shadow-lg transition">
              {featured.heroImage && (
                <div className="aspect-[5/3] sm:aspect-[16/7] bg-slate-100 overflow-hidden">
                  <img
                    src={featured.heroImage}
                    alt={featured.title}
                    loading="lazy"
                    className="w-full h-full object-cover group-hover:scale-[1.02] transition"
                  />
                </div>
              )}
              <div className="p-5 sm:p-6">
                <div className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-brand-700 mb-3">
                  Featured
                  {featured.tags.slice(0, 1).map((t) => (
                    <span key={t} className="text-slate-500">· {t}</span>
                  ))}
                </div>
                <h2 className="text-xl sm:text-2xl font-bold text-slate-900 group-hover:text-brand-700 transition-colors">
                  {featured.title}
                </h2>
                <p className="text-sm text-slate-600 mt-2 leading-relaxed">{featured.excerpt}</p>
                <div className="mt-4 flex items-center justify-between gap-3 text-[11px] text-slate-500">
                  <span>
                    By {featured.author.name} · {featured.author.role}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Clock className="w-3 h-3" /> {featured.readingMinutes} min read
                  </span>
                </div>
              </div>
            </article>
          </Link>
        )}

        {/* Rest */}
        <div className="not-prose grid sm:grid-cols-2 gap-4">
          {rest.map((p) => (
            <Link
              key={p.slug}
              href={`/blog/${p.slug}`}
              className="group block rounded-2xl border border-slate-100 bg-white p-5 hover:border-brand-300 transition"
            >
              <div className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-brand-700 mb-2">
                {p.tags.slice(0, 1).map((t) => <span key={t}>{t}</span>)}
              </div>
              <h3 className="text-base font-bold text-slate-900 group-hover:text-brand-700 transition-colors">
                {p.title}
              </h3>
              <p className="text-xs text-slate-600 mt-1.5 line-clamp-3 leading-relaxed">{p.excerpt}</p>
              <div className="mt-3 flex items-center justify-between gap-3 text-[11px] text-slate-500">
                <span>{p.author.name}</span>
                <span className="inline-flex items-center gap-1">
                  <Clock className="w-3 h-3" /> {p.readingMinutes} min
                </span>
              </div>
            </Link>
          ))}
        </div>

        <p className="not-prose mt-10 text-center text-xs text-slate-500">
          Want to write for the Helpward blog?{" "}
          <a href="mailto:hello@helpward.com" className="text-brand-700 font-semibold hover:underline">
            hello@helpward.com
          </a>{" "}
          — we publish marketplace + trust-and-safety operators&apos; perspectives.
        </p>
      </MarketingShell>
    </>
  );
}
