"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Sparkles, ShieldCheck, MapPin, ArrowRight, ArrowLeft, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { dismissOnboardingAction } from "./onboarding-actions";

// 3-step welcome modal for first-time customers. Renders nothing when
// open=false — the dashboard server component decides whether to mount
// us based on profiles.onboarded_at. Dismissal hits the server action
// which stamps the column, so closing on one device suppresses on all.

type Step = {
  icon: React.ReactNode;
  title: string;
  body: string;
  bullets?: string[];
  cta?: { label: string; href: string };
};

const STEPS: Step[] = [
  {
    icon: <Sparkles className="w-7 h-7 text-brand-600" />,
    title: "Welcome to Helpward",
    body: "Helpward is on-demand real humans for real-world tasks — grocery pickups, errands, deliveries, pet care, home help, and a lot more.",
    bullets: [
      "Every helper is ID-verified and background-checked",
      "Real-time GPS tracking from accept to complete",
      "Pay after the task is done, not before",
    ],
  },
  {
    icon: <ShieldCheck className="w-7 h-7 text-emerald-600" />,
    title: "How a request works",
    body: "Pick a service, drop your address, and we route the request to qualified helpers nearby. The first to accept is yours — usually within minutes.",
    bullets: [
      "Live ETA and map updates while they're en route",
      "Message your helper inside the app",
      "Photo proof of completion before the task closes",
    ],
  },
  {
    icon: <MapPin className="w-7 h-7 text-rose-500" />,
    title: "One quick thing",
    body: "Save the addresses you book to often — home, work, your parent's place — and skip typing on every future request.",
    cta: { label: "Add a saved address", href: "/settings" },
  },
];

export function OnboardingTour({ open: initialOpen }: { open: boolean }) {
  const [open, setOpen] = useState(initialOpen);
  const [step, setStep] = useState(0);
  const [pending, start] = useTransition();

  if (!open) return null;
  const isLast = step === STEPS.length - 1;
  const current = STEPS[step];

  const dismiss = () => {
    setOpen(false);
    start(async () => {
      await dismissOnboardingAction();
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-3 sm:p-6 bg-slate-900/40 backdrop-blur-sm">
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
        <button
          type="button"
          onClick={dismiss}
          aria-label="Close welcome"
          className="absolute top-3 right-3 p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 z-10"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Progress dots */}
        <div className="px-6 pt-6 flex items-center gap-1.5">
          {STEPS.map((_, i) => (
            <span
              key={i}
              className={cn(
                "h-1 rounded-full transition-all",
                i === step ? "bg-brand-600 w-8" : i < step ? "bg-brand-300 w-4" : "bg-slate-200 w-4",
              )}
            />
          ))}
        </div>

        <div className="px-6 pt-5 pb-6">
          <div className="w-14 h-14 rounded-2xl bg-slate-50 inline-flex items-center justify-center mb-4">
            {current.icon}
          </div>
          <h2 className="text-xl font-bold text-slate-900">{current.title}</h2>
          <p className="text-sm text-slate-600 mt-2 leading-relaxed">{current.body}</p>

          {current.bullets && (
            <ul className="mt-4 space-y-1.5">
              {current.bullets.map((b) => (
                <li key={b} className="text-xs text-slate-700 inline-flex items-start gap-2">
                  <span className="w-1 h-1 rounded-full bg-brand-600 mt-1.5 shrink-0" />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          )}

          {current.cta && (
            <Link
              href={current.cta.href}
              onClick={dismiss}
              className="mt-4 inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-bold hover:bg-slate-800 transition"
            >
              {current.cta.label} <ArrowRight className="w-4 h-4" />
            </Link>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0 || pending}
            className="inline-flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-semibold text-slate-600 disabled:opacity-0 hover:bg-slate-100"
          >
            <ArrowLeft className="w-3 h-3" /> Back
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={dismiss}
              disabled={pending}
              className="text-xs font-semibold text-slate-400 hover:text-slate-700 px-2"
            >
              Skip
            </button>
            {isLast ? (
              <button
                type="button"
                onClick={dismiss}
                disabled={pending}
                className="inline-flex items-center gap-1 px-4 py-2 rounded-lg bg-brand-600 text-white text-xs font-bold disabled:opacity-50"
              >
                {pending ? "Saving…" : "Got it"}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}
                disabled={pending}
                className="inline-flex items-center gap-1 px-4 py-2 rounded-lg bg-brand-600 text-white text-xs font-bold"
              >
                Next <ArrowRight className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
