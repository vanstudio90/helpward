import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/* Three auth behaviours that were wrong on a real phone, and that would
 * regress invisibly because all three look fine in a logged-in dev session.
 *
 * These assert on source rather than behaviour because the real checks need
 * a live Supabase project; what they protect is the specific decision, not
 * the mechanism. The live proof is in the session notes: an unconfirmed
 * account is refused with code "email_not_confirmed", and a signup for an
 * existing address returns success with identities: [].
 */

const actions = readFileSync("app/(auth)/auth/actions.ts", "utf8");
const loginPage = readFileSync("app/(auth)/login/page.tsx", "utf8");
const signupPage = readFileSync("app/(auth)/signup/page.tsx", "utf8");
const layout = readFileSync("app/layout.tsx", "utf8");
const scrollReset = readFileSync("components/scroll-reset.tsx", "utf8");

test("an unconfirmed sign-in is explained, not passed through raw", () => {
  // Supabase says "Email not confirmed", which reads as a fault rather than
  // an instruction. The code is the stable identifier; the message is not.
  assert.match(actions, /error\.code === "email_not_confirmed"/);
  assert.match(actions, /Please confirm your email first/);
  assert.match(actions, /resendEmail/);
  assert.match(loginPage, /state\.resendEmail && <ResendConfirmation/);
});

test("signup never claims to have sent mail it did not send", () => {
  // The bug: Supabase returns SUCCESS with an empty identities array for an
  // address that already exists, so that a signup form cannot be used to
  // enumerate accounts. Taken at face value it produced "Check your inbox"
  // for a link that was never sent.
  assert.match(actions, /identities\?\.length \?\? 0\) === 0/);
  assert.match(actions, /You already have a Helpward account/);
  assert.match(actions, /accountExists/);
  assert.match(signupPage, /state\.accountExists/);

  // The existing-account branch must return BEFORE the redirect to
  // /verify-email, or the message is unreachable.
  const existsAt = actions.indexOf("accountExists: true");
  const redirectAt = actions.indexOf('redirect("/verify-email');
  assert.ok(existsAt > -1 && redirectAt > -1);
  assert.ok(existsAt < redirectAt, "the already-registered check must precede the redirect");
});

test("resend never reveals whether an address has an account", () => {
  // Unlike the signup message, this endpoint is reachable by anyone who can
  // type an address, with no prior step that already disclosed it — so it
  // reports success either way.
  const fn = actions.slice(actions.indexOf("export async function resendConfirmationAction"));
  assert.match(fn, /return \{ success:/);
  assert.doesNotMatch(fn, /no account|not found|unregistered/i);
});

test("new pages start at the top without breaking back or anchors", () => {
  assert.match(layout, /<ScrollReset \/>/);
  assert.match(scrollReset, /popstate/);              // back/forward keeps its position
  assert.match(scrollReset, /window\.location\.hash/); // #links still land on the heading
  assert.match(scrollReset, /behavior: "instant"/);
});

test("pinch-zoom is still allowed", () => {
  // The mobile layout-shift fix must never be 'solved' by locking the
  // viewport: WCAG 1.4.4 requires the page to scale to 200%.
  assert.doesNotMatch(layout, /maximumScale|maximum-scale/);
  assert.doesNotMatch(layout, /userScalable|user-scalable/);
});
