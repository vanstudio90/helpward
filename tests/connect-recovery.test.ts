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
  // The default on an unrecognised error is to KEEP the account, so a rate
  // limit or a network blip never reads as "this account is gone". The
  // not-usable return must be guarded by `gone`, and the usable one must
  // come after it as the fallthrough.
  const notUsable = fn.indexOf("if (gone) return { usable: false };");
  const usable = fn.indexOf("return { usable: true };", notUsable);
  assert.ok(notUsable > -1, "the missing-account branch is gone");
  assert.ok(usable > notUsable, "an unrecognised error must fall through to keeping the account");
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

test("a platform setup failure does not tell the helper to try again", () => {
  // The real error was: "You cannot create livemode account sessions or
  // account links until you have supplied URLs at .../connect/site-links".
  // That fails identically every time and the fault is not the helper's —
  // "try again" is advice that cannot work.
  assert.match(code, /platform_not_configured/);
  assert.match(code, /site-links\|livemode account/);
  const branch = code.slice(code.indexOf("if (platformSetup)"), code.indexOf("invalid_request\","));
  assert.match(branch, /not\s*\n?\s*\+?\s*"?yours|setup problem on our side/);
  assert.doesNotMatch(branch, /Try again/);
});

test("requirement labels cover the keys Stripe actually returns", async () => {
  const { describeRequirements } = await import("../app/(helper)/helper/onboard/payout-step.tsx")
    .catch(() => ({ describeRequirements: null as unknown as (k: string[]) => string[] }));
  // The component is JSX and cannot be imported by the runner, so assert on
  // source: only individual.* was mapped while Stripe returns
  // representative.*, which is why the list read "Day" and "Month".
  const step = readFileSync("app/(helper)/helper/onboard/payout-step.tsx", "utf8");
  assert.match(step, /representative\|company\|owners\?/);
  assert.match(step, /"dob\.day": "Your date of birth"/);
  assert.match(step, /"dob\.month": "Your date of birth"/);
  assert.match(step, /business_type:/);
  assert.match(step, /support_phone/);
  // And the three dob keys must collapse to one line.
  assert.match(step, /export function describeRequirements/);
  assert.match(step, /if \(seen\.has\(label\)\) continue;/);
  void describeRequirements;
});

/* ------------------------------------------------------------- country */

test("the Connect account country follows where the helper works", () => {
  // A Connect account's country CANNOT be changed afterwards, so this is
  // one of the few defaults where being wrong needs a whole new account.
  // profiles.country took the column default for every account created
  // before migration 0078 — 93 of 94 said US — so the cities a helper
  // deliberately ticked are the stronger signal.
  const fn = code.slice(code.indexOf("async function connectCountryFor"));
  assert.match(fn, /from\("provider_cities"\)/);
  assert.match(fn, /lower-mainland-bc"\) return "CA"/);
  assert.match(fn, /san-diego-ca"\) return "US"/);
  // profiles.country remains the fallback, not the first answer.
  assert.ok(fn.indexOf('provider_cities') < fn.indexOf('from("profiles")'),
    "profiles.country must only be the fallback");
  assert.match(code, /country: wantCountry/);
});

test("a wrong-country account is replaced only when it is empty", () => {
  // An account with submitted details may hold verification documents and
  // a bank account. Discarding that to correct a country is not ours to
  // decide, however wrong the country is.
  assert.match(code, /check\.account\.country !== wantCountry/);
  assert.match(code, /check\.account\.details_submitted === false/);
  assert.match(code, /wrong country \(\$\{check\.account\.country\}/);
});

test("signup persists the country it was given", () => {
  // handle_new_user built the profile from metadata but never read
  // `country`, so every signup took the column default.
  const mig = readFileSync("supabase/migrations/0078_profile_country.sql", "utf8");
  assert.match(mig, /raw_user_meta_data->>'country'/);
  assert.match(mig, /insert into public\.profiles \(id, role, full_name, avatar_url, country\)/);
  // And the migration proves it rather than assuming: it inserts a CA
  // signup, reads the profile back, and fails if the country was dropped.
  assert.match(mig, /handle_new_user still drops the country/);
});

test("clearing an account never nulls a NOT NULL column", () => {
  // stripe_requirements_due is NOT NULL jsonb. Setting it to null failed
  // the entire update with a 23502, so the account was never cleared and
  // the helper got "Could not restart payout setup" on every attempt.
  const block = code.slice(code.indexOf("stripe_connect_account_id: null"),
                           code.indexOf("if (error) {", code.indexOf("stripe_connect_account_id: null")));
  assert.match(block, /stripe_requirements_due: \[\]/);
  assert.doesNotMatch(block, /stripe_requirements_due: null/);
  // The other NOT NULL booleans must be reset too, not left describing the
  // discarded account.
  for (const f of ["stripe_charges_enabled: false", "stripe_payouts_enabled: false",
                   "stripe_details_submitted: false", "stripe_transfers_active: false"]) {
    assert.ok(block.includes(f), `${f} missing when the account is replaced`);
  }
});
