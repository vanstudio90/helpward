import type { ReactNode } from "react";

/* Building blocks for a long legal document.
 *
 * A seventeen-section privacy policy rendered as one column of prose is
 * technically complete and practically unreadable — nobody finds the
 * retention rule or the deletion steps in it. These give the document
 * structure a reader can navigate: numbered sections to link to, callouts
 * for the statements that actually bind us, and tables where the content
 * is genuinely tabular.
 */

/** One numbered section, linkable and anchored for the contents list. */
export function Section({
  id, n, title, children,
}: { id: string; n: number; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24">
      <div className="flex items-baseline gap-3">
        <span
          aria-hidden="true"
          className="shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-lg
                     bg-brand-50 text-brand-700 text-xs font-bold tabular-nums"
        >
          {n}
        </span>
        <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
          <a href={`#${id}`} className="hover:text-brand-700 transition">{title}</a>
        </h2>
      </div>
      <div className="mt-4 pl-0 sm:pl-10 space-y-4 text-[15px] leading-relaxed text-slate-700">
        {children}
      </div>
    </section>
  );
}

/** A labelled sub-part within a section. */
export function Sub({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mt-6 first:mt-0">
      <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide">{title}</h3>
      <div className="mt-2 space-y-3">{children}</div>
    </div>
  );
}

/** A statement that binds us, pulled out so it cannot be skimmed past. */
export function Callout({
  tone = "brand", title, children,
}: { tone?: "brand" | "warn" | "good"; title?: string; children: ReactNode }) {
  // brand-900 not brand-950: the theme defines brand 50-900 only
  // (app/globals.css), so a 950 would resolve to nothing and the text
  // would silently fall back to whatever it inherited. amber and emerald
  // are stock Tailwind and do carry 950.
  const tones = {
    brand: "border-brand-200 bg-brand-50/70 text-brand-900",
    warn: "border-amber-200 bg-amber-50 text-amber-900",
    good: "border-emerald-200 bg-emerald-50 text-emerald-900",
  } as const;
  return (
    <div className={`rounded-2xl border p-4 sm:p-5 ${tones[tone]}`}>
      {title && <div className="text-sm font-bold mb-1">{title}</div>}
      <div className="text-[15px] leading-relaxed [&_a]:underline [&_a]:font-semibold">
        {children}
      </div>
    </div>
  );
}

/** Bulleted list with a consistent marker. */
export function List({ items }: { items: ReactNode[] }) {
  return (
    <ul className="space-y-2">
      {items.map((item, i) => (
        <li key={i} className="flex gap-3">
          <span aria-hidden="true" className="mt-2 w-1.5 h-1.5 rounded-full bg-brand-400 shrink-0" />
          <span className="flex-1">{item}</span>
        </li>
      ))}
    </ul>
  );
}

/** Two-column table for content that is genuinely tabular. */
export function Table({
  head, rows,
}: { head: [string, string]; rows: Array<[ReactNode, ReactNode]> }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200">
      <table className="w-full text-left text-[15px]">
        <thead className="bg-slate-50">
          <tr>
            <th scope="col" className="px-4 py-3 font-bold text-slate-900 w-1/3">{head[0]}</th>
            <th scope="col" className="px-4 py-3 font-bold text-slate-900">{head[1]}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map(([a, b], i) => (
            <tr key={i} className="align-top">
              <td className="px-4 py-3 font-semibold text-slate-900">{a}</td>
              <td className="px-4 py-3 text-slate-700">{b}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
