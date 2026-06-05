"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Radio } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

// Subscribes to Supabase Realtime channels for the tables that drive the
// admin operator-inbox counts (disputes, bookings, provider_profiles,
// data_export_requests, account_deletion_requests) and triggers a
// router.refresh() — which re-runs the server component and re-fetches
// the counts — on any change. Debounces to coalesce bursts (a cron tick
// inserting 5 notifications in 100ms shouldn't fire 5 separate refreshes).
//
// Renders a tiny "Live" indicator in the corner so admins know the page
// is in sync without manual reload.

const DEBOUNCE_MS = 2000;
const TABLES = [
  "disputes",
  "bookings",
  "provider_profiles",
  "data_export_requests",
  "account_deletion_requests",
  "requests",
];

export function AdminInboxRealtimeRefresh() {
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
        // Reset the spinning state shortly after — router.refresh resolves
        // server-side; the brief animation is just a "we saw it" signal.
        setTimeout(() => {
          setRefreshing(false);
          setLastRefresh(Date.now());
        }, 400);
      }, DEBOUNCE_MS);
    };

    const channel = supabase.channel("admin-inbox");
    for (const table of TABLES) {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        () => schedule(),
      );
    }
    channel.subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [router]);

  // Render: small fixed-top-right pill so the indicator doesn't compete
  // with any of the queue cards but stays visible while scrolling.
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
