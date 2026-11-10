import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

/*
  A REASON THE DISPATCHER CANNOT RECORD IS A BROADCAST THAT DISAPPEARS.

  `record_dispatch_refusal` inserts the string it is handed. The column
  has a CHECK, so a reason outside that list raises — inside
  broadcast_request, which unwinds the whole call, which
  broadcastRequestBestEffort then swallows by design. The customer's
  request stays in 'matching' with no offers, no refusal row and no
  admin notification.

  That is not hypothetical: 0088 renamed three refusal paths
  (`placeholder_point`, `no_providers_in_range`,
  `no_review_helper_online`) and did not touch 0034's CHECK, so the
  ordinary "nobody near enough" path has been throwing in production.
  0097 widened the list.

  The two halves are written in different files by different people
  months apart, which is exactly why this reads them both and compares
  them rather than trusting either.
*/

const DIR = "supabase/migrations";
const FILES = readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();

/** Reason literals handed to record_dispatch_refusal, anywhere. */
function reasonsEmitted(): Map<string, string[]> {
  const found = new Map<string, string[]>();
  for (const file of FILES) {
    const sql = readFileSync(`${DIR}/${file}`, "utf8");
    for (const call of sql.matchAll(/record_dispatch_refusal\s*\(([\s\S]{0,400}?)\)\s*;/g)) {
      /*
        Detail strings are sentences with spaces, so they cannot be
        mistaken for a reason. COMPARISONS can: the boundary path reads
        `case when v_boundary = 'no_dataset' then 'boundary_no_dataset'`,
        and only the second of those is ever inserted. Anything on the
        right of an `=` is a test, not a value, so it goes first.
      */
      const args = call[1].replace(/[\w.]+\s*(?:=|<>|!=)\s*'[a-z_]+'/g, "");
      for (const literal of args.matchAll(/'([a-z][a-z_]*)'/g)) {
        found.set(literal[1], [...(found.get(literal[1]) ?? []), file]);
      }
    }
  }
  return found;
}

/** The CHECK as the LAST migration to define it leaves it. */
function reasonsAllowed(): { file: string; reasons: Set<string> } {
  let winner: { file: string; reasons: Set<string> } | null = null;
  for (const file of FILES) {
    const sql = readFileSync(`${DIR}/${file}`, "utf8");
    if (!sql.includes("dispatch_refusals")) continue;
    const match = sql.match(/reason\s+in\s*\(([\s\S]*?)\)\s*\)/);
    if (!match) continue;
    const reasons = new Set(
      [...match[1].matchAll(/'([a-z][a-z_]*)'/g)].map((m) => m[1]),
    );
    if (reasons.size) winner = { file, reasons };
  }
  if (!winner) throw new Error("no dispatch_refusals CHECK found in any migration");
  return winner;
}

test("every refusal reason the dispatcher emits is one the table accepts", () => {
  const emitted = reasonsEmitted();
  const { file, reasons } = reasonsAllowed();
  assert.ok(emitted.size > 0, "no record_dispatch_refusal calls found — has the name changed?");

  for (const [reason, files] of emitted) {
    assert.ok(
      reasons.has(reason),
      `record_dispatch_refusal is called with '${reason}' (${files.join(", ")}), `
        + `which the CHECK in ${file} does not allow. The insert raises inside `
        + `broadcast_request, the broadcast is lost, and nothing is recorded.`,
    );
  }
});

/*
  WHO MAY START A DISPATCH.

  0036 revoked execute from authenticated and wrote down why; 0038
  revoked it again; 0088 granted it back in its closing lines. It is
  SECURITY DEFINER and takes a request id, so that grant let any
  signed-in account broadcast somebody else's request. Every real caller
  uses the service client.
*/
test("broadcast_request stays service-role only", () => {
  /*
    REPLAYED IN ORDER, because the answer is the LAST word on it.

    0036 revoked, 0038 revoked again, 0088 granted it back, 0097 revokes
    and re-grants service_role in that order — reading any single
    statement gives the wrong answer, and reading the last GRANT alone
    gave the wrong answer for 0097, which revokes after it grants.
  */
  const granted = new Set<string>();
  let touched: string | null = null;
  const roles = (list: string) =>
    list.split(",").map((r) => r.trim().toLowerCase()).filter(Boolean);

  for (const file of FILES) {
    const sql = readFileSync(`${DIR}/${file}`, "utf8");
    const statements = [
      ...sql.matchAll(
        /(grant|revoke)\s+execute\s+on\s+function\s+public\.broadcast_request\s*\([^)]*\)\s+(?:to|from)\s+([^;]+);/gi,
      ),
    ].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));

    for (const statement of statements) {
      touched = file;
      const verb = statement[1].toLowerCase();
      for (const role of roles(statement[2])) {
        if (verb === "grant") granted.add(role);
        else granted.delete(role);
      }
    }
  }

  assert.ok(touched, "no grant or revoke on broadcast_request found in any migration");
  assert.ok(
    granted.has("service_role"),
    `after ${touched}, service_role cannot execute broadcast_request — dispatch would stop`,
  );
  for (const role of ["authenticated", "anon", "public"]) {
    assert.ok(
      !granted.has(role),
      `after ${touched}, ${role} can execute broadcast_request. It is SECURITY DEFINER and `
        + `takes any request id; every real caller uses the service client.`,
    );
  }
});
