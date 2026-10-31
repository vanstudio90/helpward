import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  SERVICE_PAGE_COPY,
  SERVICE_SCOPE,
  servicePageFaqs,
  type PriceFacts,
} from "../lib/public-service-pages.ts";
import {
  PUBLIC_SERVICE_COPY,
  RELATED_PROMPT,
  includedPoints,
  pricingExplanation,
} from "../lib/public-service-copy.ts";
import { CITY_COPY } from "../lib/public-city-copy.ts";
import { countryMoneyForService, bothCountries, oneCountry } from "../lib/country-price.ts";
import { SERVICE_PREP, servicePrep, prepHeading, HANDOVER_LINE } from "../lib/public-service-prep.ts";

/*
  Guards for the public marketing copy.

  The rate card has moved twice in a single day. A sentence that reads
  "$25 covers the first 30 minutes" is one that goes quietly wrong the
  moment a number changes in the database, and the page keeps serving it
  confidently until somebody notices. So the copy holds tokens and these
  tests hold the line.
*/

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !/^\s*\/\//.test(line))
    .join("\n");
}

test("the copy never prints a price", () => {
  for (const file of [
    "lib/public-service-pages.ts",
    "lib/public-service-copy.ts",
    "lib/public-city-copy.ts",
  ]) {
    const body = stripComments(readFileSync(file, "utf8"));
    const found = body.match(/\$\d/g);
    assert.equal(
      found,
      null,
      `${file} hard-codes a price (${found?.join(", ")}). Use a token resolved from the pricing rule.`,
    );
  }
});

test("every token in the copy is one the resolver fills", () => {
  const known = new Set([
    "base", "fee", "inclTime", "blockPrice", "blockTime", "unitPrice", "inclUnits", "crewPrice",
  ]);
  for (const [id, page] of Object.entries(SERVICE_PAGE_COPY)) {
    for (const { a } of page.faqs) {
      for (const match of a.matchAll(/\{(\w+)\}/g)) {
        assert.ok(known.has(match[1]), `${id} uses unknown token {${match[1]}}`);
      }
    }
  }
});

/* US and CA deliberately different: every launch service is. */
const amount = (a: { us: number; ca: number }) =>
  a.us === a.ca ? `$${(a.us / 100).toFixed(2)}` : `US$${(a.us / 100).toFixed(2)} · CA$${(a.ca / 100).toFixed(2)}`;

const facts: PriceFacts = {
  base: { us: 2500, ca: 3000 },
  block: { us: 800, ca: 900 },
  unit: { us: 800, ca: 900 },
  crew: { us: 10000, ca: 11000 },
  serviceFeeCents: 450,
  rule: { includedMinutes: 30, extraBlockMinutes: 15, includedUnits: 1 },
  amount,
};

test("resolved answers carry real figures and no leftover tokens", () => {
  const faqs = servicePageFaqs("dog-walking", facts);
  assert.ok(faqs.length > 0);
  for (const { a } of faqs) {
    assert.ok(!a.includes("{"), `token survived: ${a}`);
  }
  assert.ok(faqs.some((f) => f.a.includes("US$25.00")), "US base price not substituted");
  assert.ok(faqs.some((f) => f.a.includes("CA$30.00")), "CA base price not substituted");
});

test("an answer whose figures are missing is dropped, not served with a token", () => {
  const faqs = servicePageFaqs("dog-walking", { ...facts, rule: null, block: null, unit: null });
  for (const { a } of faqs) {
    assert.ok(!a.includes("{"), `token served with no rule behind it: ${a}`);
  }
  assert.ok(
    faqs.length < SERVICE_PAGE_COPY["dog-walking"].faqs.length,
    "answers needing a pricing rule should drop when there is none",
  );
});

test("every service has its own title, H1, opening and questions", () => {
  const titles = new Set<string>();
  const h1s = new Set<string>();
  const intros = new Set<string>();
  for (const [id, page] of Object.entries(SERVICE_PAGE_COPY)) {
    assert.ok(page.title.includes("Helpward"), `${id} title omits the brand`);
    assert.ok(page.faqs.length >= 5, `${id} has only ${page.faqs.length} questions`);
    assert.ok(!titles.has(page.title), `${id} shares a title`);
    assert.ok(!h1s.has(page.h1), `${id} shares an H1`);
    assert.ok(!intros.has(page.intro), `${id} shares its opening paragraph`);
    titles.add(page.title);
    h1s.add(page.h1);
    intros.add(page.intro);
  }
});

test("the opening paragraph names the catalogue product", () => {
  // The bridge from a searched phrase to the name in the app. Without it
  // a renamed page reads as a different product from the one you book.
  for (const [id, page] of Object.entries(SERVICE_PAGE_COPY)) {
    if (!PUBLIC_SERVICE_COPY[id]?.name) continue;
    assert.ok(
      /On Helpward/.test(page.intro),
      `${id} is publicly renamed but its opening never names the product`,
    );
  }
});

test("a call-delivered service is never promised tracking or an arrival", () => {
  const remote = includedPoints({ deliveredByCall: true }).join(" ");
  assert.ok(!/GPS|arrive|arrival|on the way/i.test(remote), remote);
  const inPerson = includedPoints({ deliveredByCall: false }).join(" ");
  assert.notEqual(remote, inPerson);
});

test("the included list states one payment model, once", () => {
  for (const deliveredByCall of [true, false]) {
    const points = includedPoints({ deliveredByCall });
    const payment = points.filter((p) => /charged|authorised|payment/i.test(p));
    assert.equal(payment.length, 1, `two payment lines: ${payment.join(" | ")}`);
    assert.equal(new Set(points).size, points.length, "a line is repeated");
  }
});

test("no pricing explanation claims distance changes the price", () => {
  for (const rule of [facts.rule, null]) {
    const { points } = pricingExplanation({
      base: facts.base, block: facts.block, unit: facts.unit, crew: facts.crew,
      serviceFeeCents: 450, rule, amount,
    });
    const text = points.join(" ");
    assert.ok(/Distance does not change the price/.test(text), text);
    assert.ok(!/depends on distance/.test(text), text);
  }
});

test("each city says something only true of that city", () => {
  const entries = Object.entries(CITY_COPY);
  assert.ok(entries.length >= 2);
  for (const [slug, copy] of entries) {
    for (const [other, otherCopy] of entries) {
      if (other === slug) continue;
      assert.notEqual(copy.coverage, otherCopy.coverage, `${slug} and ${other} share coverage`);
      assert.notEqual(copy.travelNote, otherCopy.travelNote, `${slug} and ${other} share a travel note`);
    }
  }
});

test("the places listed as not covered are never also claimed as covered", () => {
  for (const [slug, copy] of Object.entries(CITY_COPY)) {
    for (const place of copy.notCovered) {
      assert.ok(
        !copy.coverage.includes(place),
        `${slug} lists ${place} as both covered and not covered`,
      );
    }
  }
});

test("every service states what it does NOT cover", () => {
  for (const id of Object.keys(SERVICE_PAGE_COPY)) {
    const scope = SERVICE_SCOPE[id];
    assert.ok(scope, `${id} has no scope block`);
    assert.ok(scope.includes.length >= 2, `${id} lists too little as included`);
    assert.ok(scope.excludes.length >= 2, `${id} does not say what is excluded`);
  }
});

test("exclusions are relevant to the service that lists them", () => {
  /*
    Uniqueness is NOT the bar, and an earlier version of this test made
    it one. Several services legitimately share a restriction — nothing
    illegal or hazardous applies to a courier run and an errand alike,
    and forcing each page to word it differently would buy nothing but
    awkward prose.

    What matters is that an exclusion belongs on the page it appears on.
    So: each service must rule out something specific to itself, rather
    than filling the list with boilerplate that would read the same
    anywhere.
  */
  const shared = new Map<string, number>();
  for (const scope of Object.values(SERVICE_SCOPE)) {
    for (const line of scope.excludes) shared.set(line, (shared.get(line) ?? 0) + 1);
  }
  for (const [id, scope] of Object.entries(SERVICE_SCOPE)) {
    const ownToThisService = scope.excludes.filter((line) => shared.get(line) === 1);
    assert.ok(
      ownToThisService.length >= 1,
      `${id} rules out nothing specific to itself — every exclusion it lists also appears elsewhere`,
    );
  }
});

test("an exclusion explains itself rather than just saying no", () => {
  // "No insurance on the contents — there is none" tells a customer
  // something. A bare "Not available" does not.
  for (const [id, scope] of Object.entries(SERVICE_SCOPE)) {
    for (const line of scope.excludes) {
      assert.ok(
        line.split(/\s+/).length >= 3,
        `${id} has an exclusion too terse to be useful: "${line}"`,
      );
    }
  }
});

test("the services most often confused say so in their exclusions", () => {
  // The misdirected-customer cases the audit named: a mortgage
  // inspection, a complete appliance repair, a shop instead of a
  // collection, a taxi instead of an own-car driver.
  const required: Record<string, RegExp> = {
    "property-inspection": /licensed|mortgage/i,
    "appliance-repair": /repair itself|quoted separately/i,
    "grocery-pickup": /Errand Runner/,
    "designated-driver": /taxi/i,
    "moving-help": /vehicle|labour only/i,
    "shopping-companion": /Errand Runner/,
  };
  for (const [id, pattern] of Object.entries(required)) {
    const text = SERVICE_SCOPE[id].excludes.join(" ");
    assert.match(text, pattern, `${id} does not rule out the thing it is confused with`);
  }
});

test("every service a page can link to has a reason to follow the link", () => {
  for (const [id, copy] of Object.entries(PUBLIC_SERVICE_COPY)) {
    for (const target of copy.related ?? []) {
      assert.ok(RELATED_PROMPT[target], `${id} links to ${target} with no reason given`);
    }
  }
});

test("every service tells the customer what to prepare", () => {
  for (const id of Object.keys(SERVICE_PAGE_COPY)) {
    const items = servicePrep(id);
    assert.ok(items, `${id} has no preparation guidance`);
    assert.ok(items!.length >= 3, `${id} lists only ${items!.length} things to prepare`);
    for (const item of items!) {
      assert.ok(item.split(/\s+/).length >= 5, `${id} has a preparation line too terse to act on: "${item}"`);
    }
  }
});

test("preparation guidance never contains a private detail", () => {
  /*
    The lists say WHAT to prepare. The thing itself — a gate code, an
    alarm code, a key location — belongs in the handover instructions on
    a booking, which only the booked helper can read. A real value
    appearing here would be published on a static public page and sent
    to every helper an open request reaches.
  */
  const looksPrivate = [
    /\b\d{4,}\b/,                      // a bare numeric code
    /\bcode is\b/i,
    /\bpassword is\b/i,
    /\bkey is (?:under|in|behind)\b/i,
    /\bunit \d/i,
    /@[a-z0-9.-]+\.[a-z]{2,}/i,         // an email address
    /\+?\d[\d\s().-]{7,}\d/,          // a phone number
  ];
  for (const [id, prep] of Object.entries(SERVICE_PREP)) {
    for (const item of prep.items) {
      for (const pattern of looksPrivate) {
        assert.ok(
          !pattern.test(item),
          `${id} preparation line looks like it contains a private detail: "${item}"`,
        );
      }
    }
  }
  assert.ok(!/\d{4,}/.test(HANDOVER_LINE));
});

test("an audio service is never told to prepare for an arrival", () => {
  assert.equal(prepHeading(true), "Before your session");
  assert.equal(prepHeading(false), "Before your helper arrives");
  for (const id of ["listening-service", "sleep-call-companion"]) {
    const text = servicePrep(id)!.join(" ");
    assert.ok(
      !/\barriv|\bdoor\b|\bparking\b|\bkeys?\b/i.test(text),
      `${id} preparation mentions a physical arrival: ${text}`,
    );
    assert.match(text, /microphone/i, `${id} should mention microphone permission`);
  }
});

test("the 'same figure in both currencies' claim can never come back", () => {
  /*
    It was published, and it was false for every launch service: the
    Canadian price differs on the base, the time block, the per-unit and
    the per-crew amount. A page that says the figure is the same in both
    currencies under-quotes a Canadian by 10-25%.

    This guards the WORDING across every module that writes public copy,
    because the sentence is what reached the page, not the arithmetic.
  */
  const banned = [
    /same figure in (?:both|CAD|USD)/i,
    /same number in both/i,
    /same (?:amount|price) in both currencies/i,
    /charged the same figure/i,
  ];
  const files = [
    "lib/public-service-copy.ts",
    "lib/public-service-pages.ts",
    "lib/public-service-prep.ts",
    "lib/public-city-copy.ts",
    "lib/country-price.ts",
    "app/pricing/page.tsx",
    "app/services/[slug]/page.tsx",
    "app/cities/[city]/[service]/page.tsx",
    "app/our-services/page.tsx",
  ];
  for (const file of files) {
    const body = stripComments(readFileSync(file, "utf8"));
    for (const pattern of banned) {
      assert.ok(
        !pattern.test(body),
        `${file} claims the price is the same in both currencies. It is not — see service_country_pricing.`,
      );
    }
  }
});

test("every money component is localised, not just the base", () => {
  /*
    price_service_cents coalesces base, extra_block, per_extra_unit and
    per_extra_crew SEPARATELY against the country row. A page that
    localises the base and leaves the block at the catalogue value shows
    a Canadian a US block price, which is the same bug one level down.
  */
  const overrides = [
    { country: "US" as const, base_price_cents: 3500, extra_block_cents: 875,
      per_extra_unit_cents: 300, per_extra_crew_cents: 10000 },
    { country: "CA" as const, base_price_cents: 4000, extra_block_cents: 1000,
      per_extra_unit_cents: 400, per_extra_crew_cents: 11000 },
  ];
  const money = countryMoneyForService(3500, overrides, {
    extraBlockCents: 875, perExtraUnitCents: 300, perExtraCrewCents: 10000,
  });
  assert.deepEqual(money.base, { us: 3500, ca: 4000 });
  assert.deepEqual(money.block, { us: 875, ca: 1000 }, "block price not localised");
  assert.deepEqual(money.unit, { us: 300, ca: 400 }, "per-unit price not localised");
  assert.deepEqual(money.crew, { us: 10000, ca: 11000 }, "per-crew price not localised");

  // A country row with a null field falls back to the rule, exactly as
  // the database's coalesce does.
  const partial = countryMoneyForService(3500, [
    { country: "US" as const, base_price_cents: 3500, extra_block_cents: null },
    { country: "CA" as const, base_price_cents: 4000, extra_block_cents: null },
  ], { extraBlockCents: 875, perExtraUnitCents: null, perExtraCrewCents: null });
  assert.deepEqual(partial.block, { us: 875, ca: 875 }, "null override should fall back to the rule");
});

test("a static page prints both figures and a city page prints one", () => {
  const differs = { us: 3500, ca: 4000 };
  const same = { us: 450, ca: 450 };
  const fmt = (c: number, cur: string) => `${cur === "CAD" ? "CA$" : "US$"}${(c / 100).toFixed(2)}`;

  const both = bothCountries(fmt);
  assert.equal(both(differs), "US$35.00 · CA$40.00");
  assert.equal(both(same), "$4.50", "an amount that genuinely matches should print once");

  assert.equal(oneCountry(fmt, "CA")(differs), "CA$40.00");
  assert.equal(oneCountry(fmt, "US")(differs), "US$35.00");
});
