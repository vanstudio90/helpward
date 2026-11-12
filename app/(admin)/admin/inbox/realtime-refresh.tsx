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
  // The conversations themselves come first: a customer's reply landing
  // is the one change on this page somebody is waiting for.
  "support_cases",
  "support_messages",
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

    /*
      A HIDDEN TAB IS NOT WATCHED, SO IT IS NOT REFRESHED.

      This page re-runs its server reads on every change to eight
      tables. On a screen somebody is reading, that is the point. On
      the four admin tabs left open behind it, it was a page render per
      change, all day. Changes that land while hidden set a flag, and
      the catch-up happens the moment the tab is looked at again — so
      nothing is missed, it is just not paid for twice.
    */
    let missedWhileHidden = false;

    const run = () => {
      setRefreshing(true);
      router.refresh();
      // Reset the spinning state shortly after — router.refresh resolves
      // server-side; the brief animation is just a "we saw it" signal.
      setTimeout(() => {
        setRefreshing(false);
        setLastRefresh(Date.now());
      }, 400);
    };

    const schedule = () => {
      if (document.visibilityState === "hidden") {
        missedWhileHidden = true;
        return;
      }
      if (timer) clearTimeout(timer);
      timer = setTimeout(run, DEBOUNCE_MS);
    };

    const onVisible = () => {
      if (document.visibilityState === "visible" && missedWhileHidden) {
        missedWhileHidden = false;
        run();
      }
    };
    document.addEventListener("visibilitychange", onVisible);

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
      document.removeEventListener("visibilitychange", onVisible);
      supabase.removeChannel(channel);
    };
  }, [router]);

  /*
    Rendered inline in the tab row rather than as a floating pill: the
    freshness of the list matters exactly where the list is, and a badge
    fixed over the corner of the screen was covering the thread.
  */
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
      {refreshing ? (
        <RefreshCw className="w-3 h-3 animate-spin text-brand-600" />
      ) : (
        <span className="relative inline-flex">
          <Radio className="w-3 h-3 text-emerald-600" />
          <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
        </span>
      )}
      {refreshing ? "Refreshing…" : `Updated ${freshness(lastRefresh)}`}
    </span>
  );
}

function freshness(t: number): string {
  const s = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}
