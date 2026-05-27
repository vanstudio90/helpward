"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Plus, Grid3x3, MessageCircle, Calendar, Heart,
  CreditCard, Star, Briefcase, BarChart3, Settings, Gift, ChevronDown, LogOut,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { logoutAction } from "@/app/(auth)/auth/actions";

const nav = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/new-request", label: "New Request", icon: Plus },
  { href: "/services", label: "All Services", icon: Grid3x3 },
  { href: "/messages", label: "Messages", icon: MessageCircle },
  { href: "/bookings", label: "Bookings", icon: Calendar },
  { href: "/saved-providers", label: "Saved Providers", icon: Heart },
  { href: "/payments", label: "Payments", icon: CreditCard },
  { href: "/favorites", label: "Favorites", icon: Star },
  { href: "/business", label: "Business Tools", icon: Briefcase, tag: "New" },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar({
  user,
}: {
  user?: { full_name: string; avatar_url: string | null; wallet_balance_cents: number } | null;
}) {
  const pathname = usePathname();
  return (
    <aside className="hidden lg:flex w-64 shrink-0 flex-col border-r border-slate-200 bg-white">
      <Link href="/" className="flex items-center gap-2 px-6 h-16 border-b border-slate-100">
        <div className="w-8 h-8 rounded-lg bg-brand-600 text-white flex items-center justify-center font-bold">H</div>
        <span className="text-lg font-bold tracking-tight">Helpward</span>
      </Link>

      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {nav.map((item) => {
          const active = pathname === item.href || pathname?.startsWith(item.href + "/");
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "group flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition",
                active
                  ? "bg-brand-50 text-brand-700"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              )}
            >
              <Icon className={cn("w-5 h-5", active ? "text-brand-600" : "text-slate-400 group-hover:text-slate-600")} />
              <span className="flex-1">{item.label}</span>
              {item.tag ? (
                <span className="bg-brand-600 text-white text-[10px] font-semibold rounded-md px-1.5 py-0.5">
                  {item.tag}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      <div className="px-3 pb-4 space-y-3">
        <div className="rounded-2xl border border-brand-100 bg-gradient-to-br from-brand-50 to-white p-4">
          <div className="flex items-center gap-2 mb-1">
            <Gift className="w-4 h-4 text-brand-600" />
            <span className="text-sm font-semibold text-slate-900">Refer & Earn</span>
          </div>
          <p className="text-xs text-slate-500 leading-relaxed">
            Invite friends and earn $20 in credits.
          </p>
          <button className="mt-3 w-full text-xs font-semibold text-brand-700 bg-white border border-brand-200 rounded-lg py-2 hover:bg-brand-50 transition">
            Invite Now
          </button>
        </div>

        {user && (
          <Link href="/settings" className="block rounded-2xl border border-slate-200 bg-white p-3 hover:bg-slate-50">
            <div className="flex items-center gap-3">
              {user.avatar_url ? (
                <img src={user.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover" />
              ) : (
                <div className="w-9 h-9 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center font-bold text-sm">
                  {user.full_name?.[0] ?? "?"}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-slate-900 truncate">{user.full_name}</div>
                <div className="text-xs text-slate-500 truncate">View profile</div>
              </div>
              <ChevronDown className="w-4 h-4 text-slate-400" />
            </div>
          </Link>
        )}

        {user && (
          <div className="rounded-2xl bg-slate-50 p-3">
            <div className="text-xs text-slate-500">Your Balance</div>
            <div className="text-lg font-bold text-slate-900">
              ${(user.wallet_balance_cents / 100).toFixed(2)}
            </div>
            <Link href="/payments" className="mt-2 block text-center text-xs font-semibold text-brand-700 bg-white border border-slate-200 rounded-lg py-2 hover:bg-brand-50 transition">
              Add Credits +
            </Link>
          </div>
        )}

        <form action={logoutAction}>
          <button className="w-full inline-flex items-center justify-center gap-2 text-xs font-semibold text-slate-500 border border-slate-200 rounded-lg py-2 hover:bg-slate-50">
            <LogOut className="w-3.5 h-3.5" /> Log out
          </button>
        </form>
      </div>
    </aside>
  );
}
