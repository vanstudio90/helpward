import test from "node:test";
import assert from "node:assert/strict";
import {
  addressFields, resolveIntakeAddresses, applyResolvedAddresses,
} from "../lib/intake-addresses.ts";
import { SERVICE_INTAKE } from "../lib/service-intake.ts";
import type { IntakeField } from "../lib/service-intake.ts";

const dest = (key: string, label: string, required = true): IntakeField =>
  ({ key, label, required, type: "destination" });

const found = (formatted: string, country = "CA") =>
  async () => ({ ok: true as const, address: { formatted, lat: 49.28, lng: -123.12, country } });

test("package delivery no longer asks for a second collection address", () => {
  // The request's own address is the collection point. Two collection
  // addresses on one booking is what let a Vancouver job say "collect in
  // Chicago", so there must only ever be one.
  const spec = SERVICE_INTAKE["package-delivery"];
  const keys = spec.fields.map((f) => f.key);
  assert.ok(!keys.includes("pickup_from"), "pickup_from must be gone");
  assert.ok(keys.includes("deliver_to"), "a drop-off is what intake should ask for");
  assert.equal(spec.addressLabel, "Collect from");
});

test("every service with an address answer labels its own address when it is not just 'yours'", () => {
  for (const [slug, spec] of Object.entries(SERVICE_INTAKE)) {
    const addrs = addressFields(spec.fields);
    for (const f of addrs) {
      // An address answer may never be named in a way that reads as the
      // place the helper starts; that is the request address's job.
      assert.ok(
        !/^collect|^pick ?up/i.test(f.label),
        `${slug}.${f.key} is labelled "${f.label}", which reads as a collection point`,
      );
    }
  }
});

test("a drop-off that cannot be found stops the booking", async () => {
  const r = await resolveIntakeAddresses(
    [dest("deliver_to", "Deliver to")],
    { deliver_to: "nowhere at all" },
    async () => ({ ok: false, reason: "not_found" }),
  );
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /Deliver to/);
});

test("a required drop-off left blank stops the booking", async () => {
  const r = await resolveIntakeAddresses(
    [dest("deliver_to", "Deliver to")],
    {},
    found("never called"),
  );
  assert.equal(r.ok, false);
});

test("an optional drop-off left blank is fine", async () => {
  const r = await resolveIntakeAddresses(
    [dest("deliver_to", "Deliver to", false)],
    {},
    found("never called"),
  );
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.resolved.length, 0);
});

test("a drop-off OUTSIDE the service area is allowed", async () => {
  // A ride out of town is a normal request. Only the collection point is
  // contained; refusing a far destination would reject real bookings.
  const r = await resolveIntakeAddresses(
    [dest("destination", "Where to?")],
    { destination: "Seattle, WA" },
    async () => ({ ok: true, address: { formatted: "Seattle, WA, USA", lat: 47.6, lng: -122.3, country: "US" } }),
  );
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.resolved[0].country, "US");
});

test("an ambiguous drop-off takes the best candidate rather than failing", async () => {
  const r = await resolveIntakeAddresses(
    [dest("destination", "Where to?")],
    { destination: "Main St" },
    async () => ({
      ok: false, reason: "needs_selection",
      candidates: [
        { formatted: "Main St, Vancouver, BC", lat: 49.2, lng: -123.1, country: "CA" },
        { formatted: "Main St, Seattle, WA", lat: 47.6, lng: -122.3, country: "US" },
      ],
    }),
  );
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.resolved[0].formatted, "Main St, Vancouver, BC");
});

test("the helper reads the RESOLVED address, with the typed one kept beside it", () => {
  const values = applyResolvedAddresses(
    { deliver_to: "1055 canada pl", size: "small" },
    [{ key: "deliver_to", typed: "1055 canada pl",
       formatted: "1055 Canada Pl, Vancouver, BC V6C 0C3", lat: 49.28, lng: -123.11, country: "CA" }],
  );
  assert.equal(values.deliver_to, "1055 Canada Pl, Vancouver, BC V6C 0C3");
  assert.equal(values.deliver_to_typed, "1055 canada pl");
  assert.equal(values.deliver_to_lat, "49.28");
  assert.equal(values.size, "small", "other answers untouched");
});

test("no _typed duplicate is kept when the geocoder changed nothing", () => {
  const values = applyResolvedAddresses(
    { deliver_to: "1055 Canada Pl, Vancouver, BC" },
    [{ key: "deliver_to", typed: "1055 Canada Pl, Vancouver, BC",
       formatted: "1055 Canada Pl, Vancouver, BC", lat: 49.28, lng: -123.11, country: "CA" }],
  );
  assert.equal(values.deliver_to_typed, undefined);
});
