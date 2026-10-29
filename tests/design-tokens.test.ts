import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync("app/globals.css", "utf8");
const layout = readFileSync("app/layout.tsx", "utf8");

/* The brief asked for a competitor's typeface and design system verbatim.
 * That face is proprietary and licensed to them, so this builds the same
 * QUALITIES — geometric warmth, generous roundness, soft elevation — from
 * an openly-licensed face and our own tokens.
 */

test("the display face is self-hosted and cannot shift the layout", () => {
  // A webfont that arrives late reflows the page, which is the opposite of
  // feeling solid. next/font self-hosts and preloads it.
  assert.match(layout, /from "next\/font\/google"/);
  assert.match(layout, /variable: "--font-display"/);
  assert.match(layout, /display: "swap"/);
  assert.match(layout, /className=\{display\.variable\}/);
});

test("the font stack degrades to real metrics, not Times", () => {
  const stack = css.slice(css.indexOf("--font-sans:"), css.indexOf("}", css.indexOf("--font-sans:")));
  assert.match(stack, /var\(--font-display\)/);
  assert.match(stack, /system-ui/);
  assert.match(stack, /-apple-system/);
});

test("radii scale with the element rather than being one big number", () => {
  // What reads as "bubbly" is a consistent ratio between an element's
  // height and its corner — not a single radius applied everywhere.
  const vals = ["--radius-sm", "--radius-md", "--radius-lg", "--radius-xl", "--radius-2xl"]
    .map((v) => {
      const m = css.match(new RegExp(`${v}: ([0-9.]+)rem`));
      assert.ok(m, `${v} is missing`);
      return parseFloat(m![1]);
    });
  for (let i = 1; i < vals.length; i++) {
    assert.ok(vals[i] > vals[i - 1], "the radius scale must increase monotonically");
  }
  // And a card must actually be round enough to read as one.
  assert.ok(vals[3] >= 1.25, "card radius is too tight to read as bubbly");
});

test("shadows are soft and tinted, not tight and black", () => {
  // A tight shadow reads as a cut-out; a diffuse one reads as a surface
  // resting above the page.
  for (const v of ["--shadow-soft", "--shadow-lift", "--shadow-float"]) {
    assert.ok(css.includes(v), `${v} is missing`);
  }
  const soft = css.slice(css.indexOf("--shadow-soft:"), css.indexOf(";", css.indexOf("--shadow-soft:")));
  assert.match(soft, /rgb\(49 46 129/, "shadows should be tinted toward the brand hue, not pure black");
  assert.doesNotMatch(soft, /rgb\(0 0 0/);
});

test("press physics are felt, not seen, and respect reduced motion", () => {
  assert.match(css, /@media \(pointer: coarse\)/, "a mouse does not need a scaling button");
  const scale = css.match(/transform: scale\((0\.\d+)\)/);
  assert.ok(scale, "no press scale defined");
  assert.ok(parseFloat(scale![1]) >= 0.95, "a press that scales below 0.95 looks broken, not responsive");
  assert.match(css, /prefers-reduced-motion: reduce[\s\S]*?transform: none/);
});

test("headings are tracked and balanced; body text is not", () => {
  const head = css.slice(css.indexOf("h1, h2, h3, h4 {"), css.indexOf("}", css.indexOf("h1, h2, h3, h4 {")));
  assert.match(head, /letter-spacing: -0\./);
  assert.match(head, /text-wrap: balance/);
  // Tightening body text in a display face hurts reading.
  assert.doesNotMatch(css, /^body \{[^}]*letter-spacing: -/m);
});

test("figures that sit in columns line up", () => {
  assert.match(css, /font-variant-numeric: tabular-nums/);
});
