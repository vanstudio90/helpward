import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getRefundsView } from "../lib/data/admin-refunds.ts";

/*
  THE REFUNDS SCREEN IS A DESIGN FOR NOW, and it is the screen where
  being wrong costs the most: every mistake here is either money that
  went back twice or a customer told something untrue about their own
  money. These guard the four distinctions the layout is built on.
*/

const page = readFileSync("app/(admin)/admin/refunds/page.tsx", "utf8");
const panel = readFileSync("components/admin/RefundReviewPanel.tsx", "utf8");
const data = readFileSync("lib/data/admin-refunds.ts", "utf8");
const states = readFileSync("lib/admin-refund-states.ts", "utf8");

test("invented numbers are labelled as invented", async () => {
  const view = await getRefundsView();
  assert.equal(view.sample, true);
  assert.match(page, /Design concept · sample data/);
  assert.match(page, /Every figure here is invented/);
  // Nothing that would submit money is reachable on sample data.
  assert.match(panel, /disabled=\{sample\}/);
  assert.match(panel, /const blocked = Boolean\(review\.blocked_reason\) \|\| sample;/);
});

test("a request awaiting review has not been sent anywhere", async () => {
  const view = await getRefundsView();
  const request = view.rows.find((r) => r.state === "awaiting_review");
  assert.ok(request, "the sample has no awaiting-review row");
  // The type makes it impossible to fake: no processor reference until
  // something was actually submitted.
  assert.equal(request!.processor_refund_id, null);
  for (const row of view.rows.filter((r) => r.state === "processing" || r.state === "succeeded")) {
    assert.ok(row.processor_refund_id, `${row.id} claims a state it has no processor record for`);
  }
  assert.match(panel, /Nothing has been sent to Stripe and the customer has not\s*\n?\s*been told/);
  assert.match(states, /An internal request\. Nothing has been sent to Stripe/);
  assert.match(page, /Requests, not refunds/);
});

test("succeeded does not mean the customer has the money", () => {
  assert.match(states, /Stripe accepted it\. The customer's bank may take days to show it\./);
  assert.match(page, /has shown it yet/);
});

test("an unknown transfer effect stops the refund", async () => {
  const view = await getRefundsView();
  const helper = view.review?.effects.find((e) => e.key === "helper_transfer");
  assert.ok(helper, "the sample review has no helper effect");
  // Unknown is null and reads as "requires review" — never as zero.
  assert.equal(helper!.amount_cents, null);
  assert.equal(helper!.state, "requires_review");
  assert.ok(view.review?.blocked_reason, "an unknown effect does not block submission");
  assert.match(panel, /UNKNOWN IS NOT ZERO/);
  assert.match(panel, /Verify transfer effects before proceeding/);
  // Two outcomes, tracked apart, because either can fail on its own.
  assert.match(data, /TWO OUTCOMES, NOT ONE/);
});

test("available to refund subtracts what is already in flight", async () => {
  const view = await getRefundsView();
  const b = view.review!.balances;
  assert.equal(b.available_cents, b.captured_cents - b.refunded_cents - b.processing_cents);
  assert.match(panel, /Refunds processing/);
  assert.match(panel, /rechecked when the\s*\n?\s*refund is submitted/);
});

test("a tip is a different charge and says so", async () => {
  const view = await getRefundsView();
  assert.equal(view.review?.separate_leg?.leg, "tip");
  assert.notEqual(view.review?.separate_leg?.payment_ref, view.review?.payment.ref);
  assert.match(panel, /not included\. It is payment/);
});

test("a failed synchronisation is never drawn as zero refunds", () => {
  assert.match(page, /\{view\.sync_error \?/);
  assert.match(page, /Refund records could not be synchronised/);
  assert.match(page, /not because they are zero/);
  assert.match(data, /NEVER rendered as zero/);
});

test("the empty state only appears when the list is genuinely empty", () => {
  assert.match(page, /const empty = view\.rows\.length === 0 && !view\.sync_error;/);
  assert.match(page, /No refunds to show/);
  assert.match(page, /Clear filters/);
  assert.match(page, /View payments/);
});

test("releasing a hold is not a refund, and a refund starts from a payment", () => {
  assert.match(page, /Releasing an uncaptured hold is not a refund/);
  // "Start refund" goes to the captured payments rather than opening a
  // blank form that could be pointed at a hold.
  assert.match(page, /\/admin\/payments\?tab=captured/);
});

test("retrying is guarded and outside refunds are expected", () => {
  assert.match(page, /check whether the first attempt went through/i);
  assert.match(page, /appear after a\s*\n?\s*synchronisation/);
  assert.match(page, /via Stripe/);
});
