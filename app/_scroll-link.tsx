"use client";

/*
  A link to a section of this page that does NOT put a "#" in the URL.

  Every in-page link on the marketing site was a bare fragment, so
  clicking one left "helpward.com/#services" in the address bar — which
  is then what a visitor sees, copies and shares.

  The href stays a real fragment on purpose: the link still works with
  JavaScript off, still right-clicks and copies to something sensible,
  and is still followed by a crawler. Only a plain left click is handled
  here.

  IT CAN NEVER BECOME A DEAD CONTROL. If the target does not exist on
  this page — a nav shared across several pages, or a section that has
  been renamed — the handler does nothing and the browser's own
  behaviour takes over. A modified click (new tab, new window) is left
  alone for the same reason.
*/

import type { ReactNode, MouseEvent } from "react";

export function scrollToSection(href: string, e: MouseEvent<HTMLAnchorElement>) {
  const hash = href.startsWith("/#") ? href.slice(1) : href;
  if (!hash.startsWith("#")) return;
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;

  const target = document.getElementById(hash.slice(1));
  if (!target) return;

  e.preventDefault();
  target.scrollIntoView({ behavior: "smooth", block: "start" });
}

export function ScrollLink({
  href,
  className,
  children,
  onNavigate,
}: {
  href: string;
  className?: string;
  children: ReactNode;
  /** Extra work on click — closing a mobile menu, for instance. */
  onNavigate?: () => void;
}) {
  return (
    <a
      href={href}
      className={className}
      onClick={(e) => {
        onNavigate?.();
        scrollToSection(href, e);
      }}
    >
      {children}
    </a>
  );
}
