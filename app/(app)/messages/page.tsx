"use client";

import { useState } from "react";
import {
  Search, SlidersHorizontal, Phone, MoreHorizontal, ClipboardList, Paperclip,
  Send, Plus, Bell, Headphones,
} from "lucide-react";
import { conversations, providerById } from "@/lib/mock";
import { cn } from "@/lib/cn";

export default function MessagesPage() {
  const [activeId, setActiveId] = useState(conversations[0].id);
  const active = conversations.find((c) => c.id === activeId)!;
  const provider = providerById(active.providerId)!;
  const [tab, setTab] = useState<"all" | "unread" | "archived">("all");
  const filtered = tab === "unread" ? conversations.filter((c) => c.unread) : conversations;

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 lg:py-8 max-w-[1500px] mx-auto">
      {/* Top */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">Messages</h1>
          <p className="text-sm text-slate-500 mt-1">Stay in touch with your providers and get real-time updates.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input placeholder="Search messages..." className="w-full pl-9 pr-3 py-2 rounded-xl bg-white border border-slate-200 text-sm" />
          </div>
          <button className="hidden sm:inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-slate-200 text-sm">
            <Headphones className="w-4 h-4 text-slate-500" /> All Conversations
          </button>
          <button className="relative p-2 rounded-xl bg-white border border-slate-200">
            <Bell className="w-5 h-5 text-slate-700" />
            <span className="absolute -top-1 -right-1 bg-rose-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">3</span>
          </button>
          <button className="hidden sm:inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold">
            <Plus className="w-4 h-4" /> New Request
          </button>
        </div>
      </div>

      <div className="grid lg:grid-cols-[300px_1fr_360px] xl:grid-cols-[340px_1fr_360px] gap-4 lg:h-[calc(100vh-160px)] min-h-[640px]">
        {/* Conversation list */}
        <aside className="rounded-2xl bg-white border border-slate-100 flex flex-col overflow-hidden">
          <div className="p-3 border-b border-slate-100 flex gap-2">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input placeholder="Search conversations..." className="w-full pl-9 pr-3 py-2 rounded-lg bg-slate-50 border border-slate-100 text-sm" />
            </div>
            <button className="p-2 rounded-lg border border-slate-200"><SlidersHorizontal className="w-4 h-4 text-slate-500" /></button>
          </div>
          <div className="px-3 pt-3 flex gap-4 border-b border-slate-100 text-sm">
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
          <ul className="flex-1 overflow-y-auto">
            {filtered.map((c) => {
              const p = providerById(c.providerId)!;
              const isActive = c.id === activeId;
              return (
                <li key={c.id}>
                  <button
                    onClick={() => setActiveId(c.id)}
                    className={cn(
                      "w-full text-left px-3 py-3 flex items-start gap-3 border-l-2",
                      isActive ? "bg-brand-50/60 border-brand-600" : "border-transparent hover:bg-slate-50"
                    )}
                  >
                    <div className="relative">
                      <img src={p.avatar} className="w-10 h-10 rounded-full" alt="" />
                      <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-white" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-semibold truncate text-slate-900">{p.name}</div>
                        <div className="text-[11px] text-slate-400 shrink-0">{c.time}</div>
                      </div>
                      <div className="text-xs text-slate-500 truncate">{c.service}</div>
                      <div className="text-xs text-slate-700 truncate mt-0.5">{c.preview}</div>
                    </div>
                    {c.unread ? (
                      <span className="ml-auto bg-brand-600 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">{c.unread}</span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="p-3 text-xs text-slate-500 border-t border-slate-100">
            Can't find your conversation?<br />
            Check your <a className="text-brand-700 underline">archived messages</a>.
          </div>
        </aside>

        {/* Chat thread */}
        <section className="rounded-2xl bg-white border border-slate-100 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between p-3 sm:p-4 border-b border-slate-100">
            <div className="flex items-center gap-3 min-w-0">
              <img src={provider.avatar} className="w-9 h-9 rounded-full" alt="" />
              <div className="min-w-0">
                <div className="text-sm font-semibold text-slate-900 truncate">{provider.name} <span className="text-brand-700 text-xs ml-1">★ {provider.rating}</span></div>
                <div className="text-xs text-slate-500 truncate">{active.service} • Task #{active.taskId}</div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button className="p-2 rounded-lg hover:bg-slate-100"><Phone className="w-4 h-4 text-slate-600" /></button>
              <button className="p-2 rounded-lg hover:bg-slate-100"><MoreHorizontal className="w-4 h-4 text-slate-600" /></button>
              <button className="hidden sm:inline-flex items-center gap-2 ml-2 px-3 py-2 rounded-lg border border-slate-200 text-xs font-semibold">
                <ClipboardList className="w-4 h-4" /> View Task
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 bg-slate-50/50">
            <div className="text-center text-[11px] text-slate-400">Today</div>
            {active.messages.map((m, i) => (
              <div key={i} className={cn("flex items-end gap-2", m.from === "me" ? "justify-end" : "")}>
                {m.from === "them" && <img src={provider.avatar} className="w-7 h-7 rounded-full" alt="" />}
                <div>
                  <div className={cn(
                    "max-w-[280px] sm:max-w-[420px] px-4 py-2.5 text-sm rounded-2xl",
                    m.from === "me" ? "bg-brand-600 text-white rounded-br-md" : "bg-white border border-slate-100 rounded-bl-md"
                  )}>
                    {m.text}
                  </div>
                  <div className={cn("text-[10px] text-slate-400 mt-1", m.from === "me" ? "text-right" : "")}>{m.time}</div>
                </div>
              </div>
            ))}
            <div className="flex items-end gap-2">
              <img src={provider.avatar} className="w-7 h-7 rounded-full" alt="" />
              <div className="px-3 py-2 bg-white border border-slate-100 rounded-2xl rounded-bl-md">
                <span className="inline-flex gap-1">
                  {[0, 1, 2].map((i) => <span key={i} className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-pulse" style={{ animationDelay: `${i * 150}ms` }} />)}
                </span>
              </div>
            </div>
          </div>

          <div className="border-t border-slate-100 p-3 flex items-center gap-2">
            <button className="p-2 text-slate-500"><Paperclip className="w-4 h-4" /></button>
            <input placeholder="Type your message..." className="flex-1 px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-100 text-sm" />
            <button className="p-2.5 rounded-xl bg-brand-600 text-white"><Send className="w-4 h-4" /></button>
          </div>
        </section>

        {/* Task panel */}
        <aside className="hidden lg:flex flex-col gap-4 overflow-y-auto">
          <div className="rounded-2xl bg-brand-50 border border-brand-100 p-5">
            <div className="flex items-center gap-2 text-brand-700 text-sm font-semibold">
              <span className="w-2 h-2 rounded-full bg-brand-600 animate-pulse" /> Task in Progress
            </div>
            <div className="text-xs text-slate-600 mt-1">Started at 10:12 AM</div>
            <a className="block text-xs text-brand-700 font-semibold mt-3 underline">View live tracking</a>
          </div>

          <div className="rounded-2xl bg-white border border-slate-100 p-5">
            <h3 className="text-sm font-bold text-slate-900 mb-3">Task Details</h3>
            <dl className="space-y-3 text-sm">
              <Row k="Service" v={active.service} />
              <Row k="Task ID" v={`#${active.taskId}`} />
              <Row k="Date & Time" v="May 17, 2024 • 10:00 AM" />
              <Row k="Address" v="123 Main St, Vancouver, BC" />
              <Row k="Payment" v="$48.50" badge="Paid" />
            </dl>
            <div className="mt-4 rounded-xl overflow-hidden h-32 bg-slate-100 relative">
              <img src="https://images.unsplash.com/photo-1524661135-423995f22d0b?auto=format&fit=crop&w=800&q=70" className="absolute inset-0 w-full h-full object-cover" alt="" />
              <div className="absolute bottom-2 right-2 bg-white text-xs rounded-lg px-2 py-1 shadow">
                <div className="font-bold">12 min away</div>
                <div className="text-slate-500">1.2 km from you</div>
              </div>
            </div>
            <button className="mt-4 w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-xl border border-brand-200 text-brand-700 text-sm font-semibold">
              <Headphones className="w-4 h-4" /> Need Help?
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Row({ k, v, badge }: { k: string; v: string; badge?: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-slate-500">{k}</dt>
      <dd className="text-slate-900 font-medium text-right flex items-center gap-2">
        {v}
        {badge && <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">✓ {badge}</span>}
      </dd>
    </div>
  );
}
