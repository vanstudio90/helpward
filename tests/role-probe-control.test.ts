import test from "node:test";
import assert from "node:assert/strict";
import { classifyAnonControl } from "../scripts/lib/role-probe.mjs";

const DENIED = JSON.stringify({
  code: "42501", details: null, hint: null,
  message: "permission denied for function whoami_role",
});

test("the real rehearsal response is a demonstrated denial", () => {
  const r = classifyAnonControl(401, DENIED);
  assert.equal(r.verdict, "denied");
  assert.match(r.reason, /42501/);
});

test("403 with the same SQLSTATE also counts", () => {
  // PostgREST surfaces insufficient_privilege as 401 or 403 depending on
  // configuration; both are the same database refusal.
  assert.equal(classifyAnonControl(403, DENIED).verdict, "denied");
});

test("anon succeeding means the grant is wrong, not that the test passed", () => {
  const r = classifyAnonControl(200, '"service_role"');
  assert.equal(r.verdict, "allowed");
  assert.match(r.reason, /proves nothing/);
});

// --- the reported defect: absence of success is not presence of denial ---

test("a server error is inconclusive, never a pass", () => {
  for (const s of [500, 502, 503]) {
    const r = classifyAnonControl(s, "upstream error");
    assert.equal(r.verdict, "inconclusive", `status ${s}`);
    assert.match(r.reason, /did not run/);
  }
});

test("a 404 is a missing endpoint, not a denial", () => {
  const r = classifyAnonControl(404, JSON.stringify({ code: "PGRST202" }));
  assert.equal(r.verdict, "inconclusive");
  assert.match(r.reason, /schema cache/);
  assert.match(r.reason, /not a denial/);
});

test("a rate limit is inconclusive", () => {
  assert.equal(classifyAnonControl(429, "").verdict, "inconclusive");
});

test("401 for the WRONG reason is inconclusive", () => {
  // An invalid anon key is an authentication failure. It says nothing
  // about whether EXECUTE is restricted, which is what this control is
  // for — and it is exactly what a mistyped key would produce.
  const r = classifyAnonControl(401, JSON.stringify({ message: "Invalid API key" }));
  assert.equal(r.verdict, "inconclusive");
  assert.match(r.reason, /authentication failure/);
});

test("a malformed body cannot pass", () => {
  assert.equal(classifyAnonControl(401, "<html>gateway</html>").verdict, "inconclusive");
  assert.equal(classifyAnonControl(401, "").verdict, "inconclusive");
  assert.equal(classifyAnonControl(401, null).verdict, "inconclusive");
});

test("a network error cannot pass", () => {
  const r = classifyAnonControl(null, null, new Error("ECONNRESET"));
  assert.equal(r.verdict, "inconclusive");
  assert.match(r.reason, /never completed/);
});

test("only one verdict is ever a pass", () => {
  // Sweep the plausible space; nothing but 401/403 + 42501 may be "denied".
  const bodies = [DENIED, JSON.stringify({ code: "PGRST202" }), "", "not json", null];
  for (const s of [200, 301, 400, 401, 403, 404, 418, 429, 500, 503]) {
    for (const b of bodies) {
      const r = classifyAnonControl(s, b);
      if (r.verdict === "denied") {
        assert.ok((s === 401 || s === 403) && b === DENIED,
          `status ${s} with body ${String(b).slice(0, 20)} must not read as denied`);
      }
    }
  }
});
