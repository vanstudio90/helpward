import test from "node:test";
import assert from "node:assert/strict";
import { distanceKm, checkTrip, describeTrip, MAX_TRIP_KM } from "../lib/trip-limits.ts";

const VANCOUVER = { lat: 49.2827, lng: -123.1207 };
const BURNABY = { lat: 49.2488, lng: -122.9805 };
const WHISTLER = { lat: 50.1163, lng: -122.9574 };
const CHICAGO = { lat: 41.8781, lng: -87.6298 };
const SAN_DIEGO = { lat: 32.7157, lng: -117.1611 };
const TEMECULA = { lat: 33.4936, lng: -117.1484 };

test("distance is right to within a percent on known pairs", () => {
  // Vancouver to Burnaby is about 11 km.
  assert.ok(Math.abs(distanceKm(VANCOUVER, BURNABY) - 11) < 2);
  // Vancouver to Chicago is about 2,800 km.
  assert.ok(Math.abs(distanceKm(VANCOUVER, CHICAGO) - 2800) < 60);
  assert.equal(Math.round(distanceKm(VANCOUVER, VANCOUVER)), 0);
});

test("the Chicago destination that was accepted is refused", () => {
  const r = checkTrip(VANCOUVER, CHICAGO, "delivery address");
  assert.equal(r.ok, false);
  if (!r.ok) {
    // The message carries the actual distance and the limit, so the
    // customer knows which part of the request was the problem.
    assert.match(r.error, /km from the collection address/);
    assert.match(r.error, new RegExp(String(MAX_TRIP_KM)));
    assert.match(r.error, /long-distance/);
  }
});

test("a normal out-of-area drop-off is still allowed", () => {
  // The whole point: out-of-area is fine, cross-country is not.
  assert.equal(checkTrip(VANCOUVER, BURNABY, "delivery address").ok, true);
  assert.equal(checkTrip(VANCOUVER, WHISTLER, "destination").ok, true,
    "Vancouver to Whistler is a real trip people take");
  assert.equal(checkTrip(SAN_DIEGO, TEMECULA, "destination").ok, true,
    "San Diego to Temecula is a real trip people take");
});

test("the limit is configurable without touching the logic", () => {
  assert.equal(checkTrip(VANCOUVER, WHISTLER, "destination", 50).ok, false);
  assert.equal(checkTrip(VANCOUVER, CHICAGO, "destination", 5000).ok, true);
});

test("straight-line distance under-estimates, so refusals are conservative", () => {
  // Road distance always exceeds great-circle. Anything refused here is
  // worse by road, so the check can never refuse a trip that was
  // actually short enough.
  const km = distanceKm(VANCOUVER, WHISTLER);
  assert.ok(km < 125, "great-circle is below the ~120 km drive");
});

test("the coarse description tells a helper enough to judge a trip", () => {
  assert.equal(describeTrip(11.4, "Burnaby, BC"), "Burnaby, BC · ~11 km away");
  assert.equal(describeTrip(0.4, null), "under 1 km away");
  assert.equal(describeTrip(12, null), "~12 km away");
});
