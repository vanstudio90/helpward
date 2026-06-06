"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Radio } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

// Customer-side realtime refresh for /bookings/[id]. Closes the loop
// symmetrically with /provider/active: when the helper flips the booking
// status (start → in_progress → completed) or uploads a proof photo, the
// customer's open booking page re-renders without manual reload.
//
// Two filtered subscriptions: bookings UPDATE on THIS booking id (status,
// completed_at, tip), and booking_completion_photos INSERT on THIS
// booking id (photo gallery refresh). Server-side filters mean we only
// get notified for events on the row the customer is actually looking at.

const DEBOUNCE_MS = 1000;

export function BookingDetailRealtimeRefresh({ bookingId }: { bookingId: string }) {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<number>(Date.now());

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    let timer: ReturnType<typeof setTimeout> | null = null;

    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        setRefreshing(true);
        router.refresh();
        setTimeout(() => {
          setRefreshing(false);
          setLastRefresh(Date.now());
        }, 400);
      }, DEBOUNCE_MS);
    };

    const channel = supabase
      .channel(`booking-detail:${bookingId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "bookings", filter: `id=eq.${bookingId}` },
        () => schedule(),
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "booking_completion_photos", filter: `booking_id=eq.${bookingId}` },
        () => schedule(),
      )
      .subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [router, bookingId]);

  return (
    <div className="fixed top-4 right-4 z-30 inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-600 bg-white/95 backdrop-blur-md border border-slate-200 rounded-full px-2.5 py-1.5 shadow-sm">
      {refreshing ? (
        <RefreshCw className="w-3 h-3 animate-spin text-brand-600" />
      ) : (
        <span className="relative inline-flex">
          <Radio className="w-3 h-3 text-emerald-600" />
          <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
        </span>
      )}
      {refreshing ? "Refreshing…" : `Live · ${freshness(lastRefresh)}`}
    </div>
  );
}

function freshness(t: number): string {
  const s = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}
