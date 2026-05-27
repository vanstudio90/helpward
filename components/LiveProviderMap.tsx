"use client";

import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { MapBackdrop } from "@/components/MapBackdrop";

type Loc = { lat: number; lng: number; updatedAt: string } | null;

export function LiveProviderMap({
  providerId, providerAvatar, providerInitial,
}: {
  providerId: string;
  providerAvatar: string | null;
  providerInitial: string;
}) {
  const [loc, setLoc] = useState<Loc>(null);
  const [lastSeen, setLastSeen] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();

    // Initial fetch — RLS only lets the customer of an in-progress booking read
    supabase
      .from("provider_locations")
      .select("location, updated_at")
      .eq("provider_id", providerId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          const coords = parsePoint(data.location);
          if (coords) setLoc({ ...coords, updatedAt: data.updated_at });
          setLastSeen(data.updated_at);
        }
      });

    // Subscribe to live updates
    const channel = supabase
      .channel(`provider_location:${providerId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "provider_locations", filter: `provider_id=eq.${providerId}` },
        (payload) => {
          const row = payload.new as { location: unknown; updated_at: string } | null;
          if (row) {
            const coords = parsePoint(row.location);
            if (coords) setLoc({ ...coords, updatedAt: row.updated_at });
            setLastSeen(row.updated_at);
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [providerId]);

  return (
    <div className="relative rounded-xl overflow-hidden h-44 bg-slate-100">
      <MapBackdrop />
      {/* Provider marker - center map. Real positioning needs Mapbox tiles + lat/lng → pixel projection.
          For now we just animate the marker presence + show "live" indicator + last-seen timestamp. */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="relative">
          <div className="absolute inset-0 w-12 h-12 rounded-full bg-emerald-500/30 animate-ping" />
          {providerAvatar ? (
            <img src={providerAvatar} className="relative w-12 h-12 rounded-full ring-4 ring-white shadow-lg" alt="" />
          ) : (
            <div className="relative w-12 h-12 rounded-full ring-4 ring-white shadow-lg bg-brand-100 text-brand-700 flex items-center justify-center font-bold">
              {providerInitial}
            </div>
          )}
        </div>
      </div>
      <div className="absolute bottom-2 right-2 bg-white text-xs rounded-lg px-2.5 py-1.5 shadow">
        {loc ? (
          <>
            <div className="font-bold text-emerald-600">Live</div>
            <div className="text-[10px] text-slate-500">
              {lastSeen ? `Updated ${timeSince(lastSeen)} ago` : "—"}
            </div>
          </>
        ) : (
          <>
            <div className="font-bold text-slate-500">Awaiting GPS</div>
            <div className="text-[10px] text-slate-400">Provider hasn&apos;t shared location yet</div>
          </>
        )}
      </div>
    </div>
  );
}

function parsePoint(raw: unknown): { lat: number; lng: number } | null {
  // PostGIS returns "0101...." WKB hex via PostgREST by default, or "POINT(lng lat)" if cast.
  // For Realtime payloads it'll likely be the raw WKB; we don't decode it here for v1.
  // Once Mapbox is wired we'll switch to ST_AsGeoJSON + a real renderer.
  if (typeof raw === "string" && raw.startsWith("POINT(")) {
    const m = raw.match(/POINT\(([-\d.]+)\s+([-\d.]+)\)/);
    if (m) return { lat: parseFloat(m[2]), lng: parseFloat(m[1]) };
  }
  return null;
}

function timeSince(iso: string): string {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h`;
}
