"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { decideSignal } from "@/lib/call/signal-order";

// A two-party audio call over WebRTC, signalled through Supabase.
//
// Listening service, sleep-call companion and the remote half of elder
// assistance are delivered ENTIRELY by talking. The intake offered an
// in-app call and the app had no way to make one, so those services
// could not be delivered as described.
//
// Audio only, deliberately: these are conversations, video is a different
// product with different consent questions, and audio survives a poor
// connection far better.

export type CallPhase = "idle" | "ringing" | "connecting" | "connected" | "ended" | "failed";

/**
 * Why the microphone was refused, and what to do about it.
 *
 * "Helpward needs microphone access" is not actionable once the browser
 * has remembered a refusal — the prompt never appears again, so the
 * person presses Call forever. Each browser hides the reset somewhere
 * different.
 */
function micError(err: unknown): string {
  const name = (err as DOMException)?.name;
  const isSafari = typeof navigator !== "undefined"
    && /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

  if (name === "NotAllowedError" || name === "SecurityError") {
    return isSafari
      ? "Microphone access is blocked. In Safari, open Settings for this website and set Microphone to Allow, then try again."
      : "Microphone access is blocked. Click the icon at the left of the address bar, set Microphone to Allow, then try again.";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return "No microphone was found. Plug one in, or use the phone number instead.";
  }
  if (name === "NotReadableError") {
    return "Your microphone is in use by another app. Close it and try again.";
  }
  return "Couldn't reach your microphone. Try again, or use the phone number.";
}

type Signal = { id: number; kind: string; payload: unknown; sender_id: string };

// Public STUN only. A TURN relay is needed for the minority of networks
// that block peer-to-peer outright (symmetric NAT, some corporate Wi-Fi);
// without one those calls fail rather than degrade, which `phase` reports
// as "failed" so the UI can offer the phone number instead.
const ICE_SERVERS: RTCIceServer[] = [
  { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
];

export function useCall(bookingId: string, selfId: string) {
  const [phase, setPhase] = useState<CallPhase>("idle");
  const [callId, setCallId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [seconds, setSeconds] = useState(0);

  const pc = useRef<RTCPeerConnection | null>(null);
  const localStream = useRef<MediaStream | null>(null);
  const remoteAudio = useRef<HTMLAudioElement | null>(null);
  const lastSignalId = useRef(0);
  // Lazily, and once.
  //
  // useRef(createSupabaseBrowserClient()) evaluates the factory on EVERY
  // render — the argument is always computed, even though only the first
  // value is kept — so this built a fresh browser client on each render,
  // including during server rendering where there is no browser. That is
  // the likeliest source of the server/client mismatch seen around this
  // component.
  const supabaseRef = useRef<ReturnType<typeof createSupabaseBrowserClient> | null>(null);
  const supabase = {
    get current() {
      if (!supabaseRef.current) supabaseRef.current = createSupabaseBrowserClient();
      return supabaseRef.current;
    },
  };

  // Everything below is scoped to ONE call. A retry builds a new peer,
  // and state left over from the previous attempt would be applied to it.
  //
  // `generation` is the guard: realtime callbacks and in-flight promises
  // from an abandoned call check it and drop out, instead of racing the
  // call that replaced them.
  const generation = useRef(0);
  type LiveChannel = ReturnType<ReturnType<typeof createSupabaseBrowserClient>["channel"]>;
  const channel = useRef<LiveChannel | null>(null);
  /**
   * ICE candidates that arrived before there was a remote description to
   * attach them to.
   *
   * addIceCandidate throws InvalidStateError when the remote description
   * is null, and the browser console filled with exactly that: candidates
   * routinely overtake the offer or answer they belong to, because
   * realtime delivers them as separate messages and the handler did not
   * wait for the previous one. They are held here and flushed the moment
   * a remote description exists.
   */
  const pendingCandidates = useRef<RTCIceCandidateInit[]>([]);
  /**
   * Signal ids already handled. Realtime and the catch-up read overlap by
   * design — the catch-up exists to cover the window before the
   * subscription is live — so the same row arrives twice.
   */
  const handled = useRef<Set<number>>(new Set());
  /** One signal at a time, in arrival order. */
  const queue = useRef<Promise<void>>(Promise.resolve());

  // Tear everything down exactly once, from wherever it is triggered:
  // hang-up, failure, unmount, the other side leaving. A microphone left
  // open after a call is a live microphone.
  const teardown = useCallback(() => {
    // Invalidate anything still in flight for the call being torn down.
    generation.current += 1;

    pc.current?.getSenders().forEach((s) => s.track?.stop());
    pc.current?.close();
    pc.current = null;
    localStream.current?.getTracks().forEach((t) => t.stop());
    localStream.current = null;

    // The realtime subscription used to outlive the call. join() returned
    // a cleanup function and enter() dropped it on the floor, so every
    // retry left another channel alive — all of them still delivering
    // signals, into whichever peer happened to be current.
    if (channel.current) {
      void supabase.current.removeChannel(channel.current);
      channel.current = null;
    }

    pendingCandidates.current = [];
    handled.current = new Set();
    lastSignalId.current = 0;
    queue.current = Promise.resolve();
  }, []);

  useEffect(() => teardown, [teardown]);

  // Counted from when media actually flows, not from when the button was
  // pressed — a caller should not be told they have been talking for the
  // thirty seconds it spent ringing.
  useEffect(() => {
    if (phase !== "connected") return;
    const started = Date.now();
    const t = setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(t);
  }, [phase]);

  const send = useCallback(async (id: string, kind: string, payload: unknown) => {
    await supabase.current.from("call_signals").insert({
      call_id: id, sender_id: selfId, kind, payload: payload as never,
    });
  }, [selfId]);

  /**
   * Ask for the microphone.
   *
   * Separated from buildPeer so it can run BEFORE a session is created.
   * It used to run after: a refused microphone left a 'ringing' session
   * nobody was on, and the next page load auto-joined that corpse
   * instead of starting a fresh call.
   */
  const acquireMic = useCallback(async (): Promise<MediaStream> => {
    return navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  }, []);

  const buildPeer = useCallback(async (id: string, stream: MediaStream) => {
    const peer = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    pc.current = peer;

    localStream.current = stream;
    stream.getTracks().forEach((t) => peer.addTrack(t, stream));

    peer.ontrack = (e) => {
      if (remoteAudio.current) {
        remoteAudio.current.srcObject = e.streams[0];
        // Autoplay can be refused by the browser. The call is still up,
        // so this must not throw and take the connection down with it.
        void remoteAudio.current.play().catch(() => {});
      }
    };

    peer.onicecandidate = (e) => {
      if (e.candidate) void send(id, "ice", e.candidate.toJSON());
    };

    peer.onconnectionstatechange = () => {
      const state = peer.connectionState;
      if (state === "connected") {
        setPhase("connected");
        // Checked and retried, not fired and forgotten.
        //
        // This was `void rpc(...)`, so when the write failed nothing said
        // so: both screens showed a 43-second call and the row ended with
        // connected_at and duration_sec null. A discarded error is a bug
        // you cannot see.
        void (async () => {
          for (let attempt = 0; attempt < 2; attempt++) {
            const { error } = await supabase.current.rpc("update_call_status", {
              p_call_id: id, p_status: "connected",
            });
            if (!error) return;
            console.error(`recording call connection failed (attempt ${attempt + 1})`, error);
            await new Promise((r) => setTimeout(r, 800));
          }
          // The server has a second line of defence: at end time it
          // recovers connected_at from the `answer` signal, which is
          // evidence the peers negotiated. See migration 0062.
          console.error("call connected but never recorded; relying on server recovery", id);
        })();
      } else if (state === "failed") {
        // Normally a network that blocks peer-to-peer entirely. No retry
        // fixes that, so say so rather than spinning forever.
        setPhase("failed");
        setError("Couldn't connect on this network. Try again, or use the phone number.");
        void supabase.current.rpc("update_call_status", {
          p_call_id: id, p_status: "ended", p_reason: "ice_failed",
        });
        teardown();
      } else if (state === "disconnected") {
        // Transient — WebRTC frequently recovers on its own, so this
        // must NOT tear down. Dropping here would end calls that were
        // about to come back.
        setPhase("connecting");
      }
    };

    return peer;
  }, [send, teardown]);

  /**
   * Attach every candidate that was waiting for a remote description.
   *
   * Called immediately after setRemoteDescription succeeds — that is the
   * moment they become applicable.
   */
  const flushCandidates = useCallback(async (peer: RTCPeerConnection) => {
    const waiting = pendingCandidates.current;
    pendingCandidates.current = [];
    for (const candidate of waiting) {
      try {
        await peer.addIceCandidate(candidate);
      } catch (err) {
        // A candidate that fails WITH a remote description present is
        // genuinely unusable — stale, or for a connection that has moved
        // on. Dropping it costs one network path, not the call.
        console.warn("buffered candidate rejected", err);
      }
    }
  }, []);

  const applySignal = useCallback(async (id: string, sig: Signal) => {
    if (sig.sender_id === selfId) return;
    const peer = pc.current;
    if (!peer) return;

    try {
      if (sig.kind === "offer") {
        await peer.setRemoteDescription(sig.payload as RTCSessionDescriptionInit);
        await flushCandidates(peer);
        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);
        await send(id, "answer", answer);
      } else if (sig.kind === "answer") {
        // An answer arriving when no offer is outstanding is a duplicate
        // from a reconnect; applying it would break a working call.
        if (peer.signalingState === "have-local-offer") {
          await peer.setRemoteDescription(sig.payload as RTCSessionDescriptionInit);
          await flushCandidates(peer);
        }
      } else if (sig.kind === "ice") {
        // decideSignal is the tested rule (lib/call/signal-order.ts):
        // a candidate is only applicable once a remote description
        // exists. Without the buffer the console filled with
        //   InvalidStateError: ... The remote description was null
        // and each of those candidates was LOST — the handler logged and
        // moved on, discarding a path that would have worked moments
        // later. Candidates routinely overtake the offer they belong to,
        // because realtime delivers them as separate rows.
        const plan = decideSignal("ice", {
          fromSelf: false,
          seen: false,
          hasRemoteDescription: peer.remoteDescription != null,
        });
        if (plan.action === "buffer") {
          pendingCandidates.current.push(sig.payload as RTCIceCandidateInit);
          return;
        }
        await peer.addIceCandidate(sig.payload as RTCIceCandidateInit);
      } else if (sig.kind === "bye") {
        setPhase("ended");
        teardown();
      }
    } catch (err) {
      console.error("signal failed", sig.kind, err);
    }
  }, [selfId, send, teardown, flushCandidates]);

  /**
   * Hand a signal to the queue.
   *
   * Realtime callbacks fire independently and the old code called
   * applySignal without awaiting the previous one, so an offer could
   * still be mid-setRemoteDescription while the next signal was already
   * being applied to the same peer. Everything now runs in arrival
   * order, once each.
   */
  const enqueue = useCallback((id: string, sig: Signal, forGeneration: number) => {
    if (handled.current.has(sig.id)) return;
    handled.current.add(sig.id);
    lastSignalId.current = Math.max(lastSignalId.current, sig.id);

    queue.current = queue.current
      .then(() => {
        // The call this signal belongs to is gone.
        if (generation.current !== forGeneration) return;
        return applySignal(id, sig);
      })
      .catch((err) => console.error("signal queue", err));
  }, [applySignal]);

  /** Anything that arrived before the subscription was live. */
  const drain = useCallback(async (id: string, forGeneration: number) => {
    const { data } = await supabase.current
      .from("call_signals")
      .select("id, kind, payload, sender_id")
      .eq("call_id", id)
      .order("id");
    // Through the same queue, deduplicated by id. The catch-up and the
    // subscription deliberately overlap — the catch-up covers the window
    // before the subscription was live — so rows arrive twice and must be
    // applied once.
    for (const sig of (data ?? []) as Signal[]) enqueue(id, sig, forGeneration);
  }, [enqueue]);

  const join = useCallback(async (id: string, asCaller: boolean, stream: MediaStream) => {
    setCallId(id);
    setError(null);
    setPhase(asCaller ? "ringing" : "connecting");

    // Everything from here belongs to THIS attempt. A retry bumps the
    // generation and anything still in flight for the old one drops out.
    const myGeneration = ++generation.current;

    try {
      const peer = await buildPeer(id, stream);

      // Held in a ref so teardown can dispose it. join used to RETURN a
      // cleanup function that enter() discarded, so every retry left
      // another live subscription feeding signals into whichever peer
      // happened to be current.
      const live = supabase.current
        .channel(`call:${id}`)
        .on("postgres_changes",
          { event: "INSERT", schema: "public", table: "call_signals", filter: `call_id=eq.${id}` },
          (p) => enqueue(id, p.new as Signal, myGeneration));
      channel.current = live;

      // Wait for the subscription to be LIVE before catching up.
      //
      // Subscribing and reading concurrently leaves a gap: a row written
      // between the read and the subscription becoming active is
      // delivered by neither. Ordering them closes it, and the overlap
      // the other way is harmless because the queue deduplicates.
      await new Promise<void>((resolve) => {
        live.subscribe((status) => {
          if (status === "SUBSCRIBED" || status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            resolve();
          }
        });
      });

      if (generation.current !== myGeneration) return () => {};

      await drain(id, myGeneration);
      // Let the queue finish applying what the catch-up found, so the
      // glare check below reads a settled signalling state.
      await queue.current;

      if (generation.current !== myGeneration) return () => {};

      // A second safety net for glare: if an offer was already applied
      // during the catch-up we are answering it, whatever started_by
      // said. Sending our own offer now would tear down a connection
      // that is already negotiating.
      const alreadyNegotiating =
        pc.current?.signalingState === "have-remote-offer" ||
        (pc.current?.signalingState === "stable" && pc.current?.remoteDescription != null);

      if (asCaller && !alreadyNegotiating) {
        const offer = await peer.createOffer();
        await peer.setLocalDescription(offer);
        await send(id, "offer", offer);
      }

      return () => {};
    } catch (err) {
      console.error("call setup failed", err);
      setPhase("failed");
      setError("Couldn't set up the call. Try again.");
      // The session exists but nobody is on it; do not leave it ringing.
      await supabase.current.rpc("abandon_call", { p_call_id: id, p_reason: "setup_failed" });
      teardown();
      return () => {};
    }
  }, [buildPeer, enqueue, drain, send, teardown]);

  /**
   * Join a call, working out which end of it we are.
   *
   * WHO CALLS AND WHO ANSWERS IS NOT "who pressed the button".
   *
   * start_call returns the LIVE session when one exists, so if the helper
   * pressed Call first and the customer pressed Call second, both got the
   * same session id — and the old code joined both as the caller. Two
   * offers, no answer, and both sides sat on "Connecting" forever. That
   * is exactly the failure independent testing hit: the helper sent an
   * offer and ICE candidates, and the customer never answered.
   *
   * The session records started_by. That is the caller, whichever button
   * either person pressed and in whatever order — deterministic, with no
   * race to lose.
   */
  const enter = useCallback(async (id: string, stream: MediaStream) => {
    const { data: session } = await supabase.current
      .from("call_sessions")
      .select("started_by, status")
      .eq("id", id)
      .maybeSingle();

    if (session && session.status !== "ringing" && session.status !== "connected") {
      // Already over. Release the microphone we just took.
      stream.getTracks().forEach((t) => t.stop());
      setPhase("ended");
      return;
    }
    await join(id, session?.started_by === selfId, stream);
  }, [join, selfId]);

  const startCall = useCallback(async () => {
    setError(null);
    setPhase("connecting");

    // MICROPHONE FIRST, session second.
    //
    // The other order left a live 'ringing' session behind every time
    // someone refused the permission prompt — and the next page load
    // auto-joined that dead session rather than starting a real call.
    // Nothing is created until we know we can actually speak.
    let stream: MediaStream;
    try {
      stream = await acquireMic();
    } catch (err) {
      setPhase("failed");
      setError(micError(err));
      return;
    }

    const { data, error: rpcError } = await supabase.current
      .rpc("start_call", { p_booking_id: bookingId });
    if (rpcError || !data) {
      // No session was created, but the microphone is open. Close it.
      stream.getTracks().forEach((t) => t.stop());
      setPhase("failed");
      setError(rpcError?.message ?? "Couldn't start the call.");
      return;
    }
    await enter(data as string, stream);
  }, [bookingId, enter, acquireMic]);

  const answerCall = useCallback(async (id: string) => {
    setError(null);
    setPhase("connecting");
    let stream: MediaStream;
    try {
      stream = await acquireMic();
    } catch (err) {
      setPhase("failed");
      setError(micError(err));
      // Someone IS calling and we cannot answer. Mark the attempt dead so
      // it does not sit ringing forever.
      await supabase.current.rpc("abandon_call", { p_call_id: id, p_reason: "mic_denied" });
      return;
    }
    await enter(id, stream);
  }, [enter, acquireMic]);

  const hangUp = useCallback(async () => {
    if (callId) {
      await send(callId, "bye", {});
      await supabase.current.rpc("update_call_status", {
        p_call_id: callId, p_status: "ended", p_reason: "hung_up",
      });
    }
    setPhase("ended");
    teardown();
  }, [callId, send, teardown]);

  const toggleMute = useCallback(() => {
    const track = localStream.current?.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setMuted(!track.enabled);
  }, []);

  return {
    phase, error, muted, seconds, callId,
    remoteAudioRef: remoteAudio,
    startCall, answerCall, hangUp, toggleMute,
  };
}
