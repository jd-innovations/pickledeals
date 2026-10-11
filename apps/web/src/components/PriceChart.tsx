import { formatPrice } from '@pickledeals/shared';

import type { HistoryPoint } from '@/data/offers';

/**
 * Daily low price as a step-free line, drawn to one scale (design: Price history). The dashed line is
 * the typical price when known. Colours come from the theme tokens so it reads in both themes.
 */
export function PriceChart({ points, typicalCents, label }: { points: HistoryPoint[]; typicalCents: number | null; label: string }) {
  if (points.length < 2) {
    return <p className="muted" style={{ fontSize: 14 }}>Not enough history yet. We check prices through the day, so the chart fills in over the next few weeks.</p>;
  }
  const W = 600;
  const H = 220;
  const PAD = { l: 8, r: 8, t: 16, b: 24 };
  const values = points.map((p) => p.cents).concat(typicalCents != null ? [typicalCents] : []);
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  if (hi === lo) {
    hi += 500;
    lo = Math.max(0, lo - 500);
  }
  const span = hi - lo;
  lo -= span * 0.12;
  hi += span * 0.12;
  const x = (i: number) => PAD.l + (i / (points.length - 1)) * (W - PAD.l - PAD.r);
  const y = (c: number) => PAD.t + (1 - (c - lo) / (hi - lo)) * (H - PAD.t - PAD.b);
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.cents).toFixed(1)}`).join(' ');
  const area = `${d} L${x(points.length - 1).toFixed(1)} ${H - PAD.b} L${x(0).toFixed(1)} ${H - PAD.b} Z`;
  const last = points[points.length - 1]!;
  const first = new Date(points[0]!.day);
  const fmt = (dt: Date) => dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} preserveAspectRatio="none">
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1={0} x2={W} y1={PAD.t + f * (H - PAD.t - PAD.b)} y2={PAD.t + f * (H - PAD.t - PAD.b)} stroke="var(--separator)" />
        ))}
        <path d={area} fill="var(--text-primary)" opacity={0.06} />
        {typicalCents != null && (
          <>
            <line x1={0} x2={W} y1={y(typicalCents)} y2={y(typicalCents)} stroke="var(--text-tertiary)" strokeDasharray="4 4" />
            <text x={4} y={y(typicalCents) - 6} fontSize={12} fill="var(--text-tertiary)">
              Typical {formatPrice(typicalCents)}
            </text>
          </>
        )}
        <path d={d} fill="none" stroke="var(--text-primary)" strokeWidth={2.5} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        <circle cx={x(points.length - 1)} cy={y(last.cents)} r={5} fill="var(--text-primary)" />
        <text x={PAD.l} y={H - 6} fontSize={12} fill="var(--text-tertiary)">
          {fmt(first)}
        </text>
        <text x={W - PAD.r} y={H - 6} fontSize={12} fill="var(--text-tertiary)" textAnchor="end">
          Today
        </text>
      </svg>
    </div>
  );
}
