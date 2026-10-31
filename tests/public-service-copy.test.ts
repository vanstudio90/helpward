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

const facts: PriceFacts = {
  baseCents: 2500,
  serviceFeeCents: 450,
  rule: {
    includedMinutes: 30,
    extraBlockMinutes: 15,
    extraBlockCents: 800,
    includedUnits: 1,
    perExtraUnitCents: 800,
    perExtraCrewCents: 10000,
  },
};

test("resolved answers carry real figures and no leftover tokens", () => {
  const faqs = servicePageFaqs("dog-walking", facts);
  assert.ok(faqs.length > 0);
  for (const { a } of faqs) {
    assert.ok(!a.includes("{"), `token survived: ${a}`);
  }
  assert.ok(faqs.some((f) => f.a.includes("$25")), "base price not substituted");
});

test("an answer whose figures are missing is dropped, not served with a token", () => {
  const faqs = servicePageFaqs("dog-walking", { ...facts, rule: null });
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
    const { points } = pricingExplanation({ baseCents: 2500, serviceFeeCents: 450, rule });
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
