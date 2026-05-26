"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, Search, Car, ShoppingBag, Home, Box, MapPin, Truck, User,
  MoreHorizontal, Sparkles, Check, Shield, ArrowRight, Calendar, Star,
  Info, Headphones,
} from "lucide-react";
import { cn } from "@/lib/cn";

const popular = [
  { slug: "driver", icon: Car, tone: "bg-brand-50 text-brand-600", title: "Designated Driver", blurb: "A verified driver drives your car home safely.", from: 29 },
  { slug: "grocery", icon: ShoppingBag, tone: "bg-emerald-50 text-emerald-600", title: "Grocery Pickup", blurb: "We shop and deliver groceries to your door.", from: 15 },
  { slug: "furniture", icon: Box, tone: "bg-amber-50 text-amber-600", title: "Furniture Assembly", blurb: "Experts assemble your furniture quickly.", from: 15 },
  { slug: "checkin", icon: MapPin, tone: "bg-brand-50 text-brand-600", title: "House Check-in", blurb: "We check your home and send updates.", from: 20 },
  { slug: "moving", icon: Truck, tone: "bg-orange-50 text-orange-600", title: "Moving Help", blurb: "Get help loading, unloading or moving.", from: 40 },
  { slug: "package", icon: Box, tone: "bg-violet-50 text-violet-600", title: "Package Delivery", blurb: "Pick up and deliver any item quickly.", from: 12 },
  { slug: "line", icon: User, tone: "bg-emerald-50 text-emerald-600", title: "Wait in Line", blurb: "We wait in line so you don't have to.", from: 15 },
  { slug: "more", icon: MoreHorizontal, tone: "bg-slate-100 text-slate-500", title: "More Services", blurb: "Explore all 100+ services available.", from: 0 },
];

const categories = ["Popular", "Transportation", "Home Help", "Errands"];

export default function NewRequestPage() {
  const [step] = useState(1);
  const [selectedSlug, setSelectedSlug] = useState("driver");
  const selected = popular.find((p) => p.slug === selectedSlug)!;

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-5 lg:py-8 max-w-[1500px] mx-auto">
      {/* Back + heading */}
      <div className="flex items-center gap-3 mb-3 lg:mb-5">
        <Link href="/dashboard" aria-label="Back" className="p-2 -ml-2 rounded-lg hover:bg-slate-100">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">New Request</h1>
      </div>

      {/* Stepper — all 3 fit on a 375pt viewport */}
      <div className="mb-6 lg:mb-8 flex items-center gap-1.5 sm:gap-3">
        <StepDot n={1} label="Choose Service" active={step === 1} done={step > 1} />
        <Dash />
        <StepDot n={2} label="Provide Details" active={step === 2} done={step > 2} />
        <Dash />
        <StepDot n={3} label="Review & Confirm" active={step === 3} done={false} />
      </div>

      <div className="grid lg:grid-cols-[1fr_360px] xl:grid-cols-[1fr_400px] gap-6">
        <section>
          <h2 className="text-base sm:text-xl font-bold text-slate-900">What do you need help with?</h2>

          <div className="mt-3 sm:mt-4 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
            <input
              placeholder="Search services (e.g., driver, moving, grocery...)"
              className="w-full pl-11 pr-4 py-3 rounded-full bg-white border border-slate-200 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-4 focus:ring-brand-100 focus:border-brand-400"
            />
          </div>

          {/* Category chips */}
          <div className="mt-4 flex gap-2 overflow-x-auto scrollbar-none -mx-4 px-4 pb-1">
            {categories.map((c, i) => (
              <button
                key={c}
                className={cn(
                  "shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-semibold transition border whitespace-nowrap",
                  i === 0
                    ? "bg-brand-50 text-brand-700 border-brand-200"
                    : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                )}
              >
                {i === 0 ? <Star className="w-3.5 h-3.5 fill-brand-500 text-brand-500" /> : null}
                {c}
              </button>
            ))}
            <button className="shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-semibold bg-white text-slate-700 border border-slate-200">
              <MoreHorizontal className="w-4 h-4" /> More
            </button>
          </div>

          {/* Service grid — 4-col always, density tightens on mobile */}
          <div className="mt-5 grid grid-cols-4 gap-2 sm:gap-3 lg:gap-4">
            {popular.map((p) => {
              const Icon = p.icon;
              const isSel = p.slug === selectedSlug;
              return (
                <button
                  key={p.slug}
                  onClick={() => setSelectedSlug(p.slug)}
                  className={cn(
                    "relative text-left rounded-2xl border p-2.5 sm:p-4 transition flex flex-col min-h-[180px] sm:min-h-[210px]",
                    isSel
                      ? "border-brand-500 bg-brand-50/40 ring-2 ring-brand-200"
                      : "border-slate-100 bg-white hover:border-slate-300"
                  )}
                >
                  {isSel && (
                    <span className="absolute top-1.5 right-1.5 sm:top-2.5 sm:right-2.5 w-5 h-5 rounded-full bg-brand-600 text-white flex items-center justify-center">
                      <Check className="w-3 h-3" />
                    </span>
                  )}
                  <span className={`inline-flex w-9 h-9 sm:w-12 sm:h-12 rounded-xl items-center justify-center mb-2 sm:mb-3 ${p.tone}`}>
                    <Icon className="w-5 h-5 sm:w-6 sm:h-6" />
                  </span>
                  <div className="text-[11px] sm:text-sm font-bold text-slate-900 leading-tight">{p.title}</div>
                  <div className="text-[10px] sm:text-xs text-slate-500 mt-1 leading-snug line-clamp-4 sm:line-clamp-3">{p.blurb}</div>
                  <div className="text-[10px] sm:text-xs font-semibold text-brand-700 mt-auto pt-2 inline-flex items-center gap-1">
                    {p.from ? `From $${p.from}` : <>View all <ArrowRight className="w-3 h-3" /></>}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Can't find what you need */}
          <div className="mt-7 lg:mt-8">
            <h3 className="text-base sm:text-lg font-bold text-slate-900">Can't find what you need?</h3>
            <div className="mt-3 rounded-2xl bg-white border border-slate-100 p-4 sm:p-5 flex items-start gap-3 sm:items-center">
              <span className="inline-flex w-10 h-10 rounded-xl bg-brand-50 items-center justify-center shrink-0">
                <Sparkles className="w-5 h-5 text-brand-600" />
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-slate-900">Custom Request</div>
                <div className="text-xs text-slate-500 mt-1 leading-snug">Describe what you need and we'll match you with the right person for the job.</div>
              </div>
              <button className="text-[11px] sm:text-sm font-semibold text-brand-700 bg-white border border-brand-200 hover:bg-brand-50 px-2.5 py-2 sm:px-4 sm:py-2.5 rounded-xl shrink-0 self-center leading-tight text-center">
                Create<br className="sm:hidden" /> Custom<br className="sm:hidden" /> Request
              </button>
            </div>
          </div>

          {/* Trust strip — 4-col always */}
          <div className="mt-5 rounded-2xl bg-brand-50/50 border border-brand-100 p-3 sm:p-5 grid grid-cols-4 gap-2 sm:gap-4">
            <TrustItem icon={Shield} title="Verified Humans" sub="All providers are background checked and verified." />
            <TrustItem icon={Shield} title="Safe & Insured" sub="Every task is insured for your peace of mind." />
            <TrustItem icon={MapPin} title="Real-time Tracking" sub="Track your task progress in real time." />
            <TrustItem icon={Headphones} title="24/7 Support" sub="Our support team is available anytime you need help." />
          </div>

          {/* MOBILE: inline summary + how-it-works + continue */}
          <div className="lg:hidden mt-5 space-y-4">
            <SummaryCard selected={selected} />
            <HowItWorks />
            <ContinueButtons />
          </div>
        </section>

        {/* Desktop side panel */}
        <aside className="hidden lg:block space-y-4 lg:sticky lg:top-6 lg:self-start">
          <SummaryCard selected={selected} />
          <HowItWorks />
          <ContinueButtons />
        </aside>
      </div>
    </div>
  );
}

function StepDot({ n, label, active, done }: { n: number; label: string; active: boolean; done: boolean }) {
  return (
    <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
      <span className={cn(
        "w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center text-[11px] sm:text-xs font-bold border-2 shrink-0",
        active ? "bg-brand-600 text-white border-brand-600" :
        done ? "bg-emerald-500 text-white border-emerald-500" :
        "bg-white text-slate-400 border-slate-300"
      )}>
        {done ? <Check className="w-3 h-3 sm:w-3.5 sm:h-3.5" /> : n}
      </span>
      <span className={cn(
        "text-[11px] sm:text-sm whitespace-nowrap",
        active ? "text-brand-700 font-semibold" : "text-slate-500"
      )}>{label}</span>
    </div>
  );
}

function Dash() {
  return <span className="flex-1 h-px border-t border-dashed border-slate-300 min-w-[8px]" />;
}

function TrustItem({ icon: Icon, title, sub }: { icon: typeof Shield; title: string; sub: string }) {
  return (
    <div className="flex flex-col items-start gap-1.5 sm:flex-row sm:gap-2.5">
      <span className="inline-flex w-7 h-7 sm:w-9 sm:h-9 rounded-lg bg-white items-center justify-center shrink-0">
        <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-brand-600" />
      </span>
      <div className="min-w-0">
        <div className="text-[11px] sm:text-xs font-bold text-slate-900 leading-tight">{title}</div>
        <div className="text-[10px] sm:text-[11px] text-slate-500 mt-0.5 leading-snug">{sub}</div>
      </div>
    </div>
  );
}

function SummaryCard({ selected }: { selected: typeof popular[number] }) {
  return (
    <div className="rounded-2xl bg-white border border-slate-100 p-4 sm:p-5">
      <div className="flex items-center justify-between mb-3 sm:mb-4">
        <h3 className="text-sm font-bold text-slate-900">Request Summary</h3>
        <button className="text-xs font-semibold text-brand-700">Clear all</button>
      </div>

      <div className="flex items-center gap-3 pb-3 sm:pb-4 border-b border-slate-100">
        <span className={`inline-flex w-9 h-9 rounded-lg items-center justify-center shrink-0 ${selected.tone}`}>
          <selected.icon className="w-4 h-4" />
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-slate-900 truncate">{selected.title}</div>
        </div>
        <button className="text-xs font-semibold text-brand-700">Change</button>
      </div>

      <dl className="text-sm divide-y divide-slate-100">
        <div className="py-3 flex items-center justify-between gap-2">
          <dt className="text-slate-500">Estimated Price</dt>
          <dd className="font-semibold text-slate-900 inline-flex items-center gap-1 whitespace-nowrap">
            ${selected.from || 29} - ${selected.from + 20}
            <Info className="w-3.5 h-3.5 text-slate-400" />
          </dd>
        </div>
        <div className="py-3 flex items-center justify-between gap-2">
          <dt className="text-slate-500">Est. Duration</dt>
          <dd className="font-semibold text-slate-900 whitespace-nowrap">30 - 60 min</dd>
        </div>
        <div className="py-3 flex items-center justify-between gap-2">
          <dt className="text-slate-500 shrink-0">Where</dt>
          <dd className="flex items-center gap-1.5 text-slate-900 font-medium text-right min-w-0">
            <MapPin className="w-4 h-4 text-brand-600 shrink-0" />
            <span className="truncate">123 Main St, Vancouver, BC</span>
            <button className="text-xs font-semibold text-brand-700 shrink-0 ml-1">Change</button>
          </dd>
        </div>
        <div className="py-3 flex items-center justify-between gap-2">
          <dt className="text-slate-500">When</dt>
          <dd className="flex items-center gap-1.5 text-slate-900 font-medium whitespace-nowrap">
            <Calendar className="w-4 h-4 text-brand-600 shrink-0" />
            ASAP
            <button className="text-xs font-semibold text-brand-700 ml-1">Change</button>
          </dd>
        </div>
      </dl>
    </div>
  );
}

function HowItWorks() {
  const steps = [
    { n: 1, title: "Submit your request", sub: "We'll notify available providers near you." },
    { n: 2, title: "We find the best match", sub: "A top-rated provider will accept your task." },
    { n: 3, title: "Task in progress", sub: "Track progress and communicate in real time." },
    { n: 4, title: "Task completed", sub: "Pay securely only when you're satisfied." },
  ];
  return (
    <div className="rounded-2xl bg-white border border-slate-100 p-3 sm:p-5">
      <h3 className="text-sm font-bold text-slate-900 mb-3 sm:mb-4">How it works</h3>
      <div className="grid grid-cols-4 lg:grid-cols-1 gap-2 sm:gap-4 lg:gap-3">
        {steps.map((s) => (
          <div key={s.n} className="flex flex-col lg:flex-row items-start gap-1.5 lg:gap-3">
            <span className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-brand-100 text-brand-700 text-[10px] sm:text-[11px] font-bold flex items-center justify-center shrink-0">{s.n}</span>
            <div className="min-w-0">
              <div className="text-[11px] sm:text-xs font-bold text-slate-900 leading-tight">{s.title}</div>
              <div className="text-[10px] sm:text-[11px] text-slate-500 mt-0.5 leading-snug">{s.sub}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ContinueButtons() {
  return (
    <div className="space-y-2">
      <button className="w-full inline-flex items-center justify-center gap-2 py-3.5 rounded-xl bg-gradient-to-r from-brand-600 to-violet-600 text-white font-semibold shadow-lg shadow-brand-900/10">
        Continue <ArrowRight className="w-4 h-4" />
      </button>
      <button className="w-full text-center py-2 text-sm font-semibold text-brand-700">Save as Draft</button>
    </div>
  );
}
