import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

/* The mark is drawn in one place.
 *
 * It was previously hand-drawn in fifteen files, and had already drifted:
 * the helper sidebar rendered it emerald and the admin one rose, so two of
 * the fifteen were not the brand at all. Nobody noticed because nothing
 * compared them. These assertions do. */

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    if (e === "node_modules" || e === ".next") continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith(".tsx")) out.push(p);
  }
  return out;
}

const files = [...walk("app"), ...walk("components")];

test("nothing hand-draws the mark any more", () => {
  const offenders: string[] = [];
  for (const f of files) {
    if (f.endsWith("components/Logo.tsx")) continue;
    const src = readFileSync(f, "utf8");
    // A square with a bare "H" in it, in any of the colours it drifted to.
    if (/className="w-[78] h-[78] rounded-(?:md|lg) bg-\w+-\d+ text-white[^"]*"\s*>\s*H\s*</.test(src)) {
      offenders.push(f);
    }
  }
  assert.deepEqual(offenders, [], `hand-drawn mark still in: ${offenders.join(", ")}`);
});

test("the mark is the real artwork, at both tones", () => {
  const logo = readFileSync("components/Logo.tsx", "utf8");
  assert.match(logo, /\/logo-512\.png/);
  // A white glyph for dark grounds. The purple mark on the near-black
  // footer sits around 2:1 against it.
  assert.match(logo, /\/logo-white-512\.png/);
  for (const f of ["public/logo-512.png", "public/logo-white-512.png", "app/icon.png", "app/apple-icon.png"]) {
    assert.ok(existsSync(f), `missing asset: ${f}`);
  }
});

test("no mark sits on a dark ground wearing the brand glyph", () => {
  // The purple mark on slate-900 is about 2:1 — readable as a shape,
  // wrong as a logo. Three placements had this when the artwork landed:
  // the shared footer, the homepage's own footer, and the admin sidebar.
  const offenders: string[] = [];
  for (const f of files) {
    const src = readFileSync(f, "utf8");
    for (const m of src.matchAll(/<Logo[^/>]*\/>/g)) {
      const before = src.slice(Math.max(0, m.index! - 600), m.index!);
      const onDark = /bg-(?:slate|gray|zinc|neutral)-(?:8|9)\d{2}|bg-black/.test(before);
      const isLight = /tone="light"/.test(m[0]);
      // MobileNav's bars are light; the regex can reach back past them,
      // so only flag where the NEAREST ground is dark.
      const nearest = before.match(/bg-(?:white|slate-50|slate-100)|bg-(?:slate|gray|zinc|neutral)-(?:8|9)\d{2}|bg-black/g);
      const nearestIsDark = nearest ? /-(?:8|9)\d{2}|black/.test(nearest[nearest.length - 1]!) : false;
      if (onDark && nearestIsDark && !isLight) offenders.push(`${f}: ${m[0]}`);
    }
  }
  assert.deepEqual(offenders, [], `brand glyph on a dark ground: ${offenders.join(", ")}`);
});

test("the retired favicon is gone, not merely unlinked", () => {
  // It is the OLD mark. Left in public/ it stays fetchable at its old URL.
  assert.ok(!existsSync("public/favicon.svg"));
  assert.doesNotMatch(readFileSync("app/layout.tsx", "utf8"), /favicon\.svg/);
});
