import { formatMoney } from "@/lib/money";

// Totals, grouped by the money they are actually in.
//
// Payments summed raw cents across currencies into one "$" figure, so a
// CA$24.50 booking and a US$24.50 booking showed as $49.00 — a number
// that is not an amount of anything. CAD and USD are not interchangeable
// and adding their cents together produces a quantity with no unit.
//
// There is no conversion here on purpose. Converting needs a rate and a
// date, and inventing one would turn a visibly wrong number into an
// invisibly wrong one.

export type Amount = { currency: string; cents: number };

export type CurrencyTotal = {
  currency: string;
  grossCents: number;
  netCents: number;
  refundedCents: number;
  count: number;
};

/**
 * Group amounts by currency.
 *
 * Returned largest-net-first, so the currency someone actually uses
 * leads — a customer with one stray booking abroad should not see it
 * first.
 */
export function totalsByCurrency(
  rows: Array<{ currency: string; grossCents: number; refundedCents: number }>,
): CurrencyTotal[] {
  const byCurrency = new Map<string, CurrencyTotal>();

  for (const row of rows) {
    const currency = (row.currency || "USD").toUpperCase();
    const existing = byCurrency.get(currency) ?? {
      currency, grossCents: 0, netCents: 0, refundedCents: 0, count: 0,
    };
    existing.grossCents += row.grossCents;
    existing.refundedCents += row.refundedCents;
    existing.netCents += Math.max(0, row.grossCents - row.refundedCents);
    existing.count += 1;
    byCurrency.set(currency, existing);
  }

  return [...byCurrency.values()].sort((a, b) => b.netCents - a.netCents);
}

/** "CA$24.50" — or "CA$24.50 · US$24.50" when more than one is in play. */
export function describeTotals(
  totals: CurrencyTotal[],
  pick: (t: CurrencyTotal) => number = (t) => t.netCents,
): string {
  if (totals.length === 0) return formatMoney(0, "USD");
  return totals.map((t) => formatMoney(pick(t), t.currency)).join(" · ");
}
