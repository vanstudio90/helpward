import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync("app/(provider)/provider/onboard/page.tsx", "utf8");
const form = readFileSync("app/(provider)/provider/onboard/services-form.tsx", "utf8");

/* A numbered checklist whose first two numbers have nothing under them is
 * not a checklist. Steps 1 and 2 rendered as bare titles while the services
 * form sat below the whole list, past a paragraph of legal text — so the
 * first thing on the page with any content was step 3, and arriving from
 * the dashboard's "Select services" link showed bank-account setup.
 */

test("every step carries its own controls", () => {
  const list = page.slice(page.indexOf("{steps.map("), page.indexOf("</ol>"));
  for (const key of ["profile", "services", "payouts"]) {
    assert.ok(list.includes(`s.key === "${key}"`), `step "${key}" has no body inside the list`);
  }
});

test("the services form is inside the list, not stranded below it", () => {
  const listEnd = page.indexOf("</ol>");
  const formAt = page.indexOf("<ProviderServicesForm");
  assert.ok(formAt > -1, "the services form must be rendered somewhere");
  assert.ok(formAt < listEnd, "the services form must sit inside its own numbered step");
  // And only once — the detached copy below the list is gone.
  assert.equal(page.split("<ProviderServicesForm").length - 1, 1);
});

test("step 1 is actionable, not a dead title", () => {
  assert.match(page, /href="\/provider\/profile"/);
  assert.match(page, /Complete your profile/);
});

test("an embedded form does not repeat the step's own heading", () => {
  // Otherwise the step reads: "Select your services" / "Services you offer".
  assert.match(form, /embedded\?: boolean/);
  assert.match(form, /\{!embedded && \(/);
});
