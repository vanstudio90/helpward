import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// A single-row read of an identity table must say WHICH row.
//
// profiles_read (migration 0002) exposes every provider's row to any
// authenticated user, so `.from("profiles").select(...).single()` with no
// filter matches 1 + <provider count> rows, returns PGRST116, and yields
// null. Null then reads as "this user has no profile", which is how a
// helper signing in got an infinite redirect: the provider layout saw a
// null role, sent them to /dashboard, and the customer layout sent them
// straight back. Chrome gave up with ERR_TOO_MANY_REDIRECTS.
//
// Ten call sites had this. One had already been found and fixed, with a
// comment explaining it; the comment did not stop the other nine.

const IDENTITY_TABLES = ["profiles", "provider_profiles", "customer_profiles"];

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.tsx?$/.test(full)) out.push(full);
  }
  return out;
}

describe("identity-table lookups are filtered", () => {
  test("every single-row read of an identity table names the row", () => {
    const offenders: string[] = [];
    const pattern = new RegExp(
      `\\.from\\(\\s*"(${IDENTITY_TABLES.join("|")})"\\s*\\)` +
        `([\\s\\S]{0,400}?)(\\.single\\(\\)|\\.maybeSingle\\(\\)|;)`,
      "g",
    );

    for (const file of [...sourceFiles("app"), ...sourceFiles("lib")]) {
      // Comments documenting the bug are not the bug.
      const src = readFileSync(file, "utf8")
        .split("\n")
        .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
        .join("\n");

      for (const m of src.matchAll(pattern)) {
        const [, table, between, terminator] = m;
        if (terminator === ";") continue;      // not a single-row read
        if (/\.eq\(/.test(between)) continue;  // filtered
        const line = src.slice(0, m.index).split("\n").length;
        offenders.push(`${file}:${line} — .from("${table}") … ${terminator} with no .eq()`);
      }
    }

    assert.deepEqual(
      offenders, [],
      `Unfiltered identity lookups will match every provider row and return null:\n${offenders.join("\n")}`,
    );
  });

  // Without this, the test above would pass if the regex simply matched
  // nothing — a broken pattern and a clean codebase look identical.
  test("the scanner actually recognises the broken shape", () => {
    const sample = `const { data } = await supabase.from("profiles").select("role").single();`;
    const pattern = /\.from\(\s*"(profiles)"\s*\)([\s\S]{0,400}?)(\.single\(\)|\.maybeSingle\(\))/g;
    const matches = [...sample.matchAll(pattern)];
    assert.equal(matches.length, 1, "scanner failed to see an unfiltered lookup");
    assert.ok(!/\.eq\(/.test(matches[0][2]), "scanner wrongly considered it filtered");
  });
});
