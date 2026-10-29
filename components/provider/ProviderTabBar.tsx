"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Inbox, Activity, DollarSign, Menu } from "lucide-react";
import { cn } from "@/lib/cn";

/* The helper's navigation on a phone.
 *
 * There wasn't one. The sidebar is `hidden lg:flex`, so below 1024px a
 * helper could reach none of the ten sections — land on Active task from a
 * notification and you were stranded with no way back to anything.
 *
 * Five tabs, because a thumb-reachable bar stops being usable past that.
 * They are the five things a helper does repeatedly: check they are online,
 * look at offers, work the current job, check what they earned, and get to
 * everything else. Everything else lives behind Menu rather than being
 * crammed in — the same reason Uber's driver app has exactly five.
 */

const TABS = [
  { href: "/provider/dashboard", label: "Home", icon: Home },
  { href: "/provider/inbox", label: "Offers", icon: Inbox },
  { href: "/provider/active", label: "Active", icon: Activity },
  { href: "/provider/earnings", label: "Earnings", icon: DollarSign },
  { href: "/provider/menu", label: "Menu", icon: Menu },
];

export function ProviderTabBar({ offerCount = 0 }: { offerCount?: number }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Helper sections"
      className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-slate-200"
      // Clears the iPhone home indicator without padding the bar on Android.
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="grid grid-cols-5">
        {TABS.map((t) => {
          const Icon = t.icon;
          // Menu owns its own page; the rest match their section prefix so a
          // detail page keeps its tab lit.
          const active = pathname === t.href || pathname.startsWith(t.href + "/");
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center justify-center gap-0.5 py-2.5 relative",
                  active ? "text-emerald-700" : "text-slate-500",
                )}
              >
                <span className="relative">
                  <Icon className="w-[22px] h-[22px]" aria-hidden="true" />
                  {t.href === "/provider/inbox" && offerCount > 0 && (
                    <span
                      className="absolute -top-1.5 -right-2 min-w-[17px] h-[17px] px-1 rounded-full bg-emerald-600 text-white text-[10px] font-bold flex items-center justify-center"
                      aria-label={`${offerCount} waiting`}
                    >
                      {offerCount > 9 ? "9+" : offerCount}
                    </span>
                  )}
                </span>
                <span className="text-[11px] font-semibold leading-none">{t.label}</span>
                {active && (
                  <span className="absolute top-0 inset-x-5 h-0.5 rounded-full bg-emerald-600" aria-hidden="true" />
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
