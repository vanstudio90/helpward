"use client";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";

/* Browser GPS ping loop for providers.
 *
 * Usage:
 *   const stop = startGpsPings({ onError: (e) => ... });
 *   // ... later ...
 *   stop();
 *
 * Behaviour:
 *   - Uses navigator.geolocation.watchPosition with high accuracy
 *   - Throttles upserts to provider_locations to once per 15s minimum
 *   - On permission denied / errors, calls onError; caller decides UX
 */

type GpsOptions = {
  onError?: (err: GeolocationPositionError | Error) => void;
  onUpdate?: (lat: number, lng: number) => void;
  intervalMs?: number;
};

const MIN_INTERVAL = 15_000;

export function startGpsPings(opts: GpsOptions = {}): () => void {
  const { onError, onUpdate, intervalMs = MIN_INTERVAL } = opts;
  const throttle = Math.max(intervalMs, MIN_INTERVAL);

  if (typeof navigator === "undefined" || !navigator.geolocation) {
    onError?.(new Error("Geolocation not available in this browser."));
    return () => {};
  }

  const supabase = createSupabaseBrowserClient();
  let lastUpsertAt = 0;
  let stopped = false;

  const watchId = navigator.geolocation.watchPosition(
    async (pos) => {
      if (stopped) return;
      const now = Date.now();
      if (now - lastUpsertAt < throttle) return;
      lastUpsertAt = now;

      const { latitude: lat, longitude: lng, heading, speed } = pos.coords;
      onUpdate?.(lat, lng);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // PostGIS geography expects POINT(lng lat)
      const point = `POINT(${lng} ${lat})`;
      const { error: upErr } = await supabase
        .from("provider_locations")
        .upsert(
          {
            provider_id: user.id,
            location: point,
            heading: heading ?? null,
            speed_kph: speed != null ? speed * 3.6 : null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "provider_id" }
        );
      if (upErr) onError?.(new Error("Location upsert failed: " + upErr.message));

      // ALSO mirror onto provider_profiles. find_nearby_providers reads
      // provider_profiles.current_location — not provider_locations — so
      // without this the matching engine never saw a real GPS fix and ran
      // entirely on the placeholder point seeded when a helper went online.
      // location_updated_at drives the freshness rule in migration 0030.
      const { error: profErr } = await supabase
        .from("provider_profiles")
        .update({ current_location: point, location_updated_at: new Date().toISOString() })
        .eq("user_id", user.id);
      if (profErr) onError?.(new Error("Location sync failed: " + profErr.message));

      // Also append to booking_location_pings if there's an in-progress booking
      const { data: active } = await supabase
        .from("bookings")
        .select("id")
        .eq("provider_id", user.id)
        .eq("status", "in_progress")
        .limit(1);
      if (active && active.length > 0) {
        const { error: pingErr } = await supabase.from("booking_location_pings").insert({
          booking_id: active[0].id,
          location: point,
        });
        if (pingErr) onError?.(new Error("Ping insert failed: " + pingErr.message));
      }
    },
    (err) => {
      onError?.(err);
    },
    {
      enableHighAccuracy: true,
      maximumAge: 5_000,
      timeout: 20_000,
    }
  );

  return () => {
    stopped = true;
    navigator.geolocation.clearWatch(watchId);
  };
}
