import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  providerRequirements, outstandingRequirements, canAcceptWork, isReadyButOffline,
} from "../lib/provider-readiness.ts";

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

const ready = {
  status: "approved", isOnline: true, serviceCount: 3,
  transfersActive: true, hasBio: true,
};

test("an approved, payable helper offering services is ready", () => {
  assert.equal(canAcceptWork(ready), true);
  assert.deepEqual(outstandingRequirements(ready), []);
});

test("the QA helper that completed three paid jobs reads as ready", () => {
  // The exact account from the retest: approved, payable, working — and
  // the Dashboard told it to finish setting up. id_verified_at is not
  // part of this input at all, because nothing enforces it.
  assert.equal(canAcceptWork({ ...ready, serviceCount: 1 }), true);
});

test("readiness does not depend on checks nothing enforces", () => {
  // If id_verified_at or background_verified_at ever appear here, they
  // must appear in the migrations too — otherwise every helper is told
  // to complete something no code will ever mark complete.
  const src = read("lib/provider-readiness.ts");
  const body = src.slice(src.indexOf("export function providerRequirements"));
  assert.ok(!/id_verified_at|background_verified_at/.test(body),
    "unenforced checks must not gate readiness");
  const keys = providerRequirements(ready).map((q) => q.key);
  assert.deepEqual(keys, ["approval", "services", "payouts"]);
});

test("being offline is a choice, not an unfinished account", () => {
  const offline = { ...ready, isOnline: false };
  assert.equal(canAcceptWork(offline), true);
  assert.deepEqual(outstandingRequirements(offline), []);
  assert.equal(isReadyButOffline(offline), true);
});

test("each unmet requirement is named specifically, not as 'finish setup'", () => {
  const noPayouts = outstandingRequirements({ ...ready, transfersActive: false });
  assert.equal(noPayouts.length, 1);
  assert.equal(noPayouts[0].key, "payouts");
  assert.match(noPayouts[0].detail, /bank account/i);
  assert.equal(noPayouts[0].href, "/provider/onboard");
  assert.ok(noPayouts[0].action, "an unmet requirement needs a working next step");
});

test("no services is its own requirement with its own next step", () => {
  const out = outstandingRequirements({ ...ready, serviceCount: 0 });
  assert.deepEqual(out.map((q) => q.key), ["services"]);
  assert.equal(out[0].action, "Pick services");
});

test("waiting on human approval offers no button that pretends to help", () => {
  const out = outstandingRequirements({ ...ready, status: "pending" });
  const approval = out.find((q) => q.key === "approval")!;
  assert.equal(approval.href, null, "nothing the helper presses decides this");
  assert.match(approval.detail, /person at Helpward/);
});

test("a suspended account is sent to support, not to onboarding", () => {
  const out = outstandingRequirements({ ...ready, status: "suspended" });
  const approval = out.find((q) => q.key === "approval")!;
  assert.equal(approval.href, "/help");
  assert.equal(canAcceptWork({ ...ready, status: "suspended" }), false);
});

test("canAcceptWork matches what the database enforces", () => {
  // assert_helper_payable (0043) is called by accept_request (0045), and
  // matching (0004) requires approved + a provider_services row. If any
  // of those three change, this test is the reminder to change here too.
  const payable = read("supabase/migrations/0043_payment_invariants.sql");
  assert.match(payable, /stripe_transfers_active/);
  const accept = read("supabase/migrations/0045_accept_requires_payable_helper.sql");
  assert.match(accept, /assert_helper_payable/);
  const matching = read("supabase/migrations/0004_matching.sql");
  assert.match(matching, /provider_services/);
  assert.match(matching, /status = 'approved'/);

  assert.equal(canAcceptWork({ ...ready, status: "pending" }), false);
  assert.equal(canAcceptWork({ ...ready, serviceCount: 0 }), false);
  assert.equal(canAcceptWork({ ...ready, transfersActive: false }), false);
});
