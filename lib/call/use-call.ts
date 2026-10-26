"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

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
  const supabase = useRef(createSupabaseBrowserClient());

  // Tear everything down exactly once, from wherever it is triggered:
  // hang-up, failure, unmount, the other side leaving. A microphone left
  // open after a call is a live microphone.
  const teardown = useCallback(() => {
    pc.current?.getSenders().forEach((s) => s.track?.stop());
    pc.current?.close();
    pc.current = null;
    localStream.current?.getTracks().forEach((t) => t.stop());
    localStream.current = null;
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

  const buildPeer = useCallback(async (id: string) => {
    const peer = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    pc.current = peer;

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
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
        void supabase.current.rpc("update_call_status", { p_call_id: id, p_status: "connected" });
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

  const applySignal = useCallback(async (id: string, sig: Signal) => {
    if (sig.sender_id === selfId) return;
    const peer = pc.current;
    if (!peer) return;

    try {
      if (sig.kind === "offer") {
        await peer.setRemoteDescription(sig.payload as RTCSessionDescriptionInit);
        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);
        await send(id, "answer", answer);
      } else if (sig.kind === "answer") {
        // An answer arriving when no offer is outstanding is a duplicate
        // from a reconnect; applying it would break a working call.
        if (peer.signalingState === "have-local-offer") {
          await peer.setRemoteDescription(sig.payload as RTCSessionDescriptionInit);
        }
      } else if (sig.kind === "ice") {
        await peer.addIceCandidate(sig.payload as RTCIceCandidateInit);
      } else if (sig.kind === "bye") {
        setPhase("ended");
        teardown();
      }
    } catch (err) {
      console.error("signal failed", sig.kind, err);
    }
  }, [selfId, send, teardown]);

  /** Anything that arrived before the subscription was live. */
  const drain = useCallback(async (id: string) => {
    const { data } = await supabase.current
      .from("call_signals")
      .select("id, kind, payload, sender_id")
      .eq("call_id", id)
      .gt("id", lastSignalId.current)
      .order("id");
    for (const sig of (data ?? []) as Signal[]) {
      lastSignalId.current = Math.max(lastSignalId.current, sig.id);
      await applySignal(id, sig);
    }
  }, [applySignal]);

  const join = useCallback(async (id: string, asCaller: boolean) => {
    setCallId(id);
    setError(null);
    setPhase(asCaller ? "ringing" : "connecting");

    try {
      const peer = await buildPeer(id);

      const channel = supabase.current
        .channel(`call:${id}`)
        .on("postgres_changes",
          { event: "INSERT", schema: "public", table: "call_signals", filter: `call_id=eq.${id}` },
          (p) => {
            const sig = p.new as Signal;
            lastSignalId.current = Math.max(lastSignalId.current, sig.id);
            void applySignal(id, sig);
          })
        .subscribe();

      // Catch up on whatever was sent before that subscription existed —
      // the normal case for whoever joins second.
      await drain(id);

      if (asCaller) {
        const offer = await peer.createOffer();
        await peer.setLocalDescription(offer);
        await send(id, "offer", offer);
      }

      return () => { void supabase.current.removeChannel(channel); };
    } catch (err) {
      setPhase("failed");
      setError(
        (err as DOMException)?.name === "NotAllowedError"
          ? "Helpward needs microphone access to make a call."
          : "Couldn't start the call.",
      );
      teardown();
      return () => {};
    }
  }, [buildPeer, applySignal, drain, send, teardown]);

  const startCall = useCallback(async () => {
    const { data, error: rpcError } = await supabase.current
      .rpc("start_call", { p_booking_id: bookingId });
    if (rpcError || !data) {
      setPhase("failed");
      setError(rpcError?.message ?? "Couldn't start the call.");
      return;
    }
    await join(data as string, true);
  }, [bookingId, join]);

  const answerCall = useCallback(async (id: string) => { await join(id, false); }, [join]);

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
