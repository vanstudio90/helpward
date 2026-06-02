// Pure client-side help-center search. The whole article catalog ships
// inline anyway (it's already pulled into the static /help page render), so
// we get fuzzy keyword search at zero round-trip cost — no Algolia, no
// server endpoint, no autocomplete debounce. The bar for "fast enough":
// indexing + scoring ~30 articles per keystroke takes <1ms on the JS thread.
//
// Scoring: per-term, weighted higher when matched in title (×5), summary
// (×3), FAQ Q (×3), or body/FAQ-A (×1). Lowercases everything; uses simple
// substring matching — no stemming, no TF-IDF, none of which is worth the
// complexity for a catalog this size.

import type { HelpArticle, HelpBlock } from "@/lib/help-articles";

export type ScoredArticle = {
  article: HelpArticle;
  score: number;
};

// Pre-build a searchable "haystack" per article so each keystroke just
// re-runs the scorer instead of re-walking the body block tree.
type Indexed = {
  article: HelpArticle;
  title: string;
  summary: string;
  faqQ: string;
  body: string; // body blocks + FAQ answers, joined
};

export function indexArticles(articles: HelpArticle[]): Indexed[] {
  return articles.map((a) => ({
    article: a,
    title: a.title.toLowerCase(),
    summary: a.summary.toLowerCase(),
    faqQ: (a.faqs ?? []).map((f) => f.q).join(" ").toLowerCase(),
    body: [
      ...a.body.map(blockText),
      ...(a.faqs ?? []).map((f) => f.a),
    ].join(" ").toLowerCase(),
  }));
}

function blockText(b: HelpBlock): string {
  if (b.type === "p" || b.type === "h2" || b.type === "h3" || b.type === "note") return b.text;
  if (b.type === "ul" || b.type === "ol") return b.items.join(" ");
  return "";
}

export function searchArticles(
  index: Indexed[],
  query: string,
  limit = 20,
): ScoredArticle[] {
  const terms = query.toLowerCase().split(/\s+/).filter((t) => t.length >= 2);
  if (terms.length === 0) return [];

  const scored: ScoredArticle[] = [];
  for (const item of index) {
    let score = 0;
    for (const t of terms) {
      if (item.title.includes(t)) score += 5;
      if (item.summary.includes(t)) score += 3;
      if (item.faqQ.includes(t)) score += 3;
      if (item.body.includes(t)) score += 1;
    }
    // Require every term to have matched somewhere — otherwise the second
    // word of a two-word query is just noise. AND semantics > OR for
    // small catalogs like this; the user typed both words on purpose.
    const everyTermMatched = terms.every((t) =>
      item.title.includes(t) || item.summary.includes(t)
      || item.faqQ.includes(t) || item.body.includes(t)
    );
    if (score > 0 && everyTermMatched) {
      scored.push({ article: item.article, score });
    }
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}
