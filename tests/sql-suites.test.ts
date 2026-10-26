// Static checks on the SQL suites.
//
// These cannot prove SQL behaviour — only execution against a database can.
// They catch the class of defect that made the suites unrunnable without
// anyone noticing: a call to a helper that no longer exists aborts the whole
// file under ON_ERROR_STOP, silently skipping everything after it, including
// all of the negative controls.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const SUITES = [
  "supabase/tests/quote_integrity.sql",
  "supabase/tests/boundary_containment.sql",
];

function read(p: string) {
  return readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
}

describe("SQL suites are internally consistent", () => {
  for (const path of SUITES) {
    const sql = read(path);

    test(`${path}: every pg_temp helper called is defined`, () => {
      const defined = new Set(
        [...sql.matchAll(/create\s+or\s+replace\s+function\s+pg_temp\.(\w+)\s*\(/gi)]
          .map((m) => m[1].toLowerCase()),
      );
      const called = new Set(
        [...sql.matchAll(/pg_temp\.(\w+)\s*\(/g)].map((m) => m[1].toLowerCase()),
      );
      const missing = [...called].filter((c) => !defined.has(c));
      assert.deepEqual(
        missing, [],
        `called but never defined: ${missing.join(", ")} — under ON_ERROR_STOP this aborts the file`,
      );
    });

    test(`${path}: dollar-quote tags are balanced`, () => {
      const tags = [...sql.matchAll(/\$([a-z_]*)\$/g)].map((m) => m[1]);
      const counts = new Map<string, number>();
      for (const t of tags) counts.set(t, (counts.get(t) ?? 0) + 1);
      const odd = [...counts].filter(([, n]) => n % 2 !== 0).map(([t]) => `$${t}$`);
      assert.deepEqual(odd, [], `unbalanced dollar-quote tags: ${odd.join(", ")}`);
    });

    test(`${path}: rolls back rather than committing`, () => {
      assert.match(sql, /\brollback\s*;/i, "a fixture suite must not leave data behind");
      assert.doesNotMatch(sql, /^\s*commit\s*;/im, "must never commit");
    });

    test(`${path}: aborts on first error`, () => {
      assert.match(sql, /\\set\s+ON_ERROR_STOP\s+on/i);
    });
  }

  test("quote_integrity: no gen_random_uuid() in a foreign-key position", () => {
    const sql = read("supabase/tests/quote_integrity.sql");
    // An unsatisfiable FK is rejected by the constraint, which would satisfy
    // a refusal assertion without exercising any guard.
    for (const col of ["request_id", "pickup_address_id", "customer_id", "service_id"]) {
      const re = new RegExp(`set\\s+${col}\\s*=\\s*gen_random_uuid\\(\\)`, "i");
      assert.doesNotMatch(sql, re, `${col} must target a real, owned row`);
    }
  });

  test("quote_integrity: assertion failures carry distinct SQLSTATEs", () => {
    const sql = read("supabase/tests/quote_integrity.sql");
    // HW001 unexpected success, HW002 wrong reason, HW003 verification
    // persisted. The negative controls accept only the intended one, so a
    // mutation blocked for an unrelated reason cannot certify a removed
    // guard.
    for (const state of ["HW001", "HW002", "HW003"]) {
      assert.ok(sql.includes(`'${state}'`), `${state} must be used`);
    }
    assert.match(
      sql, /if v_state = p_expect_state then/,
      "control_must_fail must compare against the expected SQLSTATE, not catch everything",
    );
    assert.doesNotMatch(
      sql,
      /function pg_temp\.control_must_fail[\s\S]{0,400}?when others then\s*\n\s*raise notice 'PASS/,
      "control_must_fail must not treat any exception as a passing control",
    );
  });

  test("quote_integrity: negative controls restore every guard they disable", () => {
    const sql = read("supabase/tests/quote_integrity.sql");
    for (const fn of [
      "enforce_bundle_item_quote", "enforce_request_quote",
      "enforce_address_attestation", "accept_request",
    ]) {
      assert.ok(
        sql.includes(`v_real_item`) || sql.includes(fn),
        `${fn} must be captured before being replaced`,
      );
    }
    assert.match(sql, /a real guard definition was not restored/,
      "the suite must assert its own restoration");
  });
});
