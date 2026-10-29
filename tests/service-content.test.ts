import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { SERVICE_COPY, UNIVERSAL_FAQS, serviceCopy } from "../lib/service-copy.ts";

/* Measured before this content existed: two DIFFERENT service pages were
 * 78% identical word for word, and the same service in two cities 87%.
 * Both templates carried one generic "What's included" block, so 78 public
 * pages said nearly the same thing.
 */

const servicePage = readFileSync("app/services/[slug]/page.tsx", "utf8");
const cityServicePage = readFileSync("app/cities/[city]/[service]/page.tsx", "utf8");

test("every service's copy is actually about that service", () => {
  const ids = Object.keys(SERVICE_COPY);
  assert.ok(ids.length >= 26, `only ${ids.length} services have copy`);

  // No two services may share a brief, an includes list or an excludes
  // list — that is the duplication this file exists to end.
  for (const field of ["brief", "includes", "excludes"] as const) {
    const seen = new Map<string, string>();
    for (const id of ids) {
      const key = JSON.stringify(SERVICE_COPY[id][field]);
      const prior = seen.get(key);
      assert.equal(prior, undefined, `${id} and ${prior} share the same ${field}`);
      seen.set(key, id);
    }
  }
});

test("every service says what it does NOT cover", () => {
  // The half that prevents a wasted booking: most bad bookings come from an
  // assumption nobody contradicted.
  for (const [id, c] of Object.entries(SERVICE_COPY)) {
    assert.ok(c.excludes.length >= 2, `${id} lists fewer than two exclusions`);
    assert.ok(c.includes.length >= 2, `${id} lists fewer than two inclusions`);
    assert.ok(c.brief.length > 150, `${id}'s brief is too thin to be useful`);
    assert.ok(c.faqs.length >= 3, `${id} has fewer than three specific FAQs`);
  }
});

test("the copy never prints a price", () => {
  // Prices render from the live country rate. A number typed into copy is a
  // number that goes stale the first time the rate card moves — and it
  // moved twice today.
  const text = JSON.stringify(SERVICE_COPY);
  assert.doesNotMatch(text, /\$\s?\d/, "a price is hard-coded in the editorial copy");
  assert.doesNotMatch(text, /US\$|CA\$/);
});

test("the copy makes no promise the platform cannot keep", () => {
  const text = JSON.stringify(SERVICE_COPY) + JSON.stringify(UNIVERSAL_FAQS);
  // There are zero completed bookings, so there is no average response
  // time, no "typically faster", and no guarantee anyone will accept.
  assert.doesNotMatch(text, /average (response|match)/i);
  assert.doesNotMatch(text, /minutes? (away|response)/i);
  assert.doesNotMatch(text, /guarantee[ds]? (to|that|a helper)/i);
  assert.doesNotMatch(text, /\b24\/7\b/);
});

test("both templates render the service-specific copy", () => {
  for (const [src, label] of [[servicePage, "service page"],
                              [cityServicePage, "city-service page"]] as const) {
    assert.match(src, /serviceCopy\(service\.id\)/, `${label} does not load the copy`);
    assert.match(src, /copy\.includes\.map/, `${label} does not render inclusions`);
    assert.match(src, /copy\.excludes\.map/, `${label} does not render exclusions`);
    assert.match(src, /\.\.\.\(copy\?\.faqs \?\? \[\]\)/, `${label} drops the specific FAQs`);
  }
});

/** Source minus comments — the comments here quote the removed claims in
 *  order to explain why they went. */
function codeOnly(src: string): string {
  return src.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");
}

test("the invented claims are gone from both templates", () => {
  for (const [src, label] of [[servicePage, "service page"],
                              [cityServicePage, "city-service page"]] as const) {
    const code = codeOnly(src);
    assert.doesNotMatch(code, /around 18 minutes/, `${label} still claims a response time`);
    assert.doesNotMatch(code, /2m 14s/, `${label} still claims a matching time`);
    assert.doesNotMatch(code, /typically match faster/, `${label} still compares cities with no data`);
    assert.doesNotMatch(code, /Average match/, `${label} still asserts an average`);
    // Control: stripping must not empty the file.
    assert.ok(code.includes("export default"), "comment stripping removed real code");
  }
});

test("the city page prices in its own currency", () => {
  // It read service.base_price_cents and labelled it "(CAD)" on the
  // Vancouver pages: the US number with a Canadian label.
  assert.match(cityServicePage, /displayBaseCents\(/);
  assert.match(cityServicePage, /city\.country === "CA" \? "CAD" : "USD"/);
  assert.doesNotMatch(cityServicePage, /baseDollars\.toFixed\(0\)\} \(\$\{city\.country/);
});

test("the public services directory exists and is linked", () => {
  assert.ok(existsSync("app/our-services/page.tsx"), "/our-services is still missing");
  const shell = readFileSync("components/MarketingShell.tsx", "utf8");
  assert.match(shell, /href="\/our-services"/, "no public page links to the directory");
  assert.match(shell, /href="\/cities"/);
  const sitemap = readFileSync("app/sitemap.ts", "utf8");
  assert.match(sitemap, /our-services/, "the directory is not in the sitemap");
});

test("an unknown service degrades rather than throwing", () => {
  assert.equal(serviceCopy("does-not-exist"), null);
});

/* ------------------------------------------------------------ city pages */

test("each city says something only true of that city", async () => {
  const { CITY_LOCAL } = await import("../lib/service-copy.ts");
  const slugs = Object.keys(CITY_LOCAL);
  assert.ok(slugs.length >= 2);

  // Adding the same per-service copy to both city pages made them MORE
  // alike — 92% identical, against 87% before. The fix has to be facts
  // that apply to one city and not the other, so nothing here may be
  // shared between them.
  for (const field of ["intro", "boundary", "places", "commonlyOutside"] as const) {
    const seen = new Map<string, string>();
    for (const slug of slugs) {
      const key = JSON.stringify(CITY_LOCAL[slug][field]);
      const prior = seen.get(key);
      assert.equal(prior, undefined, `${slug} and ${prior} share the same ${field}`);
      seen.set(key, slug);
    }
  }

  // And it must be substantial enough to differentiate a 900-word page.
  for (const [slug, l] of Object.entries(CITY_LOCAL)) {
    assert.ok(l.places.length >= 10, `${slug} names too few places to be useful`);
    assert.ok(l.commonlyOutside.length >= 3, `${slug} does not say what is outside`);
    assert.ok((l.intro + l.boundary).length > 400, `${slug}'s local copy is too thin`);
  }
});

test("the Lower Mainland list matches the areas actually served", async () => {
  const { CITY_LOCAL } = await import("../lib/service-copy.ts");
  const { SERVICE_AREAS, normalizeMunicipality } = await import("../lib/service-areas.ts");
  const area = SERVICE_AREAS.find((a) => a.id === "lower-mainland-bc")!;
  const listed = new Set(CITY_LOCAL.vancouver.places.map(normalizeMunicipality));
  for (const m of area.municipalities) {
    assert.ok(listed.has(normalizeMunicipality(m)),
      `the Vancouver page does not name ${m}, which is in the service area`);
  }
});

test("the city page renders its local content", () => {
  assert.match(cityServicePage, /cityLocal\(city\.slug\)/);
  assert.match(cityServicePage, /local\.places\.map/);
  assert.match(cityServicePage, /local\.commonlyOutside\.map/);
});
