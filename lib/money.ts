import type { PricingRule } from "@/lib/service-pricing";
import { singularize } from "@/lib/units";

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

/** What the base price buys: "/ first 30 minutes", "/ first helper". */
export function unitFor(rule: PricingRule | null | undefined): string {
  if (!rule) return "";
  if (rule.includedMinutes != null) {
    // Was "/ first 30-minute" — a hyphenated adjective with no noun after
    // it, so the phrase stopped mid-thought: first 30-minute WHAT. The
    // duration is the thing being bought, so it reads as a plain noun.
    const mins = rule.includedMinutes;
    if (mins >= 60 && mins % 60 === 0) {
      const hours = mins / 60;
      return `/ first ${hours} ${hours === 1 ? "hour" : "hours"}`;
    }
    return `/ first ${mins} ${mins === 1 ? "minute" : "minutes"}`;
  }
  if (rule.crewField) return "/ first helper";
  if (rule.unitField) {
    const noun = rule.unitField.replace(/_count$/, "").replace(/_/g, " ");
    return `/ first ${singularize(noun)}`;
  }
  return "";
}
