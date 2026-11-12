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

const DIR = "app/(helper)/helper/profile";
const forms = readFileSync(`${DIR}/forms.tsx`, "utf8");
const slug = readFileSync(`${DIR}/slug-form.tsx`, "utf8");
const cities = readFileSync(`${DIR}/cities-form.tsx`, "utf8");
const actions = readFileSync(`${DIR}/actions.ts`, "utf8");

/* The button and the confirmation, wherever each card happens to keep them.
 *
 * The first version of this check searched only for `state?.success`, so it
 * passed ServicesForm — which stores its result in `msg` — while that card
 * still rendered its banner above a list of 26 services, several screens
 * from the button. A check that cannot see a card is worse than no check,
 * because it reports the card as fixed. Both the button and the result are
 * matched by SHAPE here, not by one component's choice of variable name.
 */
function confirmationIsBelowTheButton(src: string, label: string) {
  const button = Math.max(src.indexOf('type="submit"'), src.indexOf("onClick={save}"));
  const result = src.search(/SaveResult|state\?\.success|msg\?\.ok|success:/);
  assert.ok(button > -1, `${label} has no save button this check can find`);
  assert.ok(result > -1, `${label} shows no result at all`);
  assert.ok(result > button,
    `${label} renders its confirmation above the button, where a phone scrolls it out of view`);
}

/** Every card on the profile page, so none can be skipped silently. */
function cardsIn(src: string): [string, string][] {
  const names = [...src.matchAll(/export function (\w+)/g)].map((m) => m[1]);
  return names.map((n, i) => {
    const start = src.indexOf(`export function ${n}`);
    const end = i + 1 < names.length ? src.indexOf(`export function ${names[i + 1]}`) : src.length;
    return [n, src.slice(start, end)] as [string, string];
  });
}

test("every card confirms where its own button is", () => {
  // Cards that save something. HelperAvatarUpload submits on pick and is
  // covered by the avatar editor instead.
  const saving = new Set(["ProfileForm", "ServicesForm"]);
  const checked: string[] = [];
  for (const [name, src] of cardsIn(forms)) {
    if (!saving.has(name)) continue;
    confirmationIsBelowTheButton(src, name);
    checked.push(name);
  }
  // Control: if a card were renamed, this would catch it rather than
  // quietly checking nothing.
  assert.deepEqual(checked.sort(), ["ProfileForm", "ServicesForm"]);

  confirmationIsBelowTheButton(slug, "slug-form");
  confirmationIsBelowTheButton(cities, "cities-form");
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

/* ------------------------------------------------------------- navigation */

test("the profile page is not a dead end", () => {
  // There was no way back from it — not to the setup steps, not to the
  // dashboard. A helper who arrived from "Complete your profile" on step 1,
  // filled it in and saved had nowhere to go.
  const page = readFileSync(`${DIR}/page.tsx`, "utf8");
  assert.match(page, /href=\{stillSettingUp \? "\/helper\/onboard" : "\/helper\/dashboard"\}/);
  // Top and bottom: the top for someone who changed their mind, the bottom
  // for someone who has just saved the last card.
  assert.equal((page.match(/\/helper\/onboard" : "\/helper\/dashboard/g) ?? []).length, 2);
});

test("the way out is navigation, not a fifth save button", () => {
  const page = readFileSync(`${DIR}/page.tsx`, "utf8");
  // Each card saves itself; a final "submit" would imply the earlier saves
  // had not counted.
  assert.match(page, /nothing left to submit here/);
});

test("where 'done' leads depends on whether setup is finished", () => {
  const page = readFileSync(`${DIR}/page.tsx`, "utf8");
  assert.match(page, /canAcceptWork\(readiness\)/);
  assert.match(page, /Back to your setup steps/);
  assert.match(page, /Back to dashboard/);
});

/* ------------------------------------------------- helper contact details */

test("a helper can record a phone number and where they are based", () => {
  // set_my_phone has existed since migration 0061, but the only page that
  // called it was /settings — in the CUSTOMER route group, absent from the
  // helper nav. Same gap that made the display name uneditable.
  const actions = readFileSync(`${DIR}/actions.ts`, "utf8");
  const forms = readFileSync(`${DIR}/forms.tsx`, "utf8");
  const page = readFileSync(`${DIR}/page.tsx`, "utf8");

  assert.match(actions, /rpc\("set_my_phone", \{ p_phone: phone \|\| null \}\)/);
  assert.match(actions, /base_address: baseAddress \|\| null/);
  assert.match(forms, /name="phone"/);
  assert.match(forms, /name="base_address"/);
  assert.match(page, /from\("profile_contacts"\)/);
});

test("the base address is not sold as the thing that gets you work", () => {
  // Matching uses current_location, the live reported point. An address
  // presented as controlling dispatch would be a lie a helper plans around.
  const forms = readFileSync(`${DIR}/forms.tsx`, "utf8");
  assert.match(forms, /Jobs reach you from your live location, not this/);
});

test("a failed admin query never renders as an empty table", () => {
  /*
    profiles.phone was dropped by migration 0051 while the admin users
    page still selected it, so PostgREST rejected the query, data came
    back null, and 94 customers rendered as "No users match those
    filters". The page now reads admin_customer_list (0101) instead of
    building its own select, so the column cannot drift again — but the
    lesson it taught has to keep holding: a read that failed must say
    so, and must never be drawn as a list with nothing in it.
  */
  const users = readFileSync("app/(admin)/admin/users/page.tsx", "utf8");
  assert.match(users, /if \(!list\.ok\)/, "the page does not branch on a failed read");
  assert.match(users, /\{list\.error\}/, "the reason for the failure is not shown");
  assert.match(users, /could not be loaded/i);
  // The empty state is for an empty result, and says so in those words.
  assert.match(users, /No customers match these filters/);

  // And the reader carries the error rather than discarding it.
  const reader = readFileSync("lib/data/admin-customers.ts", "utf8");
  assert.match(reader, /if \(error\) return \{ ok: false, error: describe\(error\) \};/);
  // A missing migration is named, not reported as an empty customer base.
  assert.match(reader, /migration 0101/);
});
