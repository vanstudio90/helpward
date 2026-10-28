import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

/* The public profile path said "providers" while every word around it said
 * "helper" — including the heading directly above the field asking a helper
 * to choose and share it. Renamed, with redirects, because the old path is
 * in the sitemap and in any link already shared.
 *
 * The old segment is built from parts below rather than written out, so a
 * future repo-wide rename cannot quietly rewrite the very string these
 * assertions exist to check for.
 */
const OLD = "/" + "providers" + "/";
const NEW = "/" + "helpers" + "/";

test("the public profile lives at the helper path", () => {
  assert.ok(existsSync("app/helpers/[id]/page.tsx"), "the helpers route must exist");
  assert.ok(!existsSync("app/providers/[id]/page.tsx"), "the old route must be gone");
});

test("nothing still links to the old path", () => {
  for (const f of [
    "app/sitemap.ts",
    "app/(provider)/provider/profile/slug-form.tsx",
    "app/(app)/favorites/page.tsx",
    "app/(admin)/admin/reviews/page.tsx",
  ]) {
    const src = readFileSync(f, "utf8");
    assert.ok(!src.includes(OLD), `${f} still links to ${OLD}`);
    assert.ok(src.includes(NEW), `${f} should link to ${NEW}`);
  }
});

test("links already shared keep working", () => {
  const cfg = readFileSync("next.config.ts", "utf8");
  assert.ok(cfg.includes(`source: "${OLD}:slug"`), "no redirect for the old profile path");
  assert.ok(cfg.includes(`destination: "${NEW}:slug"`), "the redirect does not point at the new path");
  assert.match(cfg, /permanent: true/);
});

test("the helper's own dashboard is untouched by the rename", () => {
  // /provider/* is a different route group — the helper's private area —
  // and a careless search-and-replace would have taken it too.
  assert.ok(existsSync("app/(provider)/provider/dashboard/page.tsx"));
  assert.match(readFileSync("app/(provider)/layout.tsx", "utf8"), /\/provider\/dashboard/);
});
