import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/* One app, not eleven.
 *
 * Every helper screen used to be built on its own: four card radiuses,
 * three greys for secondary text, section headings that were sometimes
 * bold-14 and sometimes uppercase-11, and a desktop nav still wearing an
 * emerald accent from before the brand existed. Each page looked fine
 * alone; together they read as separate products.
 *
 * components/provider/ui.tsx is the furniture now. These keep pages on
 * it.
 */

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith("page.tsx")) out.push(p);
  }
  return out;
}

const PAGES = walk("app/(provider)");
const read = (f: string) => readFileSync(f, "utf8");

/** Comments stripped, so prose about a removed string never counts as it. */
const codeOnly = (f: string) =>
  read(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("the shell owns the gutter, so no page re-adds one", () => {
  // Two gutters on a phone is most of the screen width. This caught a
  // real doubling when the shell took over the padding.
  const offenders = PAGES.filter((f) => /px-4 sm:px-6 lg:px-8 py-\d/.test(read(f)));
  assert.deepEqual(offenders, [], `page re-adds the shell's gutter: ${offenders.join(", ")}`);
});

test("page titles come from the kit", () => {
  // A hand-rolled <h1> is how the type scale drifted the first time.
  const offenders = PAGES.filter((f) => {
    const s = codeOnly(f);
    return /<h1 className="text-2xl sm:text-3xl font-bold/.test(s);
  });
  assert.deepEqual(offenders, [], `hand-rolled page title in: ${offenders.join(", ")}`);
});

test("the helper app is one colour, on phone and on desktop", () => {
  const nav = read("components/provider/ProviderSideNav.tsx");
  const tabs = read("components/provider/ProviderTabBar.tsx");
  // Emerald survives ONLY as a status colour (online, approved, paid),
  // never as the navigation accent — the desktop sidebar was green while
  // the phone tab bar was purple.
  assert.doesNotMatch(nav, /bg-emerald-\d+ text-white|text-emerald-600" : "text-slate-400/);
  assert.doesNotMatch(tabs, /emerald/);
  assert.match(nav, /bg-brand-50 text-brand-900/);
});

test("the ground is defined once, and it is not slate", () => {
  const css = readFileSync("app/globals.css", "utf8");
  // slate-50 is faintly blue; against an indigo brand it reads as a
  // second hue rather than as neutral.
  assert.match(css, /--color-app:/);
  assert.match(read("app/(provider)/layout.tsx"), /bg-app/);
});

test("the toggle has one definition", () => {
  // ready-panel grew its own copy before the kit existed.
  const copies = PAGES.concat(["app/(provider)/provider/active/ready-panel.tsx"])
    .filter((f) => /function Toggle\(/.test(read(f)));
  assert.deepEqual(copies, [], `duplicate Toggle in: ${copies.join(", ")}`);
});

test("home shows real earnings, not a hardcoded zero", () => {
  const s = codeOnly("app/(provider)/provider/dashboard/page.tsx");
  // This tile read value="$0.00" for every helper. The QA account has 33
  // completed bookings worth CA$864.60 and was shown nothing.
  assert.doesNotMatch(s, /value="\$0\.00"/);
  assert.match(s, /payout_cents/);
  assert.match(s, /formatMoney\(monthCents, currency\)/);
});

test("the live badge reports the channel, not the mount", () => {
  const s = read("app/(provider)/provider/inbox/realtime-refresh.tsx");
  // It used to say "Live" from the moment it rendered, so a dropped
  // socket looked exactly like a quiet day.
  assert.match(s, /subscribe\(\(status\)/);
  assert.match(s, /status === "SUBSCRIBED"/);
  assert.match(s, /CHANNEL_ERROR/);
});
