import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

/*
  WHAT A match_attempts.response ACTUALLY SAYS.

  There are exactly three answers, and every screen that reports a
  helper's acceptance rate has to agree with them:

    'accept'   the helper took the job
    'decline'  the helper turned it down
    'timeout'  somebody else accepted first, so this attempt was closed
               for them (accept_request stamps the losing candidates)
    null       still open

  The iOS app's Insights screen was written against "accepted" and
  "declined" — plausible, English, and written by nothing. Every branch
  fell through and a helper with 95 accepts and 6 declines was shown
  "Nothing answered yet"; 'timeout' matched only by accident. The app
  now carries a catch-all so a rename cannot silently zero a counter,
  but a catch-all is a fallback, not a contract.

  This test is the contract: the values are pinned where they are
  WRITTEN, so renaming one in a migration fails here rather than in a
  screen that quietly reports zero. The literals are assembled from
  fragments so that a repo-wide search-and-replace cannot rewrite the
  very strings being asserted.
*/
const ACCEPT = "acc" + "ept";
const DECLINE = "dec" + "line";
const TIMEOUT = "time" + "out";
const ALLOWED = new Set([ACCEPT, DECLINE, TIMEOUT]);

/** Every `response = '<literal>'` any migration writes. */
function writtenValues(): Map<string, string[]> {
  const found = new Map<string, string[]>();
  const dir = "supabase/migrations";
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql"))) {
    const sql = readFileSync(`${dir}/${file}`, "utf8");
    for (const m of sql.matchAll(/response\s*=\s*'([a-z_]+)'/g)) {
      found.set(m[1], [...(found.get(m[1]) ?? []), file]);
    }
  }
  return found;
}

test("migrations write only the three responses the apps count", () => {
  const written = writtenValues();
  assert.ok(written.size > 0, "no `response = '...'` writes found — has the pattern changed?");
  for (const [value, files] of written) {
    assert.ok(
      ALLOWED.has(value),
      `migrations write response '${value}' (${files.join(", ")}), which no screen counts. ` +
        `Add it to the readers — lib/data/helper-analytics.ts and HelperInsightsService.swift ` +
        `in the iOS app — or keep to ${[...ALLOWED].join("/")}.`,
    );
  }
});

test("accepting and declining are both still written", () => {
  // The two a helper does deliberately. A renamed 'decline' is the
  // change that would make an acceptance rate read 100%.
  const written = writtenValues();
  assert.ok(written.has(ACCEPT), `nothing writes response '${ACCEPT}' any more`);
  assert.ok(written.has(DECLINE), `nothing writes response '${DECLINE}' any more`);
  assert.ok(written.has(TIMEOUT), `nothing writes response '${TIMEOUT}' any more`);
});

test("the analytics reader compares against the written value", () => {
  const src = readFileSync("lib/data/helper-analytics.ts", "utf8");
  assert.ok(
    src.includes(`=== "${ACCEPT}"`),
    `helper-analytics.ts no longer tests for '${ACCEPT}', so its acceptance rate is not one`,
  );
});
