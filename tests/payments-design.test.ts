import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/*
  THE PAYMENTS SCREEN READS REAL MONEY.

  Which makes these tests the ones that matter most: a payments console
  that looks real and is wrong is the most expensive mistake this
  product could make. They are SOURCE assertions — getPaymentsView()
  now needs a database, and a test that needs a service key is a test
  that gets skipped in CI and then quietly rots. What is checked here
  is the arithmetic the wiring encodes; the figures it returns are
  checked against production by a scripted walkthrough.
*/

const page = readFileSync("app/(admin)/admin/payments/page.tsx", "utf8");
const panel = readFileSync("components/admin/PaymentDetailPanel.tsx", "utf8");
const data = readFileSync("lib/data/admin-payments.ts", "utf8");

test("the page never draws zeroes over a failed read", () => {
  // A zero here reads as a quiet month, not a broken query.
  assert.match(data, /A failed read is not an empty ledger/);
  assert.match(data, /load_error: string \| null;/);
  assert.match(page, /The payments could not be read/);
  assert.match(page, /Nothing is shown rather than zeroes/);
});

test("nothing on this screen moves money", () => {
  /*
    Refunds are the one act here that takes money back, and they live
    on their own screen with their own decision trail.
  */
  assert.match(data, /NOTHING ON THIS SCREEN MOVES MONEY/);
  assert.match(data, /writable: false/);
  assert.doesNotMatch(data, /writable: true/);
  assert.doesNotMatch(page, /disabled=\{view\.sample\}/);
  assert.match(page, /disabled=\{!view\.writable\}/);
});

test("holds are never added to captured", () => {
  /*
    A hold is the bank's money, not ours. Adding it to captured is how
    a console reports revenue that nobody has been charged.
  */
  assert.match(data, /open_holds_cents: openHolds/);
  assert.match(data, /net_captured_cents: capturedCents - refundedCents/);
  assert.doesNotMatch(data, /capturedCents \+ openHolds/);
  // And the holds figure is a balance now, not a window total.
  assert.match(data, /they are a balance right\s*\n\s*now, which is why they carry an "as of"/);
  assert.match(data, /holds_as_of: "As of just now"/);
});

test("a tip is its own payment, not a line in somebody else's", () => {
  // A separate charge against a separate intent gets a separate row.
  assert.match(data, /ONE ROW PER CHARGE, NOT PER BOOKING/);
  assert.match(data, /leg: "tip"/);
  assert.match(data, /stripe_payment_intent_id: row\.leg === "tip" \? b\.tip_payment_intent_id/);
});

test("allocation is the snapshot, not today's prices", () => {
  /*
    A job quoted in January must not be re-split at March's commission,
    and "we do not know what this settled at" is not CA$0.00.
  */
  assert.match(data, /FROM THE FIGURES SAVED WITH THIS\s*\n\s*BOOKING/);
  assert.match(data, /\{ label: "Helper payout", amount_cents: payout \}/);
  assert.match(data, /allocation: \{ label: string; amount_cents: number \| null/);
  /*
    AND THE SERVICE FEE IS COUNTED ONCE. platform_fee_cents already
    contains it, so listing both beside each other showed a CA$29.50
    job as CA$20.00 + CA$9.50 + CA$4.50 = CA$34.00 — four and a half
    dollars nobody paid.
  */
  assert.match(data, /THE SERVICE FEE IS COUNTED ONCE/);
  assert.match(data, /const commission = platform - serviceFee;/);
  // If the saved figures do not add up, the panel says so.
  assert.match(data, /label: "Unaccounted"/);
  assert.match(data, /do not add up to what was charged/);
});

test("one currency at a time", () => {
  assert.match(page, /currencies are\s*\n?\s*never added together/);
  assert.match(data, /Currencies are never summed/);
  // The totals carry no currency breakdown because the view is scoped
  // to one — the selector changes which payments the page is about.
  assert.match(data, /currency: string;/);
});

test("the screen does not claim a Stripe mirror it does not have", () => {
  /*
    There is no local copy of Stripe's event log. An "event feed" that
    looked like Stripe's but was assembled here would be the same lie
    in a different font.
  */
  assert.match(data, /WHAT HELPWARD RECORDED, NOT WHAT STRIPE SENT/);
  assert.match(data, /source: "helpward" as const/);
  assert.doesNotMatch(data, /source: "stripe"/);
  // And no reconciliation has run, so the card says so.
  assert.match(data, /No reconciliation run is recorded/);
});

test("an empty list explains itself", () => {
  // A blank payments table is a fault report unless it says why.
  assert.match(data, /WHY THE LIST IS EMPTY, WHEN IT IS/);
  assert.match(data, /belongs to a review or test account, which this view excludes/);
  assert.match(page, /AN EMPTY PAYMENTS LIST IS ALARMING UNLESS IT EXPLAINS/);
  assert.match(page, /Include review &amp; test activity/);
});

test("a stale label never decides a payment's state", () => {
  /*
    The first partial refund of a captured booking leaves
    payment_status reading "captured", and a booking cancelled after
    authorization keeps reading "authorized" when the hold is gone.
  */
  assert.match(data, /`payment_status` is a label that goes stale/);
  assert.match(data, /function stateOf/);
  assert.match(data, /if \(captured && refunded > 0\)/);
});

test("test mode is impossible to miss", () => {
  // A toggle is one chip among several and somebody arriving at a
  // shared screen did not set it.
  assert.match(page, /view\.mode === "test" && \(/);
  assert.match(page, /Test mode\./);
  assert.match(page, /No real money is involved/);
});

test("every figure says what dates it", () => {
  /*
    A January charge refunded in March is March's refund and January's
    capture. One date column cannot describe both.
  */
  assert.match(data, /EACH DATED BY ITS OWN EVENT/);
  assert.match(data, /captured_dating: "Dated by capture"/);
  assert.match(data, /refunded_dating: "Dated by refund"/);
  assert.match(data, /function datedBy/);
});

test("a partially refunded row carries more than one amount", () => {
  /*
    One "Amount" column cannot describe a partly refunded payment:
    CA$34.50 of what, and what is left?
  */
  assert.match(data, /refunded_cents: b\.captured_at \? refunded : null/);
  assert.match(data, /remaining_refundable_cents: b\.captured_at \? Math\.max/);
  // Null means not known. Never zero standing in for an unknown.
  assert.match(data, /never zero standing\s*\n\s*in for an unknown/);
});

test("the refund workflow is a separate screen", () => {
  assert.match(panel, /\/admin\/refunds\?start=/);
  // And bank confirmation is the customer's to complete, not staff's.
  assert.match(page, /the customer completes the check\s*\n?\s*with their own bank/);
});


test("a money figure is never clipped or wrapped", () => {
  /*
    A card that renders "CA$1,2…" still reads as a number, which is the
    one thing a financial summary must not do. The figure holds
    whitespace-nowrap and the grid gives it room before five cards
    share a narrow column.
  */
  const refunds = readFileSync("app/(admin)/admin/refunds/page.tsx", "utf8");
  for (const [name, source] of [["payments", page], ["refunds", refunds]] as const) {
    const figure = source.slice(source.indexOf("function Figure"));
    assert.match(figure, /whitespace-nowrap/, `the ${name} figure can wrap or clip`);
    assert.match(figure, /tabular-nums/, `the ${name} figure is not tabular`);
    assert.doesNotMatch(figure, /text-\[24px\]/, `the ${name} figure is still at the clipping size`);
  }
  // And the five-card row only goes to five columns where there is room.
  assert.match(page, /grid-cols-2 sm:grid-cols-3 2xl:grid-cols-5/);
});
