"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Send, Paperclip } from "lucide-react";
import { cn } from "@/lib/cn";
import type { Message } from "@/lib/supabase/types";

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
  const scrollerRef = useRef<HTMLDivElement>(null);

  // Subscribe to Realtime updates
  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel(`conversation:${conversationId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          const m = payload.new as Message;
          setMessages((prev) => prev.some((x) => x.id === m.id) ? prev : [...prev, m]);
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [conversationId]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollerRef.current) {
      scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
    }
  }, [messages.length]);

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    if (text.length > 2000) {
      setSendError("Message too long (max 2000 chars). Split it into a few sends.");
      return;
    }
    setDraft("");

    start(async () => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase
        .from("messages")
        .insert({
          conversation_id: conversationId,
          sender_id: currentUserId,
          body: text,
        })
        .select()
        .single();
      if (error) {
        setSendError(error.message);
        setDraft(text); // restore
        return;
      }
      setSendError(null);
      // Optimistically add — the channel will dedupe
      if (data) {
        setMessages((prev) => prev.some((x) => x.id === data.id) ? prev : [...prev, data as Message]);
      }
      // Bump conversation last_message_at
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

      {/* Composer */}
      {sendError && (
        <div className="border-t border-slate-100 bg-rose-50 text-rose-700 text-xs px-4 py-2">
          Couldn&apos;t send: {sendError}
        </div>
      )}
      <div className="border-t border-slate-100 p-3 bg-white flex items-center gap-2">
        <button aria-label="Attach" title="File attachments ship once Supabase Storage upload UI is wired" className="p-2 text-slate-400 cursor-not-allowed" disabled><Paperclip className="w-4 h-4" /></button>
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
