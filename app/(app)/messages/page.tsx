"use client";

import { useState } from "react";
import {
  Search, SlidersHorizontal, Phone, MoreHorizontal, ClipboardList, Paperclip,
  Send, Bell, Headphones, ArrowLeft, ChevronDown, ChevronRight,
} from "lucide-react";
import { conversations, providerById } from "@/lib/mock";
import { MapBackdrop } from "@/components/MapBackdrop";
import { cn } from "@/lib/cn";

export default function MessagesPage() {
  const [activeId, setActiveId] = useState(conversations[0].id);
  const active = conversations.find((c) => c.id === activeId)!;
  const provider = providerById(active.providerId)!;
  const [tab, setTab] = useState<"all" | "unread" | "archived">("all");
  const [mobileView, setMobileView] = useState<"list" | "thread">("list");
  const filtered = tab === "unread" ? conversations.filter((c) => c.unread) : conversations;

  return (
    <div className="px-4 lg:px-8 py-5 lg:py-8 max-w-[1500px] mx-auto">
      {/* Page header — visible on list view (mobile) and always on desktop */}
      <div className={cn(
        "mb-5 lg:mb-6",
        mobileView === "thread" ? "hidden lg:block" : ""
      )}>
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold text-slate-900">Messages</h1>
            <p className="text-sm text-slate-500 mt-1">Stay in touch with your providers and get real-time updates.</p>
          </div>
          {/* Desktop-only actions */}
          <div className="hidden lg:flex items-center gap-2">
            <div className="relative w-72">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input placeholder="Search messages..." className="w-full pl-9 pr-3 py-2 rounded-xl bg-white border border-slate-200 text-sm" />
            </div>
            <button className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-slate-200 text-sm">
              <Headphones className="w-4 h-4 text-slate-500" /> All Conversations
            </button>
            <button className="relative p-2 rounded-xl bg-white border border-slate-200">
              <Bell className="w-5 h-5 text-slate-700" />
              <span className="absolute -top-1 -right-1 bg-rose-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">3</span>
            </button>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-[320px_1fr] xl:grid-cols-[360px_1fr] gap-5 lg:gap-6 lg:h-[calc(100vh-180px)] lg:min-h-[640px]">
        {/* CONVERSATION LIST */}
        <aside className={cn(
          "lg:flex flex-col rounded-2xl bg-white border border-slate-100 overflow-hidden lg:max-h-full",
          mobileView === "list" ? "flex" : "hidden lg:flex"
        )}>
          {/* Mobile-only search + filter row */}
          <div className="lg:hidden p-3 border-b border-slate-100 flex gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input placeholder="Search conversations..." className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-50 border border-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200" />
            </div>
            <button className="p-2.5 rounded-xl border border-slate-200">
              <SlidersHorizontal className="w-4 h-4 text-slate-500" />
            </button>
          </div>
          <div className="hidden lg:flex p-3 border-b border-slate-100 gap-2">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input placeholder="Search conversations..." className="w-full pl-9 pr-3 py-2 rounded-lg bg-slate-50 border border-slate-100 text-sm" />
            </div>
            <button className="p-2 rounded-lg border border-slate-200"><SlidersHorizontal className="w-4 h-4 text-slate-500" /></button>
          </div>

          {/* Tabs */}
          <div className="px-4 pt-3 flex gap-6 border-b border-slate-100 text-sm">
            {(["all", "unread", "archived"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cn(
                  "pb-2.5 -mb-px border-b-2 flex items-center gap-2 capitalize",
                  tab === t ? "border-brand-600 text-brand-700 font-semibold" : "border-transparent text-slate-500"
                )}
              >
                {t}
                {t === "unread" && <span className="bg-slate-200 text-slate-700 text-[10px] font-bold rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center">3</span>}
              </button>
            ))}
          </div>

          {/* List */}
          <ul className="flex-1 overflow-y-auto">
            {filtered.map((c) => {
              const p = providerById(c.providerId)!;
              const isActive = c.id === activeId;
              return (
                <li key={c.id}>
                  <button
                    onClick={() => {
                      setActiveId(c.id);
                      setMobileView("thread");
                    }}
                    className={cn(
                      "w-full text-left px-4 py-3.5 flex items-start gap-3 border-l-[3px]",
                      isActive ? "bg-brand-50/50 border-brand-600" : "border-transparent hover:bg-slate-50"
                    )}
                  >
                    <div className="relative shrink-0">
                      <img src={p.avatar} className="w-11 h-11 rounded-full" alt="" />
                      <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-500 border-2 border-white" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-bold truncate text-slate-900">{p.name}</div>
                        <div className="text-[11px] text-slate-400 shrink-0">{c.time}</div>
                      </div>
                      <div className="text-xs text-slate-700 truncate mt-0.5">{c.service}</div>
                      <div className="text-xs text-slate-500 truncate mt-1 leading-snug">{c.preview}</div>
                    </div>
                    {c.unread ? (
                      <span className="ml-auto bg-brand-600 text-white text-[10px] font-bold rounded-full min-w-[20px] h-[20px] flex items-center justify-center px-1 self-center">{c.unread}</span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="p-4 text-xs text-slate-500 border-t border-slate-100">
            Can't find your conversation?<br />
            Check your <a className="text-brand-700 underline">archived messages</a>.
          </div>
        </aside>

        {/* THREAD + TASK DETAILS */}
        <section className={cn(
          "lg:flex flex-col rounded-2xl bg-white border border-slate-100 overflow-hidden",
          mobileView === "thread" ? "flex" : "hidden lg:flex"
        )}>
          {/* Chat header */}
          <div className="flex items-center gap-2 p-3 sm:p-4 border-b border-slate-100">
            <button
              onClick={() => setMobileView("list")}
              aria-label="Back"
              className="lg:hidden p-1.5 -ml-1 rounded-lg hover:bg-slate-100 shrink-0"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <img src={provider.avatar} className="w-10 h-10 rounded-full shrink-0" alt="" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-bold text-slate-900 truncate flex items-center gap-1.5">
                {provider.name}
                <span className="text-brand-700 text-xs font-semibold">★ {provider.rating}</span>
              </div>
              <div className="text-[11px] text-slate-500 truncate">{active.service} • Task #{active.taskId}</div>
            </div>
            <button aria-label="Call" className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 shrink-0">
              <Phone className="w-4 h-4 text-brand-600" />
            </button>
            <button aria-label="More" className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 shrink-0">
              <MoreHorizontal className="w-4 h-4 text-slate-500" />
            </button>
          </div>

          {/* Scrollable thread + task details */}
          <div className="flex-1 overflow-y-auto bg-slate-50/30">
            {/* "View Task" pill */}
            <div className="flex justify-end px-3 sm:px-4 pt-3">
              <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-brand-200 bg-white text-brand-700 text-xs font-semibold">
                <ClipboardList className="w-3.5 h-3.5" /> View Task
              </button>
            </div>

            {/* Messages */}
            <div className="px-3 sm:px-4 pt-4 space-y-3">
              <div className="text-center text-[11px] text-slate-400">Today</div>
              {active.messages.map((m, i) => (
                <div key={i} className={cn("flex items-end gap-2", m.from === "me" ? "justify-end" : "")}>
                  {m.from === "them" && <img src={provider.avatar} className="w-7 h-7 rounded-full shrink-0" alt="" />}
                  <div className={cn(m.from === "me" ? "items-end" : "items-start", "flex flex-col gap-1 max-w-[78%]")}>
                    <div className={cn(
                      "px-3.5 py-2.5 text-sm rounded-2xl",
                      m.from === "me" ? "bg-brand-600 text-white rounded-br-md" : "bg-white border border-slate-100 rounded-bl-md text-slate-800"
                    )}>
                      {m.text}
                    </div>
                    <div className="text-[10px] text-slate-400 px-1 flex items-center gap-1">
                      {m.time}
                      {m.from === "me" && <span className="text-brand-600">✓✓</span>}
                    </div>
                  </div>
                </div>
              ))}
              <div className="flex items-end gap-2">
                <img src={provider.avatar} className="w-7 h-7 rounded-full" alt="" />
                <div className="px-3 py-2.5 bg-white border border-slate-100 rounded-2xl rounded-bl-md">
                  <span className="inline-flex gap-1">
                    {[0, 1, 2].map((i) => <span key={i} className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-pulse" style={{ animationDelay: `${i * 150}ms` }} />)}
                  </span>
                </div>
              </div>
            </div>

            {/* Task in Progress */}
            <div className="mx-3 sm:mx-4 mt-5 rounded-2xl bg-brand-50 border border-brand-100 p-4 flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 text-sm font-bold text-slate-900">
                  Task in Progress <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                </div>
                <div className="text-xs text-slate-600 mt-0.5">Started at 10:12 AM</div>
                <button className="text-xs font-semibold text-brand-700 mt-2 inline-flex items-center gap-1">
                  View live tracking <ChevronRight className="w-3 h-3" />
                </button>
              </div>
              <div className="w-12 h-12 rounded-xl bg-white shrink-0 flex items-center justify-center">
                <ClipboardList className="w-6 h-6 text-brand-600" />
              </div>
            </div>

            {/* Task Details */}
            <div className="mx-3 sm:mx-4 mt-3 rounded-2xl bg-white border border-slate-100 p-4">
              <h3 className="text-sm font-bold text-slate-900 mb-3">Task Details</h3>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <div>
                  <dt className="text-[11px] font-semibold text-slate-500">Service</dt>
                  <dd className="text-sm text-slate-900 mt-0.5">{active.service}</dd>
                </div>
                <div>
                  <dt className="text-[11px] font-semibold text-slate-500">Date & Time</dt>
                  <dd className="text-sm text-slate-900 mt-0.5">May 17, 2024 • 10:00 AM</dd>
                </div>
                <div>
                  <dt className="text-[11px] font-semibold text-slate-500">Task ID</dt>
                  <dd className="text-sm text-slate-900 mt-0.5">#{active.taskId}</dd>
                </div>
                <div>
                  <dt className="text-[11px] font-semibold text-slate-500">Address</dt>
                  <dd className="text-sm text-slate-900 mt-0.5">123 Main St, Vancouver, BC</dd>
                </div>
                <div>
                  <dt className="text-[11px] font-semibold text-slate-500">Payment</dt>
                  <dd className="text-sm text-slate-900 mt-0.5 inline-flex items-center gap-2">
                    $48.50
                    <span className="inline-flex items-center text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-full">✓ Paid</span>
                  </dd>
                </div>
              </dl>

              {/* Map */}
              <div className="mt-4 rounded-xl overflow-hidden h-32 bg-slate-100 relative">
                <MapBackdrop />
                <div className="absolute bottom-2 right-2 bg-white text-xs rounded-lg px-2.5 py-1.5 shadow">
                  <div className="font-bold text-emerald-600">12 min away</div>
                  <div className="text-[10px] text-slate-500">1.2 km from you</div>
                </div>
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                  <img src={provider.avatar} className="w-9 h-9 rounded-full ring-2 ring-white shadow" alt="" />
                </div>
              </div>
            </div>

            {/* Need Help */}
            <div className="mx-3 sm:mx-4 my-3">
              <button className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-xl border border-brand-200 text-brand-700 text-sm font-semibold">
                <Headphones className="w-4 h-4" /> Need Help?
              </button>
            </div>
          </div>

          {/* Input */}
          <div className="border-t border-slate-100 p-3 flex items-center gap-2">
            <button aria-label="Attach" className="p-2 text-slate-500"><Paperclip className="w-4 h-4" /></button>
            <input placeholder="Type your message..." className="flex-1 px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200" />
            <button aria-label="Send" className="p-2.5 rounded-xl bg-brand-600 text-white"><Send className="w-4 h-4" /></button>
          </div>
        </section>
      </div>
    </div>
  );
}
