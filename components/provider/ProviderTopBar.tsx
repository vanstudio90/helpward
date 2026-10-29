"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Logo } from "@/components/Logo";

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
  // Menu leads with the profile card, so a second avatar two rows above
  // it is just noise.
  const showAvatar = base !== "/provider/menu";

  return (
    <header className="lg:hidden sticky top-0 z-30 bg-app/95 backdrop-blur">
      <div className="min-h-[60px] px-4 flex items-center gap-3">
        {showBack ? (
          <>
            <Link
              href={VIA_MENU.has(base) ? "/provider/menu" : base}
              aria-label="Back"
              className="w-9 h-9 -ml-1.5 rounded-full flex items-center justify-center text-slate-600"
            >
              <ArrowLeft className="w-5 h-5" aria-hidden="true" />
            </Link>
            <h1 className="flex-1 text-[17px] font-extrabold text-slate-900 truncate">{title}</h1>
          </>
        ) : (
          /* The lockup: mark, name, and the word HELPER under it. People
             who hold both a customer and a helper account mix them up
             constantly, and the two apps are otherwise identical at a
             glance. The tab bar below already says which section you are
             in, so the title would only repeat it. */
          <>
            <Link href="/provider/dashboard" className="flex items-center gap-2.5" aria-label="Helpward helper">
              <Logo size={38} />
              <span className="leading-none">
                <span className="block text-[23px] font-extrabold tracking-[-0.02em] text-slate-900">Helpward</span>
                <span className="block mt-1 text-[10px] font-bold tracking-[0.34em] text-slate-400">HELPER</span>
              </span>
            </Link>
            <span className="flex-1" />
          </>
        )}

        {showAvatar && (
          <Link
            href="/provider/profile"
            aria-label="Your profile"
            className="w-10 h-10 shrink-0 rounded-full bg-brand-50 text-brand-700 flex items-center justify-center text-[14px] font-extrabold"
          >
            {initials(name)}
          </Link>
        )}
      </div>
    </header>
  );
}
