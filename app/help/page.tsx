import Link from "next/link";
import type { Metadata } from "next";
import { MarketingShell } from "@/components/MarketingShell";
import { MessageSquare, Mail, Shield, BookOpen, ArrowRight } from "lucide-react";
import { HELP_CATEGORIES, HELP_ARTICLES, getArticlesByCategory } from "@/lib/help-articles";
import { HelpSearchShell } from "./search-shell";

export const metadata: Metadata = {
  title: "Help Center — Helpward",
  description:
    "Browse Helpward's help center: how booking works, pricing, refunds, safety, helpers, and account settings. Or reach a human in minutes by email.",
  alternates: { canonical: "https://helpward.com/help" },
};

export default function Help() {
  // Featured = first 3 articles across all categories — typically the most-asked.
  const featured = HELP_ARTICLES.slice(0, 3);
  return (
    <MarketingShell title="Help Center" subtitle="Find an answer, or reach a human in minutes.">
      <p className="lead">
        Most questions have a quick answer below. If you don&apos;t find what you need, our team
        is on email 24/7.
      </p>

      <HelpSearchShell articles={HELP_ARTICLES} categories={HELP_CATEGORIES}>
        <>

      <h2>Featured articles</h2>
      <ul className="not-prose grid sm:grid-cols-3 gap-3 my-4">
        {featured.map((a) => (
          <li key={a.slug}>
            <Link
              href={`/help/${a.slug}`}
              className="block h-full rounded-2xl border border-slate-100 bg-white p-4 hover:border-brand-300 hover:shadow transition"
            >
              <div className="text-sm font-bold text-slate-900">{a.title}</div>
              <div className="text-xs text-slate-500 mt-1 line-clamp-3">{a.summary}</div>
              <div className="text-[11px] font-semibold text-brand-700 mt-2 inline-flex items-center gap-1">
                Read <ArrowRight className="w-3 h-3" />
              </div>
            </Link>
          </li>
        ))}
      </ul>

      <h2>Browse by topic</h2>
      <div className="not-prose space-y-6 my-4">
        {HELP_CATEGORIES.map((cat) => {
          const items = getArticlesByCategory(cat.id);
          if (items.length === 0) return null;
          return (
            <section key={cat.id}>
              <div className="flex items-baseline justify-between gap-3 mb-2">
                <h3 className="text-base font-bold text-slate-900">{cat.label}</h3>
                <span className="text-[11px] text-slate-500">{items.length} article{items.length === 1 ? "" : "s"}</span>
              </div>
              <p className="text-xs text-slate-500 mb-3">{cat.blurb}</p>
              <ul className="rounded-2xl border border-slate-100 bg-white divide-y divide-slate-100 overflow-hidden">
                {items.map((a) => (
                  <li key={a.slug}>
                    <Link
                      href={`/help/${a.slug}`}
                      className="flex items-start gap-3 p-4 hover:bg-slate-50 transition"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-bold text-slate-900">{a.title}</div>
                        <div className="text-xs text-slate-500 mt-0.5 line-clamp-2">{a.summary}</div>
                      </div>
                      <ArrowRight className="w-4 h-4 text-slate-300 mt-1 shrink-0" />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>

        </>
      </HelpSearchShell>

      <h2>Talk to a human</h2>
      <ul className="not-prose grid sm:grid-cols-2 gap-3 my-4">
        <ContactRow icon={Mail} title="General" email="hello@helpward.com" sub="Anything else — 24/7 reply" />
        <ContactRow icon={Shield} title="Safety" email="safety@helpward.com" sub="Priority response within 4 hours" />
        <ContactRow icon={MessageSquare} title="Billing" email="billing@helpward.com" sub="Refunds, receipts, disputes" />
        <ContactRow icon={BookOpen} title="Press / partnerships" email="press@helpward.com" sub="Media + business inquiries" />
      </ul>
    </MarketingShell>
  );
}

function ContactRow({
  icon: Icon, title, email, sub,
}: { icon: React.ComponentType<{ className?: string }>; title: string; email: string; sub: string }) {
  return (
    <li>
      <a href={`mailto:${email}`} className="block rounded-2xl border border-slate-100 bg-white p-4 hover:border-brand-300 transition">
        <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
          <Icon className="w-4 h-4 text-brand-600" /> {title}
        </div>
        <div className="text-xs text-slate-500 mt-1">{sub}</div>
        <div className="text-xs font-semibold text-brand-700 mt-2 truncate">{email}</div>
      </a>
    </li>
  );
}
