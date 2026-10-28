import test from "node:test";
import assert from "node:assert/strict";
import {
  isTerminal, isLive, ringsFor, endedMessage,
  applySession, dismiss, reconcile, NO_INCOMING,
} from "../lib/call/session-events.ts";

const ME = "me-uuid";
const THEM = "them-uuid";
const row = (over: Partial<{ id: string; status: string; started_by: string | null }> = {}) =>
  ({ id: "call-1", status: "ringing", started_by: THEM, ...over });

test("a call someone else started, still ringing, rings for me", () => {
  assert.equal(ringsFor(row(), ME), true);
});

test("my own outgoing call never rings for me", () => {
  assert.equal(ringsFor(row({ started_by: ME }), ME), false);
});

test("an already-connected call is not an invitation", () => {
  assert.equal(ringsFor(row({ status: "connected" }), ME), false);
});

test("every way a call can end counts as terminal", () => {
  for (const s of ["ended", "missed", "declined", "abandoned"]) {
    assert.equal(isTerminal(s), true, s);
    assert.equal(isLive(s), false, s);
  }
  assert.equal(isLive("ringing"), true);
  assert.equal(isLive("connected"), true);
});

test("a new ringing session becomes the incoming call", () => {
  const s = applySession(NO_INCOMING, row(), ME);
  assert.equal(s.callId, "call-1");
});

test("the session going terminal stops it ringing", () => {
  // This is what was missing: the caller's own view never learned the
  // call was over, and the callee's view could not clear it either.
  let s = applySession(NO_INCOMING, row(), ME);
  s = applySession(s, row({ status: "declined" }), ME);
  assert.equal(s.callId, null);
});

test("a declined call never rings again, even if a later read still sees it", () => {
  // The catch-up read can return a row written before the decline landed.
  let s = applySession(NO_INCOMING, row(), ME);
  s = dismiss(s, "call-1");
  assert.equal(s.callId, null);
  s = applySession(s, row(), ME);
  assert.equal(s.callId, null, "a dismissed call must stay dismissed");
});

test("a LATER call rings normally after an earlier one was declined", () => {
  // The retest's "repeat after a previous attempt ends" case.
  let s = applySession(NO_INCOMING, row(), ME);
  s = dismiss(s, "call-1");
  s = applySession(s, row({ id: "call-2" }), ME);
  assert.equal(s.callId, "call-2");
});

test("a terminal row for some other call does not clear the live one", () => {
  let s = applySession(NO_INCOMING, row(), ME);
  s = applySession(s, row({ id: "call-9", status: "ended" }), ME);
  assert.equal(s.callId, "call-1");
});

test("catch-up stops a call we think is ringing but which has ended", () => {
  // The socket missed the terminal event entirely. The read is what is
  // true now, so the stale ring has to go.
  let s = applySession(NO_INCOMING, row(), ME);
  s = reconcile(s, [], ME);
  assert.equal(s.callId, null);
});

test("catch-up discovers a call that started while we were not listening", () => {
  const s = reconcile(NO_INCOMING, [row({ id: "call-7" })], ME);
  assert.equal(s.callId, "call-7");
});

test("catch-up keeps a call that is genuinely still ringing", () => {
  let s = applySession(NO_INCOMING, row(), ME);
  s = reconcile(s, [row()], ME);
  assert.equal(s.callId, "call-1");
});

test("the caller is told WHICH way it ended, not just that it did", () => {
  assert.equal(endedMessage("declined", false), "Call declined.");
  assert.equal(endedMessage("missed", false), "No answer.");
  assert.equal(endedMessage("abandoned", false), "No answer.");
  // Once it connected, how it stopped is just "ended".
  assert.equal(endedMessage("declined", true), "Call ended.");
  assert.equal(endedMessage("ended", true), "Call ended.");
});
