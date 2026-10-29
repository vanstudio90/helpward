"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { MapPin } from "lucide-react";
import { setOnlineAction } from "./actions";
import { startGpsPings } from "@/lib/gps/ping";
import { ReadyPanel } from "./ready-panel";

/* Owns the real online state; ReadyPanel owns how it looks.
 *
 * Splitting them keeps the thing that can fail — a server action, a
 * permission prompt, a GPS error — out of a component that is mostly
 * layout, and means the panel can be rendered in isolation without a
 * network call behind it.
 *
 * The optimistic flip is deliberate: a toggle that waits for a round trip
 * feels broken on a phone. It reverts if the server refuses, and the
 * reason is shown rather than swallowed.
 */
export function ReadyLive({ initialOnline }: { initialOnline: boolean }) {
  const [online, setOnline] = useState(initialOnline);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [gpsNote, setGpsNote] = useState<string | null>(null);
  const stopGps = useRef<(() => void) | null>(null);

  // Dispatch cannot reach a helper whose reported location is stale, so
  // the pings are what actually make "online" mean anything.
  useEffect(() => {
    if (online) {
      setGpsNote(null);
      const stop = startGpsPings({
        onError: (e: GeolocationPositionError | Error) => {
          setGpsNote(
            e instanceof GeolocationPositionError
              ? e.code === 1
                ? "Location permission is off, so offers may not reach you."
                : e.code === 2
                  ? "Location unavailable — check your phone's GPS."
                  : "Location request timed out."
              : e.message,
          );
        },
      });
      stopGps.current = stop;
      return () => { stop(); stopGps.current = null; };
    }
    stopGps.current?.();
    stopGps.current = null;
    setGpsNote(null);
  }, [online]);

  const toggle = (next: boolean) => {
    setOnline(next);
    setErr(null);
    start(async () => {
      const r = await setOnlineAction(next);
      if (r?.error) { setOnline(!next); setErr(r.error); }
    });
  };

  return (
    <>
      <ReadyPanel
        online={online}
        busy={pending}
        onToggleOnline={toggle}
        blockedReason={err}
      />
      {gpsNote && (
        <p className="mt-3 flex items-start gap-2 text-[13px] text-amber-800 bg-amber-50 border border-amber-100 rounded-field px-3.5 py-2.5">
          <MapPin className="w-4 h-4 mt-px shrink-0" aria-hidden="true" />
          {gpsNote}
        </p>
      )}
    </>
  );
}
