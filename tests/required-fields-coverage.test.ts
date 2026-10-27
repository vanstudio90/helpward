import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { SERVICE_INTAKE, type IntakeField } from "@/lib/service-intake";
import { tidyLabel } from "@/lib/form-labels";

// The "what's missing" notice is only as good as its weakest service. It
// works by asking each control whether it is valid, so a required field
// whose rendered input carries no enforcement is invisible to it — the
// customer fills the form, submits, and is rejected by the server.
//
// That is exactly what was happening to every required CHECKBOX group:
// required in the spec, enforced on the server, and unmarked in the
// browser, because HTML has no native "at least one of these".
//
// These checks run over the whole catalogue rather than the one service
// that happened to be open during testing.

// Types whose rendered input carries the `required` attribute, from
// app/(app)/new-request/intake-fields.tsx.
const NATIVELY_REQUIRED = new Set(["text", "destination", "textarea", "number", "select", "duration"]);
// Types enforced by the form's own check instead, via data-required-group.
const GROUP_REQUIRED = new Set(["checkboxes"]);

const services = Object.entries(SERVICE_INTAKE);
const allFields: Array<{ service: string; field: IntakeField }> = services.flatMap(
  ([service, spec]) => spec.fields.map((field) => ({ service, field })),
);

describe("every service's required fields are enforceable in the browser", () => {
  // Guard: if the catalogue were empty, every assertion below would pass
  // by doing nothing.
  test("the catalogue is actually populated", () => {
    assert.ok(services.length >= 27, `expected 27+ services, found ${services.length}`);
    assert.ok(allFields.length > 100, `expected a real field set, found ${allFields.length}`);
  });

  test("no required field has a type the form cannot enforce", () => {
    const unenforceable = allFields
      .filter(({ field }) => field.required)
      .filter(({ field }) => !NATIVELY_REQUIRED.has(field.type) && !GROUP_REQUIRED.has(field.type))
      .map(({ service, field }) => `${service}.${field.key} (type: ${field.type})`);

    assert.deepEqual(
      unenforceable, [],
      "These required fields would be skipped by the missing-fields check and " +
        "only refused by the server, after the customer submits:\n" +
        unenforceable.join("\n"),
    );
  });

  test("every required checkbox group is covered by the group check", () => {
    const groups = allFields.filter(
      ({ field }) => field.required && field.type === "checkboxes",
    );
    // If this ever reaches zero, the group branch has become dead code and
    // the test above stops meaning anything.
    assert.ok(
      groups.length > 0,
      "no required checkbox groups found — the group check is now untested",
    );
  });
});

describe("every label in the catalogue reads well in the notice", () => {
  test("none tidies down to nothing", () => {
    const empty = allFields
      .filter(({ field }) => !tidyLabel(field.label))
      .map(({ service, field }) => `${service}.${field.key}`);
    assert.deepEqual(empty, [], `labels that vanish when tidied: ${empty.join(", ")}`);
  });

  test("none leaks the raw field key", () => {
    const leaky = allFields
      .filter(({ field }) => /^intake_|_/.test(tidyLabel(field.label)))
      .map(({ service, field }) => `${service}.${field.key} -> "${tidyLabel(field.label)}"`);
    assert.deepEqual(leaky, [], `labels showing a key instead of words:\n${leaky.join("\n")}`);
  });

  test("none carries decoration a reminder should not repeat", () => {
    const decorated = allFields
      .map(({ service, field }) => ({ service, field, tidied: tidyLabel(field.label) }))
      .filter(({ tidied }) => tidied.includes("*") || /\(optional\)/i.test(tidied))
      .map(({ service, field, tidied }) => `${service}.${field.key} -> "${tidied}"`);
    assert.deepEqual(decorated, [], decorated.join("\n"));
  });

  test("none is so long it stops being scannable", () => {
    // The notice is a list of links. A sentence there reads as a paragraph
    // of errors rather than a checklist.
    const verbose = allFields
      .map(({ service, field }) => ({ service, field, tidied: tidyLabel(field.label) }))
      .filter(({ tidied }) => tidied.length > 60)
      .map(({ service, field, tidied }) => `${service}.${field.key} (${tidied.length} chars) -> "${tidied}"`);
    assert.deepEqual(verbose, [], verbose.join("\n"));
  });
});

// What the catalogue promises has to be something the app can do.
describe("the intake does not offer what is not built", () => {
  test("no service offers a video call", () => {
    // The in-app call is audio only — WebRTC with video: false. An option
    // the app cannot deliver is a promise broken at the moment the
    // customer needs the service.
    const offenders = allFields.flatMap(({ service, field }) =>
      (field.options ?? [])
        .filter((o) => /video/i.test(o.value) || /video/i.test(o.label))
        .map((o) => `${service}.${field.key} -> "${o.label}"`),
    );
    assert.deepEqual(offenders, [], offenders.join("\n"));
  });

  // Control: the scanner sees options at all, so the test above cannot
  // pass simply by finding nothing to look at.
  test("the scanner does read option labels", () => {
    const withOptions = allFields.filter(({ field }) => (field.options ?? []).length > 0);
    assert.ok(withOptions.length > 20, `only ${withOptions.length} fields have options`);
  });
});

// Three catalogues rendered service prices independently — the public
// page, the signed-in page and the booking form. Fixing "From $20" in two
// of them left the third saying it, so a customer browsing signed in saw
// a different price format from one browsing signed out.
import { readFileSync as read } from "node:fs";

describe("service prices are rendered in one place", () => {
  const CATALOGUES = [
    "app/_services-catalog.tsx",
    "app/(app)/services/view.tsx",
  ];

  test("no catalogue formats a price by hand", () => {
    const offenders = CATALOGUES.filter((f) =>
      /From \$\{?\$?\{?\(?s\.base_price_cents/.test(read(f, "utf8")),
    );
    assert.deepEqual(
      offenders, [],
      `these build a price string themselves instead of using ServicePriceLine:\n${offenders.join("\n")}`,
    );
  });

  test("every catalogue uses the shared component", () => {
    const missing = CATALOGUES.filter((f) => !read(f, "utf8").includes("ServicePriceLine"));
    assert.deepEqual(missing, [], `catalogues not using the shared price line:\n${missing.join("\n")}`);
  });

  // Control: the files exist and are being read, so neither assertion can
  // pass because the list is wrong.
  test("the catalogue list points at real files", () => {
    for (const f of CATALOGUES) {
      assert.ok(read(f, "utf8").length > 500, `${f} is missing or tiny`);
    }
  });
});

// The form quoted CA$ as soon as "Vancouver" appeared in the address BOX,
// so the price flipped mid-keystroke and flipped back once the address
// resolved. Currency follows the country the server verified, never a
// guess at what was typed.
describe("currency is never guessed from typed text", () => {
  test("no file infers a country from raw address text", () => {
    const FILES = [
      "app/(app)/new-request/view.tsx",
      "app/(app)/services/view.tsx",
      "app/_services-catalog.tsx",
    ];
    const offenders = FILES.filter((f) => {
      const src = read(f, "utf8");
      return /\/[^/\n]*\b(BC|British Columbia|Canada)\b[^/\n]*\/[a-z]*\.test\(/.test(src);
    });
    assert.deepEqual(
      offenders, [],
      `these guess currency from typed text instead of the verified country:\n${offenders.join("\n")}`,
    );
  });
});
