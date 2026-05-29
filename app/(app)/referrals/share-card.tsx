"use client";

import { useActionState, useState, useTransition } from "react";
import {
  Copy, CheckCircle2, Mail, MessageSquare, Share2, AlertCircle,
} from "lucide-react";
import { setReferralMessageAction } from "./actions";

// Code + share UI. The code is server-allocated before the page renders so
// this component never has to ask the server to mint one.
//
// Share buttons use the Web Share API when available (mobile) and fall back
// to a copy button + mailto/sms intents on desktop.

const SITE = "https://helpward.com";

export function ShareCard({
  code, initialMessage, rewardCents,
}: { code: string; initialMessage: string | null; rewardCents: number }) {
  const link = `${SITE}/signup?ref=${code}`;
  const rewardLabel = `$${(rewardCents / 100).toFixed(0)}`;
  const defaultShareText =
    initialMessage ||
    `I've been using Helpward for verified humans for rides, errands, and home tasks. Use my code ${code} and you'll get ${rewardLabel} off your first booking.`;

  const [copied, setCopied] = useState<"code" | "link" | null>(null);
  const [shared, setShared] = useState(false);

  const copy = async (text: string, which: "code" | "link") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      setTimeout(() => setCopied(null), 1500);
    } catch {/* ignore */}
  };

  const nativeShare = async () => {
    if (typeof navigator === "undefined" || !navigator.share) return;
    try {
      await navigator.share({ title: "Helpward", text: defaultShareText, url: link });
      setShared(true);
      setTimeout(() => setShared(false), 1500);
    } catch {/* user cancelled or share unsupported, no-op */}
  };

  const mailto =
    `mailto:?subject=${encodeURIComponent(`I think you'd like Helpward — here's ${rewardLabel} off`)}` +
    `&body=${encodeURIComponent(defaultShareText + "\n\n" + link)}`;
  const sms =
    `sms:?&body=${encodeURIComponent(defaultShareText + "\n\n" + link)}`;

  return (
    <section className="rounded-2xl bg-white border border-slate-100 p-5 sm:p-6">
      <h2 className="text-base font-bold text-slate-900 mb-4">Your code &amp; link</h2>

      <div className="grid sm:grid-cols-[auto_1fr] gap-3 items-stretch">
        {/* Big code chip */}
        <div className="rounded-2xl bg-gradient-to-br from-brand-600 to-violet-700 text-white p-5 text-center min-w-[140px]">
          <div className="text-[10px] uppercase tracking-widest text-white/70 mb-1">Your code</div>
          <div className="text-3xl font-black tracking-widest font-mono">{code}</div>
          <button
            type="button"
            onClick={() => copy(code, "code")}
            className="mt-3 inline-flex items-center gap-1 text-[11px] font-semibold text-white/90 hover:text-white"
          >
            {copied === "code" ? <><CheckCircle2 className="w-3 h-3" /> Copied</> : <><Copy className="w-3 h-3" /> Copy code</>}
          </button>
        </div>

        {/* Share link + actions */}
        <div className="rounded-2xl bg-slate-50 border border-slate-100 p-4 flex flex-col">
          <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-1">Share link</div>
          <div className="flex items-center gap-2 mb-3">
            <input
              readOnly
              value={link}
              onClick={(e) => (e.target as HTMLInputElement).select()}
              className="flex-1 px-3 py-2 rounded-lg bg-white border border-slate-200 text-xs font-mono text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-200"
            />
            <button
              type="button"
              onClick={() => copy(link, "link")}
              aria-label="Copy share link"
              className="px-3 py-2 rounded-lg bg-slate-900 text-white text-xs font-semibold inline-flex items-center gap-1.5"
            >
              {copied === "link" ? <><CheckCircle2 className="w-3.5 h-3.5" /> Copied</> : <><Copy className="w-3.5 h-3.5" /> Copy</>}
            </button>
          </div>

          <div className="flex flex-wrap gap-2 mt-auto">
            <button
              type="button"
              onClick={nativeShare}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white border border-slate-200 text-xs font-semibold text-slate-700 hover:border-brand-300"
            >
              <Share2 className="w-3.5 h-3.5" /> {shared ? "Shared" : "Share…"}
            </button>
            <a
              href={mailto}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white border border-slate-200 text-xs font-semibold text-slate-700 hover:border-brand-300"
            >
              <Mail className="w-3.5 h-3.5" /> Email
            </a>
            <a
              href={sms}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white border border-slate-200 text-xs font-semibold text-slate-700 hover:border-brand-300"
            >
              <MessageSquare className="w-3.5 h-3.5" /> Text
            </a>
          </div>
        </div>
      </div>

      <MessageEditor initial={initialMessage} />
    </section>
  );
}

function MessageEditor({ initial }: { initial: string | null }) {
  const [state, formAction, pending] = useActionState(setReferralMessageAction, undefined);
  const [value, setValue] = useState(initial ?? "");
  const [editing, setEditing] = useState(false);

  return (
    <form action={formAction} className="mt-5 pt-5 border-t border-slate-100">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-bold text-slate-700">Personal message (optional)</span>
        {!editing && (
          <button type="button" onClick={() => setEditing(true)} className="text-[11px] font-semibold text-brand-700 hover:text-brand-800">
            {initial ? "Edit" : "Add"}
          </button>
        )}
      </div>
      {editing ? (
        <>
          <textarea
            name="message"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            rows={2}
            maxLength={240}
            placeholder="Replace the default share blurb with your own words…"
            className="w-full px-3 py-2 rounded-lg bg-white border border-slate-200 text-sm focus:outline-none focus:ring-4 focus:ring-brand-100 focus:border-brand-400"
          />
          <div className="flex items-center justify-between mt-2">
            <span className="text-[10px] text-slate-400">{value.length}/240</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => { setValue(initial ?? ""); setEditing(false); }}
                className="text-xs font-semibold text-slate-500"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={pending}
                className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-semibold disabled:opacity-50"
              >
                {pending ? "Saving…" : "Save message"}
              </button>
            </div>
          </div>
        </>
      ) : (
        <p className="text-xs text-slate-600 leading-relaxed">
          {initial || <span className="text-slate-400 italic">Using the default share blurb.</span>}
        </p>
      )}
      {state?.error && (
        <div className="mt-2 flex items-start gap-1 text-[11px] text-rose-700">
          <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" /> {state.error}
        </div>
      )}
      {state?.success && !editing && (
        <div className="mt-2 flex items-start gap-1 text-[11px] text-emerald-700">
          <CheckCircle2 className="w-3 h-3 mt-0.5 shrink-0" /> {state.success}
        </div>
      )}
    </form>
  );
}
