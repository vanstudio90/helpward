// Regression tests for the two crashes found during the 2026-10-24 review,
// plus the launch-scope and pricing rules.
//
// Run:  npm test
//
// No test framework dependency: node:test is built in and Node 22 strips
// TypeScript types natively. Supabase-touching code is exercised through
// injected fakes, so these run offline and never touch production.

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { getBatchAvailabilityStatus } from "../lib/data/availability.ts";
import { broadcastRequestBestEffort } from "../lib/broadcast.ts";
import { resolveServiceArea, isServiceable, normalizeMunicipality } from "../lib/service-areas.ts";
import { priceTask, payoutFromEstimateCents, SERVICE_FEE_CENTS } from "../lib/pricing.ts";
import { isRetiredCityPath } from "../lib/retired-pages.ts";

// ---------------------------------------------------------------------------
// CRASH 1 — saved helpers
//
// lib/data/availability.ts re-exported computeAvailabilityStatus with
// `export { x } from "..."`, which forwards the binding to importers but
// creates no local one. Calling it threw ReferenceError, 500ing /favorites
// and /saved-providers for any customer with at least one saved helper. The
// empty-array early return is why it was never caught.
// ---------------------------------------------------------------------------
describe("getBatchAvailabilityStatus", () => {
  // Fake matching the call shape: .from(t).select(...).in(...) and
  // .select(...).in(...).gte(...), both awaited for { data }.
  function fakeClient(rows: Record<string, unknown[]>) {
    const builder = (table: string) => {
      const result = { data: rows[table] ?? [], error: null };
      const chain: any = {
        select: () => chain,
        in: () => chain,
        gte: () => chain,
        eq: () => chain,
        then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
          Promise.resolve(result).then(res, rej),
      };
      return chain;
    };
    return { from: builder };
  }

  test("returns an empty map for no providers", async () => {
    const out = await getBatchAvailabilityStatus([], fakeClient({}));
    assert.equal(out.size, 0);
  });

  test("executes the full body for a non-empty list (the crash path)", async () => {
    const client = fakeClient({
      provider_availability_rules: [
        { provider_id: "p1", id: "r1", weekday: 1, start_time: "09:00", end_time: "17:00" },
      ],
      provider_availability_overrides: [],
      provider_profiles: [{ user_id: "p1", vacation_mode: false, vacation_returns_on: null }],
    });
    // Before the fix this threw: ReferenceError: computeAvailabilityStatus
    // is not defined.
    const out = await getBatchAvailabilityStatus(["p1"], client);
    assert.equal(out.size, 1);
    assert.ok(out.has("p1"), "expected a status for the requested provider");
  });

  test("still returns a status for a provider with no rules at all", async () => {
    const out = await getBatchAvailabilityStatus(["ghost"], fakeClient({}));
    assert.equal(out.size, 1);
    assert.ok(out.has("ghost"));
  });
});

// ---------------------------------------------------------------------------
// CRASH 2 — recurring materialization
//
// The series cron called `.catch()` directly on a Postgrest builder. Those
// builders implement `then` ONLY, so `.catch is not a function` threw and
// killed every materialize-series-occurrences run at the broadcast step.
// ---------------------------------------------------------------------------
describe("broadcastRequestBestEffort", () => {
  // A thenable with NO .catch — exactly what supabase.rpc() returns.
  function thenableOnly(result: { error: unknown }) {
    return {
      then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
        Promise.resolve(result).then(res, rej),
    } as PromiseLike<{ error: unknown }>;
  }

  test("handles a builder that has then() but no catch()", async () => {
    let called: Record<string, unknown> | null = null;
    const admin = {
      rpc: (_fn: string, args: Record<string, unknown>) => {
        called = args;
        return thenableOnly({ error: null });
      },
    };
    const r = await broadcastRequestBestEffort(admin, "req-1");
    assert.equal(r.ok, true);
    assert.deepEqual(called, { p_request_id: "req-1", p_radius_km: 20 });
  });

  test("reports an rpc-level error without throwing", async () => {
    const admin = { rpc: () => thenableOnly({ error: { message: "boom" } }) };
    const r = await broadcastRequestBestEffort(admin, "req-2");
    assert.equal(r.ok, false);
  });

  test("swallows a thrown rpc so request creation still succeeds", async () => {
    const admin = {
      rpc: () => { throw new TypeError("admin.rpc(...).catch is not a function"); },
    };
    const r = await broadcastRequestBestEffort(admin, "req-3");
    assert.equal(r.ok, false, "must not propagate — the request already exists");
  });
});

// ---------------------------------------------------------------------------
// Launch service areas
// ---------------------------------------------------------------------------
describe("service areas", () => {
  test("accepts the Lower Mainland municipalities", () => {
    for (const m of [
      "Vancouver", "Burnaby", "Richmond", "New Westminster", "Surrey", "Delta",
      "White Rock", "Coquitlam", "Port Coquitlam", "Port Moody", "Pitt Meadows",
      "Maple Ridge", "North Vancouver", "West Vancouver", "Langley",
    ]) {
      assert.equal(
        isServiceable({ place: m, region: "British Columbia", country: "CA" }), true,
        `${m} should be serviceable`,
      );
    }
  });

  test("handles municipal status words and accents", () => {
    assert.equal(normalizeMunicipality("City of Langley"), "langley");
    assert.equal(normalizeMunicipality("District of North Vancouver"), "north vancouver");
    assert.equal(normalizeMunicipality("Langley Township"), "langley");
    assert.equal(normalizeMunicipality("Montréal"), "montreal");
  });

  test("rejects a same-named municipality in another region", () => {
    // Delta, BC is in scope. Delta, Utah is not.
    assert.equal(isServiceable({ place: "Delta", region: "British Columbia", country: "CA" }), true);
    assert.equal(isServiceable({ place: "Delta", region: "Utah", country: "US" }), false);
  });

  test("California launches are city limits only", () => {
    assert.equal(isServiceable({ place: "Los Angeles", region: "California", country: "US" }), true);
    assert.equal(isServiceable({ place: "San Diego", region: "California", country: "US" }), true);
    for (const m of ["Santa Monica", "Burbank", "West Hollywood", "Chula Vista", "Pasadena", "Inglewood"]) {
      assert.equal(
        isServiceable({ place: m, region: "California", country: "US" }), false,
        `${m} is outside city limits and must be rejected`,
      );
    }
  });

  test("rejects the cities we retired", () => {
    for (const [place, region, country] of [
      ["Toronto", "Ontario", "CA"], ["Montreal", "Quebec", "CA"],
      ["Seattle", "Washington", "US"], ["San Francisco", "California", "US"],
      ["Austin", "Texas", "US"], ["Chicago", "Illinois", "US"],
      ["New York", "New York", "US"], ["Miami", "Florida", "US"],
    ] as const) {
      assert.equal(isServiceable({ place, region, country }), false, `${place} must be out of area`);
    }
  });

  test("rejects an address with no municipality", () => {
    assert.equal(isServiceable({ place: null, region: "British Columbia", country: "CA" }), false);
    assert.equal(resolveServiceArea({ place: "Vancouver", region: "BC", country: null }), null);
  });
});

// ---------------------------------------------------------------------------
// Pricing split
// ---------------------------------------------------------------------------
describe("pricing", () => {
  test("helper gets 80% of subtotal; the service fee is all Helpward", () => {
    const b = priceTask(2000);
    assert.equal(b.subtotalCents, 2000);
    assert.equal(b.serviceFeeCents, SERVICE_FEE_CENTS);
    assert.equal(b.totalCents, 2450);
    assert.equal(b.helperPayoutCents, 1600);        // 80% of 2000
    assert.equal(b.platformGrossCents, 850);        // 20% of 2000 + 450
  });

  test("tips go to the helper in full and are never commissioned", () => {
    const b = priceTask(2000, 500);
    assert.equal(b.helperPayoutCents, 2100);
    assert.equal(b.platformGrossCents, 850, "platform take must not change with a tip");
    assert.equal(b.totalCents, 2950);
  });

  test("the subtotal always splits exactly, with no cent created or lost", () => {
    for (const subtotal of [0, 1, 3, 7, 333, 999, 1234, 2000, 8001, 123457]) {
      const b = priceTask(subtotal, 123);
      assert.equal(
        b.helperPayoutCents + b.platformGrossCents, b.totalCents,
        `split must reconcile at subtotal ${subtotal}`,
      );
    }
  });

  test("payout from a stored estimate removes the fee before commissioning", () => {
    // estimated_price_cents includes the $4.50 fee.
    assert.equal(payoutFromEstimateCents(2450), 1600);
    // Must not go negative on a malformed estimate.
    assert.equal(payoutFromEstimateCents(0), 0);
  });

  test("tax is explicit rather than silently absent", () => {
    assert.equal(priceTask(2000).taxCents, 0);
  });
});

// ---------------------------------------------------------------------------
// Retired city pages
// ---------------------------------------------------------------------------
describe("retired city paths", () => {
  test("retired cities are gone (410), with or without a service segment", () => {
    assert.equal(isRetiredCityPath("/cities/austin"), true);
    assert.equal(isRetiredCityPath("/cities/austin/dog-walking"), true);
    assert.equal(isRetiredCityPath("/cities/new-york/"), true);
  });

  test("launch cities are untouched", () => {
    assert.equal(isRetiredCityPath("/cities/vancouver"), false);
    assert.equal(isRetiredCityPath("/cities/los-angeles/moving-help"), false);
    assert.equal(isRetiredCityPath("/cities/san-diego"), false);
  });

  test("unknown slugs fall through to a normal 404, not a 410", () => {
    assert.equal(isRetiredCityPath("/cities/atlantis"), false);
    assert.equal(isRetiredCityPath("/services/dog-walking"), false);
    assert.equal(isRetiredCityPath("/"), false);
  });
});
