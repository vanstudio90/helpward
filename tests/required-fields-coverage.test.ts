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
import { execSync } from "node:child_process";

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

// Safety claims have to be true. "Fully insured during the task" sat on
// the booking panel, the service detail panel and two social images —
// and insurance_active_until is written by NOTHING, so there was no
// policy behind any of it. "Background-checked" needed Checkr, which is
// not wired, so background_verified_at is never written either.
//
// Someone books a stranger into their home on the strength of these.
/**
 * Comments explaining a removed claim are not the claim.
 *
 * The first version of this only skipped lines beginning `//`, so the
 * JSX block comments describing WHY "Fully insured" was removed were
 * themselves read as the promise — the test failed on its own
 * explanation.
 */
function stripComments(src: string): string {
  return src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");
}

describe("trust claims match what the system can actually do", () => {
  const SURFACES = [
    "app/page.tsx",
    "app/layout.tsx",
    "app/opengraph-image.tsx",
    "app/providers/[id]/opengraph-image.tsx",
    "app/(app)/new-request/view.tsx",
    "app/(app)/services/view.tsx",
    "app/(app)/dashboard/onboarding-tour.tsx",
  ];

  test("nothing claims helpers are insured", () => {
    const offenders = SURFACES.filter((f) => {
      return /insured/i.test(stripComments(read(f, "utf8")));
    });
    assert.deepEqual(offenders, [], `these claim insurance that does not exist:\n${offenders.join("\n")}`);
  });

  test("nothing asserts background checks are run", () => {
    const offenders = SURFACES.filter((f) => {
      // A question ("Are helpers background-checked?") is fine; an
      // assertion that they are is not.
      return /background[- ]check(ed)?\s*(helpers?|providers?|humans?)|★ Background|✓ Background/i
        .test(stripComments(read(f, "utf8")));
    });
    assert.deepEqual(offenders, [], `these assert background checks that are not run:\n${offenders.join("\n")}`);
  });

  test("the surface list points at real files", () => {
    for (const f of SURFACES) assert.ok(read(f, "utf8").length > 200, `${f} missing`);
  });
});

// The claim sweep, as a standing check rather than a one-off.
//
// "$1M platform insurance" and "background-checked helpers" were spread
// across the homepage, the booking panel, provider profiles, city pages,
// service pages, help articles, blog posts, the comparison matrix and
// two social images. insurance_active_until is written by nothing;
// background_verified_at only by a Checkr webhook that is not wired.
describe("no surface claims insurance or screening we do not have", () => {
  // Kept on disk for the owner's decision and served as 410; competitor
  // columns describe other companies; job ads describe roles; and the
  // Checkr webhook and the DB column are the integration itself.
  const EXEMPT = [
    "safety/insurance", "safety/background-checks", "safety/transparency-report",
    "competitors.ts", "careers.ts", "webhooks/checkr", "supabase/types", "retired-pages",
  ];

  // Assertions of possession, not any mention of the words. Saying we do
  // NOT have insurance is the whole point of this work, so a check that
  // flagged every occurrence would fight its own fix — the first version
  // did exactly that, and failed on the sentence explaining the removal.
  const CLAIMS: Array<[RegExp, string]> = [
    [/\$1M|\$1 ?million/i, "a specific insurance figure"],
    [/(fully|platform|marketplace) insur(ed|ance)/i, "insurance we do not carry"],
    [/every helper (passes|goes through|is) [^.]{0,60}background.check/i,
      "background checks we do not run"],
    [/background.checked (helper|provider|human|worker)/i, "background-checked helpers"],
    [/(we|helpward) (require|run|ship|include)s? [^.]{0,30}(background.check|insurance)/i,
      "a capability we do not have"],
    [/covered by (helpward|our) [^.]{0,30}insurance/i, "cover that does not exist"],
  ];

  function surfaces(): string[] {
    return execSync(
      'grep -rl -iE "insured|insurance|background.check|\\$1M" --include="*.tsx" --include="*.ts" app lib components | grep -v node_modules',
      { encoding: "utf8" },
    ).trim().split("\n").filter(Boolean).filter((f) => !EXEMPT.some((e) => f.includes(e)));
  }

  test("nothing asserts insurance or screening Helpward does not have", () => {
    const offenders: string[] = [];
    for (const f of surfaces()) {
      const lines = stripComments(read(f, "utf8")).split("\n");
      for (const [i, line] of lines.entries()) {
        // A sentence that DENIES the thing is the fix, not the defect:
        // "we don't carry marketplace insurance" contains the phrase and
        // is precisely what this work was for.
        //
        // Two things the first version got wrong. The negation can sit
        // either side of the phrase, so the whole sentence is checked
        // rather than a lookahead. And JSX prose wraps, so "None of
        // that exists" lands on the NEXT line from the claim it denies —
        // a window of lines is read, not one.
        const window = lines.slice(Math.max(0, i - 1), i + 2).join(" ");
        const prose = window.replace(/&rsquo;|&apos;|&#39;/g, "'");
        if (/\b(not|no|don't|doesn't|without|never|isn't|aren't|behind|none)\b/i.test(prose)) continue;
        for (const [pattern, what] of CLAIMS) {
          if (pattern.test(line)) {
            offenders.push(`${f}:${i + 1} — ${what}\n    ${line.trim().slice(0, 96)}`);
            break;
          }
        }
      }
    }
    assert.deepEqual(offenders, [], `claims we cannot back:\n${offenders.join("\n")}`);
  });

  // Two controls, because a detector that matches nothing and a codebase
  // that claims nothing look identical from here.
  test("the sweep finds files to read", () => {
    assert.ok(surfaces().length > 3, `only ${surfaces().length} files scanned`);
  });

  test("the patterns still recognise the claims that were removed", () => {
    const REMOVED = [
      "Every booking is protected with up to $1M insurance coverage.",
      "Verified, background-checked provider",
      "Fully insured during the task",
      "We require background checks on every helper",
    ];
    for (const line of REMOVED) {
      assert.ok(
        CLAIMS.some(([p]) => p.test(line)),
        `the detector no longer recognises: "${line}"`,
      );
    }
  });
});
