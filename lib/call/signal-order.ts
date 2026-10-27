// The order signals are applied in, and which ones have to wait.
//
// Two defects lived in the inline version of this:
//
//   An ICE candidate applied before a remote description exists throws
//   InvalidStateError and WAS SIMPLY LOST — the handler logged and moved
//   on, discarding a network path that would have worked seconds later.
//   Candidates routinely overtake the offer they belong to, because
//   realtime delivers them as separate rows.
//
//   The same row arrives twice. The catch-up read and the subscription
//   overlap on purpose — the catch-up covers the window before the
//   subscription is live — so applying every delivery applies some twice.
//
// Pulled out here because both are decisions about sequencing, not about
// WebRTC, and sequencing is what kept going wrong.

export type SignalKind = "offer" | "answer" | "ice" | "bye";

export type Decision =
  /** Hand it to the peer now. */
  | { action: "apply" }
  /** Hold it until a remote description exists. */
  | { action: "buffer" }
  /** Already handled, or not ours. */
  | { action: "skip"; why: "duplicate" | "own" };

export type SignalContext = {
  /** Did we send it? Our own signals come back through the subscription. */
  fromSelf: boolean;
  /** Already applied, by either delivery path. */
  seen: boolean;
  /** Is there a remote description to attach a candidate to? */
  hasRemoteDescription: boolean;
};

export function decideSignal(kind: SignalKind, ctx: SignalContext): Decision {
  if (ctx.fromSelf) return { action: "skip", why: "own" };
  if (ctx.seen) return { action: "skip", why: "duplicate" };

  // Only candidates wait. An offer or answer IS what creates the remote
  // description the candidates are waiting for, so buffering those would
  // deadlock the call.
  if (kind === "ice" && !ctx.hasRemoteDescription) return { action: "buffer" };

  return { action: "apply" };
}

/**
 * Replay a delivery sequence and report what the peer would see.
 *
 * Used by the tests to assert ordering without a browser: the sequencing
 * is the part that was wrong, and it is the part that can be checked
 * here.
 */
export function replay(
  signals: Array<{ id: number; kind: SignalKind; fromSelf?: boolean }>,
): { applied: Array<{ id: number; kind: SignalKind }>; buffered: number[] } {
  const seen = new Set<number>();
  const applied: Array<{ id: number; kind: SignalKind }> = [];
  let pending: Array<{ id: number; kind: SignalKind }> = [];
  let hasRemoteDescription = false;

  for (const sig of signals) {
    const decision = decideSignal(sig.kind, {
      fromSelf: sig.fromSelf === true,
      seen: seen.has(sig.id),
      hasRemoteDescription,
    });

    if (decision.action === "skip") continue;
    seen.add(sig.id);

    if (decision.action === "buffer") {
      pending.push({ id: sig.id, kind: sig.kind });
      continue;
    }

    applied.push({ id: sig.id, kind: sig.kind });

    // An offer or answer creates the remote description, which is the
    // moment every waiting candidate becomes applicable.
    if (sig.kind === "offer" || sig.kind === "answer") {
      hasRemoteDescription = true;
      applied.push(...pending);
      pending = [];
    }
  }

  return { applied, buffered: pending.map((p) => p.id) };
}
