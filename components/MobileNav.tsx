"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard, Plus, Calendar, MessageCircle, Menu, X, Bell, User2,
  Grid3x3, Heart, CreditCard, Star, Briefcase, BarChart3, Settings, Gift,
  MessageSquare, LogOut,
} from "lucide-react";
import { logoutAction } from "@/app/(auth)/auth/actions";
import { cn } from "@/lib/cn";

const primary = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/bookings", label: "My Tasks", icon: Calendar },
  { href: "/new-request", label: "", icon: Plus, primary: true },
  { href: "/messages", label: "Messages", icon: MessageCircle, badge: 3 },
  { href: "/settings", label: "Profile", icon: User2 },
];

const drawer = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/new-request", label: "New Request", icon: Plus },
  { href: "/services", label: "All Services", icon: Grid3x3 },
  { href: "/messages", label: "Messages", icon: MessageCircle, badge: 3 },
  { href: "/bookings", label: "Bookings", icon: Calendar },
  { href: "/saved-providers", label: "Saved Providers", icon: Heart },
  { href: "/payments", label: "Payments", icon: CreditCard },
  { href: "/favorites", label: "Favorites", icon: Star },
  { href: "/business", label: "Business Tools", icon: Briefcase, tag: "New" },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function MobileTopBar({
  onOpen, avatarUrl, fullName,
}: {
  onOpen: () => void;
  avatarUrl?: string | null;
  fullName?: string | null;
}) {
  return (
    <header className="lg:hidden sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-100">
      <div className="flex items-center gap-3 px-4 h-14">
        <button aria-label="Open menu" onClick={onOpen} className="p-2 -ml-2 rounded-lg hover:bg-slate-100">
          <Menu className="w-5 h-5" />
        </button>
        <Link href="/" className="flex items-center gap-2 flex-1 min-w-0">
          <div className="w-7 h-7 rounded-md bg-brand-600 text-white flex items-center justify-center font-bold text-sm">H</div>
          <span className="text-base font-bold truncate">Helpward</span>
        </Link>
        <Link href="/messages" aria-label="Messages" className="p-2 rounded-lg hover:bg-slate-100">
          <MessageSquare className="w-5 h-5 text-slate-700" />
        </Link>
        <button aria-label="Notifications" className="relative p-2 rounded-lg hover:bg-slate-100">
          <Bell className="w-5 h-5 text-slate-700" />
          <span className="absolute top-0.5 right-0.5 bg-rose-500 text-white text-[10px] font-bold rounded-full min-w-[16px] h-[16px] flex items-center justify-center px-1">3</span>
        </button>
        {avatarUrl ? (
          <Link href="/settings" className="shrink-0 relative">
            <img src={avatarUrl} className="w-8 h-8 rounded-full object-cover" alt="" />
            <span className="absolute bottom-0 right-0 w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-white" />
            <span className="sr-only">Profile</span>
          </Link>
        ) : (
          <Link href="/settings" className="shrink-0 relative w-8 h-8 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-sm font-bold">
            {fullName?.[0] ?? "?"}
            <span className="sr-only">Profile</span>
          </Link>
        )}
      </div>
    </header>
  );
}

export function MobileBottomNav() {
  const pathname = usePathname();
  return (
    <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-white border-t border-slate-200 pb-[env(safe-area-inset-bottom)]">
      <div className="grid grid-cols-5">
        {primary.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href;
          if (item.primary) {
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-label="New Request"
                className="flex flex-col items-center justify-center py-2"
              >
                <span className="w-12 h-12 -mt-6 rounded-full bg-brand-600 text-white shadow-lg flex items-center justify-center">
                  <Icon className="w-5 h-5" />
                </span>
              </Link>
            );
          }
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex flex-col items-center justify-center py-2 relative"
            >
              <Icon className={cn("w-5 h-5", active ? "text-brand-600" : "text-slate-500")} />
              {item.badge ? (
                <span className="absolute top-1 right-1/2 translate-x-3 bg-rose-500 text-white text-[9px] font-bold rounded-full min-w-[14px] h-[14px] px-1 flex items-center justify-center">
                  {item.badge}
                </span>
              ) : null}
              <span className={cn("text-[10px] mt-1", active ? "text-brand-700 font-semibold" : "text-slate-500")}>
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export function MobileDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname();
  return (
    <>
      <div
        className={cn(
          "lg:hidden fixed inset-0 z-40 bg-slate-900/40 transition",
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
        onClick={onClose}
      />
      <aside
        className={cn(
          "lg:hidden fixed top-0 left-0 z-50 h-full w-72 bg-white border-r border-slate-200 transition-transform",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex items-center justify-between px-5 h-14 border-b border-slate-100">
          <Link href="/" className="flex items-center gap-2" onClick={onClose}>
            <div className="w-7 h-7 rounded-md bg-brand-600 text-white flex items-center justify-center font-bold text-sm">H</div>
            <span className="text-base font-bold">Helpward</span>
          </Link>
          <button onClick={onClose} className="p-2 -mr-2 rounded-lg hover:bg-slate-100" aria-label="Close menu">
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="px-3 py-3 space-y-1 overflow-y-auto h-[calc(100%-3.5rem-13rem)]">
          {drawer.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href || pathname?.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium",
                  active ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-50"
                )}
              >
                <Icon className={cn("w-5 h-5", active ? "text-brand-600" : "text-slate-400")} />
                <span className="flex-1">{item.label}</span>
                {item.badge ? (
                  <span className="bg-rose-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center">
                    {item.badge}
                  </span>
                ) : null}
                {item.tag ? (
                  <span className="bg-brand-600 text-white text-[10px] font-semibold rounded-md px-1.5 py-0.5">
                    {item.tag}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>

        <div className="absolute bottom-0 left-0 right-0 p-3 space-y-3 border-t border-slate-100 bg-white">
          <div className="rounded-2xl border border-brand-100 bg-gradient-to-br from-brand-50 to-white p-4">
            <div className="flex items-center gap-2 mb-1">
              <Gift className="w-4 h-4 text-brand-600" />
              <span className="text-sm font-semibold text-slate-900">Refer & Earn</span>
            </div>
            <p className="text-xs text-slate-500">Invite friends and earn $20 in credits.</p>
          </div>
          <form action={logoutAction}>
            <button
              type="submit"
              className="w-full inline-flex items-center justify-center gap-2 text-sm font-semibold text-rose-600 border border-slate-200 rounded-xl py-2.5 hover:bg-rose-50"
            >
              <LogOut className="w-4 h-4" /> Log out
            </button>
          </form>
        </div>
      </aside>
    </>
  );
}

export function MobileShell({
  children, avatarUrl, fullName,
}: {
  children: React.ReactNode;
  avatarUrl?: string | null;
  fullName?: string | null;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <MobileTopBar onOpen={() => setOpen(true)} avatarUrl={avatarUrl} fullName={fullName} />
      <MobileDrawer open={open} onClose={() => setOpen(false)} />
      {children}
      <MobileBottomNav />
    </>
  );
}
