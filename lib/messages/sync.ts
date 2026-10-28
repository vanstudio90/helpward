// Message-thread synchronisation logic, kept pure so it can be tested
// without a socket, a browser or a database.
//
// The rule this file exists to enforce: a realtime subscription is
// best-effort TRANSPORT, never the source of truth. A thread that is
// correct only while a websocket happens to be delivering is a thread
// that silently loses messages, and the loss is invisible to the person
// it happens to — they see a conversation that simply stops.
//
// Observed before this was written: messages sent by the customer did
// not reach an open helper view until the helper reloaded the page. The
// helper could read them after a reload, so the row, the policy and the
// publication were all fine; what failed was delivery. Anything that
// stops delivery — an expired socket token, a dropped connection, a
// backgrounded tab, a server restart — produces the same silent gap, so
// the fix is not to find the one cause but to make the gap recoverable:
// notice the socket is not delivering, fetch what was missed, and say so
// on screen while it is happening.

export type SyncMessage = {
  id: string;
  created_at: string;
};

/** Merge newly-seen messages into the thread.
 *
 * Deduplicates by id, because the same message legitimately arrives
 * twice: once optimistically from our own insert and once from the
 * subscription, and again from a catch-up fetch after a reconnect.
 * Ordering is by created_at with id as the tie-break so that two
 * messages written in the same millisecond keep a stable, identical
 * order in both participants' views rather than swapping on each merge.
 *
 * Incoming rows win over held ones with the same id: a catch-up fetch
 * returns the server's version of a row we may only have optimistically,
 * and the server's is the real one.
 */
export function mergeMessages<T extends SyncMessage>(held: T[], incoming: T[]): T[] {
  if (incoming.length === 0) return held;

  const byId = new Map<string, T>();
  for (const m of held) byId.set(m.id, m);
  for (const m of incoming) byId.set(m.id, m);

  // Nothing new and nothing changed — return the original array so React
  // sees an unchanged reference and skips the re-render.
  if (byId.size === held.length && incoming.every((m) => held.some((h) => h.id === m.id && h === m))) {
    return held;
  }

  return [...byId.values()].sort((a, b) => {
    if (a.created_at !== b.created_at) return a.created_at < b.created_at ? -1 : 1;
    return a.id < b.id ? -1 : 1;
  });
}

/** The timestamp a catch-up fetch should ask for messages after.
 *
 * Deliberately returns the newest created_at MINUS a one-second overlap
 * rather than the exact value. Two messages can share a timestamp, and a
 * strict "greater than newest" would skip the second one forever. The
 * overlap re-fetches a row or two we already hold, which mergeMessages
 * discards; that is much cheaper than a permanently missing message.
 *
 * Null means the thread is empty, so the caller should fetch all of it.
 */
export function catchUpSince(held: SyncMessage[]): string | null {
  if (held.length === 0) return null;
  let newest = held[0].created_at;
  for (const m of held) if (m.created_at > newest) newest = m.created_at;
  const t = Date.parse(newest);
  if (Number.isNaN(t)) return null;
  return new Date(t - 1000).toISOString();
}

export type ConnectionState = "connecting" | "live" | "retrying";

/** Map a Supabase channel status to what the person should be told.
 *
 * SUBSCRIBED is the only status that means messages are actually being
 * delivered. Everything else — an error, a timeout, a closed socket — is
 * the same thing from the reader's point of view: the thread is not
 * updating itself, and the fallback poll has to carry it.
 */
export function connectionStateFor(status: string): ConnectionState {
  if (status === "SUBSCRIBED") return "live";
  if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") return "retrying";
  return "connecting";
}

/** How long to wait before the next catch-up poll.
 *
 * Polling exists only to cover the window where the socket is not
 * delivering, so it backs off: a quick first few passes to cover a brief
 * blip, then slower, so a long outage with an open tab does not turn
 * into a steady stream of requests. Bounded at the top rather than
 * unbounded, because a thread that gives up entirely is the bug we are
 * fixing.
 */
export function nextPollDelayMs(consecutivePolls: number): number {
  const ladder = [2_000, 2_000, 5_000, 5_000, 10_000, 15_000];
  return ladder[Math.min(consecutivePolls, ladder.length - 1)] ?? 15_000;
}
