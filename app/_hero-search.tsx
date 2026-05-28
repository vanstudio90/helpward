"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Mic, MicOff, History, X } from "lucide-react";
import { cn } from "@/lib/cn";

const STORAGE_KEY = "helpward.recent_searches";
const MAX_RECENT = 5;

// Speech recognition lives only in the browser; Webkit prefix on Safari/iOS.
// Typed loosely on purpose — the global is not in the standard lib.dom yet.
type SpeechRecognitionLike = {
  start(): void;
  stop(): void;
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: { results: { 0: { transcript: string } }[] }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: unknown) => void) | null;
};

function getRecognition(): SpeechRecognitionLike | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  return Ctor ? new Ctor() : null;
}

export function HeroSearch({ quickRequests }: { quickRequests: string[] }) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [recent, setRecent] = useState<string[]>([]);
  const [listening, setListening] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [focused, setFocused] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  // Hydrate recents + detect voice support once.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) setRecent(JSON.parse(raw));
    } catch {/* corrupt JSON → ignore */}
    setVoiceSupported(getRecognition() !== null);
  }, []);

  const persistRecent = (next: string[]) => {
    setRecent(next);
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
  };

  const submit = (q: string) => {
    const text = q.trim();
    if (!text) return;
    const next = [text, ...recent.filter((r) => r.toLowerCase() !== text.toLowerCase())].slice(0, MAX_RECENT);
    persistRecent(next);
    router.push(`/new-request?q=${encodeURIComponent(text)}`);
  };

  const startListening = () => {
    const r = getRecognition();
    if (!r) return;
    r.continuous = false;
    r.interimResults = false;
    r.lang = "en-US";
    r.onresult = (e) => {
      const transcript = e.results[0]?.[0]?.transcript ?? "";
      if (transcript) setValue(transcript);
    };
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    recognitionRef.current = r;
    setListening(true);
    try { r.start(); } catch { setListening(false); }
  };

  const stopListening = () => {
    try { recognitionRef.current?.stop(); } catch {}
    setListening(false);
  };

  const removeRecent = (q: string) => {
    persistRecent(recent.filter((r) => r !== q));
  };

  const showRecents = focused && recent.length > 0 && value === "";

  return (
    <div className="mt-6 bg-white rounded-2xl shadow-xl shadow-brand-900/5 border border-slate-100 p-4 sm:p-5">
      <label className="text-sm font-semibold text-slate-900">What do you need help with today?</label>
      <form
        onSubmit={(e) => { e.preventDefault(); submit(value); }}
        className="mt-3 flex flex-col sm:flex-row gap-2 relative"
      >
        <div className="relative flex-1">
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onFocus={() => setFocused(true)}
            // Delay blur so clicks on recent items register before the menu hides.
            onBlur={() => setTimeout(() => setFocused(false), 150)}
            placeholder={listening ? "Listening…" : "Example: Ride to airport, furniture assembly, grocery pickup..."}
            aria-label="What do you need help with"
            className={cn(
              "w-full px-4 py-3 pr-12 rounded-xl bg-slate-50 border text-sm placeholder:text-slate-400 focus:bg-white focus:border-brand-400 focus:outline-none focus:ring-4 focus:ring-brand-100",
              listening ? "border-rose-300" : "border-slate-200"
            )}
          />
          {voiceSupported && (
            <button
              type="button"
              onClick={listening ? stopListening : startListening}
              title={listening ? "Stop voice input" : "Voice search"}
              aria-label={listening ? "Stop voice input" : "Start voice search"}
              className={cn(
                "absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg transition",
                listening
                  ? "bg-rose-600 text-white animate-pulse"
                  : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"
              )}
            >
              {listening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>
          )}

          {showRecents && (
            <div className="absolute z-20 mt-1.5 left-0 right-0 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
              <div className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
                <History className="w-3 h-3" /> Recent searches
              </div>
              <ul>
                {recent.map((r) => (
                  <li key={r} className="flex items-center group">
                    <button
                      type="button"
                      onMouseDown={(e) => { e.preventDefault(); submit(r); }}
                      className="flex-1 text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 truncate"
                    >
                      {r}
                    </button>
                    <button
                      type="button"
                      onMouseDown={(e) => { e.preventDefault(); removeRecent(r); }}
                      aria-label={`Remove ${r}`}
                      className="px-2 py-2 text-slate-400 hover:text-slate-600 opacity-0 group-hover:opacity-100"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <button
          type="submit"
          className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 transition whitespace-nowrap"
        >
          Find a helper <ArrowRight className="w-4 h-4" />
        </button>
      </form>

      <div className="mt-4">
        <div className="text-[11px] font-semibold text-slate-500 mb-2">Popular right now:</div>
        <div className="flex flex-wrap gap-1.5">
          {quickRequests.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => submit(q)}
              className="inline-flex items-center px-3 py-1.5 rounded-full bg-slate-50 border border-slate-200 text-xs font-medium text-slate-700 hover:bg-brand-50 hover:border-brand-200 hover:text-brand-700 transition"
            >
              {q}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
