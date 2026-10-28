import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { BUNDLING_ENABLED } from "../lib/feature-flags.ts";

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("the bundle picker is gated on the flag, not merely unmounted by accident", () => {
  const view = read("app/(app)/new-request/view.tsx");
  assert.match(view, /BUNDLING_ENABLED && \(\s*<BundlePicker/);
});

test("the SERVER refuses bundles while the flag is off", () => {
  // Hiding a control does not close a path: this action takes a form
  // post, and a form post can be made without the picker. If this
  // assertion ever fails, bundling is reachable by anyone who posts the
  // field by hand.
  const actions = read("app/(app)/new-request/actions.ts");
  assert.match(actions, /if \(bundleItems && !BUNDLING_ENABLED\)/);
});

test("customers are not told to use bundling while it is off", () => {
  if (BUNDLING_ENABLED) return;
  const help = read("lib/help-articles.ts");
  const i = help.indexOf('slug: "bundling-multiple-tasks"');
  assert.ok(i > 0, "the bundling article should still exist");
  // The article opens with a note saying it is unavailable, before any
  // instruction to tap anything.
  const head = help.slice(i, i + 1400);
  assert.match(head, /isn't available yet|is not available yet/);
  assert.ok(
    !/How to create a bundle/.test(head),
    "no step-by-step for a control that is not on screen",
  );
});

test("the pricing page does not quote a bundle discount nobody can get", () => {
  if (BUNDLING_ENABLED) return;
  const pricing = read("app/vs/pricing/page.tsx");
  assert.ok(!/The bundling math/.test(pricing));
  assert.ok(!/\$42\.50/.test(pricing), "the bundled total was the unobtainable price");
});
