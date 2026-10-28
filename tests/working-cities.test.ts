import { test } from "node:test";
import assert from "node:assert/strict";
import { SERVICE_AREAS, normalizeMunicipality } from "../lib/service-areas.ts";
import { APPROVED } from "../scripts/lib/jurisdictions.mjs";

/* The cities a helper can PICK and the cities dispatch can MATCH must be the
 * same set.
 *
 * Migration 0072 scopes dispatch to a helper's chosen cities by polygon
 * containment. A name offered in the signup cascade or the profile card that
 * no boundary answers to does not degrade gracefully — the helper ticks it,
 * the save succeeds if validation is ever loosened, and they are then
 * configured, confident, and permanently undispatchable. That is the exact
 * silent-coverage-hole class 0067 was written about, arriving from the other
 * direction.
 *
 * SERVICE_AREAS drives both pieces of UI; APPROVED drives the boundary
 * loader and activation. This asserts they cannot drift apart offline, in
 * CI, without a database.
 */

const keysFor = (areaId: string) =>
  new Set((APPROVED[areaId] ?? []).map((j: { match: string }) => normalizeMunicipality(j.match)));

test("every city offered in the UI has an approved jurisdiction behind it", () => {
  for (const area of SERVICE_AREAS) {
    const approved = keysFor(area.id);
    assert.ok(approved.size > 0, `${area.id} has no approved jurisdictions`);
    for (const m of area.municipalities) {
      assert.ok(
        approved.has(normalizeMunicipality(m)),
        `${area.id} offers "${m}" but no jurisdiction matches it — a helper picking it would be undispatchable`,
      );
    }
  }
});

test("every approved jurisdiction is reachable from the UI", () => {
  // The reverse direction: a jurisdiction we load boundaries for but never
  // offer is territory no helper can opt into.
  for (const areaId of Object.keys(APPROVED)) {
    const area = SERVICE_AREAS.find((a) => a.id === areaId);
    assert.ok(area, `APPROVED has "${areaId}" but SERVICE_AREAS does not`);
    const offered = new Set(area!.municipalities.map(normalizeMunicipality));
    for (const j of APPROVED[areaId]) {
      assert.ok(
        offered.has(normalizeMunicipality(j.match)),
        `${areaId} loads boundaries for "${j.match}" but no helper can select it`,
      );
    }
  }
});

test("shared display names collapse to one selectable city", () => {
  // North Vancouver is the City AND the District; Langley is the City AND
  // the Township. A helper picks the name they would say out loud and gets
  // both polygons — so the UI must list the name ONCE, not twice.
  for (const area of SERVICE_AREAS) {
    const seen = new Set<string>();
    for (const m of area.municipalities) {
      const k = normalizeMunicipality(m);
      assert.ok(!seen.has(k), `${area.id} lists "${m}" twice after normalising`);
      seen.add(k);
    }
  }
  const bc = APPROVED["lower-mainland-bc"];
  const nv = bc.filter((j: { match: string }) => normalizeMunicipality(j.match) === "north vancouver");
  const lg = bc.filter((j: { match: string }) => normalizeMunicipality(j.match) === "langley");
  assert.equal(nv.length, 2, "North Vancouver should be two jurisdictions");
  assert.equal(lg.length, 2, "Langley should be two jurisdictions");
  const vanArea = SERVICE_AREAS.find((a) => a.id === "lower-mainland-bc")!;
  assert.equal(
    vanArea.municipalities.filter((m) => normalizeMunicipality(m) === "north vancouver").length, 1,
    "the UI must offer North Vancouver exactly once",
  );
});

test("the not-listed sentinel can never be a real city", () => {
  // where-you-work.tsx submits "__other__" when a helper's place is not
  // served. It must not normalise into something a boundary could match.
  const sentinel = normalizeMunicipality("__other__");
  for (const area of SERVICE_AREAS) {
    for (const m of area.municipalities) {
      assert.notEqual(normalizeMunicipality(m), sentinel);
    }
  }
});
