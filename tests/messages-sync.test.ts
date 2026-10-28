import test from "node:test";
import assert from "node:assert/strict";
import {
  mergeMessages, catchUpSince, connectionStateFor, nextPollDelayMs,
} from "../lib/messages/sync.ts";

const m = (id: string, created_at: string, body = id) => ({ id, created_at, body });

test("merge keeps one copy when the socket repeats our own optimistic insert", () => {
  const held = [m("a", "2026-10-27T10:00:00Z")];
  const merged = mergeMessages(held, [m("a", "2026-10-27T10:00:00Z")]);
  assert.equal(merged.length, 1);
});

test("merge orders by time, not by arrival", () => {
  // The catch-up fetch returns an OLDER message than one already held,
  // which is exactly what happens when a message is missed and a later
  // one arrives live before the gap is filled.
  const held = [m("late", "2026-10-27T10:05:00Z")];
  const merged = mergeMessages(held, [m("missed", "2026-10-27T10:01:00Z")]);
  assert.deepEqual(merged.map((x) => x.id), ["missed", "late"]);
});

test("messages sharing a timestamp get a stable order in both views", () => {
  const ts = "2026-10-27T10:00:00Z";
  const one = mergeMessages([], [m("b", ts), m("a", ts)]);
  const two = mergeMessages([], [m("a", ts), m("b", ts)]);
  assert.deepEqual(one.map((x) => x.id), two.map((x) => x.id));
});

test("the server's version of a row replaces the optimistic one", () => {
  const optimistic = { id: "a", created_at: "2026-10-27T10:00:00Z", body: "draft" };
  const fromServer = { id: "a", created_at: "2026-10-27T10:00:01Z", body: "stored" };
  const merged = mergeMessages([optimistic], [fromServer]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].body, "stored");
});

test("merging nothing returns the same array so React does not re-render", () => {
  const held = [m("a", "2026-10-27T10:00:00Z")];
  assert.equal(mergeMessages(held, []), held);
  assert.equal(mergeMessages(held, [held[0]]), held);
});

test("catch-up overlaps by a second so a same-timestamp message is not lost forever", () => {
  const since = catchUpSince([m("a", "2026-10-27T10:00:00.000Z")]);
  assert.equal(since, "2026-10-27T09:59:59.000Z");
});

test("catch-up asks for the whole thread when nothing is held", () => {
  assert.equal(catchUpSince([]), null);
});

test("catch-up uses the newest held message, whatever order they are in", () => {
  const since = catchUpSince([
    m("c", "2026-10-27T10:09:00.000Z"),
    m("a", "2026-10-27T10:01:00.000Z"),
  ]);
  assert.equal(since, "2026-10-27T10:08:59.000Z");
});

test("only SUBSCRIBED counts as live", () => {
  assert.equal(connectionStateFor("SUBSCRIBED"), "live");
  for (const s of ["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"]) {
    assert.equal(connectionStateFor(s), "retrying", s);
  }
  assert.equal(connectionStateFor("JOINING"), "connecting");
});

test("polling backs off but never stops", () => {
  assert.equal(nextPollDelayMs(0), 2_000);
  assert.ok(nextPollDelayMs(5) > nextPollDelayMs(0));
  // A tab open for an hour on a dead socket still polls.
  assert.ok(nextPollDelayMs(9_999) > 0);
  assert.ok(nextPollDelayMs(9_999) <= 15_000);
});
