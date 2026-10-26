import type { PricingRule } from "@/lib/service-pricing";

/**
 * A price with its currency, as a customer reads it.
 *
 * "From $20" said neither what it buys nor in what money — USD was only
 * clear on the booking detail screen, and Canadian bookings are in CAD.
 */
export function formatMoney(cents: number, currency: "USD" | "CAD" | string = "USD"): string {
  const amount = (cents / 100).toFixed(2).replace(/\.00$/, "");
  // "US$" / "CA$" rather than a bare "$": the two are different money and
  // a customer in Vancouver should not have to guess which they are
  // being quoted.
  const prefix = currency === "CAD" ? "CA$" : "US$";
  return `${prefix}${amount}`;
}

/** What the base price buys: "/ 30-minute walk", "/ helper", or nothing. */
export function unitFor(rule: PricingRule | null | undefined): string {
  if (!rule) return "";
  if (rule.includedMinutes != null) {
    const mins = rule.includedMinutes;
    const label = mins >= 60 && mins % 60 === 0
      ? `${mins / 60}-hour`
      : `${mins}-minute`;
    return `/ first ${label}`;
  }
  if (rule.crewField) return "/ first helper";
  if (rule.unitField) {
    const noun = rule.unitField.replace(/_count$/, "").replace(/_/g, " ").replace(/s$/, "");
    return `/ first ${noun}`;
  }
  return "";
}
