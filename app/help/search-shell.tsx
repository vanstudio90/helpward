"use client";

import { useMemo, useState, useRef, useEffect } from "react";
import Link from "next/link";
import { Search, X, ArrowRight, FileQuestion } from "lucide-react";
import { indexArticles, searchArticles } from "@/lib/help-search";
import type { HelpArticle, HelpCategory } from "@/lib/help-articles";

export type Category = { id: HelpCategory; label: string; blurb: string };

// Client shell around the help-center catalog. Renders a search box at the
// top; when the query is empty the children (featured + browse-by-topic
// layout that the page already composed) render below; when there's a
// query we render the matching articles instead.
//
// Keyboard: "/" focuses the input from anywhere on the page (gmail-style).
// We don't intercept while focus is in another input.
export function HelpSearchShell({
  articles, categories, children,
}: {
  articles: HelpArticle[];
  categories: Category[];
  children: React.ReactNode;
}) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  const index = useMemo(() => indexArticles(articles), [articles]);
  const results = useMemo(
    () => query.trim().length >= 2 ? searchArticles(index, query) : [],
    [index, query],
  );
  const catLabel = useMemo(
    () => new Map(categories.map((c) => [c.id, c.label] as const)),
    [categories],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "/") return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      e.preventDefault();
      inputRef.current?.focus();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const hasQuery = query.trim().length >= 2;

  return (
    <div className="not-prose">
      <div className="relative mb-5">
        <Search className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search articles… (press / to focus)"
          aria-label="Search help articles"
          className="w-full pl-11 pr-10 py-3 rounded-2xl bg-white border border-slate-200 text-sm focus:outline-none focus:ring-4 focus:ring-brand-100 focus:border-brand-400"
        />
        {query && (
          <button
            type="button"
            onClick={() => { setQuery(""); inputRef.current?.focus(); }}
            aria-label="Clear search"
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {hasQuery ? (
        <section>
          <div className="text-xs font-semibold text-slate-500 mb-3">
            {results.length === 0
              ? <>No matches for &ldquo;{query}&rdquo;.</>
              : <>{results.length} result{results.length === 1 ? "" : "s"} for &ldquo;{query}&rdquo;</>}
          </div>
          {results.length === 0 ? (
            <div className="rounded-2xl border border-slate-100 bg-white p-6 text-center">
              <FileQuestion className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="text-sm text-slate-600">
                Nothing matched. Try different keywords, or email{" "}
                <a href="mailto:hello@helpward.com" className="text-brand-700 font-semibold">hello@helpward.com</a>.
              </p>
            </div>
          ) : (
            <ul className="rounded-2xl border border-slate-100 bg-white divide-y divide-slate-100 overflow-hidden">
              {results.map((r) => (
                <li key={r.article.slug}>
                  <Link
                    href={`/help/${r.article.slug}`}
                    className="flex items-start gap-3 p-4 hover:bg-slate-50 transition"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-[10px] font-bold uppercase tracking-wide text-brand-700 bg-brand-50 px-1.5 py-0.5 rounded">
                          {catLabel.get(r.article.category) ?? r.article.category}
                        </span>
                      </div>
                      <div className="text-sm font-bold text-slate-900">{r.article.title}</div>
                      <div className="text-xs text-slate-500 mt-0.5 line-clamp-2">{r.article.summary}</div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-slate-300 mt-1 shrink-0" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : (
        children
      )}
    </div>
  );
}
