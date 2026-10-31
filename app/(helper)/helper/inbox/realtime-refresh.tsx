"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Radio, WifiOff } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/cn";

/* Realtime refresh for /helper/inbox, and the badge that reports it.
 *
 * Scoped to the rows that matter to a helper: match_attempts INSERTs (an
 * offer just dropped for me) and requests UPDATEs (someone else accepted,
 * so this card should disappear). Debounced so the broadcast cron firing
 * five attempts in 100ms causes one refresh rather than five.
 *
 * The badge used to read "Live · just now" from the moment it mounted,
 * because nothing looked at what subscribe() returned. A dropped socket,
 * a realtime outage, a revoked token — all three still said Live, on the
 * exact screen a helper watches to decide whether the quiet means "no
 * work" or "something is broken". It now reports the channel's own
 * status, and says so plainly when that status is not SUBSCRIBED.
 */

const DEBOUNCE_MS = 1500;

type Conn = "connecting" | "live" | "down";

export function HelperInboxRealtimeRefresh({
  userId, inline = false,
}: { userId: string; inline?: boolean }) {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const [conn, setConn] = useState<Conn>("connecting");

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    let timer: ReturnType<typeof setTimeout> | null = null;

    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        setRefreshing(true);
        router.refresh();
        setTimeout(() => setRefreshing(false), 400);
      }, DEBOUNCE_MS);
    };

    const channel = supabase
      .channel("provider-inbox")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "match_attempts", filter: `provider_id=eq.${userId}` },
        () => schedule(),
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "requests" },
        () => schedule(),
      )
      .subscribe((status) => {
        // SUBSCRIBED is the only status that means offers will actually
        // arrive without a manual reload.
        setConn(status === "SUBSCRIBED" ? "live"
          : status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED" ? "down"
          : "connecting");
      });

    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [router, userId]);

  const label = refreshing ? "Updating…" : conn === "live" ? "Connected" : conn === "down" ? "Reconnecting…" : "Connecting…";

  const badge = (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-bold",
        conn === "live" ? "bg-brand-50 text-brand-700" : "bg-amber-50 text-amber-800",
      )}
      role="status"
    >
      {refreshing ? (
        <RefreshCw className="w-[15px] h-[15px] animate-spin" aria-hidden="true" />
      ) : conn === "live" ? (
        <Radio className="w-[15px] h-[15px]" aria-hidden="true" />
      ) : (
        <WifiOff className="w-[15px] h-[15px]" aria-hidden="true" />
      )}
      {label}
    </span>
  );

  // Inline, the badge belongs to the status card. Floating, it is the
  // old fixed pill, kept for screens that have nowhere to put it.
  if (inline) return badge;
  return <div className="fixed top-4 right-4 z-30">{badge}</div>;
}
