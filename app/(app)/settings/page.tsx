"use client";

import {
  Search, Bell, Plus, ChevronRight, User, Lock, CreditCard, MapPin, Shield,
  Eye, SlidersHorizontal, Users, Layers, HelpCircle, Info, Camera, Download,
  Trash2, LogOut, Headphones, Globe, DollarSign, Clock, Ruler, Calendar,
  Smartphone, Edit3, Volume2, Sparkles, Moon, History, ChevronDown,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { useState } from "react";

const NAV = [
  { key: "notif", label: "Notifications", icon: Bell },
  { key: "address", label: "Addresses", icon: MapPin },
  { key: "security", label: "Security", icon: Shield },
  { key: "payment", label: "Payment Methods", icon: CreditCard },
  { key: "privacy", label: "Privacy", icon: Eye },
  { key: "prefs", label: "Preferences", icon: SlidersHorizontal },
  { key: "family", label: "Family & Team", icon: Users },
  { key: "apps", label: "Connected Apps", icon: Layers },
  { key: "support", label: "Support", icon: HelpCircle },
];

export default function SettingsPage() {
  const [darkMode, setDarkMode] = useState(false);
  const [saveSearches, setSaveSearches] = useState(true);
  const [autoSelect, setAutoSelect] = useState(true);
  const [sounds, setSounds] = useState(false);

  return (
    <div className="px-4 lg:px-8 py-5 lg:py-8 max-w-[1500px] mx-auto pb-12">
      {/* Header */}
      <div className="mb-5 lg:mb-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold text-slate-900">Settings</h1>
            <p className="text-sm text-slate-500 mt-1">Manage your account, preferences and app settings.</p>
          </div>
          <div className="hidden lg:flex items-center gap-2">
            <div className="relative w-72">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input placeholder="Search settings..." className="w-full pl-9 pr-3 py-2 rounded-xl bg-white border border-slate-200 text-sm" />
            </div>
            <button className="relative p-2 rounded-xl bg-white border border-slate-200">
              <Bell className="w-5 h-5 text-slate-700" />
              <span className="absolute -top-1 -right-1 bg-rose-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">3</span>
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-5">
        {/* Quick section nav card */}
        <div className="rounded-2xl bg-white border border-slate-100 overflow-hidden">
          <button className="w-full flex items-center justify-between gap-3 px-4 py-3.5 bg-brand-50/60 border-b border-slate-100">
            <div className="flex items-center gap-3 text-brand-700 font-semibold">
              <span className="w-8 h-8 rounded-lg bg-brand-100 inline-flex items-center justify-center">
                <User className="w-4 h-4 text-brand-700" />
              </span>
              Profile &amp; Account
            </div>
            <ChevronRight className="w-4 h-4 text-brand-600" />
          </button>
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 divide-y sm:divide-y-0 divide-slate-100">
            {NAV.map((item, i) => {
              const Icon = item.icon;
              const isLast = i === NAV.length - 1;
              const isRowEnd = (i + 1) % 3 === 0;
              return (
                <li
                  key={item.key}
                  className={cn(
                    "sm:border-l first:border-l-0 sm:border-l-slate-100",
                    !isLast && "sm:[&:nth-child(2n)]:border-r-0",
                    !isRowEnd && "lg:border-b lg:border-slate-100"
                  )}
                >
                  <button className="w-full flex items-center justify-between gap-3 px-4 py-3.5 hover:bg-slate-50">
                    <div className="flex items-center gap-3 text-slate-700">
                      <Icon className="w-4 h-4 text-slate-500" />
                      {item.label}
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-300" />
                  </button>
                </li>
              );
            })}
            <li className="sm:col-span-2 lg:col-span-3 border-t border-slate-100">
              <button className="w-full flex items-center justify-between gap-3 px-4 py-3.5 hover:bg-slate-50">
                <div className="flex items-center gap-3 text-slate-700">
                  <Info className="w-4 h-4 text-slate-500" />
                  About
                </div>
                <ChevronRight className="w-4 h-4 text-slate-300" />
              </button>
            </li>
          </ul>
        </div>

        {/* Profile Information */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-slate-900">Profile Information</h2>
            <button className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-700 border border-brand-200 px-2.5 py-1.5 rounded-lg">
              <Edit3 className="w-3 h-3" /> Edit Profile
            </button>
          </div>

          <div className="flex items-start gap-4">
            <div className="relative shrink-0">
              <img src="https://i.pravatar.cc/150?img=12" className="w-20 h-20 rounded-full" alt="" />
              <button aria-label="Change photo" className="absolute bottom-0 right-0 p-1.5 rounded-full bg-white border border-slate-200">
                <Camera className="w-3.5 h-3.5 text-brand-600" />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 flex-1 w-full min-w-0">
              <Field label="Full Name" value="Alex Morgan" />
              <Field label="Email Address" value="alex.morgan@example.com" badge="Verified" />
              <Field label="Phone Number" value="+1 (604) 555-0123" />
              <Field label="Member Since" value="Jan 23, 2023" />
            </div>
          </div>
        </Card>

        {/* Account Overview */}
        <Card>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-bold text-slate-900 inline-flex items-center gap-2">
              <Shield className="w-4 h-4 text-emerald-500" /> Account Overview
            </h2>
            <span className="text-[10px] font-bold text-brand-700 bg-brand-50 px-2 py-1 rounded-full">Standard Plan</span>
          </div>

          <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-100">
            <div>
              <div className="text-xs text-slate-500">Account Balance</div>
              <div className="text-xl font-bold text-slate-900 mt-1">$124.50</div>
            </div>
            <button className="text-xs font-semibold text-brand-700 border border-brand-200 px-3 py-2 rounded-lg shrink-0">Add Credits</button>
          </div>

          <Stat label="Total Spent" value="$2,486.75" />
          <Stat label="Total Bookings" value="128" />
        </Card>

        {/* Account Preferences */}
        <Card>
          <h2 className="text-base font-bold text-slate-900 mb-3">Account Preferences</h2>
          <ul className="divide-y divide-slate-100 -mx-1">
            <PrefRow icon={<Globe className="w-4 h-4" />} label="Language" value="English" />
            <PrefRow icon={<DollarSign className="w-4 h-4" />} label="Currency" value="CAD – Canadian Dollar ($)" />
            <PrefRow icon={<Calendar className="w-4 h-4" />} label="Date & Time Format" value="May 19, 2024 • 10:30 AM" />
            <PrefRow icon={<Clock className="w-4 h-4" />} label="Time Zone" value="(GMT−07:00) Pacific Time (US & Canada)" />
            <PrefRow icon={<Ruler className="w-4 h-4" />} label="Units" value="Metric (km, kg, °C)" />
          </ul>
        </Card>

        {/* App Preferences */}
        <Card>
          <h2 className="text-base font-bold text-slate-900 mb-3">App Preferences</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-1">
            <Toggle icon={<Moon className="w-4 h-4" />} label="Dark Mode" sub="Switch between light and dark theme" on={darkMode} onChange={setDarkMode} />
            <Toggle icon={<History className="w-4 h-4" />} label="Save recent searches" sub="Save your recent searches and filters" on={saveSearches} onChange={setSaveSearches} />
            <Toggle icon={<Sparkles className="w-4 h-4" />} label="Auto-select best provider" sub="Automatically match with the best available provider" on={autoSelect} onChange={setAutoSelect} />
            <Toggle icon={<Volume2 className="w-4 h-4" />} label="In-app sounds" sub="Play notification sounds" on={sounds} onChange={setSounds} />
          </div>
        </Card>

        {/* Security */}
        <Card>
          <div className="flex items-center gap-2 mb-3">
            <Shield className="w-4 h-4 text-brand-600" />
            <h2 className="text-base font-bold text-slate-900">Security</h2>
          </div>
          <SecurityRow icon={<Lock className="w-4 h-4 text-slate-500" />} label="Password" sub="Last changed on May 2, 2024" action="Change" />
          <SecurityRow icon={<Shield className="w-4 h-4 text-slate-500" />} label="Two-Factor Authentication" sub="Enabled" subTone="text-emerald-600" action="Manage" />
          <SecurityRow icon={<Smartphone className="w-4 h-4 text-slate-500" />} label="Login Devices" sub="3 active devices" action="View" last />
        </Card>

        {/* Quick Actions */}
        <Card>
          <h2 className="text-base font-bold text-slate-900 mb-3">Quick Actions</h2>
          <ul className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <QuickAction icon={<Download className="w-4 h-4 text-slate-500" />} label="Download My Data" sub="Export your data and history" />
            <QuickAction icon={<Trash2 className="w-4 h-4 text-rose-500" />} label="Delete Account" sub="Permanently delete your account" tone="text-rose-600" />
            <QuickAction icon={<LogOut className="w-4 h-4 text-rose-500" />} label="Log Out" sub="Sign out from this device" tone="text-rose-600" />
          </ul>
        </Card>

        {/* Need Help */}
        <Card className="bg-brand-50/50 border-brand-100">
          <div className="flex items-start gap-3 sm:items-center">
            <span className="w-9 h-9 inline-flex items-center justify-center rounded-xl bg-white shadow-sm shrink-0">
              <Headphones className="w-4 h-4 text-brand-600" />
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-slate-900">Need Help?</div>
              <div className="text-xs text-slate-600 mt-0.5">Visit our Help Center or contact support if you need assistance.</div>
            </div>
            <button className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 bg-white border border-brand-200 px-3 py-2 rounded-lg shrink-0 whitespace-nowrap">
              Visit Help Center <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        </Card>

        <footer className="text-center text-xs text-slate-400 pt-2 pb-4">
          Helpward v1.0.0 · <a className="hover:text-slate-600">Terms of Service</a> · <a className="hover:text-slate-600">Privacy Policy</a>
        </footer>
      </div>
    </div>
  );
}

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("rounded-2xl bg-white border border-slate-100 p-4 sm:p-5", className)}>{children}</div>;
}

function Field({ label, value, badge }: { label: string; value: string; badge?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className="text-sm font-semibold text-slate-900 mt-1 flex items-center gap-2 min-w-0">
        <span className="truncate">{value}</span>
        {badge && <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full shrink-0">{badge}</span>}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between mt-3 text-sm">
      <div className="text-slate-500">{label}</div>
      <div className="font-semibold text-slate-900 inline-flex items-center gap-1">{value} <ChevronRight className="w-3 h-3 text-slate-300" /></div>
    </div>
  );
}

function PrefRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <li className="flex items-center gap-3 py-3 px-1">
      <span className="w-8 h-8 rounded-lg bg-slate-50 inline-flex items-center justify-center text-slate-500 shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-slate-900">{label}</div>
        <div className="text-xs text-slate-500 truncate">{value}</div>
      </div>
      <ChevronDown className="w-4 h-4 text-slate-300 shrink-0" />
    </li>
  );
}

function Toggle({
  icon, label, sub, on, onChange,
}: { icon: React.ReactNode; label: string; sub: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center gap-3 py-3 border-b border-slate-100 last:border-b-0 sm:[&:nth-last-child(-n+2)]:border-b-0">
      <span className="w-9 h-9 rounded-lg bg-slate-50 inline-flex items-center justify-center text-slate-500 shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-slate-900">{label}</div>
        <div className="text-xs text-slate-500 leading-snug">{sub}</div>
      </div>
      <button
        role="switch"
        aria-checked={on}
        aria-label={label}
        onClick={() => onChange(!on)}
        className={cn("relative inline-flex w-10 h-6 rounded-full transition shrink-0", on ? "bg-brand-600" : "bg-slate-200")}
      >
        <span className={cn("absolute top-0.5 w-5 h-5 bg-white rounded-full transition shadow-sm", on ? "right-0.5" : "left-0.5")} />
      </button>
    </div>
  );
}

function SecurityRow({
  icon, label, sub, subTone, action, last,
}: { icon: React.ReactNode; label: string; sub: string; subTone?: string; action: string; last?: boolean }) {
  return (
    <div className={cn("flex items-center gap-3 py-3", !last && "border-b border-slate-100")}>
      <span className="w-9 h-9 rounded-lg bg-slate-50 inline-flex items-center justify-center shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-slate-900">{label}</div>
        <div className={cn("text-[11px]", subTone ?? "text-slate-500")}>{sub}</div>
      </div>
      <button className="text-xs font-semibold text-brand-700 shrink-0">{action}</button>
    </div>
  );
}

function QuickAction({ icon, label, sub, tone }: { icon: React.ReactNode; label: string; sub: string; tone?: string }) {
  return (
    <li>
      <button className="w-full text-left flex items-start gap-3 p-3 rounded-xl border border-slate-100 hover:bg-slate-50">
        <span className="w-8 h-8 rounded-lg bg-slate-50 inline-flex items-center justify-center shrink-0">{icon}</span>
        <div className="flex-1 min-w-0">
          <div className={cn("text-sm font-semibold", tone ?? "text-slate-900")}>{label}</div>
          <div className="text-[11px] text-slate-500 leading-snug">{sub}</div>
        </div>
      </button>
    </li>
  );
}
