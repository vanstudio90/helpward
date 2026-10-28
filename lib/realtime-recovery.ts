// Shared recovery policy for anything that depends on a Supabase realtime
// subscription.
//
// The rule, learned from the message thread: a subscription is best-effort
// TRANSPORT, never the source of truth. A socket can be joined and silent
// — an expired token, a backgrounded tab, a dropped connection — and
// silence is indistinguishable from "nothing happened". So every live
// surface needs the same three things: notice that it is not receiving,
// fetch what it missed, and say so on screen.
//
// Message threads and call state both need exactly this, so the policy
// lives in one place rather than being re-derived per feature.

export type ConnectionState = "connecting" | "live" | "retrying";

/** Map a Supabase channel status to what the person should be told.
 *
 * SUBSCRIBED is the only status that means events are actually being
 * delivered. Everything else — an error, a timeout, a closed socket — is
 * the same thing from the reader's point of view: this surface is not
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
 * unbounded, because a surface that gives up entirely is the bug this
 * exists to prevent.
 */
export function nextPollDelayMs(consecutivePolls: number): number {
  const ladder = [2_000, 2_000, 5_000, 5_000, 10_000, 15_000];
  return ladder[Math.min(consecutivePolls, ladder.length - 1)] ?? 15_000;
}
