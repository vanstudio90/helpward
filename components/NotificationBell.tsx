"use client";

import { useEffect, useState } from "react";
import { Bell, X } from "lucide-react";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/cn";

export function NotificationBell({
  userId, initialUnread,
}: { userId: string; initialUnread: number }) {
  const [count, setCount] = useState(initialUnread);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Array<{ id: string; type: string; payload: Record<string, unknown>; created_at: string; read_at: string | null }>>([]);

  // Real-time: bump count on new notifications
  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel(`notifs:${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        () => setCount((c) => c + 1)
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId]);

  // Per-item dismiss: optimistic remove from local list, then RLS-scoped
  // delete from the table. If the delete fails (network, RLS regression)
  // we revert so the user can retry. Decrement unread badge only when the
  // dismissed item was actually unread.
  const dismiss = (id: string) => {
    const prev = items;
    const wasUnread = items.find((x) => x.id === id)?.read_at == null;
    setItems((arr) => arr.filter((x) => x.id !== id));
    if (wasUnread) setCount((c) => Math.max(0, c - 1));
    const supabase = createSupabaseBrowserClient();
    supabase
      .from("notifications")
      .delete()
      .eq("id", id)
      .then(({ error }) => {
        if (error) {
          console.error("notifications delete:", error.message);
          setItems(prev);
          if (wasUnread) setCount((c) => c + 1);
        }
      });
  };

  // Load list when opening. We deliberately DON'T auto-mark-everything-read
  // here anymore — per-item dismiss exists, and bulk auto-mark on glance
  // was burying real unread items the user wanted to come back to. The
  // explicit "Mark all read" button in the header handles the bulk case.
  useEffect(() => {
    if (!open) return;
    const supabase = createSupabaseBrowserClient();
    supabase
      .from("notifications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(15)
      .then(({ data, error }) => {
        if (error) {
          console.error("notifications load:", error.message);
          return;
        }
        if (data) setItems(data);
      });
  }, [open]);

  // Bulk "Mark all read" — flips read_at on every unread row for this user.
  // RLS scopes the update; client trusts the badge count of the resulting
  // local state instead of re-fetching.
  const markAllRead = () => {
    const prev = items;
    const now = new Date().toISOString();
    setItems((arr) => arr.map((x) => x.read_at ? x : { ...x, read_at: now }));
    setCount(0);
    const supabase = createSupabaseBrowserClient();
    supabase
      .from("notifications")
      .update({ read_at: now })
      .is("read_at", null)
      .then(({ error }) => {
        if (error) {
          console.error("notifications mark-all-read:", error.message);
          setItems(prev);
          setCount(prev.filter((x) => !x.read_at).length);
        }
      });
  };

  // Bulk "Clear all" — deletes every notification for this user. Aggressive
  // by design (no per-row confirm) because per-item dismiss already exists
  // for cherry-picking and this button is for the inbox-zero use case.
  const clearAll = () => {
    if (items.length === 0) return;
    const prev = items;
    const prevCount = count;
    setItems([]);
    setCount(0);
    const supabase = createSupabaseBrowserClient();
    supabase
      .from("notifications")
      .delete()
      .in("id", prev.map((x) => x.id))
      .then(({ error }) => {
        if (error) {
          console.error("notifications clear-all:", error.message);
          setItems(prev);
          setCount(prevCount);
        }
      });
  };

  return (
    <div className="relative">
      <button
        aria-label="Notifications"
        onClick={() => setOpen((v) => !v)}
        className="relative p-2 rounded-xl hover:bg-slate-100"
      >
        <Bell className="w-5 h-5 text-slate-700" />
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 bg-rose-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
            {count > 9 ? "9+" : count}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-2xl shadow-xl border border-slate-200 z-40 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-2">
              <div className="text-sm font-bold text-slate-900 shrink-0">Notifications</div>
              {items.length > 0 ? (
                <div className="flex items-center gap-2 text-[11px] font-semibold">
                  {count > 0 && (
                    <button
                      type="button"
                      onClick={markAllRead}
                      className="text-brand-700 hover:text-brand-800"
                    >
                      Mark all read
                    </button>
                  )}
                  <span className="text-slate-300" aria-hidden>·</span>
                  <button
                    type="button"
                    onClick={clearAll}
                    className="text-rose-600 hover:text-rose-700"
                  >
                    Clear all
                  </button>
                </div>
              ) : (
                <div className="text-[11px] text-slate-500">—</div>
              )}
            </div>
            <ul className="max-h-96 overflow-y-auto">
              {items.length === 0 && (
                <li className="px-4 py-8 text-center text-sm text-slate-500">You're all caught up.</li>
              )}
              {items.map((n) => {
                const href = hrefFor(n.type, n.payload);
                const body = (
                  <>
                    <div className="text-sm font-semibold text-slate-900">{labelFor(n.type)}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{new Date(n.created_at).toLocaleString()}</div>
                  </>
                );
                return (
                  <li key={n.id} className={cn(
                    "relative group border-b border-slate-100 last:border-b-0",
                    !n.read_at && "bg-brand-50/30"
                  )}>
                    {href ? (
                      <Link
                        href={href}
                        onClick={() => setOpen(false)}
                        className="block px-4 py-3 pr-10 hover:bg-slate-50 transition"
                      >
                        {body}
                      </Link>
                    ) : (
                      <div className="px-4 py-3 pr-10">{body}</div>
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        dismiss(n.id);
                      }}
                      aria-label="Dismiss notification"
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}

// Map a notification type + payload to the page that's most useful to open.
// Returns null when there's no good destination (some notifications are
// pure FYI, e.g. provider_rejected — sending the helper somewhere isn't
// the right move). Keeps the bell from getting actively annoying.
function hrefFor(type: string, payload: Record<string, unknown>): string | null {
  const bookingId = typeof payload.booking_id === "string" ? payload.booking_id : null;
  const requestId = typeof payload.request_id === "string" ? payload.request_id : null;

  switch (type) {
    // Helper-side: new offer lands them on their inbox where the full
    // offer card with accept/decline lives.
    case "new_request_offered":
      return "/provider/inbox";

    // Helper-side: their active-task screen is the right landing for both
    // reminders (about to start) and no-show notices (about what just
    // happened). Reviews live on the dedicated /provider/reviews page.
    case "helper_booking_reminder":
    case "booking_no_show":
      return "/provider/active";
    case "review_received":
      return "/provider/reviews";

    // Customer-side: T-30 reminder lands on the booking detail page where
    // they can message the helper or open dispute if something's off.
    case "booking_reminder":
      return bookingId ? `/bookings/${bookingId}` : "/bookings";

    // Customer-side: booking lifecycle events all jump to that booking's
    // detail page — that's where they can message, dispute, cancel, etc.
    case "booking_accepted":
    case "booking_cancelled":
    case "booking_auto_cancelled":
    case "booking_no_show":
    case "booking_auto_completed":
    case "task_started":
    case "task_completed":
    case "portfolio_photo_featured":
      return bookingId ? `/bookings/${bookingId}` : "/bookings";

    case "dispute_opened":
      return bookingId ? `/bookings/${bookingId}/dispute` : "/bookings";

    case "request_expired":
      // Land them on /new-request so they can re-submit, not on the dead
      // expired-request detail page. Drop the request_id since it's no
      // longer actionable.
      return "/new-request";

    case "provider_approved":
      return "/provider/dashboard";

    case "data_export_ready":
      // /settings/data auto-surfaces the most recent ready archive with a
      // download CTA — no need to point at a specific export id.
      return "/settings/data";

    // No-href types: provider_rejected (the helper doesn't need a deep
    // link to bad news; their profile sub-page handles re-applying).
    case "provider_rejected":
      return null;

    default:
      // Unknown types fall back to a sensible default based on what's in
      // the payload, or null if we can't infer anything.
      if (bookingId) return `/bookings/${bookingId}`;
      if (requestId) return "/bookings";
      return null;
  }
}

function labelFor(type: string) {
  switch (type) {
    case "new_request_offered": return "New task offer";
    case "booking_accepted": return "A provider accepted your request";
    case "booking_cancelled": return "A booking was cancelled";
    case "booking_auto_cancelled": return "Booking auto-cancelled — provider didn't arrive";
    case "booking_no_show": return "You missed a scheduled booking";
    case "booking_auto_completed": return "Your task was auto-completed";
    case "request_expired": return "Your request expired — no providers available";
    case "task_started": return "Your task has started";
    case "task_completed": return "Your task is complete";
    case "dispute_opened": return "A dispute was opened";
    case "provider_approved": return "You're approved! You can now accept tasks";
    case "provider_rejected": return "Your provider application was reviewed";
    case "data_export_ready": return "Your data export is ready to download";
    case "portfolio_photo_featured": return "Your helper featured a photo from your booking";
    case "review_received": return "You received a new review";
    case "booking_reminder": return "Your task starts soon";
    case "helper_booking_reminder": return "You have a task starting soon";
    case "booking_no_show": return "Booking auto-cancelled — you didn't arrive";
    default: return type.replace(/_/g, " ");
  }
}
