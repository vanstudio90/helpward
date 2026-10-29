"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import type { LucideIcon } from "lucide-react";

/* The desktop sidebar, with an active state.
 *
 * Every link rendered identically regardless of which page you were on, so
 * the sidebar told you where you could go but never where you were. On a
 * ten-item list that is the difference between navigation and a menu card.
 *
 * Grouped to match the phone's Menu page, so the two surfaces describe the
 * same app rather than two different ones.
 */

export type NavItem = { href: string; label: string; icon: LucideIcon };

export function ProviderSideNav({
  groups,
  offerCount = 0,
}: {
  groups: { title: string | null; items: NavItem[] }[];
  offerCount?: number;
}) {
  const pathname = usePathname();

  return (
    <nav className="flex-1 px-3 py-4 space-y-5 overflow-y-auto">
      {groups.map((g, gi) => (
        <div key={g.title ?? gi}>
          {g.title && (
            <div className="px-3 mb-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">
              {g.title}
            </div>
          )}
          <div className="space-y-0.5">
            {g.items.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors",
                    active
                      ? "bg-emerald-50 text-emerald-900"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
                  )}
                >
                  {active && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-1 rounded-r-full bg-emerald-600" aria-hidden="true" />
                  )}
                  <Icon className={cn("w-5 h-5 shrink-0", active ? "text-emerald-600" : "text-slate-400")} aria-hidden="true" />
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.href === "/provider/inbox" && offerCount > 0 && (
                    <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-emerald-600 text-white text-[11px] font-bold flex items-center justify-center">
                      {offerCount > 9 ? "9+" : offerCount}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}
