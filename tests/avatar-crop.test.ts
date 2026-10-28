import { test } from "node:test";
import assert from "node:assert/strict";
import {
  coverScale, containScale, zoomRange, clampScale, clampOffset, centered,
  initialTransform, zoomAbout, outputRect, hasEmptySpace,
} from "../lib/avatar-crop.ts";

const V = 288;
// A portrait phone photo — the case that was broken: a centre crop takes
// the top of the head off, and nobody could move it.
const portrait = { width: 1125, height: 2436 };
const landscape = { width: 4000, height: 2250 };
const square = { width: 1000, height: 1000 };

test("cover fills the square, contain fits inside it", () => {
  assert.equal(coverScale(square, V), V / 1000);
  assert.equal(containScale(square, V), V / 1000);
  // Portrait: cover is driven by the narrow side, contain by the long one.
  assert.equal(coverScale(portrait, V), V / 1125);
  assert.equal(containScale(portrait, V), V / 2436);
  assert.ok(coverScale(portrait, V) > containScale(portrait, V));
});

test("you can always zoom out far enough to show the whole photo", () => {
  // The point of the editor. If the minimum were `cover`, a portrait photo
  // could never be shown in full and the crop would stay unavoidable.
  for (const img of [portrait, landscape, square]) {
    const { min } = zoomRange(img, V);
    assert.equal(min, containScale(img, V));
    assert.ok(hasEmptySpace({ scale: min, x: 0, y: 0 }, img, V) || img.width === img.height);
  }
});

test("zoom is bounded at both ends", () => {
  const { min, max } = zoomRange(portrait, V);
  assert.equal(clampScale(min / 10, portrait, V), min);
  assert.equal(clampScale(max * 10, portrait, V), max);
});

test("a zoomed-in image cannot be dragged away from the circle", () => {
  const t = { scale: coverScale(portrait, V) * 2, x: 9999, y: 9999 };
  const c = clampOffset(t, portrait, V);
  // Both edges must stay outside the viewport, so no blank wedge appears.
  assert.ok(c.x <= 0 && c.y <= 0);
  assert.ok(c.x + portrait.width * c.scale >= V - 0.001);
  assert.ok(c.y + portrait.height * c.scale >= V - 0.001);
});

test("a zoomed-out image cannot be dragged out of sight", () => {
  const scale = containScale(portrait, V);
  const c = clampOffset({ scale, x: -9999, y: -9999 }, portrait, V);
  assert.ok(c.x >= 0 && c.y >= 0);
  assert.ok(c.x + portrait.width * scale <= V + 0.001);
  assert.ok(c.y + portrait.height * scale <= V + 0.001);
});

test("the default position is what the old centre-crop produced", () => {
  // So nobody who liked the previous result has to do anything.
  const t = initialTransform(portrait, V);
  assert.equal(t.scale, coverScale(portrait, V));
  assert.ok(Math.abs(t.x - (V - portrait.width * t.scale) / 2) < 0.001);
});

test("zooming holds the point you zoomed about", () => {
  const start = centered(landscape, V, coverScale(landscape, V));
  const focus = { x: V / 2, y: V / 2 };
  // What sits under the focus, in image coordinates, before and after.
  const before = { x: (focus.x - start.x) / start.scale, y: (focus.y - start.y) / start.scale };
  const after = zoomAbout(start, start.scale * 1.8, focus, landscape, V);
  const nowAt = { x: (focus.x - after.x) / after.scale, y: (focus.y - after.y) / after.scale };
  assert.ok(Math.abs(before.x - nowAt.x) < 0.5, "the image lurched horizontally");
  assert.ok(Math.abs(before.y - nowAt.y) < 0.5, "the image lurched vertically");
});

test("the export maps the editor square onto the output square", () => {
  const OUT = 512;
  const t = initialTransform(portrait, V);
  const r = outputRect(t, portrait, V, OUT);
  const f = OUT / V;
  assert.ok(Math.abs(r.width - portrait.width * t.scale * f) < 0.001);
  // At cover, the output must be fully covered: no transparent edge.
  assert.ok(r.x <= 0.001 && r.y <= 0.001);
  assert.ok(r.x + r.width >= OUT - 0.001);
  assert.ok(r.y + r.height >= OUT - 0.001);
});

test("empty space is reported honestly", () => {
  assert.equal(hasEmptySpace(initialTransform(portrait, V), portrait, V), false);
  assert.equal(hasEmptySpace(centered(portrait, V, containScale(portrait, V)), portrait, V), true);
});

test("a zero-sized image cannot produce NaN", () => {
  // An unreadable file would otherwise poison every later calculation.
  const empty = { width: 0, height: 0 };
  assert.equal(coverScale(empty, V), 1);
  assert.equal(containScale(empty, V), 1);
  assert.ok(Number.isFinite(clampScale(2, empty, V)));
});
