import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { totalsByCurrency, describeTotals } from "@/lib/money-by-currency";

// Payments summed raw cents across currencies into one "$" figure, so a
// CA$24.50 booking and a US$24.50 booking read as $49.00 — a number that
// is not an amount of anything.

describe("spending is counted in the money it was spent in", () => {
  const ROWS = [
    { currency: "CAD", grossCents: 2450, refundedCents: 0 },
    { currency: "USD", grossCents: 2450, refundedCents: 0 },
  ];

  test("two currencies are never added together", () => {
    const totals = totalsByCurrency(ROWS);
    assert.equal(totals.length, 2);
    assert.ok(
      !totals.some((t) => t.netCents === 4900),
      "CAD and USD cents were summed into a quantity with no unit",
    );
  });

  test("the defect, stated as the assertion", () => {
    assert.equal(describeTotals(totalsByCurrency(ROWS)), "CA$24.50 · US$24.50");
  });

  test("one currency reads as a single plain total", () => {
    const totals = totalsByCurrency([
      { currency: "USD", grossCents: 2450, refundedCents: 0 },
      { currency: "USD", grossCents: 1000, refundedCents: 0 },
    ]);
    assert.equal(totals.length, 1);
    assert.equal(describeTotals(totals), "US$34.50");
  });

  test("refunds come off the currency they were refunded in", () => {
    const totals = totalsByCurrency([
      { currency: "CAD", grossCents: 2450, refundedCents: 1000 },
      { currency: "USD", grossCents: 2450, refundedCents: 0 },
    ]);
    const cad = totals.find((t) => t.currency === "CAD")!;
    const usd = totals.find((t) => t.currency === "USD")!;
    assert.equal(cad.netCents, 1450);
    assert.equal(usd.netCents, 2450, "a CAD refund must not reduce a USD total");
  });

  test("a refund never drives a total negative", () => {
    const [t] = totalsByCurrency([{ currency: "USD", grossCents: 1000, refundedCents: 5000 }]);
    assert.equal(t.netCents, 0);
  });

  test("the currency someone actually uses leads", () => {
    const totals = totalsByCurrency([
      { currency: "USD", grossCents: 500, refundedCents: 0 },
      { currency: "CAD", grossCents: 90000, refundedCents: 0 },
    ]);
    assert.equal(totals[0].currency, "CAD");
  });

  test("a missing currency is treated as USD rather than dropped", () => {
    const [t] = totalsByCurrency([{ currency: "", grossCents: 1000, refundedCents: 0 }]);
    assert.equal(t.currency, "USD");
    assert.equal(t.netCents, 1000);
  });

  test("nothing spent is nothing, not a blank", () => {
    assert.equal(describeTotals([]), "US$0");
  });
});
