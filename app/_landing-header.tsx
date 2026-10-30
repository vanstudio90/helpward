"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Globe, ChevronDown, Menu, X } from "lucide-react";
import { Logo } from "@/components/Logo";

/*
  REAL PAGES WHERE THERE IS ONE, AND ROOT-RELATIVE ANCHORS OTHERWISE.

  Every link here used to be a bare "#section", which has two problems.

  A bare fragment is resolved against the CURRENT page, and this header
  is on four of them — the home page, /services/<slug>, /cities/<city>
  and /cities/<city>/<service>. On any of those, clicking "Safety" did
  nothing at all except append "#safety" to the address bar, which is
  what made every URL grow a hash.

  Worse, two of the five never existed anywhere: the home page has
  id="how", id="business" and id="safety", but no "#services" and no
  "#helpers". So those two did nothing even at home.

  Services and Safety are real pages and now link to them, which also
  stops wasting the internal links. The two that are genuinely home-page
  sections are written "/#..." so they work from anywhere.
*/
const NAV_LINKS: [string, string][] = [
  ["/#how", "How it works"],
  ["/our-services", "Services"],
  ["/#business", "For Business"],
  ["/safety", "Safety"],
  ["/signup?role=helper", "Become a Helper"],
];

export function LandingHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  /*
    SCROLLS WITHOUT PUTTING A "#" IN THE ADDRESS BAR.

    Two of these links point at sections of the home page, and the
    browser's own behaviour for those is to append "#how" or "#business"
    to the URL — which is what the owner asked to be rid of.

    The href stays a real URL so the link still works with JavaScript
    off, still right-clicks and copies to something sensible, and is
    still followed by a crawler. The click is intercepted only when it
    CAN be handled here: a plain left click, on this page, to a section
    that exists. Anything else falls through to the browser.
  */
  const onSectionClick = (href: string) => (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (!href.startsWith("/#")) return;
    // Let the browser handle modified clicks — new tab, new window,
    // download — exactly as it would for any other link.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;

    const id = href.slice(2);
    if (pathname !== "/") {
      // Not on the home page: go there first, then scroll once it has
      // rendered. Still no hash.
      e.preventDefault();
      router.push("/");
      window.setTimeout(() => {
        document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 350);
      return;
    }
    const target = document.getElementById(id);
    if (!target) return;   // nothing to scroll to; let the link behave normally
    e.preventDefault();
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <>
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <Logo size={32} />
            <span className="text-lg font-bold tracking-tight">Helpward</span>
          </Link>

          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-700">
            {NAV_LINKS.map(([href, label]) => (
              <a
                key={href}
                href={href}
                onClick={onSectionClick(href)}
                className="hover:text-slate-900"
              >
                {label}
              </a>
            ))}
          </nav>

          <div className="hidden md:flex items-center gap-2">
            <Link href="/dashboard" className="text-sm font-medium px-3 py-2 rounded-lg text-slate-700 hover:bg-slate-100">Log in</Link>
            <Link href="/dashboard" className="text-sm font-semibold px-4 py-2 rounded-lg bg-slate-900 text-white hover:bg-slate-800">Sign up</Link>
          </div>

          <div className="flex md:hidden items-center gap-1">
            <button className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-sm text-slate-700 hover:bg-slate-100">
              <Globe className="w-4 h-4" />
              <span className="font-semibold">EN</span>
              <ChevronDown className="w-3 h-3" />
            </button>
            <button onClick={() => setMenuOpen(true)} aria-label="Open menu" className="p-2 rounded-lg hover:bg-slate-100">
              <Menu className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <div
        className={`md:hidden fixed inset-0 z-40 bg-slate-900/40 transition ${menuOpen ? "opacity-100" : "opacity-0 pointer-events-none"}`}
        onClick={() => setMenuOpen(false)}
      />
      <aside
        className={`md:hidden fixed top-0 right-0 z-50 h-full w-72 bg-white shadow-2xl transition-transform ${menuOpen ? "translate-x-0" : "translate-x-full"}`}
      >
        <div className="flex items-center justify-between px-5 h-16 border-b border-slate-100">
          <span className="text-base font-bold">Menu</span>
          <button onClick={() => setMenuOpen(false)} aria-label="Close menu" className="p-2 rounded-lg hover:bg-slate-100"><X className="w-5 h-5" /></button>
        </div>
        <nav className="px-3 py-4 space-y-1 text-sm font-medium text-slate-700">
          {NAV_LINKS.map(([href, label]) => (
            <a
              key={href}
              href={href}
              onClick={(e) => { setMenuOpen(false); onSectionClick(href)(e); }}
              className="block px-3 py-2.5 rounded-lg hover:bg-slate-50"
            >
              {label}
            </a>
          ))}
        </nav>
        <div className="px-3 mt-4 space-y-2">
          <Link href="/dashboard" onClick={() => setMenuOpen(false)} className="block text-center text-sm font-medium px-3 py-2.5 rounded-xl border border-slate-200 text-slate-700">Log in</Link>
          <Link href="/dashboard" onClick={() => setMenuOpen(false)} className="block text-center text-sm font-semibold px-3 py-2.5 rounded-xl bg-slate-900 text-white">Sign up</Link>
        </div>
      </aside>
    </>
  );
}
