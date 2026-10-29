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
                  "flex flex-col items-center justify-center gap-1 pt-2 pb-1.5",
                  active ? "text-brand-700" : "text-slate-400",
                )}
              >
                {/* The lit tab carries a filled pill rather than the hairline
                    rail it used to. A 2px line above a 22px icon is most of
                    nothing on a phone held at arm's length; a pill is
                    readable in peripheral vision, which is how a tab bar is
                    actually read. */}
                <span
                  className={cn(
                    "relative flex items-center justify-center h-8 px-4 rounded-full transition-colors",
                    active ? "bg-brand-50" : "bg-transparent",
                  )}
                >
                  <Icon
                    className="w-[22px] h-[22px]"
                    strokeWidth={active ? 2.4 : 2}
                    aria-hidden="true"
                  />
                  {t.href === "/provider/inbox" && offerCount > 0 && (
                    <span
                      className="absolute top-0 right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-brand-600 text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-white"
                      aria-label={`${offerCount} waiting`}
                    >
                      {offerCount > 9 ? "9+" : offerCount}
                    </span>
                  )}
                </span>
                <span className={cn("text-[11px] leading-none", active ? "font-extrabold" : "font-semibold")}>
                  {t.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
