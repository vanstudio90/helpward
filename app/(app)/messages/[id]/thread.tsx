"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Send } from "lucide-react";
import { cn } from "@/lib/cn";
import type { Message } from "@/lib/supabase/types";
import {
  mergeMessages, catchUpSince, connectionStateFor, nextPollDelayMs,
  type ConnectionState,
} from "@/lib/messages/sync";

// Shared by the customer thread and the helper thread. Both sides of a
// conversation run this exact component, which is worth knowing when a
// defect appears on only one side: the cause is never the code here, it
// is the connection or the session underneath it.
export function ChatThread({
  conversationId, currentUserId, initialMessages, otherAvatar, otherInitial,
}: {
  conversationId: string;
  currentUserId: string;
  initialMessages: Message[];
  otherAvatar: string | null;
  otherInitial: string;
}) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [draft, setDraft] = useState("");
  const [pending, start] = useTransition();
  const [sendError, setSendError] = useState<string | null>(null);
  const [connection, setConnection] = useState<ConnectionState>("connecting");
  const scrollerRef = useRef<HTMLDivElement>(null);

  // One client for the lifetime of the thread. Built lazily with useMemo
  // rather than useRef(create()) so it is not constructed during server
  // rendering, where there is no browser session to read.
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  // The catch-up fetch reads the current messages to work out where the
  // gap starts, but must not be re-created every time a message arrives
  // or it would restart the subscription effect on every render. The ref
  // keeps the callback stable while still seeing fresh state.
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  /** Fetch whatever was written while we were not listening.
   *
   * This is what makes the thread correct independently of the socket.
   * It runs on first subscribe, on every re-subscribe, when the tab is
   * brought back to the front, when the network returns, and on the
   * fallback poll.
   */
  const catchUp = useCallback(async () => {
    const since = catchUpSince(messagesRef.current);
    let q = supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .limit(200);
    if (since) q = q.gte("created_at", since);

    const { data, error } = await q;
    if (error || !data) return;
    setMessages((prev) => mergeMessages(prev, data as Message[]));
  }, [supabase, conversationId]);

  // Realtime subscription. Re-created when the auth token changes,
  // because the socket authorises once at subscribe time: a token that
  // expires mid-session leaves the channel joined and silent, which
  // looks identical to "nobody is typing" and is the failure that sent
  // customer messages into a helper's open view only after a reload.
  const [authEpoch, setAuthEpoch] = useState(0);
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "TOKEN_REFRESHED" || event === "SIGNED_IN") {
        setAuthEpoch((n) => n + 1);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [supabase]);

  useEffect(() => {
    let cancelled = false;

    const channel = supabase
      .channel(`conversation:${conversationId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          const m = payload.new as Message;
          setMessages((prev) => mergeMessages(prev, [m]));
        }
      )
      .subscribe((status) => {
        if (cancelled) return;
        const state = connectionStateFor(status);
        setConnection(state);
        // Every successful (re)subscribe closes the gap it opened. A
        // channel that errors and recovers has missed everything sent
        // in between and would otherwise never show it.
        if (state === "live") void catchUp();
      });

    return () => { cancelled = true; supabase.removeChannel(channel); };
  }, [supabase, conversationId, catchUp, authEpoch]);

  // Fallback poll — runs ONLY while the socket is not delivering, and
  // backs off. This is the safety net, not the mechanism: when realtime
  // is healthy this timer never schedules a request.
  useEffect(() => {
    if (connection === "live") return;
    let polls = 0;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      await catchUp();
      polls += 1;
      timer = setTimeout(tick, nextPollDelayMs(polls));
    };
    timer = setTimeout(tick, nextPollDelayMs(0));
    return () => clearTimeout(timer);
  }, [connection, catchUp]);

  // A backgrounded tab has its socket throttled or closed by the
  // browser. Coming back to it is the single most common moment for a
  // person to be looking at a stale thread, so always re-check then.
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === "visible") void catchUp(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [catchUp]);

  // Stick to the bottom only when the reader is already near it. Yanking
  // someone back down while they are reading earlier messages is worse
  // than letting a new one arrive off-screen.
  const prevCount = useRef(messages.length);
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const grew = messages.length > prevCount.current;
    prevCount.current = messages.length;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (!grew || nearBottom) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    if (text.length > 2000) {
      setSendError("Message too long (max 2000 chars). Split it into a few sends.");
      return;
    }

    // The draft stays in the box until the insert succeeds. Clearing it
    // first and restoring on failure loses what someone wrote if the tab
    // closes, the request hangs, or the error path is ever missed.
    start(async () => {
      const { data, error } = await supabase
        .from("messages")
        .insert({ conversation_id: conversationId, sender_id: currentUserId, body: text })
        .select()
        .single();
      if (error) {
        setSendError(error.message);
        return;
      }
      setSendError(null);
      setDraft("");
      if (data) setMessages((prev) => mergeMessages(prev, [data as Message]));

      await supabase
        .from("conversations")
        .update({ last_message_at: new Date().toISOString() })
        .eq("id", conversationId);
    });
  };

  return (
    <>
      {/* Messages */}
      <div ref={scrollerRef} className="flex-1 overflow-y-auto bg-slate-50/30 px-3 sm:px-4 py-4 space-y-3">
        {messages.length === 0 ? (
          <div className="text-center text-xs text-slate-400 py-8">
            No messages yet. Say hi to start the conversation.
          </div>
        ) : (
          messages.map((m) => {
            const mine = m.sender_id === currentUserId;
            return (
              <div key={m.id} className={cn("flex items-end gap-2", mine ? "justify-end" : "")}>
                {!mine && (
                  otherAvatar ? (
                    <img src={otherAvatar} className="w-7 h-7 rounded-full shrink-0" alt="" />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 font-bold text-xs shrink-0">
                      {otherInitial}
                    </div>
                  )
                )}
                <div className={cn(mine ? "items-end" : "items-start", "flex flex-col gap-1 max-w-[78%]")}>
                  <div className={cn(
                    "px-3.5 py-2.5 text-sm rounded-2xl whitespace-pre-wrap break-words",
                    mine
                      ? "bg-brand-600 text-white rounded-br-md"
                      : "bg-white border border-slate-100 rounded-bl-md text-slate-800"
                  )}>
                    {m.body}
                  </div>
                  <div className="text-[10px] text-slate-400 px-1">
                    {new Date(m.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Connection state. Shown only when messages are NOT arriving on
          their own, so a healthy thread carries no chrome — but a stalled
          one never looks like a quiet one. */}
      {connection !== "live" && (
        <div
          role="status"
          className="border-t border-amber-100 bg-amber-50 text-amber-800 text-[11px] px-4 py-1.5 flex items-center gap-2"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
          {connection === "connecting"
            ? "Connecting — checking for new messages…"
            : "Reconnecting — still checking for new messages, so nothing will be missed."}
        </div>
      )}

      {/* Composer */}
      {sendError && (
        <div className="border-t border-slate-100 bg-rose-50 text-rose-700 text-xs px-4 py-2">
          Couldn&apos;t send: {sendError} — your message is still in the box.
        </div>
      )}
      <div className="border-t border-slate-100 p-3 bg-white flex items-center gap-2">
        {/* A disabled paperclip sat here. Attachments are not built, and
            a greyed control is still a control: it invites the one click
            it refuses. */}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder="Type your message…"
          className="flex-1 px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200"
        />
        <button
          aria-label="Send"
          disabled={pending || !draft.trim()}
          onClick={send}
          className="p-2.5 rounded-xl bg-brand-600 text-white disabled:opacity-40"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </>
  );
}
