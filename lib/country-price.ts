/*
 * Prices that differ by country, not just by currency symbol.
 *
 * A service had ONE base_price_cents, rendered as "US$15" in San Diego and
 * "CA$15" in Vancouver. That is a currency label on a single price, not two
 * prices, and it left Wait in Line paying a Vancouver helper CA$12 for an
 * hour that cost them travel at both ends.
 *
 * HOW THE COUNTRY REACHES THE DATABASE PRICER.
 *
 * price_service_cents(service_id, intake) is called from three places that
 * must agree exactly — the quote, the quote fingerprint, and acceptance —
 * because the fingerprint exists to stop an offer being accepted at a
 * different price from the one quoted. Rather than add a parameter and
 * rewrite all three, the country rides inside the intake under the reserved
 * key `_country`, which all three already read from the same stored row.
 *
 * It is written here, server-side, from the attested service area, and it
 * OVERWRITES anything the client sent. A customer who posts
 * `_country: "US"` from Vancouver gets the Vancouver price.
 */

/** The reserved intake key. Underscore-prefixed so it cannot collide with a real question. */
export const COUNTRY_KEY = "_country";

export type PricedCountry = "US" | "CA";

export function isPricedCountry(v: unknown): v is PricedCountry {
  return v === "US" || v === "CA";
}

/**
 * Stamp the attested country onto an intake blob.
 *
 * Call AFTER validation and AFTER applyResolvedAddresses, with the country
 * from the dispatch guard's resolved service area — never from a form
 * field, a header, or the address text.
 */
export function sealIntakeCountry<T extends Record<string, unknown>>(
  intake: T,
  country: string | null | undefined,
): T & Record<string, unknown> {
  const clean: Record<string, unknown> = { ...intake };
  // Remove first, so an unknown country cannot leave a client-supplied
  // value standing.
  delete clean[COUNTRY_KEY];
  if (isPricedCountry(country)) clean[COUNTRY_KEY] = country;
  return clean as T & Record<string, unknown>;
}

/**
 * Per-country overrides for one service.
 *
 * Deliberately the DATABASE row shape, snake_case and all. A camelCase
 * mirror would need mapping at every query, and the one thing that must
 * not happen is a catalogue quietly dropping the overrides on the way
 * through and advertising a price the server will not charge.
 */
export type CountryPrice = {
  country: PricedCountry;
  base_price_cents: number;
  extra_block_cents: number | null;
  per_extra_unit_cents?: number | null;
  per_extra_crew_cents?: number | null;
};

/**
 * The base price to SHOW for a service in a country.
 *
 * Display only. The charged number always comes from price_service_cents in
 * the database, which is what acceptance re-computes. If these two ever
 * disagree the database wins and the customer sees a different total at
 * submission — so this must use the same fallback rule: a country with no
 * row keeps the single price.
 */
export function displayBaseCents(
  serviceBaseCents: number,
  overrides: CountryPrice[] | undefined,
  country: string | null | undefined,
): number {
  if (!isPricedCountry(country) || !overrides?.length) return serviceBaseCents;
  const row = overrides.find((o) => o.country === country);
  return row ? row.base_price_cents : serviceBaseCents;
}

/** Same rule for the per-block extra. Null means "keep the service's rule". */
export function displayExtraBlockCents(
  ruleExtraCents: number | null,
  overrides: CountryPrice[] | undefined,
  country: string | null | undefined,
): number | null {
  if (!isPricedCountry(country) || !overrides?.length) return ruleExtraCents;
  const row = overrides.find((o) => o.country === country);
  return row?.extra_block_cents ?? ruleExtraCents;
}

/**
 * How a price reads on a page that cannot know who is looking.
 *
 * The public service pages are force-static with ISR, so they are built
 * once and served to San Diego and Vancouver alike — there is no request to
 * take a country from. A service priced differently in the two markets
 * therefore has to show both, because picking one and hoping would mean
 * advertising a number half the visitors will not be charged.
 *
 * Services with no overrides — every service but one today — are unchanged:
 * a single figure, exactly as before.
 */
export function staticPriceLabel(
  serviceBaseCents: number,
  overrides: CountryPrice[] | null | undefined,
  format: (cents: number, currency: string) => string,
): string {
  const us = overrides?.find((o) => o.country === "US");
  const ca = overrides?.find((o) => o.country === "CA");
  if (!us && !ca) return format(serviceBaseCents, "USD");

  const usCents = us?.base_price_cents ?? serviceBaseCents;
  const caCents = ca?.base_price_cents ?? serviceBaseCents;
  return `${format(usCents, "USD")} · ${format(caCents, "CAD")}`;
}


/**
 * A pricing rule with every local money amount applied.
 *
 * displayBaseCents covered the base and displayExtraBlockCents the time
 * block, which left the per-unit and per-crew amounts at their single
 * value — so a Canadian booking three dogs would have been SHOWN
 * CA$27 + 2 x US$8 = CA$43 and CHARGED CA$47. Localising the whole rule
 * in one place means a new country-priced field cannot be applied in the
 * database and forgotten in the display, which is the exact shape of the
 * bug that put "$15" on a page billing CA$40.
 *
 * Returns the rule unchanged when there is nothing to override, so every
 * service without country rows behaves exactly as before.
 */
export function localizeRule<
  R extends {
    extraBlockCents: number | null;
    perExtraUnitCents: number | null;
    perExtraCrewCents: number | null;
  },
>(
  rule: R | null | undefined,
  overrides: CountryPrice[] | null | undefined,
  country: string | null | undefined,
): R | null {
  if (!rule) return null;
  if (!isPricedCountry(country) || !overrides?.length) return rule;
  const row = overrides.find((o) => o.country === country);
  if (!row) return rule;
  return {
    ...rule,
    extraBlockCents: row.extra_block_cents ?? rule.extraBlockCents,
    perExtraUnitCents: row.per_extra_unit_cents ?? rule.perExtraUnitCents,
    perExtraCrewCents: row.per_extra_crew_cents ?? rule.perExtraCrewCents,
  };
}
