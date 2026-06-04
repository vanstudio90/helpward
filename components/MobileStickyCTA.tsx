"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";

// Fixed-bottom mobile-only CTA bar that appears once the user has scrolled
// past the hero. Pure UX win — keeps the primary action within thumb reach
// while readers explore mid-page content, without competing with the hero
// search box above-the-fold.
//
// Uses IntersectionObserver on a sentinel rendered just below the hero —
// no scroll-position math, no resize handling, no janky-on-old-mobile
// requestAnimationFrame loops. Hides itself on lg: + breakpoints because
// the desktop nav is always visible and the bar would be redundant clutter.
//
// safe-area-inset-bottom honours the iPhone home indicator on devices that
// use one — falls back to 0 on older devices that don't expose the var.
export function MobileStickyCTA({ heroSentinelId }: { heroSentinelId: string }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const sentinel = document.getElementById(heroSentinelId);
    if (!sentinel) return;
    const io = new IntersectionObserver(
      (entries) => {
        // When the sentinel scrolls OUT of view above the viewport, show
        // the bar. When it comes back into view (scrolling back up), hide.
        const e = entries[0];
        setShow(!e.isIntersecting && e.boundingClientRect.top < 0);
      },
      { threshold: 0, rootMargin: "0px" },
    );
    io.observe(sentinel);
    return () => io.disconnect();
  }, [heroSentinelId]);

  return (
    <div
      aria-hidden={!show}
      className={`fixed bottom-0 inset-x-0 z-40 lg:hidden transition-transform duration-200 ${
        show ? "translate-y-0" : "translate-y-full pointer-events-none"
      }`}
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <div className="mx-3 mb-3 rounded-2xl bg-white/95 backdrop-blur-md border border-slate-200 shadow-lg shadow-slate-900/10 p-2 flex items-center gap-2">
        <Link
          href="/services"
          className="flex-1 inline-flex items-center justify-center px-3 py-3 rounded-xl text-sm font-bold text-slate-700 hover:bg-slate-50"
        >
          Browse services
        </Link>
        <Link
          href="/signup?next=/new-request"
          className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-3 rounded-xl bg-gradient-to-r from-brand-600 to-violet-600 text-white text-sm font-bold shadow-sm"
        >
          <Sparkles className="w-4 h-4" /> Get help now <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    </div>
  );
}

// Sentinel that lives just below the hero. Renders as a 1px transparent
// element so it doesn't affect layout but the IntersectionObserver can
// track it cleanly.
export function HeroSentinel({ id }: { id: string }) {
  return <div id={id} aria-hidden="true" className="h-px w-full" />;
}
