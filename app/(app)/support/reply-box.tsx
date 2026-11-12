"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Send } from "lucide-react";
import { replyToSupportAction } from "./actions";

export function SupportReplyBox({ caseId }: { caseId: string }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="border-t border-slate-100 p-3 bg-white">
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        placeholder="Write a reply…"
        className="w-full text-[15px] border border-slate-200 rounded-field px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-200"
      />
      {error && <p className="text-[13px] text-rose-700 mt-1">{error}</p>}
      <div className="flex items-center gap-2 mt-2">
        <button
          disabled={pending || body.trim().length === 0}
          onClick={() => start(async () => {
            setError(null);
            const result = await replyToSupportAction(caseId, body);
            if (!result.ok) { setError(result.error); return; }
            setBody("");
            router.refresh();
          })}
          className="inline-flex items-center gap-1.5 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-[14px] font-semibold px-4 py-2 rounded-field"
        >
          {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          Send
        </button>
        <span className="text-[12px] text-slate-500">
          Support usually replies within a few hours.
        </span>
      </div>
    </div>
  );
}
