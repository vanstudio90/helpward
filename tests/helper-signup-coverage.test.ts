import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SERVICE_AREAS } from "../lib/service-areas.ts";

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("the city list comes from the dispatch source, not a hand-written list", () => {
  // If this ever hardcodes cities, the signup form can promise a place the
  // dispatch guard refuses — the exact asymmetry this feature fixes.
  const src = read("app/(auth)/signup/where-you-work.tsx");
  assert.match(src, /from "@\/lib\/service-areas"/);
  assert.ok(!/"Vancouver"|"Burnaby"|"San Diego"/.test(src.split("placeholder")[0]),
    "municipalities must be read, not literal");
});

test("every municipality a helper can pick is genuinely serviceable", () => {
  const all = SERVICE_AREAS.flatMap((a) => a.municipalities);
  assert.ok(all.includes("Surrey"), "a Surrey helper must see Surrey, not just 'Metro Vancouver'");
  assert.ok(all.includes("San Diego"));
  assert.ok(!all.includes("Victoria"));
  assert.ok(!all.includes("Chula Vista"), "San Diego is city limits only");
  // 16, not the 17 jurisdiction ids used for boundary coverage: the signup
  // list shows NAMES, and "North Vancouver" and "Langley" each cover two
  // jurisdictions (City + District / City + Township). A helper picks the
  // name they would say out loud; the polygons keep the pairs separate.
  assert.equal(all.length, 16);
});

test("the two markets are split by country so the list matches the signup country", () => {
  const ca = SERVICE_AREAS.filter((a) => a.country === "CA").flatMap((a) => a.municipalities);
  const us = SERVICE_AREAS.filter((a) => a.country === "US").flatMap((a) => a.municipalities);
  assert.ok(ca.includes("Burnaby") && !ca.includes("San Diego"));
  assert.ok(us.includes("San Diego") && !us.includes("Burnaby"));
});

test("the waitlist writes through the restricted function, never the table", () => {
  // helper_waitlist has RLS on with no policies and no grants; the RPC is
  // the only door. A direct .from("helper_waitlist") would simply fail.
  const action = read("app/(auth)/signup/waitlist-action.ts");
  assert.match(action, /rpc\("join_helper_waitlist"/);
  assert.ok(!/from\("helper_waitlist"\)/.test(action));
});

test("the waitlist function cannot be used as an address oracle", () => {
  const sql = read("supabase/migrations/0071_helper_waitlist.sql");
  assert.match(sql, /returns void/);
  assert.match(sql, /on conflict \(email, city, country\) do update/);
  assert.match(sql, /revoke all on helper_waitlist from anon, authenticated/);
});

test("mobile form controls are 16px so iOS cannot auto-zoom", () => {
  // Safari zooms any focused input under 16px and slides the page sideways.
  const css = read("app/globals.css");
  assert.match(css, /@media \(max-width: 640px\)[\s\S]*?font-size: 16px/);
});

test("pinch-zoom is NOT disabled", () => {
  // Blocking it is a WCAG 1.4.4 failure; the font size is the real fix.
  const layout = read("app/layout.tsx");
  assert.ok(!/maximumScale|userScalable|user-scalable|maximum-scale/.test(layout),
    "never disable zoom to stop the auto-zoom");
});

test("the cascade is country -> region -> city, all read from the same source", () => {
  const src = read("app/(auth)/signup/where-you-work.tsx");
  assert.match(src, /name="work_region"/);
  assert.match(src, /name="work_city"/);
  // The city list must be derived from the chosen region, never a flat list.
  assert.match(src, /area\.municipalities\.map/);
  assert.match(src, /SERVICE_AREAS\.filter\(\(a\) => a\.country === country\)/);
});

test("province/state wording follows the country", () => {
  const src = read("app/(auth)/signup/where-you-work.tsx");
  assert.match(src, /country === "CA" \? "Province" : "State"/);
});

test("every area exposes a full region name and a code", () => {
  // The cascade shows regions[0] ("British Columbia"), not the code.
  for (const a of SERVICE_AREAS) {
    assert.ok(a.regions.length >= 1, a.id);
    assert.ok(a.regions[0].length > 2, `${a.id} should lead with a full name, got ${a.regions[0]}`);
  }
});
