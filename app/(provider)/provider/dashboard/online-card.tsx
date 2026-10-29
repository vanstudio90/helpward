"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { MapPin, ChevronRight } from "lucide-react";
import { setOnlineAction } from "../active/actions";
import { startGpsPings } from "@/lib/gps/ping";
import { Toggle } from "@/components/provider/Toggle";
import { cn } from "@/lib/cn";

/* The online switch, on the screen helpers actually open first.
 *
 * It used to live only on Active, which meant the home screen could show
 * "You're approved and ready to work" to someone who was offline and
 * therefore reachable by nothing. The toggle and the sentence describing
 * it now sit in the same card, so they cannot disagree.
 */
export function OnlineCard({ initialOnline }: { initialOnline: boolean }) {
  const [on, setOn] = useState(initialOnline);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [gpsNote, setGpsNote] = useState<string | null>(null);
  const stop = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!on) { stop.current?.(); stop.current = null; setGpsNote(null); return; }
    const s = startGpsPings({
      onError: (e: GeolocationPositionError | Error) =>
        setGpsNote(
          e instanceof GeolocationPositionError && e.code === 1
            ? "Location permission is off, so offers may not reach you."
            : "We can't read your location right now.",
        ),
    });
    stop.current = s;
    return () => { s(); stop.current = null; };
  }, [on]);

  const toggle = (next: boolean) => {
    setOn(next); setErr(null);
    start(async () => {
      const r = await setOnlineAction(next);
      if (r?.error) { setOn(!next); setErr(r.error); }
    });
  };

  return (
    <div className="bg-white rounded-card border border-slate-100 shadow-soft">
      <div className="flex items-center gap-3.5 p-4">
        <span className={cn(
          "w-11 h-11 rounded-full flex items-center justify-center shrink-0",
          on ? "bg-emerald-50" : "bg-slate-100",
        )}>
          <span className={cn("w-3.5 h-3.5 rounded-full", on ? "bg-emerald-500" : "bg-slate-300")} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[18px] font-extrabold text-slate-900 leading-tight">
            {on ? "You're online" : "You're offline"}
          </span>
          <span className="block text-[14px] text-slate-500 leading-snug mt-0.5">
            {on ? "Available for nearby offers" : "No offers will reach you"}
          </span>
        </span>
        <Toggle on={on} busy={pending} onChange={toggle} label="Online for task offers" />
      </div>

      {(err || gpsNote || on) && (
        <Link
          href="/provider/active"
          className="flex items-center gap-2.5 px-4 py-3.5 border-t border-slate-100"
        >
          <MapPin className={cn("w-[18px] h-[18px] shrink-0", err || gpsNote ? "text-amber-600" : "text-brand-600")} aria-hidden="true" />
          <span className={cn("flex-1 text-[15px] leading-snug", err || gpsNote ? "text-amber-800 font-semibold" : "text-slate-600")}>
            {err ?? gpsNote ?? "Keep your location up to date."}
          </span>
          <ChevronRight className="w-5 h-5 text-slate-300 shrink-0" aria-hidden="true" />
        </Link>
      )}
    </div>
  );
}
