"use client";

import { useEffect, useState, useTransition } from "react";
import { Bell, BellOff, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import {
  registerPushSubscriptionAction,
  unregisterPushSubscriptionAction,
} from "./push-actions";

// Push-notification toggle. Loads the OneSignal v16 SDK from CDN on first
// mount (only when NEXT_PUBLIC_ONESIGNAL_APP_ID is set), drives the
// browsers permission prompt + subscription on click, syncs the resulting
// player_id back to /push_subscriptions via the server action.
//
// Pre-key posture mirrors lib/push.ts: when the app id env isnt set we
// render a small "Push notifications coming soon" card instead of the
// toggle so the customer doesnt click a button that silently no-ops.

declare global {
  interface Window {
    OneSignalDeferred?: Array<(os: OneSignalType) => void | Promise<void>>;
    OneSignal?: OneSignalType;
  }
}

type OneSignalType = {
  init: (cfg: { appId: string; safari_web_id?: string; allowLocalhostAsSecureOrigin?: boolean }) => Promise<void>;
  Notifications: {
    permission: boolean;
    permissionNative: NotificationPermission;
    requestPermission: () => Promise<boolean>;
  };
  User: {
    PushSubscription: {
      id?: string;
      addEventListener: (event: "change", cb: (e: { current: { id?: string } }) => void) => void;
      optIn: () => Promise<void>;
      optOut: () => Promise<void>;
    };
  };
};

const SDK_SRC = "https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js";

export function PushToggle({ appId }: { appId: string | null }) {
  const [ready, setReady] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // Load + init the SDK once on mount when configured.
  useEffect(() => {
    if (!appId) return;
    let cancelled = false;

    // Idempotent script-tag injection — re-renders within the same tab
    // shouldnt re-add the script.
    if (!document.querySelector(`script[src="${SDK_SRC}"]`)) {
      const s = document.createElement("script");
      s.src = SDK_SRC;
      s.async = true;
      document.head.appendChild(s);
    }
    window.OneSignalDeferred = window.OneSignalDeferred || [];
    window.OneSignalDeferred.push(async (OneSignal) => {
      if (cancelled) return;
      try {
        await OneSignal.init({ appId, allowLocalhostAsSecureOrigin: true });
        setReady(true);
        const id = OneSignal.User.PushSubscription.id ?? null;
        setPlayerId(id);
        setEnabled(!!id && OneSignal.Notifications.permission);
        // Keep state in sync if the subscription changes from another tab
        // or after the user toggles permission in browser settings.
        OneSignal.User.PushSubscription.addEventListener("change", (e) => {
          const newId = e.current.id ?? null;
          setPlayerId(newId);
          setEnabled(!!newId);
        });
      } catch (e) {
        setErr(e instanceof Error ? e.message : "SDK init failed");
      }
    });
    return () => { cancelled = true; };
  }, [appId]);

  const enable = () => {
    setErr(null);
    start(async () => {
      try {
        const OneSignal = window.OneSignal;
        if (!OneSignal) throw new Error("SDK not ready");
        const granted = await OneSignal.Notifications.requestPermission();
        if (!granted) {
          setErr("Permission denied. Re-enable from your browser's site settings if you change your mind.");
          return;
        }
        await OneSignal.User.PushSubscription.optIn();
        const id = OneSignal.User.PushSubscription.id;
        if (!id) throw new Error("No subscription id after opt-in");
        const r = await registerPushSubscriptionAction(id, navigator.userAgent);
        if ("error" in r) { setErr(r.error); return; }
        setPlayerId(id);
        setEnabled(true);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Could not enable push.");
      }
    });
  };

  const disable = () => {
    setErr(null);
    start(async () => {
      try {
        const OneSignal = window.OneSignal;
        if (OneSignal) await OneSignal.User.PushSubscription.optOut();
        if (playerId) {
          const r = await unregisterPushSubscriptionAction(playerId);
          if ("error" in r) { setErr(r.error); return; }
        }
        setEnabled(false);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Could not disable.");
      }
    });
  };

  // Pre-key window: no app id env var means push isnt provisioned yet.
  if (!appId) {
    return (
      <div className="rounded-2xl bg-slate-50 border border-slate-100 p-4 sm:p-5">
        <h2 className="text-base font-bold text-slate-900 inline-flex items-center gap-2 mb-1">
          <Bell className="w-4 h-4 text-slate-400" /> Push notifications
        </h2>
        <p className="text-xs text-slate-500 leading-relaxed">
          Coming soon — we&apos;ll send real-time alerts when your helper accepts, arrives, and wraps up.
          The bell + email digest cover you in the meantime.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-white border border-slate-100 p-4 sm:p-5">
      <h2 className="text-base font-bold text-slate-900 inline-flex items-center gap-2 mb-1">
        <Bell className="w-4 h-4 text-brand-600" /> Push notifications
      </h2>
      <p className="text-xs text-slate-500 leading-relaxed mb-3">
        Real-time alerts on this device for new bookings, helper-arrived, and task-complete events.
        Each device is independent — turn it on per browser/phone.
      </p>

      {err && (
        <div className="mb-3 flex items-start gap-2 text-xs text-rose-700 bg-rose-50 border border-rose-100 rounded-lg p-2.5">
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {err}
        </div>
      )}

      {!ready ? (
        <div className="text-xs text-slate-500 inline-flex items-center gap-1.5">
          <Loader2 className="w-3 h-3 animate-spin" /> Loading…
        </div>
      ) : enabled ? (
        <div className="flex items-center gap-3 rounded-xl bg-emerald-50 border border-emerald-100 p-3">
          <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
          <div className="flex-1 min-w-0 text-xs text-emerald-900">
            <strong>Enabled on this device.</strong> You&apos;ll get a popup the moment your helper accepts a task.
          </div>
          <button
            type="button"
            onClick={disable}
            disabled={pending}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-50 shrink-0"
          >
            {pending ? <Loader2 className="w-3 h-3 animate-spin" /> : <BellOff className="w-3 h-3" />}
            Turn off
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={enable}
          disabled={pending}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-bold disabled:opacity-50"
        >
          {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bell className="w-4 h-4" />}
          Enable push notifications
        </button>
      )}
    </div>
  );
}
