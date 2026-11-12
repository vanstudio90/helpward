import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getPaymentsView } from "../lib/data/admin-payments.ts";

/*
  THE PAYMENTS SCREEN IS A DESIGN FOR NOW.

  Which makes one test more important than the rest: a payments console
  that looks real and is not is the most expensive mistake this product
  could make. These guard the stamp, the switched-off buttons and the
  three pieces of arithmetic the layout is built around — so that when
  the page is wired, the wiring has to keep them true.
*/

const page = readFileSync("app/(admin)/admin/payments/page.tsx", "utf8");
const panel = readFileSync("components/admin/PaymentDetailPanel.tsx", "utf8");
const data = readFileSync("lib/data/admin-payments.ts", "utf8");

test("invented numbers are labelled as invented", async () => {
  const view = await getPaymentsView();
  assert.equal(view.sample, true, "the sample dataset does not flag itself");
  // The badge and the banner are both tied to that flag, so wiring the
  // page turns them off and nothing has to remember to remove them.
  assert.match(page, /\{view\.sample && \(/);
  assert.match(page, /Design concept · sample data/);
  assert.match(page, /Every number on this page is invented/);
});

test("nothing on a sample page can move money or claim a record", async () => {
  const view = await getPaymentsView();
  // Export, saved views, reconciliation, refund review and the Stripe
  // link are all disabled while the data is sample.
  const disabled = page.match(/disabled=\{view\.sample\}/g) ?? [];
  assert.ok(disabled.length >= 4, `only ${disabled.length} controls are switched off on sample data`);
  assert.match(panel, /disabled=\{sample\}/);
  assert.match(panel, /there is no Stripe record behind this/);
  // No real payment intent is implied by the sample.
  assert.ok(
    view.detail?.stripe_payment_intent_id?.includes("sample"),
    "the sample payment claims a real-looking Stripe intent",
  );
});

test("holds are never added to captured", async () => {
  const view = await getPaymentsView();
  // Net captured is captures minus refunds. The hold is nobody's
  // revenue and does not appear in it.
  assert.equal(
    view.totals.net_captured_cents,
    view.totals.captured_cents - view.totals.refunded_cents,
    "net captured is not captures minus refunds",
  );
  assert.notEqual(
    view.totals.net_captured_cents,
    view.totals.captured_cents + view.totals.open_holds_cents - view.totals.refunded_cents,
  );
  assert.match(page, /before fees and transfers/);
  assert.match(page, /Holds are not captured funds/);
});

test("a tip is its own payment, not a line in somebody else's", async () => {
  const view = await getPaymentsView();
  const tipRow = view.rows.find((r) => r.leg === "tip");
  assert.ok(tipRow, "the sample has no tip row");
  const serviceRow = view.rows.find((r) => r.booking_ref === tipRow!.booking_ref && r.leg === "service");
  assert.ok(serviceRow && serviceRow.id !== tipRow!.id, "the tip shares an id with the service payment");
  // And the detail points at it rather than folding it in.
  assert.equal(view.detail?.tip?.payment_id, tipRow!.id);
  assert.equal(
    view.detail?.breakdown.find((b) => b.emphasis)?.amount_cents,
    view.detail?.amount_cents,
    "the captured total does not match the breakdown",
  );
});

test("allocation is not a payout", async () => {
  const view = await getPaymentsView();
  // Every party's share adds up to what was captured, which is exactly
  // why it must not be read as money that has moved.
  const allocated = (view.detail?.allocation ?? [])
    .reduce((sum, a) => sum + (a.amount_cents ?? 0), 0);
  assert.equal(allocated, view.detail?.amount_cents);
  assert.match(panel, /does not confirm a\s*\n?\s*payout/);
  assert.match(panel, /Excludes processor fees/);
  // An allocation nobody recorded is shown as unknown, not as zero.
  assert.match(panel, /Not recorded/);
  assert.match(panel, /CA\$0\.00 here is how a\s*\n?\s*helper gets paid the wrong amount/);
  // And it comes from the booking's saved quote, not today's prices.
  assert.ok(
    view.detail?.allocation_source.includes("not from today"),
    "the allocation does not say where it came from",
  );
});

test("one currency at a time", () => {
  assert.match(page, /currencies are\s*\n?\s*never added together/);
  assert.match(data, /Currencies are never summed/);
  // The totals carry no currency breakdown because the view is scoped
  // to one — the selector changes which payments the page is about.
  assert.match(data, /currency: string;/);
});

test("the seam is one function", () => {
  assert.match(data, /export async function getPaymentsView/);
  assert.match(data, /Replace the body with real reads/);
  // The page reads nothing else, so wiring cannot miss a corner.
  assert.doesNotMatch(page, /createSupabaseServiceClient|createSupabaseServerClient|\.rpc\(/);
});


/* ---- the second payments brief ------------------------------------- */

test("test mode is impossible to miss", () => {
  // A toggle is one chip among several and somebody arriving at a
  // shared screen did not set it.
  assert.match(page, /view\.mode === "test" && \(/);
  assert.match(page, /Test mode\./);
  assert.match(page, /No real money is involved/);
});

test("every figure says what dates it", async () => {
  const view = await getPaymentsView();
  assert.match(view.totals.captured_dating, /capture/i);
  assert.match(view.totals.refunded_dating, /refund/i);
  // Open holds are a balance, not a period total.
  assert.match(view.totals.holds_as_of, /as of/i);
  assert.match(page, /Captures are dated by\s*\n?\s*capture and refunds by refund/);
});

test("a partially refunded row carries more than one amount", async () => {
  const view = await getPaymentsView();
  const partial = view.rows.find((r) => r.state === "partially_refunded");
  assert.ok(partial, "the sample has no partially refunded row");
  assert.ok(partial!.captured_cents && partial!.refunded_cents, "it carries no context");
  assert.equal(
    partial!.remaining_refundable_cents,
    partial!.captured_cents! - partial!.refunded_cents!,
    "remaining refundable does not follow from captured minus refunded",
  );
  // A hold has no captured figure at all — null, never zero.
  const hold = view.rows.find((r) => r.state === "authorized");
  assert.equal(hold!.captured_cents, null, "an open hold reports a captured amount");
  assert.match(page, /captured ·/);
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
