"use client";

import { useState } from "react";
import Link from "next/link";
import { Phone, PhoneOff, Mic, MicOff, AlertCircle, Loader2 } from "lucide-react";
import { useCall } from "@/lib/call/use-call";
import { useIncomingCall } from "@/lib/call/use-incoming-call";
import { callDisplay } from "@/lib/call/display";

// The call itself, for services that ARE a call.
//
// Shown to both sides of the booking. Whoever presses first creates the
// session; the other joins the same one, because start_call returns the
// live call rather than opening a second.


export function CallPanel({
  bookingId, selfId, counterpartName,
  incomingCallId: incomingCallIdFromServer,
  awaitingPayment, viewerIs,
}: {
  bookingId: string;
  selfId: string;
  counterpartName: string;
  /** Set when the other side has already started one. */
  incomingCallId?: string | null;
  /**
   * The call IS the service here, and the card has not been held yet.
   * start_call refuses in this state (migration 0063); saying so beats a
   * button that returns an error.
   */
  awaitingPayment?: boolean;
  viewerIs: "customer" | "helper";
}) {
  const call = useCall(bookingId, selfId);

  // A call that starts while this page is OPEN has to reach it. The
  // incoming id used to come only from the server render, so the person
  // being called sat looking at "Start call" until they reloaded.
  const { incomingCallId, dismissCall } = useIncomingCall(
    bookingId, selfId, incomingCallIdFromServer ?? null,
  );
  // Local to the button, not the call: the call's own phase does not
  // change until the microphone prompt is answered, which can be a long
  // time if the person is reading it.
  const [starting, setStarting] = useState(false);

  // An incoming call is OFFERED, never taken.
  //
  // This used to answer automatically the moment the page rendered:
  //
  //   if (incomingCallId && phase === "idle") void answerCall(incomingCallId)
  //
  // which opened the microphone and connected audio to the other party
  // without the person agreeing to anything — including when the page
  // was merely refreshed, or opened in a background tab. Joining the
  // ringing session rather than racing a second one is still right; doing
  // it without being asked is not.
  const { answerCall, declineCall } = call;

  // ONE derivation of what this panel says and shows — see
  // lib/call/display.ts. Three JSX expressions used to each re-test the
  // same conditions, so "the ringing label wins" was a property of how
  // they happened to be ordered rather than something stated once.
  const view = callDisplay({
    phase: call.phase,
    incomingCallId,
    currentCallId: call.callId,
    endedText: call.endedText,
    counterpartName,
    seconds: call.seconds,
  });


  // Before the hold exists there is nothing to say about microphones or
  // ringing — there is one thing to do, and only one person can do it.
  if (awaitingPayment) {
    return (
      <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-4">
        <div className="flex items-start gap-3">
          <span className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 inline-flex items-center justify-center shrink-0">
            <Phone className="w-5 h-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <div className="text-sm font-bold text-amber-950">
              {viewerIs === "customer"
                ? "Confirm your card to start your session"
                : "Waiting for the customer to confirm payment"}
            </div>
            <p className="text-xs text-amber-900/80 mt-0.5">
              {viewerIs === "customer"
                ? `This session is delivered by call. ${counterpartName} can't start it until the hold is in place — you're charged after it finishes.`
                : `${counterpartName} has been asked to confirm their card. The call opens as soon as they do.`}
            </p>
            {viewerIs === "customer" && (
              <Link
                href={`/bookings/${bookingId}/confirm-payment`}
                className="mt-2.5 inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-amber-600 text-white text-sm font-semibold"
              >
                Confirm card
              </Link>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      {/* Where the other person's voice comes out. Hidden, but it has to
          exist in the DOM before the track arrives. */}
      <audio ref={call.remoteAudioRef} autoPlay playsInline className="hidden" />

      <div className="flex items-center gap-3">
        {/* The icon follows the same derived state as the words. An
            incoming ring counts as activity even though `phase` is
            whatever the last call left behind. */}
        <span
          className={`w-10 h-10 rounded-xl inline-flex items-center justify-center shrink-0 ${
            call.phase === "connected" ? "bg-emerald-50 text-emerald-600"
            : view.ringingIn ? "bg-emerald-50 text-emerald-600"
            : "bg-brand-50 text-brand-600"
          }`}
        >
          {view.ringingIn || call.phase === "connecting" || call.phase === "ringing" ? (
            <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
          ) : (
            <Phone className="w-5 h-5" aria-hidden="true" />
          )}
        </span>

        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold text-slate-900 truncate">{view.heading}</div>
          <div className="text-xs text-slate-500" aria-live="polite">{view.status}</div>
        </div>

        {view.controls === "in-call" ? (
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={call.toggleMute}
              aria-pressed={call.muted}
              aria-label={call.muted ? "Unmute" : "Mute"}
              className={`p-2.5 rounded-xl border ${
                call.muted
                  ? "bg-slate-900 border-slate-900 text-white"
                  : "bg-white border-slate-200 text-slate-600"
              }`}
            >
              {call.muted ? <MicOff className="w-4 h-4" aria-hidden="true" />
                          : <Mic className="w-4 h-4" aria-hidden="true" />}
            </button>
            <button
              type="button"
              onClick={() => void call.hangUp()}
              aria-label="End call"
              className="p-2.5 rounded-xl bg-rose-600 text-white"
            >
              <PhoneOff className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        ) : view.controls === "answer-decline" ? (
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => { dismissCall(incomingCallId!); void declineCall(incomingCallId!); }}
              className="px-3.5 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50"
            >
              Decline
            </button>
            <button
              type="button"
              onClick={() => void answerCall(incomingCallId!)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 text-white text-sm font-semibold"
            >
              <Phone className="w-4 h-4" aria-hidden="true" /> Answer
            </button>
          </div>
        ) : (
          <button
            type="button"
            // Disabled the instant it is pressed. Two presses created two
            // attempts, and the screen showed no change in between, so
            // pressing twice was the natural thing to do.
            disabled={starting}
            onClick={() => {
              setStarting(true);
              void call.startCall().finally(() => setStarting(false));
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-brand-600 text-white text-sm font-semibold shrink-0 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <Phone className="w-4 h-4" aria-hidden="true" />
            {starting
              ? "Starting call…"
              : call.phase === "ended" || call.phase === "failed" ? "Call again" : "Start call"}
          </button>
        )}
      </div>

      {call.error && (
        <p className="mt-2.5 text-xs text-rose-700 flex items-start gap-1.5">
          <AlertCircle className="w-3.5 h-3.5 mt-px shrink-0" aria-hidden="true" />
          {call.error}
        </p>
      )}

      {view.showMicReassurance && (
        <p className="mt-2.5 text-[11px] text-slate-500">
          Your microphone stays off until you answer.
        </p>
      )}

      {call.phase === "connected" && (
        <p className="mt-2.5 text-[11px] text-slate-400">
          Audio only. Helpward doesn&rsquo;t record calls.
        </p>
      )}
    </div>
  );
}
