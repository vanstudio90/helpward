import { test } from "node:test";
import assert from "node:assert/strict";
import { describeDisabledReason } from "../lib/stripe-disabled-reason.ts";

/* Stripe puts two unrelated situations in disabled_reason, and the page
 * treated every non-null value as the alarming one: a helper who simply
 * had not finished the form was told "Stripe has paused this account" and
 * sent to support. requirements.past_due is the ordinary state of every
 * half-finished signup.
 */

test("an unfinished form is not a paused account", () => {
  for (const r of [
    "requirements.past_due",
    "requirements.pending_verification",
    "requirements.something_stripe_adds_later",
  ]) {
    const d = describeDisabledReason(r);
    assert.ok(d, `${r} should produce a message`);
    assert.equal(d!.serious, false, `${r} must not be reported as serious`);
    assert.doesNotMatch(d!.message, /paused/i);
    assert.doesNotMatch(d!.message, /support@/, `${r} must not send the helper to support`);
  }
});

test("a genuinely unusable account says so and offers a way out", () => {
  for (const r of ["rejected.fraud", "rejected.terms_of_service", "platform_paused", "other"]) {
    const d = describeDisabledReason(r);
    assert.ok(d);
    assert.equal(d!.serious, true, `${r} must be reported as serious`);
    assert.match(d!.message, /support@helpward\.com/);
  }
});

test("review states read as waiting, not failure", () => {
  for (const r of ["under_review", "listed"]) {
    const d = describeDisabledReason(r);
    assert.equal(d!.serious, false);
    assert.match(d!.message, /review/i);
  }
});

test("no reason means no message at all", () => {
  assert.equal(describeDisabledReason(null), null);
});
