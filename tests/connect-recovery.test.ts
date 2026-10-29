import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const payments = readFileSync("lib/payments.ts", "utf8");
const code = payments.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");

/* A Connect account belongs to the platform AND mode that created it.
 *
 * Helper accounts were created in May under test keys; the platform went
 * live on 2026-10-28. Stripe answers `resource_missing` for those ids now,
 * exactly as for an id that never existed — and the code handed the stored
 * id straight to accountLinks.create, so it failed identically on every
 * attempt with no way past it.
 */

test("an unusable stored account is replaced, not retried for ever", () => {
  assert.match(code, /connectAccountIsUsable\(stripe, accountId\)/);
  assert.match(code, /stripe_connect_account_id: null/);
  // The derived flags must be cleared too, or the dashboard keeps
  // reporting the dead account's requirements against the new one.
  for (const f of ["stripe_details_submitted", "stripe_transfers_active",
                   "stripe_requirements_due", "stripe_disabled_reason"]) {
    assert.ok(code.includes(`${f}:`), `${f} is not cleared when the account is replaced`);
  }
});

test("only a missing account counts as missing", () => {
  // A rate limit or a network blip must not be read as "this account is
  // gone", or a transient failure throws away a working account.
  const fn = code.slice(code.indexOf("async function connectAccountIsUsable"));
  assert.match(fn, /resource_missing/);
  assert.match(fn, /StripePermissionError/);
  assert.match(fn, /no such account/i);
  // The default on an unrecognised error is to keep the account.
  assert.match(fn, /return true;[\s\S]*?\}\n\}/);
});

test("the failure message no longer claims support was notified", () => {
  // Nothing notifies support, and until MX records exist the address it
  // would use bounces.
  assert.doesNotMatch(code, /Support has been notified/);
  assert.match(code, /Stripe refused that request/);
});

test("a replacement cannot be handed out before it is recorded", () => {
  // The pre-existing guard: if the new id cannot be persisted, the link
  // must not be returned, or the next attempt creates a second account and
  // strands whatever was entered in the first.
  assert.match(code, /could not persist connect account/);
  assert.match(code, /return fail\("persist_failed"/);
});
