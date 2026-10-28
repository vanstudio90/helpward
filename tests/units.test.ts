import test from "node:test";
import assert from "node:assert/strict";
import { formatUnit, singularize } from "../lib/units.ts";

test("one of something is singular", () => {
  assert.equal(formatUnit(1, "dogs"), "1 dog");
  assert.equal(formatUnit(1, "rooms"), "1 room");
  assert.equal(formatUnit(1, "helpers"), "1 helper");
  assert.equal(formatUnit(1, "parcels"), "1 parcel");
  assert.equal(formatUnit(1, "items"), "1 item");
});

test("more than one stays plural", () => {
  assert.equal(formatUnit(3, "dogs"), "3 dogs");
  assert.equal(formatUnit(0, "dogs"), "0 dogs");
});

test("irregular plurals the catalogue actually uses", () => {
  assert.equal(formatUnit(1, "people"), "1 person");
  assert.equal(formatUnit(4, "people"), "4 people");
  assert.equal(formatUnit(1, "inches"), "1 inch");
  assert.equal(formatUnit(32, "inches"), "32 inches");
});

test("currency goes in front of the number", () => {
  assert.equal(formatUnit(20, "$"), "$20");
  assert.equal(formatUnit(1, "$"), "$1", "a dollar is not 'a dollar singular'");
});

test("symbols are never pluralised either way", () => {
  assert.equal(formatUnit(1, "kg"), "1 kg");
  assert.equal(formatUnit(5, "kg"), "5 kg");
});

test("no unit means no unit", () => {
  assert.equal(formatUnit(3, undefined), "3");
});

test("a non-numeric value leaves the unit alone rather than guessing", () => {
  assert.equal(formatUnit("a few", "dogs"), "a few dogs");
});

test("singularize handles the shapes in the catalogue", () => {
  assert.equal(singularize("boxes"), "box");
  assert.equal(singularize("categories"), "category");
  assert.equal(singularize("dogs"), "dog");
  assert.equal(singularize("kg"), "kg");
});

// --- the price-tile suffix -------------------------------------------

import { unitFor } from "../lib/money.ts";

const rule = (over: Record<string, unknown> = {}) => ({
  serviceId: "s", includedMinutes: null, extraBlockMinutes: null, extraBlockCents: null,
  durationField: "duration_min", unitField: null, includedUnits: 1, perExtraUnitCents: null,
  crewField: null, includedCrew: 1, perExtraCrewCents: null, ...over,
}) as never;

test("the price suffix is a finished phrase, not a dangling adjective", () => {
  // Was "/ first 30-minute": first 30-minute WHAT.
  assert.equal(unitFor(rule({ includedMinutes: 30 })), "/ first 30 minutes");
  assert.equal(unitFor(rule({ includedMinutes: 60 })), "/ first 1 hour");
  assert.equal(unitFor(rule({ includedMinutes: 120 })), "/ first 2 hours");
  assert.equal(unitFor(rule({ includedMinutes: 1 })), "/ first 1 minute");
});

test("a per-unit price names the unit in the singular", () => {
  assert.equal(unitFor(rule({ unitField: "dog_count" })), "/ first dog");
  assert.equal(unitFor(rule({ unitField: "bedrooms" })), "/ first bedroom");
  assert.equal(unitFor(rule({ crewField: "helpers_needed" })), "/ first helper");
});

test("no rule means no suffix", () => {
  assert.equal(unitFor(null), "");
  assert.equal(unitFor(rule()), "");
});
