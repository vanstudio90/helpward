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

/** Per-country overrides for one service, as the catalogue reads them. */
export type CountryPrice = {
  country: PricedCountry;
  basePriceCents: number;
  extraBlockCents: number | null;
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
  return row ? row.basePriceCents : serviceBaseCents;
}

/** Same rule for the per-block extra. Null means "keep the service's rule". */
export function displayExtraBlockCents(
  ruleExtraCents: number | null,
  overrides: CountryPrice[] | undefined,
  country: string | null | undefined,
): number | null {
  if (!isPricedCountry(country) || !overrides?.length) return ruleExtraCents;
  const row = overrides.find((o) => o.country === country);
  return row?.extraBlockCents ?? ruleExtraCents;
}
