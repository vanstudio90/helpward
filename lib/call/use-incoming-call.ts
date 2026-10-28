"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { nextPollDelayMs } from "@/lib/realtime-recovery";
import {
  applySession, reconcile, dismiss, NO_INCOMING,
  type CallSessionRow, type IncomingState,
} from "@/lib/call/session-events";

/**
 * Watch a booking for a call someone is trying to start with you.
 *
 * The incoming call id used to be read ONCE, during server rendering, and
 * passed down as a prop. So a customer sitting on the booking page while
 * the helper pressed Call saw nothing at all — the page had already
 * rendered. The only way to discover the call was to reload, which nobody
 * does while waiting for a call they do not know about.
 *
 * This never answers anything. It reports that a call is ringing; the
 * person decides.
 */
export function useIncomingCall(
  bookingId: string,
  selfId: string,
  /** What the server knew at render time, if anything. */
  initialCallId: string | null = null,
) {
  const [state, setState] = useState<IncomingState>(() =>
    initialCallId ? { callId: initialCallId, dismissed: new Set() } : NO_INCOMING,
  );

  // Built lazily so it is not constructed during server rendering, where
  // there is no browser session to read.
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const selfRef = useRef(selfId);
  selfRef.current = selfId;

  /** Read what is actually live for this booking right now. */
  const catchUp = useCallback(async () => {
    const { data, error } = await supabase
      .from("call_sessions")
      .select("id, status, started_by, connected_at")
      .eq("booking_id", bookingId)
      .in("status", ["ringing", "connected"])
      .order("started_at", { ascending: false })
      .limit(5);
    if (error) return;
    setState((prev) => reconcile(prev, (data ?? []) as CallSessionRow[], selfRef.current));
  }, [supabase, bookingId]);

  const [live, setLive] = useState(false);

  // Re-subscribe when the access token changes: the socket authorises
  // once at subscribe time, so an expired token leaves the channel
  // joined and silent — the same failure that stranded message threads.
  const [authEpoch, setAuthEpoch] = useState(0);
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "TOKEN_REFRESHED" || event === "SIGNED_IN") setAuthEpoch((n) => n + 1);
    });
    return () => sub.subscription.unsubscribe();
  }, [supabase]);

  useEffect(() => {
    let cancelled = false;

    const onRow = (row: CallSessionRow) => {
      if (cancelled) return;
      setState((prev) => applySession(prev, row, selfRef.current));
    };

    const channel = supabase
      .channel(`booking-calls:${bookingId}`)
      // INSERT catches a call starting. UPDATE catches it ending —
      // including the decline that previously reached nobody.
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "call_sessions", filter: `booking_id=eq.${bookingId}` },
        (p) => onRow(p.new as CallSessionRow))
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "call_sessions", filter: `booking_id=eq.${bookingId}` },
        (p) => onRow(p.new as CallSessionRow))
      .subscribe((status) => {
        if (cancelled) return;
        const subscribed = status === "SUBSCRIBED";
        setLive(subscribed);
        // Every successful (re)subscribe closes the gap it opened.
        if (subscribed) void catchUp();
      });

    return () => { cancelled = true; void supabase.removeChannel(channel); };
  }, [supabase, bookingId, catchUp, authEpoch]);

  // Fallback poll, only while the socket is not delivering. A missed call
  // is not recoverable after the fact, so this surface must not depend on
  // the subscription being healthy.
  useEffect(() => {
    if (live) return;
    let polls = 0;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      await catchUp();
      polls += 1;
      timer = setTimeout(tick, nextPollDelayMs(polls));
    };
    timer = setTimeout(tick, nextPollDelayMs(0));
    return () => clearTimeout(timer);
  }, [live, catchUp]);

  // A backgrounded tab has its socket throttled or closed by the browser.
  useEffect(() => {
    const recheck = () => { if (document.visibilityState === "visible") void catchUp(); };
    document.addEventListener("visibilitychange", recheck);
    window.addEventListener("focus", recheck);
    window.addEventListener("online", recheck);
    return () => {
      document.removeEventListener("visibilitychange", recheck);
      window.removeEventListener("focus", recheck);
      window.removeEventListener("online", recheck);
    };
  }, [catchUp]);

  const dismissCall = useCallback((callId: string) => {
    setState((prev) => dismiss(prev, callId));
  }, []);

  return { incomingCallId: state.callId, dismissCall };
}
