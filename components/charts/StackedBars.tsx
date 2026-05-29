// Stacked horizontal bar chart — used for dispute-category breakdowns,
// helper-funnel stages, top-services by booking volume.

export type BarItem = {
  label: string;
  value: number;
  color: string;
  href?: string;          // optional click-through (e.g. /admin/disputes?cat=damage)
  sub?: string;           // small label below the row (e.g. "12 this week · +20%")
};

type Props = {
  items: BarItem[];
  // Optional override; otherwise we scale to the largest value
  scaleMax?: number;
  formatValue?: (n: number) => string;
};

export function StackedBars({ items, scaleMax, formatValue }: Props) {
  const fmt = formatValue ?? ((n: number) => n.toLocaleString());
  const max = scaleMax ?? Math.max(...items.map((i) => i.value), 1);

  return (
    <ul className="space-y-2.5">
      {items.map((it) => {
        const pct = max === 0 ? 0 : Math.max(2, (it.value / max) * 100);
        const inner = (
          <>
            <div className="flex items-baseline justify-between gap-3 text-xs">
              <span className="font-bold text-slate-900 truncate">{it.label}</span>
              <span className="font-semibold text-slate-700 tabular-nums">{fmt(it.value)}</span>
            </div>
            <div className="mt-1 h-2 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${pct}%`, background: it.color }}
              />
            </div>
            {it.sub && <div className="text-[10px] text-slate-500 mt-1">{it.sub}</div>}
          </>
        );
        return (
          <li key={it.label}>
            {it.href ? (
              <a href={it.href} className="block hover:opacity-80 transition-opacity">
                {inner}
              </a>
            ) : (
              <div>{inner}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
