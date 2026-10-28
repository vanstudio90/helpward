import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkVenue, type VenueRecord } from "../lib/venue-gate.ts";
import { sealIntakeCountry, displayBaseCents, COUNTRY_KEY } from "../lib/country-price.ts";
import { SERVICE_INTAKE } from "../lib/service-intake.ts";

const venue = (over: Partial<VenueRecord> = {}): VenueRecord => ({
  name: "Test Diner",
  substitutesAllowed: "unknown",
  customerMayReplace: "unknown",
  fullPartyRequired: "unknown",
  numbersTransferable: "unknown",
  earlyTurnPolicy: null,
  confirmedAt: null,
  ...over,
});

/* ---------------------------------------------------------------- venue */

test("a venue we confirmed refuses stand-ins blocks the booking", () => {
  const v = checkVenue(venue({ substitutesAllowed: "refused" }), "swap");
  assert.equal(v.allow, false);
  assert.match((v as { reason: string }).reason, /doesn't allow anyone to queue/);
});

test("an unlisted venue proceeds, and says it is unverified", () => {
  // Treating unknown as refused would block every venue in both cities.
  const v = checkVenue(null, "swap");
  assert.equal(v.allow, true);
  assert.equal((v as { level: string }).level, "unverified");
  assert.match((v as { notice: string }).notice, /haven't confirmed/);
  // And it must say the customer is not charged if the venue turns them away.
  assert.match((v as { notice: string }).notice, /won't be charged/);
});

test("a venue that allows waiting but not handover blocks only the swap", () => {
  const v = venue({ substitutesAllowed: "allowed", customerMayReplace: "refused", confirmedAt: "2026-10-28" });
  assert.equal(checkVenue(v, "swap").allow, false);
  assert.equal(checkVenue(v, "collect").allow, true);
});

test("a confirmed venue surfaces the caveats that still apply", () => {
  const v = checkVenue(venue({
    substitutesAllowed: "allowed", fullPartyRequired: "allowed",
    numbersTransferable: "refused", confirmedAt: "2026-10-28",
  }), "swap");
  assert.equal(v.allow, true);
  assert.equal((v as { level: string }).level, "confirmed");
  const n = (v as { notice: string }).notice;
  assert.match(n, /everyone in your party/);
  assert.match(n, /can't be transferred/);
});

/* -------------------------------------------------------------- country */

test("the country is written by the server and overwrites the client's", () => {
  const posted = { expected_wait: "60", [COUNTRY_KEY]: "US" };
  const sealed = sealIntakeCountry(posted, "CA");
  assert.equal(sealed[COUNTRY_KEY], "CA", "a posted country must never survive");
});

test("an unknown country leaves no country at all, not a stale one", () => {
  // Otherwise a client-supplied value would stand whenever the area did
  // not resolve, which is exactly when it is least trustworthy.
  const sealed = sealIntakeCountry({ [COUNTRY_KEY]: "US" }, undefined);
  assert.equal(COUNTRY_KEY in sealed, false);
});

test("display pricing falls back the same way the database does", () => {
  const overrides = [
    { country: "US" as const, base_price_cents: 3500, extra_block_cents: 1750 },
    { country: "CA" as const, base_price_cents: 4000, extra_block_cents: 2000 },
  ];
  assert.equal(displayBaseCents(1500, overrides, "US"), 3500);
  assert.equal(displayBaseCents(1500, overrides, "CA"), 4000);
  // No country, no overrides, or an unpriced country: the single price.
  assert.equal(displayBaseCents(1500, overrides, null), 1500);
  assert.equal(displayBaseCents(1500, undefined, "US"), 1500);
  assert.equal(displayBaseCents(1500, [], "CA"), 1500);
});

/* --------------------------------------------------------------- intake */

test("the brief asks what decides whether the job can work", () => {
  const spec = SERVICE_INTAKE["wait-in-line"];
  const keys = new Set(spec.fields.map((f) => f.key));
  for (const k of ["venue_name", "which_queue", "venue_permission",
                   "notice_needed", "party_size", "early_turn"]) {
    assert.ok(keys.has(k), `the brief is missing "${k}"`);
  }
});

test("the brief never suggests a queue that cannot be served", () => {
  const spec = SERVICE_INTAKE["wait-in-line"];
  const text = JSON.stringify(spec);
  assert.doesNotMatch(text, /passport/i, "passport appointments are non-transferable");
  assert.doesNotMatch(text, /\bDMV\b/i);
});

test("the documents question discourages oversharing", () => {
  const f = SERVICE_INTAKE["wait-in-line"].fields.find((x) => x.key === "documents")!;
  assert.match(f.hint ?? "", /Never share/i);
  assert.ok(!f.required, "nobody should be forced to hand over paperwork details");
});

test("the service page states that admission is not guaranteed", () => {
  const intro = SERVICE_INTAKE["wait-in-line"].intro ?? "";
  assert.match(intro, /not a guaranteed place|time, not a guarantee|You're booking their time/i);
});

/* -------------------------------------------------------- settlement */

test("only the venue-refused outcome escapes a charge", () => {
  // Mirrors outcome_is_chargeable() in migration 0074. If these two ever
  // disagree, a customer is billed for a job the venue made impossible.
  const sql = readFileSync("supabase/migrations/0074_wait_in_line.sql", "utf8");
  assert.match(sql, /<> 'venue_refused_substitution'/);
  const client = readFileSync("app/(provider)/provider/active/client.tsx", "utf8");
  for (const o of ["customer_took_over", "booked_period_ended", "queue_closed",
                   "venue_refused_substitution"]) {
    assert.ok(client.includes(o), `the helper cannot report "${o}"`);
  }
});

test("a refused venue releases the hold rather than capturing it", () => {
  const actions = readFileSync("app/(provider)/provider/active/actions.ts", "utf8");
  assert.match(actions, /settlement === "release"/);
  assert.match(actions, /voidBookingAuthorization/);
});

/* ------------------------------------------------- price display parity */

test("every catalogue passes the country overrides to the price line", () => {
  // ServicePriceLine is already enforced as the single place a price is
  // rendered. The overrides have to reach it, or a catalogue advertises a
  // number price_service_cents will not charge — which is how the live
  // page said $15 for a job billed at CA$40.
  for (const f of ["app/_services-catalog.tsx", "app/(app)/services/view.tsx"]) {
    const src = readFileSync(f, "utf8");
    assert.match(src, /countryPricing=\{s\.country_pricing\}/, `${f} drops the country overrides`);
  }
});

test("the price line applies the overrides itself", () => {
  const src = readFileSync("components/ServicePriceLine.tsx", "utf8");
  assert.match(src, /displayBaseCents/);
  // And must render the resolved figure, not the raw base.
  assert.match(src, /formatMoney\(shown, currency\)/);
  assert.doesNotMatch(src, /formatMoney\(baseCents, currency\)/);
});

test("every service query carries the overrides", () => {
  const src = readFileSync("lib/data/services.ts", "utf8");
  assert.match(src, /country_pricing:service_country_pricing/);
  // Through one shared select, so no query can forget them.
  assert.equal((src.match(/\.select\(SERVICE_SELECT\)/g) ?? []).length >= 4, true);
});
