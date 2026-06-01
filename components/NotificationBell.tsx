"use client";

import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
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

  // Load list when opening
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
        // Mark unread as read — best-effort; only flip badge if write succeeds
        supabase
          .from("notifications")
          .update({ read_at: new Date().toISOString() })
          .is("read_at", null)
          .then(({ error: updErr }) => {
            if (updErr) console.error("notifications mark-read:", updErr.message);
            else setCount(0);
          });
      });
  }, [open]);

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
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
              <div className="text-sm font-bold text-slate-900">Notifications</div>
              <div className="text-[11px] text-slate-500">{items.length} most recent</div>
            </div>
            <ul className="max-h-96 overflow-y-auto">
              {items.length === 0 && (
                <li className="px-4 py-8 text-center text-sm text-slate-500">You're all caught up.</li>
              )}
              {items.map((n) => (
                <li key={n.id} className={cn(
                  "px-4 py-3 border-b border-slate-100 last:border-b-0",
                  !n.read_at && "bg-brand-50/30"
                )}>
                  <div className="text-sm font-semibold text-slate-900">{labelFor(n.type)}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{new Date(n.created_at).toLocaleString()}</div>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
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
    default: return type.replace(/_/g, " ");
  }
}
