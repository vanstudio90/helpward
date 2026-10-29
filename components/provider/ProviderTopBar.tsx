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

/** First letters of the first and last word — "Rodolf Bugaci" -> "RB". */
function initials(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0]![0]!;
  const last = parts.length > 1 ? parts[parts.length - 1]![0]! : "";
  return (first + last).toUpperCase();
}

export function ProviderTopBar({ name }: { name?: string | null }) {
  const pathname = usePathname();
  const base = "/" + pathname.split("/").slice(1, 3).join("/");
  const title = TITLES[base] ?? "Helpward";
  const showBack = VIA_MENU.has(base) || pathname !== base;

  return (
    <header className="lg:hidden sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-100">
      <div className="h-14 px-3 flex items-center gap-2.5">
        {showBack ? (
          <>
            <Link
              href={VIA_MENU.has(base) ? "/provider/menu" : base}
              aria-label="Back"
              className="w-9 h-9 -ml-1 rounded-full flex items-center justify-center text-slate-600"
            >
              <ArrowLeft className="w-5 h-5" aria-hidden="true" />
            </Link>
            <h1 className="flex-1 text-base font-bold text-slate-900 truncate">{title}</h1>
          </>
        ) : (
          /* On a root tab the title is redundant — the lit tab below
             already says where you are. So the space goes to identity
             instead: the mark, and the fact that you are signed in as a
             helper rather than as a customer, which is the one thing
             people with both accounts get wrong. */
          <>
            <Link href="/provider/dashboard" className="flex items-center gap-2 pl-0.5" aria-label="Helpward">
              <span className="w-8 h-8 rounded-field bg-brand-600 text-white flex items-center justify-center text-[15px] font-extrabold">
                H
              </span>
              <span className="text-[17px] font-extrabold tracking-tight text-slate-900">Helpward</span>
            </Link>
            <span className="px-2 py-0.5 rounded-full bg-brand-50 text-brand-700 text-[10px] font-extrabold tracking-[0.08em]">
              HELPER
            </span>
            <span className="flex-1" />
          </>
        )}

        <Link
          href="/provider/profile"
          aria-label="Your profile"
          className="w-9 h-9 shrink-0 rounded-full bg-slate-900 text-white flex items-center justify-center text-[13px] font-bold"
        >
          {initials(name)}
        </Link>
      </div>
    </header>
  );
}
