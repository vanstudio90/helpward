// What the call panel should SAY and SHOW, derived in one place.
//
// The panel used to work this out inline across three JSX expressions
// that each re-tested the same conditions. The precedence was right, but
// "right" was a property of how those expressions happened to be
// ordered, not of anything stated once and checked — and independent
// testing reported a stale "Call ended." sitting above working
// Answer/Decline buttons.
//
// The deeper problem is that two pieces of state describe "what is
// happening" and they can legitimately disagree: `phase` is terminal
// because the LAST call ended, while an incoming call is ringing right
// now. Nothing reconciled them except render order. So the reconciliation
// is stated here, once, and tested against the exact sequence that was
// reported.
//
// Rule: a call ringing NOW outranks anything a previous call left behind.

export type CallPhase = "idle" | "ringing" | "connecting" | "connected" | "ended" | "failed";

export type DisplayInput = {
  phase: CallPhase;
  /** A call someone else started that is ringing for us, if any. */
  incomingCallId: string | null;
  /** The call this side is on or was last on. */
  currentCallId: string | null;
  /** How the last attempt ended — "Call declined.", "No answer.", … */
  endedText: string;
  counterpartName: string;
  seconds: number;
};

export type Controls = "in-call" | "answer-decline" | "start";

export type CallDisplay = {
  /** The one line under the name. */
  status: string;
  /** Which set of buttons. */
  controls: Controls;
  /** Heading above the status line. */
  heading: string;
  /** Whether a call is ringing for us right now. */
  ringingIn: boolean;
  /** Show the "microphone stays off until you answer" reassurance. */
  showMicReassurance: boolean;
};

/** Are we on a call right now (as opposed to between calls)? */
function onACall(phase: CallPhase): boolean {
  return phase === "ringing" || phase === "connecting" || phase === "connected";
}

function clock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function callDisplay(input: DisplayInput): CallDisplay {
  const {
    phase, incomingCallId, currentCallId, endedText, counterpartName, seconds,
  } = input;

  // A call is offered to us when there is one, we are not already on a
  // call, and it is not the call we are already on or just finished.
  const ringingIn =
    incomingCallId != null && !onACall(phase) && incomingCallId !== currentCallId;

  if (ringingIn) {
    // Deliberately NOT falling through to the phase switch. A terminal
    // phase from the previous call says nothing about this one, and
    // showing it is how "Call ended." ended up above a live Answer
    // button.
    return {
      status: `${counterpartName} is calling.`,
      controls: "answer-decline",
      heading: counterpartName,
      ringingIn: true,
      showMicReassurance: true,
    };
  }

  const heading = phase === "connected"
    ? `On a call with ${counterpartName}`
    : counterpartName;

  const status = (() => {
    switch (phase) {
      case "idle": return "This service is delivered by call.";
      case "ringing": return "Calling — waiting for them to pick up…";
      // Answering an incoming call and placing one look different to the
      // person doing them.
      case "connecting": return incomingCallId ? "Connecting audio…" : "Starting call…";
      case "connected": return clock(seconds);
      case "ended": return endedText;
      case "failed": return "Couldn't connect.";
    }
  })();

  return {
    status,
    controls: onACall(phase) ? "in-call" : "start",
    heading,
    ringingIn: false,
    showMicReassurance: false,
  };
}
