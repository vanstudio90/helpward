import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, Clock, ChevronRight, Tag, Info } from "lucide-react";
import { MarketingShell } from "@/components/MarketingShell";
import { BLOG_POSTS, getPost, type BlogBlock, type BlogPost } from "@/lib/blog-posts";

export const dynamic = "force-static";

export async function generateStaticParams() {
  return BLOG_POSTS.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) return { title: "Post not found — Helpward Blog" };
  const title = `${post.title} — Helpward Blog`;
  return {
    title,
    description: post.excerpt,
    alternates: { canonical: `https://helpward.com/blog/${post.slug}` },
    openGraph: {
      title, description: post.excerpt,
      url: `https://helpward.com/blog/${post.slug}`,
      type: "article",
      publishedTime: post.publishedAt,
      modifiedTime: post.updatedAt ?? post.publishedAt,
      images: post.heroImage ? [{ url: post.heroImage }] : undefined,
    },
    twitter: { card: "summary_large_image", title, description: post.excerpt },
  };
}

function postLd(post: BlogPost) {
  const url = `https://helpward.com/blog/${post.slug}`;
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.excerpt,
    mainEntityOfPage: url,
    url,
    image: post.heroImage,
    datePublished: post.publishedAt,
    dateModified: post.updatedAt ?? post.publishedAt,
    author: { "@type": "Organization", name: "Helpward", url: "https://helpward.com" },
    publisher: { "@id": "https://helpward.com/#organization" },
    keywords: post.tags.join(", "),
    timeRequired: `PT${post.readingMinutes}M`,
    isPartOf: { "@id": "https://helpward.com/blog#blog" },
  };
}

function breadcrumbLd(post: BlogPost) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "https://helpward.com" },
      { "@type": "ListItem", position: 2, name: "Blog", item: "https://helpward.com/blog" },
      { "@type": "ListItem", position: 3, name: post.title, item: `https://helpward.com/blog/${post.slug}` },
    ],
  };
}

export default async function BlogPostPage({
  params,
}: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) notFound();

  // Up to 2 related — same tag overlap, scored cheaply.
  const related = BLOG_POSTS
    .filter((p) => p.slug !== post.slug)
    .map((p) => ({ post: p, score: p.tags.filter((t) => post.tags.includes(t)).length }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 2)
    .map((r) => r.post);

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(postLd(post)) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd(post)) }} />

      <MarketingShell title={post.title} subtitle={post.excerpt}>
        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb" className="not-prose text-xs text-slate-500 mb-6 -mt-2">
          <ol className="flex items-center gap-1.5 flex-wrap">
            <li><Link href="/" className="hover:text-slate-900">Home</Link></li>
            <ChevronRight className="w-3 h-3 text-slate-300" />
            <li><Link href="/blog" className="hover:text-slate-900">Blog</Link></li>
            <ChevronRight className="w-3 h-3 text-slate-300" />
            <li className="text-slate-900 font-semibold truncate max-w-[40ch]">{post.title}</li>
          </ol>
        </nav>

        {/* Meta strip */}
        <div className="not-prose mb-6 flex items-center justify-between gap-3 text-xs text-slate-500 flex-wrap pb-6 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-700">{post.author.name}</span>
            <span className="text-slate-300">·</span>
            <span>{post.author.role}</span>
          </div>
          <div className="flex items-center gap-3">
            <span>
              <time dateTime={post.publishedAt}>
                {new Date(post.publishedAt + "T00:00:00").toLocaleDateString(undefined, {
                  year: "numeric", month: "long", day: "numeric",
                })}
              </time>
            </span>
            <span className="inline-flex items-center gap-1">
              <Clock className="w-3 h-3" /> {post.readingMinutes} min read
            </span>
          </div>
        </div>

        {/* Hero */}
        {post.heroImage && (
          <div className="not-prose mb-8 rounded-2xl overflow-hidden">
            <img src={post.heroImage} alt={post.title} className="w-full aspect-[16/7] object-cover" loading="eager" />
          </div>
        )}

        {/* Body */}
        {post.body.map((b, i) => <Block key={i} block={b} />)}

        {/* Tags */}
        {post.tags.length > 0 && (
          <div className="not-prose mt-10 pt-6 border-t border-slate-100 flex items-center gap-2 flex-wrap">
            <Tag className="w-3 h-3 text-slate-400" />
            {post.tags.map((t) => (
              <span key={t} className="inline-flex items-center px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[10px] font-semibold uppercase tracking-wide">
                {t}
              </span>
            ))}
          </div>
        )}

        {/* Back + related */}
        <div className="not-prose mt-10 flex items-center justify-between gap-3 flex-wrap">
          <Link href="/blog" className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:text-brand-800">
            <ArrowLeft className="w-4 h-4" /> Back to the blog
          </Link>
          <span className="text-xs text-slate-500">
            Last updated <time dateTime={post.updatedAt ?? post.publishedAt}>
              {new Date((post.updatedAt ?? post.publishedAt) + "T00:00:00").toLocaleDateString()}
            </time>
          </span>
        </div>

        {related.length > 0 && (
          <div className="not-prose mt-10">
            <div className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">Related reading</div>
            <ul className="grid sm:grid-cols-2 gap-3">
              {related.map((r) => (
                <li key={r.slug}>
                  <Link href={`/blog/${r.slug}`} className="block h-full rounded-2xl border border-slate-100 bg-white p-4 hover:border-brand-300 transition">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-brand-700 mb-1">
                      {r.tags.slice(0, 1).join("")}
                    </div>
                    <div className="text-sm font-bold text-slate-900">{r.title}</div>
                    <div className="text-xs text-slate-500 mt-1 line-clamp-2">{r.excerpt}</div>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </MarketingShell>
    </>
  );
}

function Block({ block }: { block: BlogBlock }) {
  switch (block.type) {
    case "p": return <p>{block.text}</p>;
    case "h2": return <h2>{block.text}</h2>;
    case "h3": return <h3>{block.text}</h3>;
    case "ul": return <ul>{block.items.map((i) => <li key={i}>{i}</li>)}</ul>;
    case "ol": return <ol>{block.items.map((i) => <li key={i}>{i}</li>)}</ol>;
    case "quote":
      return (
        <blockquote>
          {block.text}
          {block.attribution && <footer className="text-xs text-slate-500 mt-1">— {block.attribution}</footer>}
        </blockquote>
      );
    case "note":
      return (
        <aside className="not-prose my-4 rounded-2xl bg-brand-50 border border-brand-100 p-4 flex items-start gap-3">
          <Info className="w-4 h-4 text-brand-600 shrink-0 mt-0.5" />
          <div className="text-sm text-slate-700 leading-relaxed">{block.text}</div>
        </aside>
      );
  }
}
