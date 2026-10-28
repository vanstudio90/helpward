"use client";

import { useEffect, useState } from "react";

/* Contents list that tracks where the reader is.
 *
 * Seventeen sections is a lot to hold in your head. On desktop this sits
 * beside the document and highlights the current section; on mobile it
 * collapses into a jump menu so it does not push the policy off screen.
 */
export function Toc({ items }: { items: Array<{ id: string; label: string }> }) {
  const [active, setActive] = useState(items[0]?.id ?? "");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const seen = new Map<string, boolean>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) seen.set(e.target.id, e.isIntersecting);
        // The topmost section currently on screen wins, so the highlight
        // follows reading order rather than whichever fired last.
        const first = items.find((i) => seen.get(i.id));
        if (first) setActive(first.id);
      },
      // Bias towards the upper part of the viewport: a heading is "current"
      // once it reaches the top, not when it is halfway down.
      { rootMargin: "-80px 0px -70% 0px", threshold: 0 },
    );
    for (const i of items) {
      const el = document.getElementById(i.id);
      if (el) io.observe(el);
    }
    return () => io.disconnect();
  }, [items]);

  return (
    <>
      {/* Mobile: a disclosure, closed by default. */}
      <div className="lg:hidden mb-8">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl
                     border border-slate-200 bg-white text-sm font-semibold text-slate-900"
        >
          Jump to a section
          <span aria-hidden="true" className={`transition ${open ? "rotate-180" : ""}`}>⌄</span>
        </button>
        {open && (
          <nav className="mt-2 rounded-xl border border-slate-200 bg-white p-2 max-h-80 overflow-y-auto">
            {items.map((i, n) => (
              <a
                key={i.id}
                href={`#${i.id}`}
                onClick={() => setOpen(false)}
                className="block px-3 py-2 rounded-lg text-sm text-slate-700 hover:bg-slate-50"
              >
                <span className="tabular-nums text-slate-400 mr-2">{n + 1}</span>
                {i.label}
              </a>
            ))}
          </nav>
        )}
      </div>

      {/* Desktop: sticky, with the current section marked. */}
      <nav aria-label="Contents" className="hidden lg:block sticky top-8 self-start">
        <div className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-3">
          Contents
        </div>
        <ol className="space-y-0.5 border-l border-slate-200">
          {items.map((i, n) => {
            const current = active === i.id;
            return (
              <li key={i.id}>
                <a
                  href={`#${i.id}`}
                  aria-current={current ? "true" : undefined}
                  className={`block -ml-px border-l-2 pl-4 py-1.5 text-[13px] leading-snug transition ${
                    current
                      ? "border-brand-600 text-brand-700 font-semibold"
                      : "border-transparent text-slate-500 hover:text-slate-900 hover:border-slate-300"
                  }`}
                >
                  <span className="tabular-nums opacity-60 mr-1.5">{n + 1}</span>
                  {i.label}
                </a>
              </li>
            );
          })}
        </ol>
      </nav>
    </>
  );
}
