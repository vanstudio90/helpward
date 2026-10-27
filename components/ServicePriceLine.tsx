import { formatMoney, unitFor } from "@/lib/money";
import { SERVICE_FEE_CENTS } from "@/lib/pricing";
import type { PricingRule } from "@/lib/service-pricing";

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
  baseCents, rule, currency = "USD", className = "",
}: {
  baseCents: number;
  rule?: PricingRule | null;
  currency?: "USD" | "CAD";
  className?: string;
}) {
  const unit = unitFor(rule);
  return (
    <span className={`block text-[11px] sm:text-xs ${className}`}>
      <span className="block font-semibold text-slate-900">
        From {formatMoney(baseCents, currency)}
        {unit && <span className="font-normal text-slate-500"> {unit}</span>}
      </span>
      <span className="block text-slate-500 mt-0.5">
        + {formatMoney(SERVICE_FEE_CENTS, currency)} service fee
      </span>
    </span>
  );
}
