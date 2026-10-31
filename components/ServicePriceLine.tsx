import { formatMoney, unitFor } from "@/lib/money";
import { SERVICE_FEE_CENTS } from "@/lib/pricing";
import type { PricingRule } from "@/lib/service-pricing";
import { displayBaseCents, type CountryPrice } from "@/lib/country-price";

/**
 * A service's price, as a customer reads it: the money, what it buys, and
 * the fee that is coming.
 *
 * ONE component, used by every catalogue.
 *
 * There were three card implementations — the public catalogue, the
 * signed-in catalogue and the booking form — and fixing "From $20" in two
 * of them left the third saying it. A customer who browses signed in saw
 * a different price format from one who browses signed out. They drift
 * because nothing stops them drifting.
 *
 * Rendered with <span>s so it can sit inside a <button>, which the
 * signed-in card is.
 */
export function ServicePriceLine({
  baseCents, rule, currency = "USD", className = "", countryPricing,
}: {
  baseCents: number;
  rule?: PricingRule | null;
  currency?: "USD" | "CAD";
  className?: string;
  /**
   * Per-country overrides for this service. Applied HERE rather than by
   * each caller, for the same reason this component exists at all: a
   * catalogue that forgot to apply them would advertise one price while
   * price_service_cents charged another, and only this file is enforced
   * by a test as the single place prices are rendered.
   */
  countryPricing?: CountryPrice[] | null;
}) {
  const unit = unitFor(rule);
  // Derived from the currency, never passed separately, so the number and
  // the symbol cannot disagree: a card reading CA$ shows the CA price.
  const shown = displayBaseCents(
    baseCents, countryPricing ?? undefined, currency === "CAD" ? "CA" : "US",
  );
  return (
    <span className={`block text-[13px] sm:text-[13px] ${className}`}>
      <span className="block font-semibold text-slate-900">
        From {formatMoney(shown, currency)}
        {unit && <span className="font-normal text-slate-500"> {unit}</span>}
      </span>
      <span className="block text-slate-500 mt-0.5">
        + {formatMoney(SERVICE_FEE_CENTS, currency)} service fee
      </span>
    </span>
  );
}
