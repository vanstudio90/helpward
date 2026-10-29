import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/* The waiting screen is looked at for long stretches while nothing
 * happens, which makes it unusually easy to get dishonest: a pulse that
 * runs while offline, or a "sound alerts" switch wired to nothing, both
 * read as a working system to someone waiting on work that will never
 * arrive. These assertions exist to keep it truthful. */

const panel = readFileSync("app/(provider)/provider/active/ready-panel.tsx", "utf8");
const live = readFileSync("app/(provider)/provider/active/ready-live.tsx", "utf8");
const page = readFileSync("app/(provider)/provider/active/page.tsx", "utf8");
const realtime = readFileSync("app/(provider)/provider/active/realtime-refresh.tsx", "utf8");
const css = readFileSync("app/globals.css", "utf8");
const tabs = readFileSync("components/provider/ProviderTabBar.tsx", "utf8");

/** Strips comments, so prose about a rule can never satisfy the rule. */
function codeOnly(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

test("the radar only animates while online", () => {
  const code = codeOnly(panel);
  // The rings are rendered behind `online &&`, so an offline helper
  // cannot be shown a page that looks like it is searching.
  assert.match(code, /\{online && \[0, 1, 2\]\.map/);
  assert.match(css, /\.hw-radar\b/);
  // Motion is opt-out-able, and holds a visible size rather than vanishing.
  assert.match(css, /prefers-reduced-motion: reduce[\s\S]{0,120}\.hw-radar \{ animation: none/);
});

test("the online label states the real state, both ways", () => {
  const code = codeOnly(panel);
  for (const copy of ["You're online", "You're offline", "Looking for nearby requests", "Not receiving requests"]) {
    assert.ok(code.includes(copy), `missing state copy: ${copy}`);
  }
});

test("sound alerts are wired to a real offer event, not decorative", () => {
  // The chime listens for the event the realtime subscription dispatches,
  // so the switch has an effect. A toggle that only writes localStorage
  // would pass a screenshot review and fail the helper.
  assert.match(codeOnly(panel), /addEventListener\("helpward:offer"/);
  assert.match(codeOnly(realtime), /dispatchEvent\(new CustomEvent\("helpward:offer"\)\)/);
  assert.match(codeOnly(panel), /playChime/);
});

test("the wake lock is released when offline or unmounted", () => {
  const code = codeOnly(live) + codeOnly(panel);
  // Holding a screen-wake lock after going offline drains a battery for
  // nothing, so `online` is a dependency of the lock effect.
  assert.match(code, /\}, \[awake, online\]\);/);
  assert.match(code, /release\(\)/);
});

test("an approved helper with no task gets the waiting screen", () => {
  const code = codeOnly(page);
  assert.match(code, /!booking && pp\?\.status === "approved"[\s\S]{0,80}<ReadyLive/);
  // The old dead-end copy is gone.
  assert.doesNotMatch(code, /No active task/);
  assert.doesNotMatch(code, /Toggle yourself online above/);
});

test("an unapproved helper is pointed at onboarding, not at a dead switch", () => {
  const code = codeOnly(page);
  assert.match(code, /Finish setting up/);
  assert.doesNotMatch(code, /<OnlineToggle[^>]*>[\s\S]{0,200}Finish setting up/);
});

test("the lit tab is readable at a glance", () => {
  const code = codeOnly(tabs);
  // A pill, not the 2px rail it replaced.
  assert.match(code, /active \? "bg-brand-50"/);
  assert.doesNotMatch(code, /h-0\.5 rounded-full bg-emerald-600/);
  // The helper nav follows the brand palette rather than a stray green.
  assert.doesNotMatch(code, /text-emerald-700/);
});
