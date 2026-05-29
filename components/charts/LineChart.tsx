// Multi-series line chart with axis grid + hover-friendly markers via the
// browser's native title tooltip. Hand-rolled SVG, no deps. Used for the
// big 30-day time series on the admin overview.

export type LineSeries = {
  name: string;
  values: number[];   // length must match labels
  color: string;
};

type Props = {
  labels: string[];   // x-axis labels (one per data point)
  series: LineSeries[];
  width?: number;
  height?: number;
  yLabel?: string;
  formatY?: (n: number) => string;
};

export function LineChart({
  labels, series, width = 720, height = 200, yLabel, formatY,
}: Props) {
  const padding = { top: 16, right: 16, bottom: 28, left: 48 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;
  const fmt = formatY ?? ((n: number) => String(n));

  const allValues = series.flatMap((s) => s.values);
  const max = allValues.length > 0 ? Math.max(...allValues, 0) : 1;
  // Round max up to a "friendly" tick — keeps the y-axis labels human.
  const niceMax = niceCeil(max);
  const points = labels.length;
  const xStep = points > 1 ? innerW / (points - 1) : innerW;

  const xy = (i: number, v: number): [number, number] => {
    const x = padding.left + i * xStep;
    const y = padding.top + innerH - (v / niceMax) * innerH;
    return [x, y];
  };

  // 5 horizontal grid lines including top + baseline
  const gridLines = [0, 1, 2, 3, 4].map((i) => {
    const v = (niceMax * (4 - i)) / 4;
    const y = padding.top + (innerH * i) / 4;
    return { v, y };
  });

  // Skinny x labels: show every Nth so we don't crowd. Aim for ~8 visible.
  const labelStride = Math.max(1, Math.ceil(points / 8));

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} className="block">
      <title>{yLabel ?? "Time series"}</title>

      {/* Y grid + labels */}
      {gridLines.map(({ v, y }, i) => (
        <g key={i}>
          <line x1={padding.left} x2={padding.left + innerW} y1={y} y2={y} stroke="#e2e8f0" strokeWidth="1" />
          <text x={padding.left - 6} y={y + 3} textAnchor="end" fontSize="10" fill="#94a3b8">
            {fmt(v)}
          </text>
        </g>
      ))}

      {/* X tick labels */}
      {labels.map((l, i) => i % labelStride !== 0 ? null : (
        <text
          key={l + i}
          x={padding.left + i * xStep}
          y={padding.top + innerH + 16}
          textAnchor="middle"
          fontSize="10"
          fill="#94a3b8"
        >
          {l}
        </text>
      ))}

      {/* Series */}
      {series.map((s) => {
        const path = s.values.map((v, i) => {
          const [x, y] = xy(i, v);
          return `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
        }).join(" ");
        return (
          <g key={s.name}>
            <path d={path} fill="none" stroke={s.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            {s.values.map((v, i) => {
              const [x, y] = xy(i, v);
              return (
                <circle key={i} cx={x} cy={y} r="2" fill={s.color}>
                  <title>{`${labels[i]}: ${fmt(v)}`}</title>
                </circle>
              );
            })}
          </g>
        );
      })}

      {/* Legend */}
      <g transform={`translate(${padding.left}, 4)`}>
        {series.map((s, i) => (
          <g key={s.name} transform={`translate(${i * 110}, 0)`}>
            <rect x="0" y="0" width="10" height="10" rx="2" fill={s.color} />
            <text x="14" y="9" fontSize="10" fill="#475569">{s.name}</text>
          </g>
        ))}
      </g>
    </svg>
  );
}

// Round a value up to a "round-ish" max suitable for axis ticks. Keeps the
// y-axis labels readable (10 not 9.34, 50 not 47.2, 1000 not 974).
function niceCeil(n: number): number {
  if (n <= 0) return 1;
  const exp = Math.floor(Math.log10(n));
  const base = Math.pow(10, exp);
  const f = n / base;
  let nice: number;
  if (f <= 1) nice = 1;
  else if (f <= 2) nice = 2;
  else if (f <= 5) nice = 5;
  else nice = 10;
  return nice * base;
}
