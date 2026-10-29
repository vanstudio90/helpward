"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft } from "lucide-react";

/* A header for the phone, where there was none.
 *
 * Two jobs: say which section you are in, and give a way out of the ones
 * the tab bar cannot return you from. Schedule, Reviews, Portfolio,
 * Analytics and the profile are all reached through Menu, so their back
 * arrow goes to Menu — anywhere else and the arrow would lie about where
 * it came from.
 */

const TITLES: Record<string, string> = {
  "/provider/dashboard": "Dashboard",
  "/provider/inbox": "Offers",
  "/provider/active": "Active task",
  "/provider/earnings": "Earnings",
  "/provider/menu": "Menu",
  "/provider/schedule": "Schedule",
  "/provider/messages": "Messages",
  "/provider/reviews": "Reviews",
  "/provider/portfolio": "Portfolio",
  "/provider/analytics": "Analytics",
  "/provider/profile": "My profile",
  "/provider/onboard": "Setup",
};

/** Sections reached through Menu, so Menu is where back belongs. */
const VIA_MENU = new Set([
  "/provider/schedule", "/provider/messages", "/provider/reviews",
  "/provider/portfolio", "/provider/analytics", "/provider/profile",
  "/provider/onboard",
]);

export function ProviderTopBar() {
  const pathname = usePathname();
  const base = "/" + pathname.split("/").slice(1, 3).join("/");
  const title = TITLES[base] ?? "Helpward";
  const showBack = VIA_MENU.has(base) || pathname !== base;

  return (
    <header className="lg:hidden sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-200">
      <div className="h-14 px-3 flex items-center gap-2">
        {showBack ? (
          <Link
            href={VIA_MENU.has(base) ? "/provider/menu" : base}
            aria-label="Back"
            className="w-9 h-9 -ml-1 rounded-full flex items-center justify-center text-slate-600 hover:bg-slate-100"
          >
            <ArrowLeft className="w-5 h-5" aria-hidden="true" />
          </Link>
        ) : (
          <Link href="/provider/dashboard" className="flex items-center gap-2 pl-1" aria-label="Helpward">
            <span className="w-7 h-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center text-sm font-bold">H</span>
          </Link>
        )}
        <h1 className="text-base font-bold text-slate-900 truncate">{title}</h1>
      </div>
    </header>
  );
}
