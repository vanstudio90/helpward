import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { decideSignal, replay } from "@/lib/call/signal-order";

// The customer console filled with:
//   InvalidStateError: Failed to execute 'addIceCandidate' …
//   The remote description was null
// and every one of those candidates was discarded. The customer sat on
// "Calling — waiting for them to pick up" while the helper showed a
// running timer.

describe("a candidate that arrives before its description", () => {
  test("waits instead of being thrown away", () => {
    const d = decideSignal("ice", { fromSelf: false, seen: false, hasRemoteDescription: false });
    assert.equal(d.action, "buffer");
  });

  test("applies normally once a description exists", () => {
    const d = decideSignal("ice", { fromSelf: false, seen: false, hasRemoteDescription: true });
    assert.equal(d.action, "apply");
  });

  test("an offer is never buffered — it is what ends the wait", () => {
    // Buffering an offer would deadlock: the candidates wait for a
    // description that nothing is left to create.
    for (const kind of ["offer", "answer"] as const) {
      const d = decideSignal(kind, { fromSelf: false, seen: false, hasRemoteDescription: false });
      assert.equal(d.action, "apply", `${kind} must not be buffered`);
    }
  });
});

describe("the real arrival order", () => {
  test("candidates overtaking the offer are flushed after it", () => {
    // Exactly what the console showed: ICE first, offer second.
    const { applied, buffered } = replay([
      { id: 1, kind: "ice" },
      { id: 2, kind: "ice" },
      { id: 3, kind: "offer" },
      { id: 4, kind: "ice" },
    ]);

    assert.deepEqual(
      applied.map((a) => `${a.id}:${a.kind}`),
      ["3:offer", "1:ice", "2:ice", "4:ice"],
      "the offer must land first, then everything that was waiting, in order",
    );
    assert.deepEqual(buffered, [], "nothing should still be waiting");
  });

  test("no candidate is lost", () => {
    const sent = [
      { id: 1, kind: "ice" as const }, { id: 2, kind: "ice" as const },
      { id: 3, kind: "offer" as const }, { id: 4, kind: "ice" as const },
      { id: 5, kind: "ice" as const },
    ];
    const { applied } = replay(sent);
    assert.equal(applied.length, sent.length, "a dropped candidate is a lost network path");
  });

  test("a duplicate delivery is applied once", () => {
    // The catch-up read and the subscription overlap by design.
    const { applied } = replay([
      { id: 7, kind: "offer" },
      { id: 8, kind: "ice" },
      { id: 7, kind: "offer" },   // same row, second path
      { id: 8, kind: "ice" },
    ]);
    assert.deepEqual(applied.map((a) => a.id), [7, 8]);
  });

  test("our own signals are ignored", () => {
    const { applied } = replay([
      { id: 1, kind: "offer", fromSelf: true },
      { id: 2, kind: "answer" },
    ]);
    assert.deepEqual(applied.map((a) => a.id), [2]);
  });

  test("candidates with no description at all stay buffered, not applied", () => {
    // A call where the offer never arrives must not pretend to progress.
    const { applied, buffered } = replay([
      { id: 1, kind: "ice" },
      { id: 2, kind: "ice" },
    ]);
    assert.deepEqual(applied, []);
    assert.deepEqual(buffered, [1, 2]);
  });

  test("the answerer's sequence works too", () => {
    const { applied, buffered } = replay([
      { id: 1, kind: "offer" },
      { id: 2, kind: "ice" },
      { id: 3, kind: "ice" },
    ]);
    assert.deepEqual(applied.map((a) => a.id), [1, 2, 3]);
    assert.deepEqual(buffered, []);
  });
});
