// Every service collects what its helper actually needs.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

import {
  SERVICE_INTAKE, intakeFor, validateIntake, describeIntake,
} from "../lib/service-intake.ts";

// The live catalog, read from the seed migration so the test tracks the
// real service list rather than a copy that can drift.
function catalogIds(): string[] {
  const sql = readFileSync(
    new URL("../supabase/migrations/0003_seed_catalog.sql", import.meta.url), "utf8",
  );
  return [...sql.matchAll(/\(\s*'([a-z0-9-]+)'\s*,\s*'[a-z-]+'\s*,/g)].map((m) => m[1]);
}

describe("intake coverage", () => {
  test("every catalogued service has a spec", () => {
    const missing = catalogIds().filter((id) => !intakeFor(id));
    assert.deepEqual(missing, [], `services with no intake spec: ${missing.join(", ")}`);
  });

  test("no spec exists for a service that is not in the catalog", () => {
    const ids = new Set(catalogIds());
    const orphans = Object.keys(SERVICE_INTAKE).filter((k) => !ids.has(k));
    assert.deepEqual(orphans, [], `specs with no service: ${orphans.join(", ")}`);
  });

  test("every field is usable: unique key, label, and options where needed", () => {
    for (const [id, spec] of Object.entries(SERVICE_INTAKE)) {
      const keys = new Set<string>();
      for (const f of spec.fields) {
        assert.ok(f.key && f.label, `${id}: field missing key or label`);
        assert.ok(!keys.has(f.key), `${id}: duplicate field key ${f.key}`);
        keys.add(f.key);
        if (f.type === "select" || f.type === "duration" || f.type === "checkboxes") {
          assert.ok((f.options ?? []).length > 0, `${id}.${f.key}: needs options`);
        }
        if (f.type === "number") {
          assert.ok(f.min != null && f.max != null, `${id}.${f.key}: needs min and max`);
        }
      }
    }
  });
});

describe("the briefs the launch decision named", () => {
  test("driving and delivery collect a destination", () => {
    for (const id of ["designated-driver", "motorcycle-taxi", "moving-help"]) {
      const keys = intakeFor(id)!.fields.map((f) => f.key);
      assert.ok(keys.includes("destination"), `${id} must ask where to`);
    }
    assert.ok(
      intakeFor("package-delivery")!.fields.some((f) => f.type === "destination"),
      "package delivery must ask where to collect from",
    );
  });

  test("walking and companionship collect a duration", () => {
    for (const id of [
      "dog-walking", "date-companion", "event-companion", "wedding-guest",
      "rent-a-friend", "elder-assistance", "listening-service",
      "sleep-call-companion", "professional-cuddler",
    ]) {
      const f = intakeFor(id)!.fields.find((x) => x.key === "duration_min");
      assert.ok(f?.required, `${id} must ask how long`);
    }
  });

  test("moving collects crew size and stairs at BOTH ends", () => {
    const keys = intakeFor("moving-help")!.fields.map((f) => f.key);
    for (const k of ["crew_size", "access_from", "access_to", "inventory"]) {
      assert.ok(keys.includes(k), `moving-help must ask for ${k}`);
    }
  });

  test("installation collects the equipment facts that decide the job", () => {
    const tv = intakeFor("tv-mounting")!.fields.map((f) => f.key);
    assert.ok(tv.includes("wall_type") && tv.includes("tv_size") && tv.includes("mount"));
    assert.ok(intakeFor("furniture-assembly")!.fields.some((f) => f.key === "tools"));
  });

  test("property work collects access instructions", () => {
    for (const id of ["property-inspection", "house-check-in", "dog-walking"]) {
      const f = intakeFor(id)!.fields.find((x) => x.key === "access");
      assert.ok(f?.required, `${id} must ask how the helper gets in`);
    }
  });

  test("a designated driver is asked about transmission", () => {
    // A helper who cannot drive a manual must be able to see this before
    // accepting, so it is required rather than a note.
    const f = intakeFor("designated-driver")!.fields.find((x) => x.key === "transmission");
    assert.equal(f?.required, true);
    assert.deepEqual(f?.options?.map((o) => o.value), ["automatic", "manual"]);
  });
});

describe("server-side validation", () => {
  test("a missing required field is refused by name", () => {
    const r = validateIntake("dog-walking", { dog_count: "1" });
    assert.equal(r.ok, false);
    assert.match(r.ok === false ? r.error : "", /required/i);
  });

  test("a complete brief passes and is normalised", () => {
    const r = validateIntake("dog-walking", {
      duration_min: "60", dog_count: "2", dog_size: "medium",
      leash_location: "hook by the front door", access: "code 1234",
    });
    assert.equal(r.ok, true);
    assert.equal(r.ok && r.values.duration_min, "60");
  });

  test("an invented option value is refused", () => {
    const r = validateIntake("dog-walking", {
      duration_min: "60", dog_count: "1", dog_size: "enormous",
      leash_location: "x", access: "y",
    });
    assert.equal(r.ok, false);
  });

  test("numbers are range-checked", () => {
    const base = { inventory: "a sofa", access_from: "ground", access_to: "ground",
      vehicle: "car-loads", destination: "1055 Canada Pl" };
    assert.equal(validateIntake("moving-help", { ...base, crew_size: "0" }).ok, false);
    assert.equal(validateIntake("moving-help", { ...base, crew_size: "9" }).ok, false);
    assert.equal(validateIntake("moving-help", { ...base, crew_size: "3" }).ok, true);
  });

  test("checkbox groups reject values outside the spec", () => {
    const base = { access: "lockbox", alarm: "none" };
    assert.equal(validateIntake("house-check-in", { ...base, tasks: ["mail", "plants"] }).ok, true);
    assert.equal(validateIntake("house-check-in", { ...base, tasks: ["mail", "burgle"] }).ok, false);
  });

  test("a service with no spec accepts an empty brief", () => {
    assert.equal(validateIntake("not-a-service", {}).ok, true);
  });
});

describe("what the helper reads", () => {
  test("stored values render as labels, not raw codes", () => {
    const out = describeIntake("moving-help", {
      destination: "1055 Canada Pl", crew_size: "3", inventory: "sofa, 20 boxes",
      access_from: "stairs-2plus", access_to: "elevator", vehicle: "have-van",
    });
    const byLabel = Object.fromEntries(out.map((o) => [o.label, o.value]));
    assert.equal(byLabel["Access at the pickup"], "Two or more flights");
    assert.equal(byLabel["Access at the destination"], "Lift / elevator");
    assert.equal(byLabel["How many helpers do you need?"], "3 helpers");
  });

  test("durations read as time, not minutes-as-a-number", () => {
    const out = describeIntake("dog-walking", { duration_min: "90" });
    assert.equal(out[0].value, "1.5 hours");
  });

  test("checkbox groups join their labels", () => {
    const out = describeIntake("house-check-in", { tasks: ["mail", "bins"] });
    assert.equal(out.find((o) => o.label === "What should they do?")?.value,
      "Collect mail, Put bins out or back");
  });

  test("absent answers are omitted rather than shown blank", () => {
    assert.deepEqual(describeIntake("dog-walking", {}), []);
    assert.deepEqual(describeIntake("dog-walking", null), []);
  });
});
