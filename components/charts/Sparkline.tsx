// Sparkline — hand-rolled SVG, no deps. Used in KPI cards.
//
// Renders a small filled-area path over a series of numbers. If all values
// are zero the line collapses to the baseline (looks intentional, not broken).

type Props = {
  values: number[];
  width?: number;
  height?: number;
  color?: string;        // stroke color
  fill?: string;         // gradient bottom fill, with low alpha
  strokeWidth?: number;
  className?: string;
  ariaLabel?: string;
};

export function Sparkline({
  values, width = 120, height = 36, color = "currentColor",
  fill = "currentColor", strokeWidth = 1.5, className, ariaLabel = "Trend",
}: Props) {
  if (values.length === 0) {
    return <svg width={width} height={height} className={className} aria-label={ariaLabel} />;
  }
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1; // avoid divide-by-zero when flat
  const step = values.length > 1 ? width / (values.length - 1) : width;

  const points = values.map((v, i) => {
    const x = i * step;
    const y = height - ((v - min) / range) * (height - 2) - 1;
    return [x, y] as const;
  });

  const linePath = points.map(([x, y], i) => `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`).join(" ");
  const areaPath = `${linePath} L ${width} ${height} L 0 ${height} Z`;

  // Tiny gradient defs id-namespaced so multiple sparklines on a page don't collide.
  const gradId = `spk-${Math.random().toString(36).slice(2, 8)}`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={className} aria-label={ariaLabel}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={fill} stopOpacity="0.25" />
          <stop offset="100%" stopColor={fill} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradId})`} stroke="none" />
      <path d={linePath} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
