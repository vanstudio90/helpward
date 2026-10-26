import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { one, many } from "@/lib/supabase/relation";

// The bug this prevents: a UNIQUE embedded relation arrives as an OBJECT,
// and reading `[0]` off it yields undefined. On the booking detail page
// that silently removed the Message link — the conversation existed, chat
// worked from the nav, and the booking's own shortcut was simply absent.
// Nothing threw, so nothing surfaced it.

describe("embedded relation normalisation", () => {
  test("an object embed (to-one) is returned as itself", () => {
    const convo = { id: "c1" };
    assert.deepEqual(one(convo), convo);
  });

  test("the shape that broke the booking page", () => {
    const convo = { id: "c1" };
    // What the page used to do:
    assert.equal((convo as unknown as Array<{ id: string }>)[0], undefined);
    // What it does now:
    assert.deepEqual(one(convo), convo);
  });

  test("an array embed returns its first row", () => {
    assert.deepEqual(one([{ id: "a" }, { id: "b" }]), { id: "a" });
  });

  test("empty and null are both null, not undefined", () => {
    assert.equal(one([]), null);
    assert.equal(one(null), null);
    assert.equal(one(undefined), null);
  });

  test("many() accepts either shape", () => {
    assert.deepEqual(many([{ id: "a" }]), [{ id: "a" }]);
    assert.deepEqual(many({ id: "a" }), [{ id: "a" }]);
    assert.deepEqual(many(null), []);
  });
});
