"use client";

import { useState, useTransition } from "react";
import { Bell, Mail, MessageSquare, MessageCircle } from "lucide-react";
import { setNotificationPrefAction } from "./actions";
import { cn } from "@/lib/cn";

type Prefs = {
  push_booking: boolean;
  push_messages: boolean;
  email_receipts: boolean;
  email_digest: boolean;
  sms_critical: boolean;
};

export function NotificationPrefs({ initial }: { initial: Prefs }) {
  const [prefs, setPrefs] = useState(initial);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const update = (key: keyof Prefs) => {
    const next = !prefs[key];
    setPrefs({ ...prefs, [key]: next });
    setErr(null);
    start(async () => {
      const r = await setNotificationPrefAction(key, next);
      if (r?.error) {
        setPrefs({ ...prefs, [key]: !next });
        setErr(r.error);
      }
    });
  };

  return (
    <div className="rounded-2xl bg-white border border-slate-100 p-4 sm:p-5">
      <h2 className="text-base font-bold text-slate-900 mb-3">Notification preferences</h2>
      {err && <div className="mb-3 text-xs text-rose-700 bg-rose-50 rounded-lg p-2.5">{err}</div>}
      <ul className="space-y-1">
        <Toggle
          icon={<Bell className="w-4 h-4" />}
          label="Booking updates (push)"
          sub="Provider accepted, on the way, completed"
          on={prefs.push_booking}
          onChange={() => update("push_booking")}
          disabled={pending}
        />
        <Toggle
          icon={<MessageCircle className="w-4 h-4" />}
          label="New messages (push)"
          sub="When your provider sends a message"
          on={prefs.push_messages}
          onChange={() => update("push_messages")}
          disabled={pending}
        />
        <Toggle
          icon={<Mail className="w-4 h-4" />}
          label="Receipts (email)"
          sub="Get a copy of every paid receipt"
          on={prefs.email_receipts}
          onChange={() => update("email_receipts")}
          disabled={pending}
        />
        <Toggle
          icon={<Mail className="w-4 h-4" />}
          label="Weekly digest (email)"
          sub="Tips, top providers, what's new"
          on={prefs.email_digest}
          onChange={() => update("email_digest")}
          disabled={pending}
        />
        <Toggle
          icon={<MessageSquare className="w-4 h-4" />}
          label="Critical alerts (SMS)"
          sub="Provider arrival, safety, account locks"
          on={prefs.sms_critical}
          onChange={() => update("sms_critical")}
          disabled={pending}
        />
      </ul>
      <p className="text-[11px] text-slate-400 mt-3">
        Push and SMS require linking a device/phone (Phase 4-5 wiring).
      </p>
    </div>
  );
}

function Toggle({
  icon, label, sub, on, onChange, disabled,
}: { icon: React.ReactNode; label: string; sub: string; on: boolean; onChange: () => void; disabled?: boolean }) {
  return (
    <li className="flex items-center gap-3 py-2.5">
      <span className="w-9 h-9 rounded-lg bg-slate-50 inline-flex items-center justify-center text-slate-500 shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-slate-900">{label}</div>
        <div className="text-[11px] text-slate-500 leading-snug">{sub}</div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        disabled={disabled}
        onClick={onChange}
        className={cn("relative inline-flex w-10 h-6 rounded-full transition shrink-0 disabled:opacity-50", on ? "bg-brand-600" : "bg-slate-200")}
      >
        <span className={cn("absolute top-0.5 w-5 h-5 bg-white rounded-full transition shadow-sm", on ? "right-0.5" : "left-0.5")} />
      </button>
    </li>
  );
}
