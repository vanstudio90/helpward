"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

/* A thin bar across the top while a navigation is in flight.
 *
 * Provider and customer pages are server-rendered behind an auth check, so
 * between the tap and the new screen there is a real pause. The press state
 * in globals.css says "I registered that"; this says "I am still working",
 * which is the part that was missing.
 *
 * Driven by capturing link clicks rather than by Next's router, because
 * there is no supported global "navigation pending" signal — useLinkStatus
 * only works inside one Link, and this has to cover every link on the site
 * without touching any of them.
 *
 * The capture listener is deliberately conservative. Anything that is not
 * a plain in-app navigation is ignored, because a bar that starts and
 * never finishes is worse than no bar at all.
 */
export function NavProgress() {
  const pathname = usePathname();
  const barRef = useRef<HTMLDivElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;

    const stop = () => {
      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
      if (bar.dataset.active === "true") {
        bar.dataset.active = "done";
        setTimeout(() => { if (bar.dataset.active === "done") bar.dataset.active = "false"; }, 400);
      }
    };

    const start = () => {
      if (bar.dataset.active === "true") return;
      bar.dataset.active = "false";
      // Next frame, so restarting the animation actually restarts it.
      requestAnimationFrame(() => { bar.dataset.active = "true"; });
      // A navigation that never lands (a server error, a dropped
      // connection) must not leave the bar running forever.
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(stop, 15000);
    };

    const onClick = (e: MouseEvent) => {
      // Let the browser handle anything that is not a plain left click.
      if (e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

      const anchor = (e.target as Element | null)?.closest?.("a");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;

      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;

      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      // Same page, or only the hash differs: nothing is going to load.
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;

      start();
    };

    // A form post (a server action) is also a wait worth showing.
    const onSubmit = () => start();

    document.addEventListener("click", onClick, { capture: true });
    document.addEventListener("submit", onSubmit, { capture: true });
    // Leaving via back/forward or a full page load ends the wait.
    window.addEventListener("pagehide", stop);
    return () => {
      document.removeEventListener("click", onClick, { capture: true });
      document.removeEventListener("submit", onSubmit, { capture: true });
      window.removeEventListener("pagehide", stop);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  // The new route has rendered: that is the only honest "finished" signal.
  useEffect(() => {
    const bar = barRef.current;
    if (!bar || bar.dataset.active !== "true") return;
    bar.dataset.active = "done";
    const t = setTimeout(() => { if (bar.dataset.active === "done") bar.dataset.active = "false"; }, 400);
    return () => clearTimeout(t);
  }, [pathname]);

  return <div id="nav-progress" ref={barRef} data-active="false" aria-hidden="true" />;
}
