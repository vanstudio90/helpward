import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  WINDOW_OPTIONS, DEFAULT_WINDOW, windowDays, windowSince, windowLabel, modeOfAccount,
} from "../lib/admin-filters.ts";

/*
  THE FILTER THAT LOOKED LIKE IT WORKED.

  The date control submitted `7d`; the payments reader looked up
  `Last 7 days`. Every lookup missed, every miss meant "no cutoff", and
  changing the range on a live console silently removed the range.
  Nothing failed, which is why nothing caught it.

  These run the contract rather than describing it.
*/

const control = readFileSync("components/admin/PaymentFilters.tsx", "utf8");
const payments = readFileSync("lib/data/admin-payments.ts", "utf8");
const refunds = readFileSync("lib/data/admin-refunds.ts", "utf8");

test("every value the control can submit is a window the readers know", () => {
  for (const option of WINDOW_OPTIONS) {
    assert.notEqual(windowDays(option.value), undefined,
      `${option.value} is offered by the control and unknown to the readers`);
  }
});

test("an unknown key is not silently 'everything'", () => {
  // The old table returned undefined for "7d" and `?? null` turned that
  // into no cutoff at all.
  assert.equal(windowDays("Last 7 days"), undefined);
  assert.equal(windowDays("nonsense"), undefined);
  // And resolving one falls back to the default window, not to no window.
  assert.equal(windowSince("nonsense", Date.UTC(2026, 0, 31)),
    windowSince(DEFAULT_WINDOW, Date.UTC(2026, 0, 31)));
  assert.notEqual(windowSince("nonsense", Date.UTC(2026, 0, 31)), null);
});

test("each window is the number of days it says", () => {
  const now = Date.UTC(2026, 0, 31);
  const days = (key: string) =>
    Math.round((now - new Date(windowSince(key, now)!).getTime()) / 86400_000);
  assert.equal(days("today"), 1);
  assert.equal(days("7d"), 7);
  assert.equal(days("30d"), 30);
  assert.equal(days("90d"), 90);
  assert.equal(windowSince("all", now), null, "everything means no cutoff");
});

test("the label shown is the label of the window applied", () => {
  assert.equal(windowLabel("7d"), "Last 7 days");
  assert.equal(windowLabel(undefined), "Last 30 days");
  assert.equal(windowLabel("nonsense"), "Last 30 days");
});

test("both readers use the shared contract, not a private table", () => {
  for (const [name, source] of [["payments", payments], ["refunds", refunds]] as const) {
    assert.match(source, /windowSince\(opts\.window\)/, `${name} must resolve the window centrally`);
    assert.doesNotMatch(source, /"Last 7 days": 7/, `${name} must not keep its own table`);
  }
  assert.match(control, /WINDOW_OPTIONS\.map/);
});

/* ------------------------------------------------------------------ */
/* MODE IS A FACT ABOUT THE TRANSACTION                                */
/* ------------------------------------------------------------------ */

test("mode comes from the account, not from the chip", () => {
  /*
    The same payment read "Captured · Live", then "Captured · Test"
    after clicking a filter — a console inventing a fact about money.
    Review accounts transact against the test Stripe, so the account
    is the authority.
  */
  assert.equal(modeOfAccount(true), "test");
  assert.equal(modeOfAccount(false), "live");
  assert.equal(modeOfAccount(null), "live");
  assert.equal(modeOfAccount(undefined), "live");

  for (const [name, source] of [["payments", payments], ["refunds", refunds]] as const) {
    assert.match(source, /modeOfAccount\(/, `${name} must derive the mode`);
    assert.doesNotMatch(source, /mode: opts\.mode \?\? "live",\n\s*dated_by/,
      `${name} must not stamp the filter's value onto a row`);
  }
  // And selecting a mode excludes the other rather than relabelling it.
  assert.match(payments, /a mode filter EXCLUDES the other mode rather than relabelling it/);
  assert.match(payments, /modeExcluded/);
});

test("the filter control follows the route it is on", () => {
  // Hardcoding /admin/payments sent a Refunds filter to Payments.
  assert.match(control, /usePathname/);
  assert.match(control, /router\.replace\(`\$\{pathname\}\?/);
  assert.doesNotMatch(control, /router\.replace\(`\/admin\/payments\?/);
});
