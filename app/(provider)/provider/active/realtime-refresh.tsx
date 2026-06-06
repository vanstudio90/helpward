"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Radio } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

// Realtime refresh for /provider/active. Same pattern as the admin + helper
// inboxes shipped in the last two commits, but narrower: we only care about
// UPDATE events on the helper's own bookings — specifically status flips
// when the customer cancels mid-task, or when a customer messages support
// to force-cancel a scheduled booking from outside the helper's view.
//
// 1s debounce — tightest of the three because the helper standing in front
// of a doorway when the customer cancels has nothing useful left to do;
// faster visual feedback is the whole point.

const DEBOUNCE_MS = 1000;

export function ProviderActiveRealtimeRefresh({ userId }: { userId: string }) {
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
      .channel("provider-active")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "bookings", filter: `provider_id=eq.${userId}` },
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
