import test from "node:test";
import assert from "node:assert/strict";
import { callDisplay, type DisplayInput } from "../lib/call/display.ts";

const base: DisplayInput = {
  phase: "idle",
  incomingCallId: null,
  currentCallId: null,
  endedText: "Call ended.",
  counterpartName: "QA Customer",
  seconds: 0,
};
const d = (over: Partial<DisplayInput> = {}) => callDisplay({ ...base, ...over });

// --- the reported defect ---------------------------------------------

test("a new incoming call never shows the PREVIOUS call's ending", () => {
  // The exact reported state: this side hung up call #2, so phase is
  // terminal and endedText is "Call ended."; the customer then started
  // call #3, which is ringing now.
  const r = d({
    phase: "ended",
    endedText: "Call ended.",
    currentCallId: "call-2",
    incomingCallId: "call-3",
  });
  assert.equal(r.status, "QA Customer is calling.");
  assert.equal(r.controls, "answer-decline");
  assert.ok(!r.status.includes("ended"), "the stale label must not survive");
});

test("the same holds after a DECLINE, not just a hang-up", () => {
  const r = d({
    phase: "ended",
    endedText: "Call declined.",
    currentCallId: "call-1",
    incomingCallId: "call-2",
  });
  assert.equal(r.status, "QA Customer is calling.");
  assert.equal(r.controls, "answer-decline");
});

test("and after a failed attempt", () => {
  const r = d({ phase: "failed", currentCallId: "call-1", incomingCallId: "call-2" });
  assert.equal(r.status, "QA Customer is calling.");
  assert.equal(r.controls, "answer-decline");
});

test("the label and the controls can never disagree", () => {
  // The bug class: two expressions deciding the same thing. Exhaust the
  // combinations and assert they always agree.
  const phases = ["idle", "ringing", "connecting", "connected", "ended", "failed"] as const;
  for (const phase of phases) {
    for (const incomingCallId of [null, "call-new", "call-same"]) {
      for (const currentCallId of [null, "call-same"]) {
        const r = d({ phase, incomingCallId, currentCallId });
        assert.equal(
          r.controls === "answer-decline", r.ringingIn,
          `controls and ringing disagree at ${phase}/${incomingCallId}/${currentCallId}`,
        );
        if (r.ringingIn) {
          assert.match(r.status, /is calling\.$/,
            `ringing but status is "${r.status}" at ${phase}`);
        } else {
          assert.ok(!r.status.endsWith("is calling."),
            `not ringing but status claims a call at ${phase}`);
        }
      }
    }
  }
});

// --- the sequence the retest actually ran ----------------------------

test("the full three-call sequence reads correctly at every step", () => {
  // 1. Worker opens the booking. Nothing has happened.
  let r = d({ phase: "idle" });
  assert.equal(r.status, "This service is delivered by call.");
  assert.equal(r.controls, "start");

  // 2. Worker starts call #1. Ringing out.
  r = d({ phase: "ringing", currentCallId: "call-1" });
  assert.equal(r.status, "Calling — waiting for them to pick up…");
  assert.equal(r.controls, "in-call");

  // 3. Customer declines. The caller is told WHICH way it ended.
  r = d({ phase: "ended", currentCallId: "call-1", endedText: "Call declined." });
  assert.equal(r.status, "Call declined.");
  assert.equal(r.controls, "start");

  // 4. Worker starts call #2, customer answers, media flows.
  r = d({ phase: "connected", currentCallId: "call-2", seconds: 36 });
  assert.equal(r.status, "0:36");
  assert.equal(r.heading, "On a call with QA Customer");
  assert.equal(r.controls, "in-call");

  // 5. Worker hangs up.
  r = d({ phase: "ended", currentCallId: "call-2", endedText: "Call ended." });
  assert.equal(r.status, "Call ended.");

  // 6. Customer starts call #3 — THE REPORTED STEP.
  r = d({
    phase: "ended", currentCallId: "call-2",
    endedText: "Call ended.", incomingCallId: "call-3",
  });
  assert.equal(r.status, "QA Customer is calling.");
  assert.equal(r.controls, "answer-decline");
  assert.equal(r.showMicReassurance, true);

  // 7. Worker answers it.
  r = d({ phase: "connecting", currentCallId: "call-3", incomingCallId: "call-3" });
  assert.equal(r.status, "Connecting audio…");
  assert.equal(r.controls, "in-call");

  // 8. Connected, then the customer hangs up.
  r = d({ phase: "connected", currentCallId: "call-3", incomingCallId: "call-3", seconds: 35 });
  assert.equal(r.status, "0:35");
  r = d({ phase: "ended", currentCallId: "call-3", incomingCallId: null, endedText: "Call ended." });
  assert.equal(r.status, "Call ended.");
  assert.equal(r.controls, "start");
});

// --- things that must NOT ring ---------------------------------------

test("the call we are already on does not ring at us", () => {
  const r = d({ phase: "connected", currentCallId: "call-1", incomingCallId: "call-1", seconds: 5 });
  assert.equal(r.ringingIn, false);
  assert.equal(r.controls, "in-call");
});

test("a call we just finished does not ring again", () => {
  const r = d({ phase: "ended", currentCallId: "call-1", incomingCallId: "call-1" });
  assert.equal(r.ringingIn, false);
  assert.equal(r.controls, "start");
});

test("an incoming call while we are mid-connect does not steal the screen", () => {
  const r = d({ phase: "connecting", currentCallId: "call-1", incomingCallId: "call-9" });
  assert.equal(r.ringingIn, false);
  assert.equal(r.controls, "in-call");
});

test("placing a call and answering one read differently while connecting", () => {
  assert.equal(d({ phase: "connecting", currentCallId: "c" }).status, "Starting call…");
  assert.equal(
    d({ phase: "connecting", currentCallId: "c", incomingCallId: "c" }).status,
    "Connecting audio…",
  );
});

test("the clock pads seconds", () => {
  assert.equal(d({ phase: "connected", seconds: 5 }).status, "0:05");
  assert.equal(d({ phase: "connected", seconds: 65 }).status, "1:05");
  assert.equal(d({ phase: "connected", seconds: 600 }).status, "10:00");
});
