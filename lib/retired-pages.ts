// HTTP 410 Gone for city pages we retired when launch scope narrowed to
// Vancouver / Lower Mainland, Los Angeles and San Diego.
//
// Why 410 and not a redirect: sending someone searching for "Austin" to
// Los Angeles is an irrelevant redirect. Google treats those as soft 404s,
// and it misleads a visitor who asked a specific question. 410 states
// plainly that the page is gone and is not coming back, while the body
// still helps the visitor by listing where we do operate.
//
// Served from the proxy rather than a page component because the App
// Router cannot set a 410 status from a server component (notFound() is
// hardcoded to 404).

import { RETIRED_CITY_SLUGS, CITIES } from "@/lib/marketing";

const RETIRED = new Set(RETIRED_CITY_SLUGS);

/**
 * Is this a retired /cities/<slug> or /cities/<slug>/<service> URL?
 * Live launch cities and unknown slugs both return false — unknown slugs
 * fall through to the normal 404, which is correct: they were never
 * published, so they are "not found", not "gone".
 */
export function isRetiredCityPath(pathname: string): boolean {
  const m = /^\/cities\/([^/]+)(?:\/([^/]+))?\/?$/.exec(pathname);
  if (!m) return false;
  return RETIRED.has(decodeURIComponent(m[1]).toLowerCase());
}

function escapeHtml(v: string): string {
  return v.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

/** Self-contained "not currently served" body, returned WITH a 410 status. */
export function retiredCityHtml(pathname: string): string {
  const slug = (/^\/cities\/([^/]+)/.exec(pathname)?.[1] ?? "").replace(/-/g, " ");
  const pretty = escapeHtml(
    slug.replace(/\b\w/g, (c) => c.toUpperCase()).trim() || "That city",
  );
  const links = CITIES.map(
    (c) =>
      `<li><a href="/cities/${c.slug}">${escapeHtml(c.name)}, ${escapeHtml(c.region)}</a>` +
      `<span class="muted"> — ${escapeHtml(c.metro ?? "")}</span></li>`,
  ).join("");

  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>${pretty} isn't a Helpward service area — Helpward</title>
<style>
  :root { color-scheme: light dark; }
  body { margin:0; font:16px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif;
         background:#f8fafc; color:#0f172a; }
  @media (prefers-color-scheme: dark) { body { background:#0f172a; color:#e2e8f0; } }
  main { max-width:40rem; margin:0 auto; padding:4rem 1.25rem; }
  h1 { font-size:1.6rem; line-height:1.25; margin:0 0 .75rem; }
  p { margin:0 0 1rem; }
  ul { list-style:none; padding:0; margin:0 0 1.5rem; }
  li { padding:.6rem 0; border-bottom:1px solid rgba(100,116,139,.25); }
  a { color:#4f46e5; text-decoration:none; font-weight:600; }
  @media (prefers-color-scheme: dark) { a { color:#a5b4fc; } }
  a:hover { text-decoration:underline; }
  .muted { color:#64748b; font-weight:400; font-size:.875rem; }
  .cta { display:inline-block; margin-top:.5rem; background:#4f46e5; color:#fff;
         padding:.7rem 1.1rem; border-radius:.6rem; }
</style>
</head><body><main>
  <h1>Helpward doesn&rsquo;t serve ${pretty}</h1>
  <p>We used to list this city before we had helpers there. It was never a
     live service area, so we&rsquo;ve removed the page rather than leave a
     promise we can&rsquo;t keep.</p>
  <p><strong>Where Helpward is live today:</strong></p>
  <ul>${links}</ul>
  <p class="muted">The two California areas cover city limits only.</p>
  <a class="cta" href="/">Go to Helpward</a>
</main></body></html>`;
}
