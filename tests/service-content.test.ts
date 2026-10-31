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
  /* PORTED from the lib/service-copy.ts layer this replaced. The
     protection is unchanged: neither template may fall back to a generic
     block instead of the service's own scope and questions. */
  assert.match(servicePage, /SERVICE_SCOPE\[service\.id\]/, "service page does not load the scope");
  assert.match(servicePage, /scope\.includes\.map/, "service page does not render inclusions");
  assert.match(servicePage, /scope\.excludes\.map/, "service page does not render exclusions");
  assert.match(servicePage, /servicePageFaqs\(service\.id/, "service page drops the specific FAQs");
  assert.match(cityServicePage, /SERVICE_SCOPE\[service\.id\]/, "city page does not load the scope");
  assert.match(cityServicePage, /scope\.excludes\.map/, "city page does not render exclusions");
});

/** Source minus comments — the comments here quote the removed claims in
 *  order to explain why they went. */
function codeOnly(src: string): string {
  return src.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");
}

test("no unverified platform claim is repeated across a template", () => {
  /* PORTED. The original pinned two specific claims to one occurrence
     each. Those strings are gone — the eta sentence now quotes the
     catalogue's own label instead of asserting an average — so this
     guards the rule rather than the wording: a marketing claim stated
     more than once in a template is a claim that gets updated in one
     place and not the other. */
  const claims = [/around 18 minutes/g, /Average match in 2m 14s/g, /Helpers available now/g];
  for (const [src, label] of [[servicePage, "service page"],
                              [cityServicePage, "city-service page"]] as const) {
    const code = codeOnly(src);
    for (const claim of claims) {
      const n = (code.match(claim) ?? []).length;
      assert.ok(n <= 1, `${label} repeats ${claim} ${n} times`);
    }
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
  /* PORTED to lib/public-city-copy.ts. A city page must say something
     only true of that city, not just swap the name in. */
  assert.match(cityServicePage, /cityCopy\(city\.slug\)/);
  assert.match(cityServicePage, /local\.coverage/);
  assert.match(cityServicePage, /local\.notCovered/);
});

test("the city page's structured data quotes the same price as its own copy", () => {
  /* PORTED. Vancouver published CAD with the US figure in its Service
     markup while the copy beneath said something else. ONE localised
     definition must feed both. */
  const code = codeOnly(cityServicePage);
  assert.equal((code.match(/displayBaseCents\(/g) ?? []).length >= 1, true,
    "city page does not localise its base price");
  assert.match(code, /price: baseDollars\.toFixed\(2\)/,
    "markup must quote the same localised figure the copy uses");
  assert.match(code, /priceCurrency: currency/);
});

test("professional-cuddler is not published anywhere public", () => {
  // Deliberately inactive by owner decision, reaffirmed 2026-10-29: do not
  // create a page for it. The SEO audit recommended publishing one; that
  // recommendation is declined, and this test is here so a later catalogue
  // edit cannot quietly reverse the decision.
  //
  // listServicesPublic() filters on active, so the page, the sitemap and
  // the directory all follow from the row being inactive — the thing worth
  // guarding is that no file names it as content.
  const copySrc = readFileSync("lib/service-copy.ts", "utf8");
  assert.ok(!copySrc.includes("professional-cuddler"),
    "editorial copy exists for a service that must not be published");

  for (const f of ["app/our-services/page.tsx", "app/sitemap.ts"]) {
    assert.ok(!readFileSync(f, "utf8").includes("professional-cuddler"),
      `${f} names a service that must not be published`);
  }
});

test("every public page offers a way to contact a person", () => {
  // The service pages and both city templates ended with no footer at all,
  // so 78 public pages had no contact address, no route back to the
  // directories and no legal links. support@helpward.com was printed on
  // Stripe receipts and both legal pages and nowhere a visitor would look.
  const footer = readFileSync("components/SiteFooter.tsx", "utf8");
  assert.match(footer, /mailto:support@helpward\.com/);
  for (const f of ["app/services/[slug]/page.tsx",
                   "app/cities/[city]/page.tsx",
                   "app/cities/[city]/[service]/page.tsx"]) {
    assert.match(readFileSync(f, "utf8"), /<SiteFooter \/>/, `${f} has no footer`);
  }
  // And the two shells that already had footers carry it too.
  assert.match(readFileSync("components/MarketingShell.tsx", "utf8"), /support@helpward\.com/);
  assert.match(readFileSync("app/page.tsx", "utf8"), /support@helpward\.com/);
});

/* --------------------------------------------- problem-led positioning */

test("every service leads with the problem, not the product name", async () => {
  const { SERVICE_COPY } = await import("../lib/service-copy.ts");
  for (const [id, c] of Object.entries(SERVICE_COPY)) {
    assert.ok(c.title.length > 15, `${id} has no real title`);
    assert.ok(c.headline.length > 15, `${id} has no headline`);
    // A headline that is just the catalogue name defeats the point.
    assert.notEqual(c.headline.toLowerCase(), id.replace(/-/g, " "),
      `${id}'s headline is just its own name`);
    assert.ok(c.situations.length >= 3, `${id} describes fewer than three situations`);
  }
});

test("no two services share a headline or a situation list", async () => {
  const { SERVICE_COPY } = await import("../lib/service-copy.ts");
  for (const field of ["title", "headline", "situations"] as const) {
    const seen = new Map<string, string>();
    for (const [id, c] of Object.entries(SERVICE_COPY)) {
      const key = JSON.stringify(c[field]);
      assert.equal(seen.get(key), undefined, `${id} and ${seen.get(key)} share a ${field}`);
      seen.set(key, id);
    }
  }
});

test("overlapping services point at each other", async () => {
  const { SERVICE_COPY } = await import("../lib/service-copy.ts");
  // The groups the plan names as competing. Each must disambiguate, or the
  // pages quietly fight over the same reader.
  for (const group of [
    ["rent-a-friend", "date-companion", "event-companion"],
    ["event-companion", "wedding-guest", "family-standin"],
    ["grocery-pickup", "errand-runner", "package-delivery"],
    ["house-check-in", "property-inspection"],
    ["listening-service", "sleep-call-companion"],
  ]) {
    for (const id of group) {
      const alts = SERVICE_COPY[id]?.chooseBetween ?? [];
      assert.ok(alts.length > 0, `${id} does not say which neighbouring service to use instead`);
      // And every alternative must be a service that exists.
      for (const a of alts) {
        assert.ok(SERVICE_COPY[a.slug], `${id} points at "${a.slug}", which has no copy`);
      }
    }
  }
});

test("the page renders the problem-led title and opening", () => {
  /* PORTED to lib/public-service-pages.ts: the page must lead with the
     service's own title, H1 and opening, not the catalogue row. */
  const page = readFileSync("app/services/[slug]/page.tsx", "utf8");
  assert.match(page, /page\?\.title \?\?/, "title does not come from the page copy");
  assert.match(page, /page\?\.h1 \?\? service\.title/, "H1 does not come from the page copy");
  assert.match(page, /page\?\.intro \?\? description/, "opening does not come from the page copy");
});

test("each page renders exactly one footer", () => {
  /* Four footers shipped on all 78 service and city pages.
   *
   * SiteFooter was inserted by a regex that matched the LAST
   * `</div>…);}` in each file — which was the `Trust` helper at the
   * bottom, not the page component. Trust renders four times, so the
   * footer did too, repeating the whole boilerplate block through the
   * middle of the content.
   *
   * My own check missed it because `grep -c` counts matching LINES and
   * the HTML is minified: four footers on one line counted as one. Count
   * occurrences, never lines. */
  for (const f of ["app/services/[slug]/page.tsx",
                   "app/cities/[city]/page.tsx",
                   "app/cities/[city]/[service]/page.tsx"]) {
    const src = readFileSync(f, "utf8");
    const uses = (src.match(/<SiteFooter \/>/g) ?? []).length;
    assert.equal(uses, 1, `${f} renders SiteFooter ${uses} times`);

    // And it must sit in the page component, not in a helper below it.
    const atFooter = src.indexOf("<SiteFooter />");
    const atHelper = src.search(/\nfunction \w+\(/);
    assert.ok(atHelper === -1 || atFooter < atHelper,
      `${f} renders the footer inside a helper component, which repeats it`);
  }
});

test("a service definition never contradicts the scope beside it", async () => {
  /* services.blurb is the most reused string on the site: the catalogue
   * card, the meta description, the opening answer and the schema.org
   * Service description all read it. Six promised something the detailed
   * scope on the same page then withdrew — "we shop your list at any
   * store" for a prepaid-pickup service, "certified technician… most
   * fixed same day" for a diagnosis visit, video for two audio-only
   * services. Each produced a specific bad booking. */
  const mig = readFileSync("supabase/migrations/0080_service_definitions.sql", "utf8");
  // The guard lives in the migration so a future catalogue edit fails loudly.
  assert.match(mig, /qualification claim/);
  assert.match(mig, /timing promise/);
  assert.match(mig, /offers video/);
  assert.match(mig, /raise exception 'service definitions still contradict/);
});

test("coverage is described accurately on every service page", () => {
  /* PORTED, and this has now been wrong twice: first "the two California
     areas" (one of them is in British Columbia), then "Both areas cover
     city limits only" (true of San Diego, false of the Lower Mainland).
     One sentence, written once, naming both realities. */
  const page = readFileSync("app/services/[slug]/page.tsx", "utf8");
  assert.doesNotMatch(page, /two California areas/);
  assert.doesNotMatch(page, /Both areas cover city limits only/);
  assert.match(page, /coverageNote\(\)/, "page does not use the one shared coverage sentence");
});

test("remote services do not promise someone will arrive", () => {
  /* PORTED. An audio call has nobody travelling, so no arrival question.
     The set is no longer hardcoded: delivered_by_call is read from the
     database, which is better — it stays true when a service changes. */
  const city = readFileSync("app/cities/[city]/[service]/page.tsx", "utf8");
  assert.match(city, /listCallDeliveredServiceIds\(\)/,
    "the call-delivered set must come from the database");
  assert.match(city, /deliveredByCall/);
  assert.match(city, /How soon will a helper call/);
});
