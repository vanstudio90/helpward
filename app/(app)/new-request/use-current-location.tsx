"use client";

import { useState, useTransition } from "react";
import { Crosshair, Loader2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/cn";
import { reverseGeocodeAction } from "./location-actions";

// Tap to fill the address input from the browser's GPS. Hands the coords
// to a server action that reverse-geocodes via Mapbox (when MAPBOX_TOKEN
// is set) and surfaces a canonical address; falls back to "lat, lng"
// formatted text when there's no token so the booking still goes through.
//
// We surface the coords up to the parent via onResolved so the create-
// request action can skip the forward-geocode round-trip on submit — the
// browser already knows EXACTLY where the customer is.
export function UseCurrentLocationButton({
  onResolved,
}: {
  onResolved: (formatted: string, lat: number, lng: number) => void;
}) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const onClick = () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setErr("Your browser doesn't support location lookup.");
      return;
    }
    setErr(null);
    // We wrap navigator.geolocation inside a transition so the button
    // shows pending state from the moment the OS permission prompt fires,
    // not just from the moment we hit the server action.
    start(async () => {
      const coords = await new Promise<GeolocationCoordinates | null>((resolve) => {
        navigator.geolocation.getCurrentPosition(
          (pos) => resolve(pos.coords),
          (e) => {
            const msg = e.code === 1
              ? "Location permission denied — type the address instead."
              : e.code === 2
              ? "Couldn't get your location. Try typing the address."
              : "Location request timed out.";
            setErr(msg);
            resolve(null);
          },
          { enableHighAccuracy: true, maximumAge: 60_000, timeout: 15_000 },
        );
      });
      if (!coords) return;

      const r = await reverseGeocodeAction(coords.latitude, coords.longitude);
      if (!r.ok) {
        setErr(r.error);
        return;
      }
      onResolved(r.formatted, r.lat, r.lng);
    });
  };

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className={cn(
          "inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1.5 rounded-full border transition",
          pending
            ? "bg-white text-slate-400 border-slate-200"
            : "bg-white text-brand-700 border-brand-200 hover:bg-brand-50",
        )}
      >
        {pending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Crosshair className="w-3 h-3" />}
        {pending ? "Locating…" : "Use my current location"}
      </button>
      {err && (
        <div className="mt-1.5 flex items-start gap-1.5 text-[11px] text-amber-700">
          <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" /> {err}
        </div>
      )}
    </div>
  );
}
