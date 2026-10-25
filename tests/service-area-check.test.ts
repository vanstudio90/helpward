// Two-stage service-area eligibility.
//
// What these DO cover: the orchestration — that the preliminary name check
// alone never grants eligibility, that each boundary verdict maps to the
// right outcome and message, and that the system fails CLOSED.
//
// What they do NOT cover: polygon containment itself, which lives in
// PostGIS (migration 0033). Its inside/outside behaviour is asserted by
// supabase/tests/boundary_containment.sql, which is retained and marked
// UNEXECUTED until the isolated environment has a dataset loaded.

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { checkServiceArea, AREA_MESSAGES } from "../lib/service-area-check.ts";

const VANCOUVER = { country: "CA", region: "British Columbia", city: "Vancouver" };
const POINT = "POINT(-123.1207 49.2827)";

function rpc(result: { data?: unknown; error?: unknown } | (() => never)) {
  return {
    rpc: (_fn: string, _args: Record<string, unknown>) => {
      if (typeof result === "function") result();
      return Promise.resolve({ data: null, error: null, ...result }) as any;
    },
  };
}

describe("stage 1 — preliminary municipality check", () => {
  test("a municipality outside the launch list is refused without consulting boundaries", async () => {
    let called = false;
    const client = {
      rpc: () => { called = true; return Promise.resolve({ data: "serviceable", error: null }) as any; },
    };
    const r = await checkServiceArea(client, { country: "CA", region: "British Columbia", city: "Abbotsford" }, POINT);
    assert.equal(r.ok, false);
    assert.equal(r.ok === false && r.code, "not_in_launch_area");
    assert.equal(called, false, "must not waste a boundary lookup on a plainly out-of-area city");
  });

  test("passing stage 1 grants nothing on its own", async () => {
    // The name says Vancouver, but the pin is outside every boundary.
    const r = await checkServiceArea(rpc({ data: "outside_boundary" }), VANCOUVER, POINT);
    assert.equal(r.ok, false, "a name match must never be sufficient");
    assert.equal(r.ok === false && r.code, "outside_boundary");
  });
});

describe("stage 2 — authoritative boundary containment", () => {
  test("serviceable only when the polygon check agrees", async () => {
    const r = await checkServiceArea(rpc({ data: "serviceable" }), VANCOUVER, POINT);
    assert.equal(r.ok, true);
    assert.equal(r.ok === true && r.area.id, "lower-mainland-bc");
    assert.equal(r.ok === true && r.boundaryVerdict, "serviceable");
  });

  test("outside_boundary is distinct from not_in_launch_area", async () => {
    // The unincorporated-land case: geocodes as a launch city, sits outside
    // its legal limits. Telling the customer "we don't serve San Diego"
    // would be wrong, so the codes and messages must differ.
    const outside = await checkServiceArea(
      rpc({ data: "outside_boundary" }),
      { country: "US", region: "California", city: "San Diego" }, POINT,
    );
    const notLaunch = await checkServiceArea(
      rpc({ data: "serviceable" }),
      { country: "US", region: "California", city: "Chula Vista" }, POINT,
    );
    assert.equal(outside.ok === false && outside.code, "outside_boundary");
    assert.equal(notLaunch.ok === false && notLaunch.code, "not_in_launch_area");
    assert.notEqual(
      AREA_MESSAGES.outside_boundary,
      AREA_MESSAGES.not_in_launch_area,
      "the two cases must read differently to the customer",
    );
    assert.match(AREA_MESSAGES.outside_boundary, /city limits/i);
  });
});

describe("fail-closed behaviour", () => {
  test("no boundary dataset loaded refuses the request", async () => {
    const r = await checkServiceArea(rpc({ data: "no_dataset" }), VANCOUVER, POINT);
    assert.equal(r.ok, false, "must not degrade to the preliminary check");
    assert.equal(r.ok === false && r.code, "no_dataset");
  });

  test("an RPC error refuses the request", async () => {
    const r = await checkServiceArea(rpc({ error: { message: "boom" } }), VANCOUVER, POINT);
    assert.equal(r.ok, false);
    assert.equal(r.ok === false && r.code, "boundary_check_failed");
  });

  test("a thrown RPC refuses the request rather than propagating", async () => {
    const r = await checkServiceArea(
      rpc(() => { throw new Error("connection reset"); }), VANCOUVER, POINT,
    );
    assert.equal(r.ok, false);
    assert.equal(r.ok === false && r.code, "boundary_check_failed");
  });

  test("an unrecognised verdict is treated as not serviceable", async () => {
    const r = await checkServiceArea(rpc({ data: "something_new" }), VANCOUVER, POINT);
    assert.equal(r.ok, false);
    assert.equal(r.ok === false && r.code, "no_dataset");
  });

  test("a null verdict is treated as not serviceable", async () => {
    const r = await checkServiceArea(rpc({ data: null }), VANCOUVER, POINT);
    assert.equal(r.ok, false);
  });

  test("every refusal code has customer-facing copy", () => {
    for (const code of ["not_in_launch_area", "outside_boundary", "no_dataset", "boundary_check_failed"] as const) {
      assert.ok(AREA_MESSAGES[code]?.length > 20, `missing message for ${code}`);
    }
  });
});

// ---------------------------------------------------------------------------
// R08 — the emergency boundary exception must cover request CREATION, not
// just broadcast. Previously the override replaced broadcast_request only,
// while this guard refused outside_boundary/no_dataset before a request row
// was ever created — so the documented procedure could not restore ordinary
// customer submission during a dataset incident.
// ---------------------------------------------------------------------------
describe("declared boundary incident", () => {
  function clientWith(verdict: string, mode: string) {
    return {
      rpc: (fn: string) =>
        Promise.resolve(
          fn === "boundary_enforcement_mode"
            ? { data: mode, error: null }
            : { data: verdict, error: null },
        ) as any,
    };
  }

  test("outside_boundary is allowed through while enforcement is relaxed", async () => {
    const r = await checkServiceArea(clientWith("outside_boundary", "relaxed"), VANCOUVER, POINT);
    assert.equal(r.ok, true, "the override must cover request creation, not just dispatch");
  });

  test("no_dataset is allowed through while enforcement is relaxed", async () => {
    const r = await checkServiceArea(clientWith("no_dataset", "relaxed"), VANCOUVER, POINT);
    assert.equal(r.ok, true);
  });

  test("a city outside the launch list is STILL refused while relaxed", async () => {
    // The override relaxes boundary containment, not the launch decision.
    const r = await checkServiceArea(
      clientWith("serviceable", "relaxed"),
      { country: "CA", region: "British Columbia", city: "Abbotsford" }, POINT,
    );
    assert.equal(r.ok, false);
    assert.equal(r.ok === false && r.code, "not_in_launch_area");
  });

  test("normal enforcement still refuses", async () => {
    const r = await checkServiceArea(clientWith("outside_boundary", "enforced"), VANCOUVER, POINT);
    assert.equal(r.ok, false);
  });

  test("an unreadable setting fails CLOSED to enforced", async () => {
    const client = {
      rpc: (fn: string) =>
        Promise.resolve(
          fn === "boundary_enforcement_mode"
            ? { data: null, error: { message: "denied" } }
            : { data: "outside_boundary", error: null },
        ) as any,
    };
    const r = await checkServiceArea(client, VANCOUVER, POINT);
    assert.equal(r.ok, false, "an error reading the mode must not relax anything");
  });

  test("a thrown setting lookup fails CLOSED to enforced", async () => {
    const client = {
      rpc: (fn: string) => {
        if (fn === "boundary_enforcement_mode") throw new Error("connection reset");
        return Promise.resolve({ data: "no_dataset", error: null }) as any;
      },
    };
    const r = await checkServiceArea(client, VANCOUVER, POINT);
    assert.equal(r.ok, false);
  });
});
