import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { priceTask, SERVICE_FEE_CENTS } from "../lib/pricing.ts";
import { displayBaseCents } from "../lib/country-price.ts";

const forms = readFileSync("app/(helper)/helper/profile/forms.tsx", "utf8");
const actions = readFileSync("app/(helper)/helper/profile/actions.ts", "utf8");
const page = readFileSync("app/(helper)/helper/profile/page.tsx", "utf8");

/* A control that silently does nothing is worse than no control.
 *
 * "Your price (optional)" wrote provider_services.custom_price_cents, and
 * NOTHING reads it: price_service_cents prices from the catalogue, the
 * pricing rule and the country override, and accept_request uses the same
 * function. A helper could set a rate, watch it save, and be paid the
 * platform rate regardless.
 */

/** Source with comments stripped — the comments here deliberately quote
 *  the removed label and column to explain why they went. */
function codeOnly(src: string): string {
  return src.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");
}

test("the dead price field is gone from the form and the action", () => {
  const formCode = codeOnly(forms);
  assert.doesNotMatch(formCode, /Your price \(optional\)/);
  assert.doesNotMatch(formCode, /setCustomDollars|customDollars/);
  for (const [src, label] of [[forms, "forms"], [actions, "actions"]] as const) {
    assert.doesNotMatch(codeOnly(src), /custom_price_cents/,
      `${label} still writes the unused column`);
  }
  // Control: the stripper must not simply empty the file, or every
  // assertion above passes for the wrong reason.
  assert.ok(formCode.includes("setProviderServicesAction"), "comment stripping removed real code");
});

test("the card shows earnings, not a bare base price", () => {
  assert.doesNotMatch(forms, /Base \$\{/);
  assert.doesNotMatch(forms, /basePriceCents/);
  assert.match(forms, /You earn \{formatMoney\(s\.helperEarnsCents, currency\)\}/);
  assert.match(forms, /Customer pays \{formatMoney\(s\.customerPaysCents, currency\)\}/);
});

test("the figures come from the country rule, not the legacy base", () => {
  // services.base_price_cents is the single legacy number that made this
  // card say "Base $15" for a job billed at CA$40.
  assert.match(page, /displayBaseCents\(/);
  assert.match(page, /payCountry/);
  assert.match(page, /priceTask\(subtotal\)\.helperPayoutCents/);
});

test("the market follows the cities the helper actually chose", () => {
  // profiles.country is set from a signup field and never corrected;
  // someone working the Lower Mainland is paid in CAD whatever it says.
  assert.match(page, /workArea\?\.country \?\? \(profile\?\.country === "CA"/);
});

test("the arithmetic the card displays is the arithmetic that is charged", () => {
  // Wait in Line, the one service with country rows today.
  const overrides = [
    { country: "US" as const, base_price_cents: 3500, extra_block_cents: 1750 },
    { country: "CA" as const, base_price_cents: 4000, extra_block_cents: 2000 },
  ];
  const us = displayBaseCents(1500, overrides, "US");
  const ca = displayBaseCents(1500, overrides, "CA");
  assert.equal(us, 3500);
  assert.equal(ca, 4000);

  // The proposal's stated figures: US$35 subtotal -> helper US$28,
  // customer US$39.50.
  assert.equal(priceTask(us).helperPayoutCents, 2800);
  assert.equal(priceTask(us).totalCents, 3950);
  // CA$40 -> helper CA$32, customer CA$44.50.
  assert.equal(priceTask(ca).helperPayoutCents, 3200);
  assert.equal(priceTask(ca).totalCents, 4450);
  assert.equal(SERVICE_FEE_CENTS, 450);
});

test("the split is explained once, in the helper's own currency", () => {
  assert.match(forms, /You earn 80% of the service price, and\s*\n?\s*all of any tip/);
  assert.match(forms, /Canadian dollars" : "US dollars/);
  // And must not be sold as an hourly wage.
  assert.match(forms, /not an hourly rate across travel or/);
});

/* ------------------------------------------------- display/charge parity */

test("the whole rule is localised, not just the base and the time block", async () => {
  const { localizeRule } = await import("../lib/country-price.ts");
  const rule = {
    extraBlockCents: 900, perExtraUnitCents: 800, perExtraCrewCents: 3500,
  };
  const overrides = [
    { country: "US" as const, base_price_cents: 2500, extra_block_cents: 800,
      per_extra_unit_cents: 800, per_extra_crew_cents: null },
    { country: "CA" as const, base_price_cents: 2700, extra_block_cents: 800,
      per_extra_unit_cents: 1000, per_extra_crew_cents: null },
  ];
  // The bug this prevents: showing CA$27 + 2 x US$8 = CA$43 for a job the
  // database bills at CA$27 + 2 x CA$10 = CA$47.
  assert.equal(localizeRule(rule, overrides, "CA")!.perExtraUnitCents, 1000);
  assert.equal(localizeRule(rule, overrides, "US")!.perExtraUnitCents, 800);
  // A null override keeps the service's own figure rather than blanking it.
  assert.equal(localizeRule(rule, overrides, "CA")!.perExtraCrewCents, 3500);
  // No country, no overrides: unchanged.
  assert.equal(localizeRule(rule, overrides, null), rule);
  assert.equal(localizeRule(rule, [], "CA"), rule);
  assert.equal(localizeRule(null, overrides, "CA"), null);
});

test("the booking summary localises through that one helper", () => {
  const view = readFileSync("app/(app)/new-request/view.tsx", "utf8");
  assert.match(view, /localizeRule\(/);
  // Field-at-a-time localisation is what let per-dog money drift.
  assert.doesNotMatch(view, /displayExtraBlockCents/);
});
