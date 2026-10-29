import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/* A save you have to take on trust is not a confirmation.
 *
 * Two separate faults on the helper profile page:
 *   - Every card put its result banner at the TOP and its save button at
 *     the BOTTOM, so on a phone the confirmation appeared off screen at the
 *     exact moment it was needed. Pressing Save looked like nothing had
 *     happened.
 *   - "Profile updated." confirms that a request completed, not that the
 *     right values landed.
 */

const DIR = "app/(provider)/provider/profile";
const forms = readFileSync(`${DIR}/forms.tsx`, "utf8");
const slug = readFileSync(`${DIR}/slug-form.tsx`, "utf8");
const cities = readFileSync(`${DIR}/cities-form.tsx`, "utf8");
const actions = readFileSync(`${DIR}/actions.ts`, "utf8");

function confirmationIsBelowTheButton(src: string, label: string) {
  const button = src.indexOf('type="submit"');
  const result = src.search(/state\?\.success|SaveResult|state\?\.error \|\| state\?\.success/);
  assert.ok(button > -1, `${label} has no submit button`);
  assert.ok(result > -1, `${label} shows no result at all`);
  assert.ok(result > button,
    `${label} renders its confirmation above the button, where a phone scrolls it out of view`);
}

test("each card confirms where the button is", () => {
  confirmationIsBelowTheButton(slug, "slug-form");
  confirmationIsBelowTheButton(cities, "cities-form");
  // forms.tsx holds several cards; check the one with the reported problem.
  const profile = forms.slice(forms.indexOf("export function ProfileForm"),
                              forms.indexOf("export function ServicesForm"));
  confirmationIsBelowTheButton(profile, "ProfileForm");
});

test("saving the profile reports the values it stored", () => {
  // Not "Profile updated." — the name and radius read back are what turn
  // "it says it worked" into "I can see that it worked".
  const fn = actions.slice(actions.indexOf("export async function updateProviderProfileAction"));
  assert.match(fn, /Saved · \$\{saved\.join/);
  assert.match(fn, /fullName,/);
  assert.match(fn, /km radius/);
  assert.doesNotMatch(fn.slice(0, fn.indexOf("}")), /success: "Profile updated\."/);
});

test("every save on this page says what it did, not just that it did", () => {
  for (const msg of [
    /Timezone set to \$\{timezone\}/,
    /Your profile URL is now \/helpers\/\$\{raw\}/,
    /Saved \$\{services\.length\} service/,
  ]) {
    assert.match(actions, msg);
  }
});

test("the confirmation is announced, not just coloured", () => {
  // Colour alone excludes anyone using a screen reader, and green on its
  // own does not say what changed.
  for (const [src, label] of [[forms, "forms"], [slug, "slug"], [cities, "cities"]] as const) {
    assert.match(src, /role="status"/, `${label} does not announce its result`);
    assert.match(src, /aria-live="polite"/, `${label} should not steal focus`);
  }
});
