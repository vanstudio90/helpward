"use client";

import Link from "next/link";
import { useState } from "react";
import { Globe, ChevronDown, Menu, X } from "lucide-react";

const NAV_LINKS: [string, string][] = [
  ["#how", "How it works"],
  ["#services", "Services"],
  ["#business", "For Business"],
  ["#safety", "Safety"],
  ["#providers", "Become a Helper"],
];

export function LandingHeader() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-brand-600 text-white flex items-center justify-center font-bold">H</div>
            <span className="text-lg font-bold tracking-tight">Helpward</span>
          </Link>

          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-700">
            {NAV_LINKS.map(([href, label]) => (
              <a key={href} href={href} className="hover:text-slate-900">{label}</a>
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
            <a key={href} href={href} onClick={() => setMenuOpen(false)} className="block px-3 py-2.5 rounded-lg hover:bg-slate-50">{label}</a>
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
