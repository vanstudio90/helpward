"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Radio } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

// Customer-side realtime refresh for the /bookings list. Same shape as the
// other four realtime surfaces (admin inbox, helper inbox, helper active,
// booking detail) — subscribe + debounce + router.refresh + Live pill.
//
// Three filtered subscriptions on a single channel:
//   * UPDATE bookings WHERE customer_id=me — status flips, tip changes,
//     completed_at stamps so the per-row "Rate" badge appears the moment
//     a task completes
//   * INSERT bookings WHERE customer_id=me — a matching request just got
//     accepted; the new booking row should appear without reload
//   * UPDATE requests WHERE customer_id=me — pending request status flips
//     (matching → expired / cancelled / matched)
//
// 1.5s debounce — slightly longer than the booking detail page since the
// list view tolerates a beat more latency before things matter.

const DEBOUNCE_MS = 1500;

export function CustomerBookingsListRealtimeRefresh({ userId }: { userId: string }) {
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
      .channel("customer-bookings-list")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "bookings", filter: `customer_id=eq.${userId}` },
        () => schedule(),
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "bookings", filter: `customer_id=eq.${userId}` },
        () => schedule(),
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "requests", filter: `customer_id=eq.${userId}` },
        () => schedule(),
      )
      .subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [router, userId]);

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
