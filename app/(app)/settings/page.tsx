"use client";

import { useState } from "react";
import {
  Search, Bell, Plus, ChevronRight, User, Lock, CreditCard, MapPin, Shield,
  Eye, SlidersHorizontal, Users, Layers, HelpCircle, Info, Camera, Download,
  Trash2, LogOut, Headphones, Globe, DollarSign, Clock, Ruler, Calendar, Smartphone,
} from "lucide-react";
import { cn } from "@/lib/cn";

const SECTIONS = [
  { key: "profile", label: "Profile & Account", icon: User },
  { key: "notif", label: "Notifications", icon: Bell },
  { key: "payment", label: "Payment Methods", icon: CreditCard },
  { key: "address", label: "Addresses", icon: MapPin },
  { key: "security", label: "Security", icon: Shield },
  { key: "privacy", label: "Privacy", icon: Eye },
  { key: "prefs", label: "Preferences", icon: SlidersHorizontal },
  { key: "family", label: "Family & Team", icon: Users },
  { key: "apps", label: "Connected Apps", icon: Layers },
  { key: "support", label: "Support", icon: HelpCircle },
  { key: "about", label: "About", icon: Info },
];

export default function SettingsPage() {
  const [section, setSection] = useState("profile");

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 lg:py-8 max-w-[1500px] mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">Settings</h1>
          <p className="text-sm text-slate-500 mt-1">Manage your account, preferences and app settings.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input placeholder="Search settings..." className="w-full pl-9 pr-3 py-2 rounded-xl bg-white border border-slate-200 text-sm" />
          </div>
          <button className="relative p-2 rounded-xl bg-white border border-slate-200">
            <Bell className="w-5 h-5 text-slate-700" />
            <span className="absolute -top-1 -right-1 bg-rose-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">3</span>
          </button>
          <button className="hidden sm:inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-brand-600 text-white text-sm font-semibold">
            <Plus className="w-4 h-4" /> New Request
          </button>
        </div>
      </div>

      <div className="grid lg:grid-cols-[220px_1fr_320px] gap-5">
        {/* Section nav */}
        <aside className="rounded-2xl bg-white border border-slate-100 p-2 self-start sticky top-6 max-h-[calc(100vh-3rem)] overflow-y-auto">
          <ul className="space-y-1">
            {SECTIONS.map((s) => {
              const Icon = s.icon;
              const active = section === s.key;
              return (
                <li key={s.key}>
                  <button
                    onClick={() => setSection(s.key)}
                    className={cn(
                      "w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm",
                      active ? "bg-brand-50 text-brand-700 font-semibold" : "text-slate-600 hover:bg-slate-50"
                    )}
                  >
                    <Icon className={cn("w-4 h-4", active ? "text-brand-600" : "text-slate-400")} />
                    {s.label}
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        {/* Main panel */}
        <section className="space-y-5">
          <Card>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-slate-900">Profile Information</h2>
              <button className="inline-flex items-center gap-2 text-xs font-semibold text-brand-700 border border-brand-200 px-3 py-1.5 rounded-lg">
                ✏️ Edit Profile
              </button>
            </div>

            <div className="flex flex-col sm:flex-row gap-5 items-start sm:items-center">
              <div className="relative shrink-0">
                <img src="https://i.pravatar.cc/150?img=12" className="w-20 h-20 rounded-full" alt="" />
                <button className="absolute bottom-0 right-0 p-1.5 rounded-full bg-brand-600 text-white border-2 border-white"><Camera className="w-3 h-3" /></button>
              </div>
              <div className="grid sm:grid-cols-2 gap-4 flex-1 w-full">
                <Field label="Full Name" value="Alex Morgan" />
                <Field label="Email Address" value="alex.morgan@example.com" badge="Verified" />
                <Field label="Phone Number" value="+1 (604) 555-0123" />
                <Field label="Member Since" value="Jan 23, 2023" />
              </div>
            </div>
          </Card>

          <Card>
            <h2 className="text-base font-bold text-slate-900 mb-4">Account Preferences</h2>
            <ul className="divide-y divide-slate-100 -mx-1">
              <PrefRow icon={<Globe className="w-4 h-4" />} label="Language" value="English" />
              <PrefRow icon={<DollarSign className="w-4 h-4" />} label="Currency" value="CAD – Canadian Dollar ($)" />
              <PrefRow icon={<Calendar className="w-4 h-4" />} label="Date & Time Format" value="May 19, 2024 • 10:30 AM" />
              <PrefRow icon={<Clock className="w-4 h-4" />} label="Time Zone" value="(GMT−07:00) Pacific Time (US & Canada)" />
              <PrefRow icon={<Ruler className="w-4 h-4" />} label="Units" value="Metric (km, kg, °C)" />
            </ul>
          </Card>

          <Card>
            <h2 className="text-base font-bold text-slate-900 mb-4">App Preferences</h2>
            <ul className="space-y-3">
              <Toggle icon={<Smartphone className="w-4 h-4" />} label="Dark Mode" sub="Switch between light and dark theme" on={false} />
              <Toggle icon={<Clock className="w-4 h-4" />} label="Save recent searches" sub="Save your recent searches and filters" on={true} />
              <Toggle icon={<SlidersHorizontal className="w-4 h-4" />} label="Auto-select best provider" sub="Automatically match with the best available provider" on={true} />
              <Toggle icon={<Bell className="w-4 h-4" />} label="In-app sounds" sub="Play notification sounds" on={false} />
            </ul>
          </Card>
        </section>

        {/* Side column */}
        <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <Card>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-slate-900">Account Overview</h3>
              <Shield className="w-4 h-4 text-emerald-500" />
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-500">Personal Account</span>
              <span className="text-[10px] font-bold text-violet-700 bg-violet-50 px-2 py-1 rounded-full">Standard Plan</span>
            </div>
            <div className="mt-4 pt-4 border-t border-slate-100">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-slate-500">Account Balance</div>
                  <div className="text-2xl font-bold text-slate-900">$124.50</div>
                </div>
                <button className="text-xs font-semibold text-brand-700 border border-brand-200 px-3 py-1.5 rounded-lg">Add Credits</button>
              </div>
            </div>
            <Stat label="Total Spent" value="$2,486.75" />
            <Stat label="Total Bookings" value="128" />
          </Card>

          <Card>
            <div className="flex items-center gap-2 mb-3">
              <Shield className="w-4 h-4 text-brand-600" />
              <h3 className="text-sm font-bold text-slate-900">Security</h3>
            </div>
            <SecurityRow icon={<Lock className="w-4 h-4 text-slate-500" />} label="Password" sub="Last changed on May 2, 2024" action="Change" />
            <SecurityRow icon={<Shield className="w-4 h-4 text-slate-500" />} label="Two-Factor Authentication" sub="Enabled" action="Manage" />
            <SecurityRow icon={<Smartphone className="w-4 h-4 text-slate-500" />} label="Login Devices" sub="3 active devices" action="View" last />
          </Card>

          <Card>
            <h3 className="text-sm font-bold text-slate-900 mb-3">Quick Actions</h3>
            <ul className="space-y-1.5">
              <QuickAction icon={<Download className="w-4 h-4 text-slate-500" />} label="Download My Data" sub="Export your data and history" />
              <QuickAction icon={<Trash2 className="w-4 h-4 text-rose-500" />} label="Delete Account" sub="Permanently delete your account" tone="text-rose-600" />
              <QuickAction icon={<LogOut className="w-4 h-4 text-rose-500" />} label="Log Out" sub="Sign out from this device" tone="text-rose-600" />
            </ul>
          </Card>

          <Card className="bg-brand-50/50 border-brand-100">
            <div className="flex items-start gap-3">
              <span className="w-9 h-9 inline-flex items-center justify-center rounded-xl bg-white shadow-sm"><Headphones className="w-4 h-4 text-brand-600" /></span>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-slate-900">Need Help?</div>
                <div className="text-xs text-slate-600 mt-1">Visit our Help Center or contact support if you need assistance.</div>
                <button className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-brand-700 bg-white border border-brand-200 px-3 py-1.5 rounded-lg">
                  Visit Help Center →
                </button>
              </div>
            </div>
          </Card>
        </aside>
      </div>

      <footer className="mt-10 text-center text-xs text-slate-400">
        Helpward v1.0.0 · <a className="hover:text-slate-600">Terms of Service</a> · <a className="hover:text-slate-600">Privacy Policy</a>
      </footer>
    </div>
  );
}

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("rounded-2xl bg-white border border-slate-100 p-5", className)}>{children}</div>;
}

function Field({ label, value, badge }: { label: string; value: string; badge?: string }) {
  return (
    <div>
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-sm font-semibold text-slate-900 mt-1 flex items-center gap-2">
        <span className="truncate">{value}</span>
        {badge && <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">{badge}</span>}
      </div>
    </div>
  );
}

function PrefRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <li className="flex items-center gap-3 py-3 px-1">
      <span className="w-9 h-9 rounded-lg bg-slate-50 inline-flex items-center justify-center text-slate-500">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-slate-900">{label}</div>
      </div>
      <div className="text-sm text-slate-700 text-right">{value}</div>
      <ChevronRight className="w-4 h-4 text-slate-300" />
    </li>
  );
}

function Toggle({ icon, label, sub, on }: { icon: React.ReactNode; label: string; sub: string; on: boolean }) {
  return (
    <li className="flex items-center gap-3 py-2">
      <span className="w-9 h-9 rounded-lg bg-slate-50 inline-flex items-center justify-center text-slate-500">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-slate-900">{label}</div>
        <div className="text-xs text-slate-500">{sub}</div>
      </div>
      <span className={cn("relative inline-flex w-10 h-6 rounded-full transition", on ? "bg-brand-600" : "bg-slate-200")}>
        <span className={cn("absolute top-0.5 w-5 h-5 bg-white rounded-full transition", on ? "right-0.5" : "left-0.5")} />
      </span>
    </li>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100 text-sm">
      <div className="text-slate-500">{label}</div>
      <div className="font-semibold text-slate-900">{value} <ChevronRight className="inline w-3 h-3 text-slate-300" /></div>
    </div>
  );
}

function SecurityRow({ icon, label, sub, action, last }: { icon: React.ReactNode; label: string; sub: string; action: string; last?: boolean }) {
  return (
    <div className={cn("flex items-center gap-3 py-3", !last && "border-b border-slate-100")}>
      <span className="w-9 h-9 rounded-lg bg-slate-50 inline-flex items-center justify-center">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-slate-900">{label}</div>
        <div className="text-[11px] text-slate-500">{sub}</div>
      </div>
      <button className="text-xs font-semibold text-brand-700">{action}</button>
    </div>
  );
}

function QuickAction({ icon, label, sub, tone }: { icon: React.ReactNode; label: string; sub: string; tone?: string }) {
  return (
    <li>
      <button className="w-full text-left flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-slate-50">
        <span className="w-9 h-9 rounded-lg bg-slate-50 inline-flex items-center justify-center">{icon}</span>
        <div className="flex-1 min-w-0">
          <div className={cn("text-sm font-semibold", tone ?? "text-slate-900")}>{label}</div>
          <div className="text-[11px] text-slate-500">{sub}</div>
        </div>
        <ChevronRight className="w-4 h-4 text-slate-300" />
      </button>
    </li>
  );
}
