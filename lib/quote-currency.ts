// Which money a quote is shown in, and when that answer changes.
//
// This lived inline in the booking form as a regex over the address box,
// so the price flipped mid-keystroke — CA$ as soon as "Vancouver"
// appeared, US$ once the address resolved, CA$ again after acceptance.
// Pulled out here because the rule is about STATE TRANSITIONS, and those
// are what kept going wrong: not the arithmetic, but when a country
// becomes known and when it goes stale.

export type Country = "US" | "CA";
export type Currency = "USD" | "CAD";

/** Events that can change what we know about where the job is. */
export type AddressEvent =
  | { type: "typed" }                                   // free text edited
  | { type: "saved_address"; country?: string | null }  // picked a saved one
  | { type: "gps"; country?: string | null }            // reverse geocoded
  | { type: "confirmed"; country: string }              // server resolved it
  | { type: "cleared" };

export function countryOf(iso: string | null | undefined): Country | null {
  if (!iso) return null;
  return iso.toUpperCase() === "CA" ? "CA" : "US";
}

/**
 * The country the quote should use after an event.
 *
 * `null` means nothing is verified. That is a real state, not a missing
 * value: an address nobody has resolved has no country, and inventing
 * one from the text is what made the quote oscillate.
 */
export function nextConfirmedCountry(
  current: Country | null,
  event: AddressEvent,
): Country | null {
  switch (event.type) {
    // Typing invalidates whatever was verified. Keeping it would quote
    // the old place's money against the new address.
    case "typed":
    case "cleared":
      return null;

    // A saved address was verified when it was saved; a reverse geocode
    // IS a resolution. Both are as good as an explicit confirmation.
    case "saved_address":
    case "gps":
      return countryOf(event.country) ?? current;

    case "confirmed":
      return countryOf(event.country);
  }
}

/**
 * What to quote in.
 *
 * Falls back to the customer's own country while nothing is verified —
 * a guess, but a stable one, and it stops being a guess the moment an
 * address resolves. The BOOKING's real currency is set at acceptance
 * from the pickup country (migration 0052); this is only what the form
 * shows beforehand.
 */
export function quoteCurrency(
  confirmed: Country | null,
  viewerCountry: Country,
): Currency {
  const country = confirmed ?? viewerCountry;
  return country === "CA" ? "CAD" : "USD";
}
