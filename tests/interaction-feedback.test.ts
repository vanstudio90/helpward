import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/* Tapping a link gave no sign it had registered, and the page behind it
 * was slow enough that the screen looked frozen. Both halves are asserted
 * here because both are easy to delete by accident.
 */

const css = readFileSync("app/globals.css", "utf8");
const layout = readFileSync("app/layout.tsx", "utf8");
const bar = readFileSync("components/nav-progress.tsx", "utf8");
const onboard = readFileSync("app/(provider)/provider/onboard/page.tsx", "utf8");
const providerLayout = readFileSync("app/(provider)/layout.tsx", "utf8");

test("a press is visible the moment it happens", () => {
  assert.match(css, /-webkit-tap-highlight-color/);
  assert.match(css, /button:not\(:disabled\):active/);
  assert.match(css, /opacity: 0\.68/);
});

test("the press rule never sets a transition shorthand", () => {
  // The shorthand sets transition-property, which would replace Tailwind's
  // transition-colors wherever this rule won and kill hover transitions.
  const block = css.slice(css.indexOf("a:active,"), css.indexOf("#nav-progress"));
  assert.doesNotMatch(block, /^\s*transition:/m);
});

test("a navigation in flight is shown, and always ends", () => {
  assert.match(layout, /<NavProgress \/>/);
  assert.match(bar, /setTimeout\(stop, 15000\)/);  // a lost navigation cannot hang the bar
  assert.match(bar, /url\.origin !== window\.location\.origin/); // external links ignored
  assert.match(bar, /href\.startsWith\("#"\)/);                  // anchors ignored
  assert.match(css, /#nav-progress/);
});

test("the bar never claims to have finished early", () => {
  // It creeps to 90% and waits for the route to actually render.
  assert.match(css, /100% \{ transform: scaleX\(0\.9\); \}/);
  assert.match(bar, /\[pathname\]/);
});

test("provider pages fetch in parallel, not in a chain", () => {
  // Every one of these was a separate round trip to us-west-1 before the
  // page could render, and the provider layout is on all of them.
  assert.match(onboard, /await Promise\.all\(\[/);
  assert.match(providerLayout, /await Promise\.all\(\[/);
});
