"use client";

import { useEffect, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

/*
  WHO ELSE IS IN THIS CONVERSATION.

  The brief asks for another agent's presence "to prevent duplicate
  replies", which is the one thing a shared inbox gets wrong that a
  personal one cannot: two people answering the same customer within a
  minute of each other, politely contradicting themselves.

  Realtime presence, keyed by the staff member's id, so a second tab is
  the same person rather than a crowd. Nothing is written down — this
  is who is looking RIGHT NOW, and when the tab closes the channel
  forgets, which is the correct lifetime for that fact.
*/

export type Viewer = { id: string; name: string; typing: boolean };

export function useCasePresence(caseId: string, me: { id: string; name: string }) {
  const [others, setOthers] = useState<Viewer[]>([]);
  const typingRef = useRef(false);
  const trackRef = useRef<((typing: boolean) => void) | null>(null);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const channel = supabase.channel(`support-case:${caseId}`, {
      config: { presence: { key: me.id } },
    });

    channel.on("presence", { event: "sync" }, () => {
      const state = channel.presenceState<Viewer>();
      const seen: Viewer[] = [];
      for (const [key, entries] of Object.entries(state)) {
        if (key === me.id) continue;
        const latest = entries[entries.length - 1];
        if (latest) seen.push({ id: key, name: latest.name, typing: Boolean(latest.typing) });
      }
      setOthers(seen);
    });

    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        void channel.track({ id: me.id, name: me.name, typing: false });
      }
    });

    trackRef.current = (typing: boolean) => {
      void channel.track({ id: me.id, name: me.name, typing });
    };

    return () => {
      trackRef.current = null;
      supabase.removeChannel(channel);
    };
  }, [caseId, me.id, me.name]);

  /* Called on every keystroke; only the transitions are published, and
     typing lapses on its own so a closed laptop does not leave somebody
     typing forever. */
  const idle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const setTyping = (typing: boolean) => {
    if (idle.current) clearTimeout(idle.current);
    if (typing !== typingRef.current) {
      typingRef.current = typing;
      trackRef.current?.(typing);
    }
    if (typing) {
      idle.current = setTimeout(() => {
        typingRef.current = false;
        trackRef.current?.(false);
      }, 4000);
    }
  };

  return { others, setTyping };
}
