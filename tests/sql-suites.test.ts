// Static checks on the SQL suites.
//
// These cannot prove SQL behaviour — only execution against a database can.
// They catch the class of defect that made the suites unrunnable without
// anyone noticing: a call to a helper that no longer exists aborts the whole
// file under ON_ERROR_STOP, silently skipping everything after it, including
// all of the negative controls.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

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

  test("quote_integrity: every disabled guard is captured and restored", () => {
    const sql = read("supabase/tests/quote_integrity.sql");

    // Each negative control replaces a real function with a no-op. If its
    // definition is not captured first AND executed again afterwards, the
    // control leaves a weakened function behind for every later assertion
    // in the same transaction.
    //
    // The previous version of this test asserted
    // `sql.includes("v_real_item") || sql.includes(fn)`, where the first
    // operand is true anywhere in the file — so it passed unconditionally
    // and established nothing per guard.
    const GUARDS: Array<[string, string]> = [
      ["v_real_item",   "public.enforce_bundle_item_quote()"],
      ["v_real_req",    "public.enforce_request_quote()"],
      ["v_real_attn",   "public.enforce_address_attestation()"],
      ["v_real_accept", "public.accept_request(uuid,uuid)"],
    ];

    for (const [variable, signature] of GUARDS) {
      // The specific capture assignment, for this exact function.
      const capture = new RegExp(
        `${variable}\\s*:=\\s*pg_get_functiondef\\(\\s*to_regprocedure\\(\\s*'${
          signature.replace(/[().]/g, (c) => `\\${c}`)
        }'`,
      );
      assert.match(
        sql, capture,
        `${variable} must capture ${signature} before it is replaced`,
      );

      // And the matching restoration.
      const restore = new RegExp(`execute\\s+${variable}\\s*;`);
      assert.match(
        sql, restore,
        `${signature} is captured into ${variable} but never restored with "execute ${variable};"`,
      );

      // The no-op replacement must come between them, otherwise the pairing
      // is decorative.
      const iCapture = sql.search(capture);
      const iRestore = sql.search(restore);
      assert.ok(
        iCapture < iRestore,
        `${variable} must be captured before it is restored`,
      );
    }

    // Each guard must actually be disabled somewhere, or the control is not
    // testing anything.
    for (const fn of [
      "enforce_bundle_item_quote", "enforce_request_quote",
      "enforce_address_attestation",
    ]) {
      const noop = new RegExp(
        `create or replace function public\\.${fn}\\(\\)[\\s\\S]{0,400}?\\$noop\\$`,
        "i",
      );
      assert.match(sql, noop, `${fn} must be replaced with a no-op by its negative control`);
    }

    // accept_request is weakened by rewriting its body, not by a no-op.
    assert.match(
      sql,
      /execute replace\(v_real_accept,[\s\S]{0,300}?compute_bundle_fingerprint/,
      "control D must strip the fingerprint comparison from accept_request",
    );

    // And the suite must check its own restoration at the end.
    assert.match(sql, /a real guard definition was not restored/,
      "the suite must assert its own restoration");
  });
});

// ---------------------------------------------------------------------------
// Static checks on error handling at write boundaries.
//
// Static, not behavioural: they assert the shape of the code, not that it
// behaves correctly at runtime. They exist because a live audit found an
// action that rendered an error page AFTER committing a row — the customer
// was told it failed while the work existed, so a retry duplicated it.
// ---------------------------------------------------------------------------
describe("best-effort work is actually guarded", () => {
  test("series creation tolerates a materialisation failure", () => {
    const src = readFileSync(
      new URL("../app/(app)/bookings/series/actions.ts", import.meta.url), "utf8",
    );
    // The call must sit inside a try, and the action must still return the
    // committed series id. An unguarded await propagates into Next's error
    // boundary with the series already written.
    const guarded =
      /try\s*\{[^}]*await\s+materialiseNextOccurrence\(series\.id\)/s.test(src);
    assert.ok(guarded, "materialiseNextOccurrence(series.id) must be inside a try block");
    assert.match(
      src, /seriesId:\s*series\.id/,
      "the committed series id must be returned so the caller can redirect to real state",
    );
  });

  test("broadcast is best-effort at every call site", () => {
    for (const f of [
      "app/(app)/new-request/actions.ts",
      "app/(app)/bookings/series/actions.ts",
    ]) {
      const src = readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
      // Must go through the shared helper, which try/catches internally.
      // A direct .catch() on a Postgrest builder throws: builders implement
      // then() only.
      assert.doesNotMatch(
        src, /\.rpc\((["'])broadcast_request\1[\s\S]{0,200}?\.catch\(/,
        `${f}: .catch() on a Postgrest builder throws — use broadcastRequestBestEffort`,
      );
    }
  });

  test("the app calls no RPC that only a deploy-coupled migration provides", () => {
    // The deploy order applies restrictive migrations AFTER the app, so an
    // RPC the app calls must already exist at that moment — either from the
    // long-applied baseline (0001-0028) or from this release's pre-deploy
    // set. If it is provided ONLY by a deploy-coupled migration, the app
    // calls a missing function in the window between deploy and migrate.
    // That is exactly the hole that would have broken every bundle
    // submission.
    const DEPLOY_COUPLED = ["0036", "0038"];
    const appSrc = [
      "app/(app)/new-request/actions.ts",
      "app/(app)/bookings/series/actions.ts",
      "lib/service-area-check.ts",
    ].map((f) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8")).join("\n");

    const called = new Set(
      [...appSrc.matchAll(/\.rpc\(\s*["'](\w+)["']/g)].map((m) => m[1]),
    );
    // broadcast_request is best-effort: the request already exists and the
    // shared helper swallows its absence, so it may come from 0038.
    called.delete("broadcast_request");

    const migrations = readdirSync(new URL("../supabase/migrations", import.meta.url))
      .filter((m) => m.endsWith(".sql"));

    for (const fn of called) {
      const providers = migrations.filter((m) =>
        readFileSync(new URL(`../supabase/migrations/${m}`, import.meta.url), "utf8")
          .includes(`create or replace function public.${fn}`),
      );
      assert.ok(providers.length > 0, `${fn} is called but no migration defines it`);
      const onlyDeployCoupled = providers.every((m) =>
        DEPLOY_COUPLED.some((d) => m.startsWith(d)),
      );
      assert.ok(
        !onlyDeployCoupled,
        `${fn} is provided only by ${providers.join(", ")}, which is applied AFTER the deploy — the app would call a missing function in that window`,
      );
    }
  });
});
