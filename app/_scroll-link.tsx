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

  IT CAN NEVER BECOME A DEAD CONTROL. If the target does not exist and
  we are not on the page that owns it, the handler does nothing and the
  browser's own behaviour takes over. A modified click (new tab, new
  window) is left alone for the same reason.

  OFF-PAGE ANCHORS ARE HANDLED TOO. The header appears on every page, so
  "How it works" is usually clicked from somewhere that has no "how"
  section. Falling through there would navigate to "/#how" and leave the
  hash in the address bar — the exact thing this exists to prevent. So a
  "/#id" link clicked away from home routes to "/" and scrolls once it
  has rendered.
*/

import type { ReactNode, MouseEvent } from "react";
import { usePathname, useRouter } from "next/navigation";

export function scrollToSection(
  href: string,
  e: MouseEvent<HTMLAnchorElement>,
  nav?: { pathname: string; push: (href: string) => void },
) {
  const hash = href.startsWith("/#") ? href.slice(1) : href;
  if (!hash.startsWith("#")) return;
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;

  const id = hash.slice(1);
  const target = document.getElementById(id);

  if (!target) {
    // Not on this page. If the link names the home page and we know how
    // to route, go there and scroll when it arrives.
    if (nav && href.startsWith("/#") && nav.pathname !== "/") {
      e.preventDefault();
      nav.push("/");
      window.setTimeout(() => {
        document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 350);
    }
    return;
  }

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
  const pathname = usePathname();
  const router = useRouter();
  return (
    <a
      href={href}
      className={className}
      onClick={(e) => {
        onNavigate?.();
        scrollToSection(href, e, { pathname, push: (to) => router.push(to) });
      }}
    >
      {children}
    </a>
  );
}
