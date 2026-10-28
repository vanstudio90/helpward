import test from "node:test";
import assert from "node:assert/strict";
import { SERVICE_AREAS, normalizeMunicipality } from "../lib/service-areas.ts";
import { CITIES } from "../lib/marketing.ts";

/* The homepage headline personalises on the visitor's IP city. It must
 * personalise ONLY where a booking could actually be filled — the previous
 * version snapped any BC visitor to Vancouver, which greeted someone in
 * Prince George with "Get real human help in Vancouver". */

const AREA_TO_CITY: Record<string, string> = {
  "lower-mainland-bc": "vancouver",
  "san-diego-ca": "san-diego",
};

function match(city: string, region: string, country: string) {
  const t = city.toLowerCase().trim();
  for (const c of CITIES) if (c.name.toLowerCase() === t) return c.slug;
  const area = SERVICE_AREAS.find((a) =>
    a.country === country &&
    a.regions.some((r) => r.toLowerCase() === region.toLowerCase()) &&
    a.municipalities.some((m) => normalizeMunicipality(m) === normalizeMunicipality(t)));
  return area ? AREA_TO_CITY[area.id] ?? null : null;
}

test("a visitor in a launch city is personalised", () => {
  assert.equal(match("Vancouver", "BC", "CA"), "vancouver");
  assert.equal(match("San Diego", "CA", "US"), "san-diego");
});

test("a visitor elsewhere in the Lower Mainland is too — they can be served", () => {
  for (const m of ["Burnaby", "Surrey", "Richmond", "Coquitlam", "White Rock", "Delta"]) {
    assert.equal(match(m, "BC", "CA"), "vancouver", m);
  }
});

test("a visitor elsewhere in BC is NOT — no helper can reach them", () => {
  // The exact defect: province-wide snapping promised Vancouver to people
  // hundreds of kilometres outside any serviceable address.
  for (const m of ["Victoria", "Kelowna", "Prince George", "Nanaimo", "Whistler"]) {
    assert.equal(match(m, "BC", "CA"), null, m);
  }
});

test("a visitor elsewhere in California is NOT — San Diego is city limits only", () => {
  for (const m of ["Los Angeles", "Chula Vista", "San Francisco", "La Mesa", "Sacramento"]) {
    assert.equal(match(m, "CA", "US"), null, m);
  }
});

test("retired markets personalise nothing", () => {
  for (const [m, r, c] of [["Toronto","ON","CA"],["Seattle","WA","US"],["Austin","TX","US"],["Miami","FL","US"]]) {
    assert.equal(match(m, r, c), null, m);
  }
});

test("status words in a header city name still match", () => {
  // Mapbox and Vercel both sometimes ship "City of Langley".
  assert.equal(match("City of Langley", "BC", "CA"), "vancouver");
  assert.equal(match("District of North Vancouver", "BC", "CA"), "vancouver");
});

test("the right region is required — Delta BC is served, Delta Utah is not", () => {
  assert.equal(match("Delta", "BC", "CA"), "vancouver");
  assert.equal(match("Delta", "UT", "US"), null);
});
