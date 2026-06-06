"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Radio } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

// Realtime refresh for /provider/inbox. Mirrors the admin pattern from
// AdminInboxRealtimeRefresh but scoped to the rows that matter for the
// helper: match_attempts INSERTs (new offer just dropped) + requests
// status changes (someone else accepted, this card should disappear).
//
// Debounce coalesces bursts so the broadcast cron firing 5 attempts in
// 100ms triggers ONE refresh, not 5.

const DEBOUNCE_MS = 1500;

export function ProviderInboxRealtimeRefresh({ userId }: { userId: string }) {
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
      .channel("provider-inbox")
      // New offer specifically routed to this helper. Server-side filter
      // shaves bandwidth — we only get notified when the row actually
      // belongs to us, instead of fanning every match_attempt to every
      // online helper.
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "match_attempts", filter: `provider_id=eq.${userId}` },
        () => schedule(),
      )
      // Request status flip — someone else accepted, or it expired, or
      // the customer cancelled. Any of those should remove the card.
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "requests" },
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
