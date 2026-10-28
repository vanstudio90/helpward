// What a change to a call_sessions row MEANS to each participant.
//
// Two defects came from nothing watching this table while a page was
// open. The only subscription was on call_signals for a call you had
// already joined, which is useless for the two moments that matter most:
//
//   1. A call STARTS. The person being called is sitting on the booking
//      page and sees nothing, because the incoming call id was read once
//      during server rendering. They find out by reloading, which is not
//      a thing anyone does while waiting for a call they do not know is
//      happening.
//
//   2. A call ENDS from the other side. The callee declined, the row
//      went terminal, and the CALLER's screen carried on saying
//      "Calling — waiting for them to pick up…" with a live microphone
//      and Mute and End call still on it. The decline was recorded
//      correctly and reached nobody.
//
// Both are answered by the same authority: the row's own status. Local
// state is not shared, and a signal can be missed; the row is the record.

export type CallStatus = "ringing" | "connected" | "ended" | "missed" | "declined" | "abandoned";

export type CallSessionRow = {
  id: string;
  status: string;
  started_by: string | null;
  connected_at?: string | null;
};

/** A call that is over, however it ended. */
export function isTerminal(status: string): boolean {
  return status === "ended" || status === "missed"
      || status === "declined" || status === "abandoned";
}

/** A call still worth showing something about. */
export function isLive(status: string): boolean {
  return status === "ringing" || status === "connected";
}

/**
 * Should this session ring for me?
 *
 * Only a session someone ELSE started, and only while it is still
 * ringing. A connected session is not an invitation, and one I started
 * is my own outgoing call.
 */
export function ringsFor(row: CallSessionRow, selfId: string): boolean {
  return row.status === "ringing" && row.started_by !== selfId && row.started_by != null;
}

/**
 * What the caller should be told when their attempt ends without
 * connecting.
 *
 * "Call ended" is true of all of these and useful in none of them. A
 * person who was declined, and a person whose call rang out, need to
 * know which happened — one of them should not call straight back.
 */
export function endedMessage(status: string, connected: boolean): string {
  if (connected) return "Call ended.";
  switch (status) {
    case "declined": return "Call declined.";
    case "missed":
    case "abandoned": return "No answer.";
    default: return "Call ended.";
  }
}

export type IncomingState = {
  /** The session ringing for me right now, if any. */
  callId: string | null;
  /** Sessions I have already turned down, so they never ring again. */
  dismissed: ReadonlySet<string>;
};

export const NO_INCOMING: IncomingState = { callId: null, dismissed: new Set() };

/**
 * Fold one session row into the incoming-call state.
 *
 * Used for the realtime event AND for the catch-up read, so a call
 * discovered late behaves exactly like one that arrived on time.
 */
export function applySession(
  state: IncomingState,
  row: CallSessionRow,
  selfId: string,
): IncomingState {
  // A session going terminal clears it if it was the one ringing. This is
  // what stops a declined or expired call from ringing forever, and what
  // lets the NEXT call ring cleanly.
  if (isTerminal(row.status)) {
    return state.callId === row.id ? { ...state, callId: null } : state;
  }

  if (!ringsFor(row, selfId)) return state;
  if (state.dismissed.has(row.id)) return state;
  if (state.callId === row.id) return state;

  return { ...state, callId: row.id };
}

/** Turn one down. It must not ring again, even if a later read sees it. */
export function dismiss(state: IncomingState, callId: string): IncomingState {
  const dismissed = new Set(state.dismissed);
  dismissed.add(callId);
  return { callId: state.callId === callId ? null : state.callId, dismissed };
}

/**
 * Reconcile against everything the catch-up read returned.
 *
 * The read is authoritative about what is live RIGHT NOW, so a call we
 * think is ringing but which no longer appears as live has ended while
 * we were not listening, and must stop ringing.
 */
export function reconcile(
  state: IncomingState,
  rows: CallSessionRow[],
  selfId: string,
): IncomingState {
  let next = state;
  for (const row of rows) next = applySession(next, row, selfId);

  if (next.callId && !rows.some((r) => r.id === next.callId && isLive(r.status))) {
    next = { ...next, callId: null };
  }
  return next;
}
