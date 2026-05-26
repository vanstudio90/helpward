"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, Search, Car, ShoppingBag, Home, Box, MapPin, Truck, User,
  MoreHorizontal, Sparkles, Bell, Check, Shield, ChevronRight, Briefcase, Heart,
} from "lucide-react";
import { cn } from "@/lib/cn";

const popular = [
  { slug: "driver", icon: Car, tone: "bg-brand-50 text-brand-600", title: "Designated Driver", blurb: "A verified driver drives your car home safely.", from: 29 },
  { slug: "grocery", icon: ShoppingBag, tone: "bg-emerald-50 text-emerald-600", title: "Grocery Pickup", blurb: "We shop and deliver groceries to your door.", from: 15 },
  { slug: "furniture", icon: Box, tone: "bg-amber-50 text-amber-600", title: "Furniture Assembly", blurb: "Experts assemble your furniture quickly.", from: 15 },
  { slug: "checkin", icon: MapPin, tone: "bg-brand-50 text-brand-600", title: "House Check-in", blurb: "We check your home and send updates.", from: 20 },
  { slug: "moving", icon: Truck, tone: "bg-orange-50 text-orange-600", title: "Moving Help", blurb: "Get help loading, unloading or moving.", from: 40 },
  { slug: "package", icon: Box, tone: "bg-violet-50 text-violet-600", title: "Package Delivery", blurb: "Pick up and deliver any item quickly.", from: 12 },
  { slug: "line", icon: User, tone: "bg-slate-100 text-slate-700", title: "Wait in Line", blurb: "We wait in line so you don't have to.", from: 15 },
  { slug: "more", icon: MoreHorizontal, tone: "bg-slate-100 text-slate-500", title: "More Services", blurb: "Explore all 100+ services available.", from: 0 },
];

const categories = ["Popular", "Transportation", "Home Help", "Errands", "Presence", "Lifestyle", "Business", "More"];

export default function NewRequestPage() {
  const [step] = useState(1);
  const [selectedSlug, setSelectedSlug] = useState("driver");
  const selected = popular.find((p) => p.slug === selectedSlug)!;

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 lg:py-8 max-w-[1500px] mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-2">
        <Link href="/dashboard" className="p-2 -ml-2 rounded-lg hover:bg-slate-100">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900">New Request</h1>
      </div>

      {/* Stepper */}
      <div className="mt-5 mb-7 flex items-center gap-3 sm:gap-5 overflow-x-auto scrollbar-none">
        <StepDot n={1} label="Choose Service" active={step === 1} done={step > 1} />
        <Line />
        <StepDot n={2} label="Provide Details" active={step === 2} done={step > 2} />
        <Line />
        <StepDot n={3} label="Review & Confirm" active={step === 3} done={false} />
        <div className="ml-auto hidden sm:flex items-center gap-2">
          <button className="p-2 rounded-xl bg-white border border-slate-200"><Sparkles className="w-4 h-4 text-brand-600" /></button>
          <button className="relative p-2 rounded-xl bg-white border border-slate-200">
            <Bell className="w-4 h-4" />
            <span className="absolute -top-1 -right-1 bg-rose-500 text-white text-[10px] font-bold rounded-full min-w-[16px] h-[16px] flex items-center justify-center px-1">3</span>
          </button>
        </div>
      </div>

      <div className="grid lg:grid-cols-[1fr_360px] xl:grid-cols-[1fr_400px] gap-6">
        <section>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900">What do you need help with?</h2>

          <div className="mt-4 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              placeholder="Search services (e.g., driver, moving, grocery...)"
              className="w-full pl-9 pr-3 py-3 rounded-xl bg-white border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200"
            />
          </div>

          <div className="mt-4 flex gap-2 overflow-x-auto scrollbar-none -mx-4 px-4">
            {categories.map((c, i) => (
              <button
                key={c}
                className={cn(
                  "shrink-0 inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-semibold transition border",
                  i === 0 ? "bg-brand-600 text-white border-brand-600" : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                )}
              >
                {i === 0 ? "⭐ " : ""}{c}
              </button>
            ))}
          </div>

          <div className="mt-6 grid sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-4 gap-4">
            {popular.map((p) => {
              const Icon = p.icon;
              const isSel = p.slug === selectedSlug;
              return (
                <button
                  key={p.slug}
                  onClick={() => setSelectedSlug(p.slug)}
                  className={cn(
                    "relative text-left rounded-2xl border p-5 transition",
                    isSel ? "border-brand-500 bg-brand-50/50 ring-4 ring-brand-100" : "border-slate-100 bg-white hover:border-slate-300"
                  )}
                >
                  {isSel && (
                    <span className="absolute top-3 right-3 w-5 h-5 rounded-full bg-brand-600 text-white flex items-center justify-center">
                      <Check className="w-3 h-3" />
                    </span>
                  )}
                  <span className={`inline-flex w-12 h-12 rounded-xl items-center justify-center mb-3 ${p.tone}`}>
                    <Icon className="w-6 h-6" />
                  </span>
                  <div className="text-sm font-bold text-slate-900">{p.title}</div>
                  <div className="text-xs text-slate-500 mt-1 line-clamp-2">{p.blurb}</div>
                  {p.from ? (
                    <div className="text-xs font-semibold text-brand-700 mt-3">From ${p.from}</div>
                  ) : (
                    <div className="text-xs font-semibold text-brand-700 mt-3">View all services →</div>
                  )}
                </button>
              );
            })}
          </div>

          <div className="mt-8">
            <h3 className="text-base font-bold text-slate-900">Can't find what you need?</h3>
            <div className="mt-3 rounded-2xl bg-brand-50/60 border border-brand-100 p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <span className="inline-flex w-12 h-12 rounded-xl bg-white border border-brand-100 items-center justify-center">
                <Sparkles className="w-5 h-5 text-brand-600" />
              </span>
              <div className="flex-1">
                <div className="text-sm font-bold text-slate-900">Custom Request</div>
                <div className="text-xs text-slate-600 mt-1">Describe what you need and we'll match you with the right person for the job.</div>
              </div>
              <button className="text-sm font-semibold text-brand-700 bg-white border border-brand-200 hover:bg-brand-50 px-4 py-2.5 rounded-xl shrink-0">
                Create Custom Request
              </button>
            </div>
          </div>

          {/* Trust strip */}
          <div className="mt-6 rounded-2xl bg-brand-50/40 border border-brand-100 p-5 grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { icon: Shield, title: "Verified Humans", sub: "All providers are background checked and verified." },
              { icon: Shield, title: "Safe & Insured", sub: "Every task is insured for your peace of mind." },
              { icon: MapPin, title: "Real-time Tracking", sub: "Track your task progress in real time." },
              { icon: Briefcase, title: "24/7 Support", sub: "Our support team is available anytime you need help." },
            ].map((t) => (
              <div key={t.title} className="flex items-start gap-3">
                <span className="inline-flex w-9 h-9 rounded-lg bg-white items-center justify-center shrink-0">
                  <t.icon className="w-4 h-4 text-brand-600" />
                </span>
                <div>
                  <div className="text-xs font-bold text-slate-900">{t.title}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">{t.sub}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Summary panel */}
        <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <div className="rounded-2xl bg-white border border-slate-100 p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-slate-900">Request Summary</h3>
              <button className="text-xs font-semibold text-brand-700">Clear all</button>
            </div>

            <div className="text-xs font-semibold text-slate-500">Service</div>
            <div className="mt-2 flex items-center gap-3 p-3 rounded-xl border border-slate-100">
              <span className={`inline-flex w-9 h-9 rounded-lg items-center justify-center ${selected.tone}`}>
                <selected.icon className="w-4 h-4" />
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold truncate">{selected.title}</div>
              </div>
              <button className="text-xs font-semibold text-brand-700">Change</button>
            </div>

            <dl className="mt-5 text-sm space-y-3">
              <div className="flex justify-between"><dt className="text-slate-500">Estimated Price</dt><dd className="font-semibold">${selected.from || 29} - ${selected.from + 20}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Est. Duration</dt><dd className="font-semibold">30 - 60 min</dd></div>
            </dl>

            <div className="mt-5 pt-4 border-t border-slate-100">
              <div className="text-xs font-semibold text-slate-500">Where</div>
              <div className="mt-2 flex items-center justify-between text-sm">
                <span className="flex items-center gap-2"><MapPin className="w-4 h-4 text-brand-600" /> 123 Main St, Vancouver, BC</span>
                <button className="text-xs font-semibold text-brand-700">Change</button>
              </div>
            </div>
            <div className="mt-4">
              <div className="text-xs font-semibold text-slate-500">When</div>
              <div className="mt-2 flex items-center justify-between text-sm">
                <span className="flex items-center gap-2"><Sparkles className="w-4 h-4 text-brand-600" /> ASAP</span>
                <button className="text-xs font-semibold text-brand-700">Change</button>
              </div>
            </div>
          </div>

          <div className="rounded-2xl bg-white border border-slate-100 p-5">
            <h3 className="text-sm font-bold text-slate-900 mb-4">How it works</h3>
            <ol className="space-y-3 text-sm">
              {["Submit your request — We'll notify available providers near you.",
                "We find the best match — A top-rated provider will accept your task.",
                "Task in progress — Track progress and communicate in real time.",
                "Task completed — Pay securely only when you're satisfied."].map((t, i) => (
                <li key={i} className="flex gap-3">
                  <span className="w-6 h-6 rounded-full bg-brand-50 text-brand-700 font-bold text-xs flex items-center justify-center shrink-0">{i+1}</span>
                  <div className="text-slate-700">{t}</div>
                </li>
              ))}
            </ol>
          </div>

          <button className="w-full inline-flex items-center justify-center gap-2 py-3.5 rounded-xl bg-gradient-to-r from-brand-600 to-violet-600 text-white font-semibold shadow-lg shadow-brand-900/10">
            Continue <ChevronRight className="w-4 h-4" />
          </button>
          <button className="w-full text-center text-sm font-semibold text-brand-700">Save as Draft</button>
        </aside>
      </div>
    </div>
  );
}

function StepDot({ n, label, active, done }: { n: number; label: string; active: boolean; done: boolean }) {
  return (
    <div className="flex items-center gap-2 shrink-0">
      <span className={cn(
        "w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold",
        active ? "bg-brand-600 text-white" : done ? "bg-emerald-500 text-white" : "bg-slate-200 text-slate-500"
      )}>
        {done ? <Check className="w-4 h-4" /> : n}
      </span>
      <span className={cn("text-sm", active ? "text-brand-700 font-semibold" : "text-slate-500")}>{label}</span>
    </div>
  );
}

function Line() {
  return <span className="hidden sm:block flex-1 h-px bg-slate-200" />;
}
