"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Radio, Volume2, VolumeX, ListChecks, MapPin, ChevronRight,
  Power, Sun, SunDim, AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { Toggle } from "@/components/ui/Toggle";
import { WaitingMap } from "@/components/helper/WaitingMap";

/* The waiting screen.
 *
 * A helper sits on this page for long stretches doing nothing, which is
 * exactly when an interface has to keep earning trust: is it still on, is
 * it still looking, will it actually tell me. The old version answered
 * none of that — a heading, a toggle and an empty card reading "No active
 * task", which is indistinguishable from a page that has quietly died.
 *
 * So the state is shown rather than asserted: a pulse that only animates
 * while online, a live label, and controls for the things a waiting helper
 * actually reaches for.
 */

const SOUND_KEY = "hw.offerSound";
const WAKE_KEY = "hw.keepAwake";

/** A short two-note chime, synthesised rather than shipped as a file. */
function playChime() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    [880, 1174.7].forEach((hz, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = hz;
      // Short attack, quick decay — a notification, not an alarm.
      const t = ctx.currentTime + i * 0.16;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.22, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.32);
    });
    setTimeout(() => ctx.close().catch(() => {}), 900);
  } catch {
    /* Audio is a courtesy. A browser that refuses it must not break the page. */
  }
}

function Row({ icon: Icon, title, sub, children, href }: {
  icon: typeof ListChecks; title: string; sub: string;
  children?: React.ReactNode; href?: string;
}) {
  const inner = (
    <>
      <span className="w-11 h-11 rounded-field bg-brand-50 flex items-center justify-center shrink-0">
        <Icon className="w-[21px] h-[21px] text-brand-600" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className="block text-[15px] font-bold text-slate-900 leading-tight">{title}</span>
        <span className="block text-[13px] text-slate-500 leading-snug mt-0.5">{sub}</span>
      </span>
      {children ?? <ChevronRight className="w-5 h-5 text-slate-300 shrink-0" aria-hidden="true" />}
    </>
  );
  const cls = "w-full flex items-center gap-3.5 bg-white rounded-card border border-slate-100 p-3.5 shadow-soft";
  return href ? <Link href={href} className={cls}>{inner}</Link> : <div className={cls}>{inner}</div>;
}

export function ReadyPanel({
  online, onToggleOnline, busy, blockedReason,
  blockers = [], serviceCount = 0, cityCount = 0, radiusKm = 20,
}: {
  online: boolean;
  onToggleOnline: (next: boolean) => void;
  busy?: boolean;
  blockedReason?: string | null;
  blockers?: { title: string; detail: string; href: string; cta: string }[];
  serviceCount?: number;
  cityCount?: number;
  radiusKm?: number;
}) {
  /* "Searching" has to mean searching.
   *
   * Being online is necessary but not sufficient: the dispatch gate also
   * wants services picked, a fresh location and vacation mode off. Unless
   * all of that holds, this screen must not pulse and must not say it is
   * looking — a helper who believes a lie here loses an evening to it. */
  const searching = online && blockers.length === 0;
  const [sound, setSound] = useState(true);
  const [awake, setAwake] = useState(false);
  const wakeRef = useRef<WakeLockSentinel | null>(null);

  // Preferences are per-device: which phone is in your pocket decides
  // whether a sound is useful, not which account you signed in with.
  useEffect(() => {
    try {
      setSound(localStorage.getItem(SOUND_KEY) !== "0");
      setAwake(localStorage.getItem(WAKE_KEY) === "1");
    } catch { /* private mode — defaults stand */ }
  }, []);

  useEffect(() => {
    try { localStorage.setItem(SOUND_KEY, sound ? "1" : "0"); } catch {}
  }, [sound]);

  /* Keep the screen on while waiting.
   *
   * A phone that sleeps stops the realtime socket, so a helper who put it
   * face-down misses the offer they were waiting for. The lock is released
   * the moment they go offline or leave — holding it longer drains a
   * battery for nothing. */
  useEffect(() => {
    let cancelled = false;
    async function apply() {
      try { await wakeRef.current?.release(); } catch {}
      wakeRef.current = null;
      if (!awake || !online) return;
      try {
        const nav = navigator as Navigator & { wakeLock?: { request(t: "screen"): Promise<WakeLockSentinel> } };
        if (!nav.wakeLock) return;
        const lock = await nav.wakeLock.request("screen");
        if (cancelled) { await lock.release(); return; }
        wakeRef.current = lock;
      } catch { /* denied or unsupported — the toggle simply has no effect */ }
    }
    apply();
    try { localStorage.setItem(WAKE_KEY, awake ? "1" : "0"); } catch {}
    return () => { cancelled = true; wakeRef.current?.release().catch(() => {}); };
  }, [awake, online]);

  // An offer arriving while this page is open plays the chime.
  useEffect(() => {
    const onOffer = () => { if (sound) playChime(); };
    window.addEventListener("helpward:offer", onOffer);
    return () => window.removeEventListener("helpward:offer", onOffer);
  }, [sound]);

  return (
    /* One column on a phone, two on a desktop.
     *
     * Stretching a phone layout across a monitor leaves a 260px radar
     * floating in a metre of white space with the controls pushed below
     * the fold. Splitting it puts the thing you watch beside the things
     * you touch, and caps the width so neither grows past readable. */
    <div className="max-w-5xl lg:grid lg:grid-cols-2 lg:gap-6 lg:items-start space-y-3 lg:space-y-0">
      <div className="space-y-3">
      <div className="px-0.5">
        <h1 className="text-[30px] leading-[1.15] font-extrabold text-slate-900 flex items-start gap-2.5">
          <Radio className={cn("w-7 h-7 mt-1 shrink-0", searching ? "text-brand-600" : "text-slate-300")} aria-hidden="true" />
          {searching ? "Ready for requests" : online ? "Almost ready" : "You're offline"}
        </h1>
        <p className="mt-1.5 text-[17px] text-slate-500 leading-snug">
          {searching
            ? "Stay online. New offers appear here."
            : online
              ? blockers.length === 1
                ? "One thing is stopping offers reaching you."
                : `${blockers.length} things are stopping offers reaching you.`
              : "Go online to start receiving offers."}
        </p>
      </div>

      <div className="flex items-center gap-3 bg-white rounded-card border border-slate-100 p-4 shadow-soft">
        <span className={cn("w-3 h-3 rounded-full shrink-0", online ? "bg-emerald-500" : "bg-slate-300")} />
        <span className="flex-1 text-[17px] font-bold text-slate-900">
          {online ? "You're online" : "You're offline"}
        </span>
        <Toggle on={online} busy={busy} onChange={onToggleOnline} label="Online for task offers" />
      </div>

      {blockedReason && (
        <p className="text-[13px] text-amber-800 bg-amber-50 border border-amber-100 rounded-field px-3.5 py-2.5">
          {blockedReason}
        </p>
      )}

      {blockers.length > 0 && (
        <ul className="space-y-2">
          {blockers.map((b) => (
            <li
              key={b.title}
              className="flex items-start gap-3 bg-amber-50 border border-amber-200/80 rounded-card p-3.5"
            >
              <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-bold text-amber-950">{b.title}</span>
                <span className="block text-[13px] text-amber-900/80 leading-snug mt-0.5">{b.detail}</span>
                <Link
                  href={b.href}
                  className="inline-block mt-2 text-[13px] font-bold text-amber-900 underline underline-offset-2"
                >
                  {b.cta}
                </Link>
              </span>
            </li>
          ))}
        </ul>
      )}

      {/* The radar. It animates ONLY while online, so the page cannot look
          busy while nothing is happening — the single most misleading
          thing a waiting screen can do. */}
      <div className="relative rounded-panel overflow-hidden bg-brand-50 border border-brand-100/60 h-[260px] lg:h-[320px]">
        <WaitingMap />
        <div className="absolute inset-0 flex items-center justify-center">
          {searching && [0, 1, 2].map((i) => (
            <span
              key={i}
              aria-hidden="true"
              className="absolute rounded-full bg-brand-500/15 hw-radar"
              style={{ width: 150, height: 150, animationDelay: `${i * 1.1}s` }}
            />
          ))}
          <span className="relative z-10 flex items-center justify-center w-[52px] h-[52px]">
            <MapPin className={cn("w-11 h-11", searching ? "text-brand-600" : "text-slate-400")} aria-hidden="true" />
          </span>
        </div>
        <div className="absolute inset-x-0 bottom-4 flex justify-center">
          <span className="inline-flex items-center gap-2 bg-white rounded-btn px-4 py-2.5 shadow-lift text-[14px] font-bold text-slate-900">
            <Radio className={cn("w-4 h-4", searching ? "text-brand-600" : "text-slate-400")} aria-hidden="true" />
            {searching ? "Looking for nearby requests" : "Not receiving requests"}
          </span>
        </div>
      </div>

      </div>

      <div className="space-y-3">
      <div className="text-center lg:text-left px-4 lg:px-0 pt-3 lg:pt-0 pb-1">
        <p className="text-[19px] font-extrabold text-slate-900 leading-snug">
          {searching
            ? "We'll ping you when an offer arrives"
            : online
              ? "Fix the above and offers start arriving"
              : "Nothing will reach you while you're offline"}
        </p>
        <p className="mt-1.5 text-[15px] text-slate-500 leading-snug max-w-xs mx-auto lg:mx-0">
          {searching
            ? "Review the job and your earnings, then choose whether to accept."
            : online
              ? "Nothing is being sent to you until each item above is sorted."
              : "Your place in the queue isn't affected by going offline."}
        </p>
      </div>

      <Row
        icon={ListChecks}
        title="Your services"
        sub={serviceCount === 0
          ? "None picked yet — pick some to receive offers."
          : `${serviceCount} selected. Tap to change what you take.`}
        href="/helper/profile"
      />
      <Row
        icon={MapPin}
        title="Cities you work in"
        sub={cityCount === 0
          ? `Everywhere within ${radiusKm} km of you.`
          : `${cityCount} selected, within ${radiusKm} km of you.`}
        href="/helper/profile"
      />
      <Row
        icon={sound ? Volume2 : VolumeX}
        title="Sound alerts"
        sub="Sound plays while this page is open."
      >
        <Toggle on={sound} onChange={setSound} label="Play a sound when an offer arrives" />
      </Row>
      <Row
        icon={awake ? Sun : SunDim}
        title="Keep screen awake"
        sub="Stops your phone sleeping while you wait."
      >
        <Toggle on={awake} onChange={setAwake} label="Keep the screen awake while online" />
      </Row>

      <button
        type="button"
        disabled={busy}
        onClick={() => onToggleOnline(!online)}
        className={cn(
          "w-full flex items-center justify-center gap-2.5 rounded-btn py-4 text-[17px] font-bold transition-colors disabled:opacity-50",
          online
            ? "border-2 border-brand-600 text-brand-700 bg-white"
            : "bg-brand-600 text-white",
        )}
      >
        <Power className="w-5 h-5" aria-hidden="true" />
        {busy ? "Just a moment…" : online ? "Go offline" : "Go online"}
      </button>
      </div>
    </div>
  );
}
