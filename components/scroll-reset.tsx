"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

/* Start every new page at the top.
 *
 * Signing up from the bottom of a long form and landing on /verify-email
 * put the next page on screen already scrolled, with its header cut off.
 * The browser keeps the scroll offset across a client-side navigation and
 * the new page is shorter than the old one, so nothing scrolls it back.
 *
 * Two things this deliberately does NOT do:
 *
 *   BACK AND FORWARD keep their remembered position. Returning to a list
 *   you had scrolled halfway down and being thrown to the top is its own
 *   bug, and the browser's restoration is the correct behaviour there. A
 *   popstate sets the flag so the effect below stands down for that one
 *   navigation.
 *
 *   ANCHOR LINKS still land on their heading. /terms and /privacy have
 *   tables of contents that jump within the page; pathname does not change
 *   for those, and the hash check covers a cross-page #link.
 */
export function ScrollReset() {
  const pathname = usePathname();
  // True on first paint: the page is already where the browser wants it,
  // and forcing a scroll would fight a deep link into an anchor.
  const skipNext = useRef(true);

  useEffect(() => {
    const onPopState = () => { skipNext.current = true; };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    if (skipNext.current) { skipNext.current = false; return; }
    if (window.location.hash) return;
    // "instant" rather than smooth: this is a correction, not a transition,
    // and it should be over before the new page is read. It also respects
    // prefers-reduced-motion by never animating in the first place.
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [pathname]);

  return null;
}
