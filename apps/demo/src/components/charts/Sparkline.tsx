// KPI sparkline (smooth line over a soft gradient, last point marked) and its expandable version:
// the whole sparkline is one button that opens the shared chart dialog (larger chart, Daily/Monthly,
// legend, tooltips, values table, Print and Save PDF).
import { useId, useMemo } from 'react';
import { useAppState } from '../../state/AppState';
import { count, countAxis, money, moneyAxis, multiple, pct, periodLabel } from '../../lib/format';
import { ChartCard } from './ChartCard';
import { TimeSeriesChart, type ChartRow } from './TimeSeriesChart';
import { COLOR } from './colors';

/** How daily values combine into a month: sums add up; ratios are recomputed from summed parts, never averaged. */
export type SparkAgg =
  | { kind: 'sum' }
  | { kind: 'ratio'; num: readonly (number | null)[]; den: readonly (number | null)[]; scale?: number }
  | { kind: 'none' };

export type SparkFormat = 'money' | 'count' | 'pct' | 'multiple';

const FORMAT: Record<SparkFormat, { value: (n: number) => string; axis: (n: number) => string }> = {
  money: { value: (n) => money(n), axis: moneyAxis },
  count: { value: (n) => count(n), axis: countAxis },
  pct: { value: (n) => pct(n), axis: (n) => pct(n, 1) },
  multiple: { value: (n) => multiple(n), axis: (n) => multiple(n, 1) },
};

const finite = (v: number | null | undefined): v is number => typeof v === 'number' && Number.isFinite(v);

/** Monotone cubic path through the points (no overshoot between days), like a monotone-x curve. */
export function monotonePath(pts: readonly [number, number][]): string {
  const n = pts.length;
  if (n === 0) return '';
  if (n === 1) return `M${pts[0]![0]},${pts[0]![1]}`;
  const dx: number[] = [];
  const m: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx.push(pts[i + 1]![0] - pts[i]![0]);
    m.push((pts[i + 1]![1] - pts[i]![1]) / (dx[i] || 1));
  }
  const t: number[] = [m[0]!];
  for (let i = 1; i < n - 1; i++) t.push(m[i - 1]! * m[i]! <= 0 ? 0 : (3 * (dx[i - 1]! + dx[i]!)) / ((2 * dx[i]! + dx[i - 1]!) / m[i - 1]! + (dx[i]! + 2 * dx[i - 1]!) / m[i]!));
  t.push(m[n - 2]!);
  const f = (v: number) => v.toFixed(2);
  let d = `M${f(pts[0]![0])},${f(pts[0]![1])}`;
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = pts[i]!;
    const [x1, y1] = pts[i + 1]!;
    const h = dx[i]! / 3;
    d += ` C${f(x0 + h)},${f(y0 + h * t[i]!)} ${f(x1 - h)},${f(y1 - h * t[i + 1]!)} ${f(x1)},${f(y1)}`;
  }
  return d;
}

/** Static sparkline. Null values break the line (no data is not zero). */
export function SparkLine({ values, color = COLOR.combined, label }: { values: readonly (number | null)[]; color?: string; label: string }) {
  const gid = useId().replace(/:/g, '');
  const nums = values.filter(finite);
  if (nums.length < 2) return null;
  const lo = Math.min(...nums);
  const hi = Math.max(...nums);
  const span = hi - lo || 1;
  const W = 120;
  const H = 40;
  const x = (i: number) => (i / (values.length - 1)) * W;
  const y = (v: number) => H - 5 - ((v - lo) / span) * (H - 12);
  const runs: [number, number][][] = [];
  let cur: [number, number][] = [];
  values.forEach((v, i) => {
    if (!finite(v)) {
      if (cur.length) runs.push(cur);
      cur = [];
    } else cur.push([x(i), y(v)]);
  });
  if (cur.length) runs.push(cur);
  const lastRun = runs[runs.length - 1]!;
  const end = lastRun[lastRun.length - 1]!;
  return (
    <span className="relative block h-full w-full">
    <svg role="img" aria-label={label} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block h-full w-full overflow-visible">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.18" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {runs.map((r, i) => {
        const line = monotonePath(r);
        return (
          <g key={i}>
            {r.length > 1 && <path d={`${line} L${r[r.length - 1]![0].toFixed(2)},${H} L${r[0]![0].toFixed(2)},${H} Z`} fill={`url(#${gid})`} stroke="none" />}
            <path d={line} fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          </g>
        );
      })}
    </svg>
      {/* Last-point marker in HTML so the stretched viewBox does not turn it into an ellipse. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute size-[4.4px] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ left: `${(end[0] / W) * 100}%`, top: `${(end[1] / H) * 100}%`, background: color, boxShadow: '0 0 0 1.2px #fff' }}
      />
    </span>
  );
}

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function daysInMonth(ym: string): number {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y!, m!, 0)).getUTCDate();
}

/** Daily rows, or monthly rows where sums add up and ratios are sum(num) / sum(den). */
export function sparkRows(dates: readonly string[], values: readonly (number | null)[], agg: SparkAgg, granularity: 'daily' | 'monthly'): ChartRow[] {
  if (granularity === 'daily' || agg.kind === 'none') {
    return dates.map((d, i) => ({ key: d, label: periodLabel(d), value: finite(values[i]) ? values[i] : null }));
  }
  const months = new Map<string, { idx: number[] }>();
  dates.forEach((d, i) => {
    const k = d.slice(0, 7);
    if (!months.has(k)) months.set(k, { idx: [] });
    months.get(k)!.idx.push(i);
  });
  return [...months.entries()].map(([k, { idx }]) => {
    const covered = idx.filter((i) => finite(values[i])).length;
    let value: number | null = null;
    if (agg.kind === 'sum') {
      value = covered ? idx.reduce((a, i) => a + (finite(values[i]) ? values[i]! : 0), 0) : null;
    } else {
      let num = 0;
      let den = 0;
      let any = false;
      for (const i of idx) {
        const a = agg.num[i];
        const b = agg.den[i];
        if (finite(a) && finite(b)) {
          num += a;
          den += b;
          any = true;
        }
      }
      value = any && den > 0 ? (num / den) * (agg.scale ?? 1) : null;
    }
    return { key: k, label: periodLabel(k), value, incomplete: idx.length < daysInMonth(k) || covered < idx.length };
  });
}

export interface SparkProps {
  values: readonly (number | null)[];
  color?: string;
  /** Accessible label of the small sparkline. */
  label: string;
  /** Dialog title; defaults to the label. */
  title?: string;
  /** ISO day per value; defaults to consecutive days from the selected range start. */
  dates?: readonly string[];
  format?: SparkFormat;
  agg?: SparkAgg;
  /** Series name in the dialog legend and table. */
  seriesLabel?: string;
  howCalculated?: string;
  scope?: string;
}

/** KPI sparkline that opens the shared chart dialog on click (Enter/Space when focused). */
export function Spark(props: SparkProps) {
  const { range } = useAppState();
  const color = props.color ?? COLOR.combined;
  const fmt = FORMAT[props.format ?? 'count'];
  const agg: SparkAgg = props.agg ?? (props.format === 'pct' || props.format === 'multiple' ? { kind: 'none' } : { kind: 'sum' });
  const dates = useMemo(() => props.dates ?? (range ? props.values.map((_, i) => addDays(range.start, i)) : []), [props.dates, props.values, range]);
  const title = props.title ?? props.label;
  const line = <SparkLine values={props.values} color={color} label={props.label} />;
  if (!range || props.values.filter(finite).length < 2) return line;
  const how =
    agg.kind === 'sum'
      ? 'Monthly values are the sum of the days in the month that have data.'
      : agg.kind === 'ratio'
        ? 'Monthly values are recomputed from the summed numerator and denominator of the month, not averaged from daily ratios.'
        : 'Daily values only.';
  return (
    <ChartCard
      variant="spark"
      title={title}
      trigger={line}
      scope={props.scope}
      monthlyUnavailable={agg.kind === 'none' ? 'Daily values (a monthly figure needs the underlying totals)' : undefined}
      howCalculated={[props.howCalculated, how].filter(Boolean).join(' ')}
      render={(o) => (
        <TimeSeriesChart
          data={sparkRows(dates, props.values, agg, o.granularity)}
          series={[{ key: 'value', label: props.seriesLabel ?? title, color, kind: 'line', format: fmt.value }]}
          yFormat={fmt.axis}
          height={o.height}
          fixedWidth={o.fixedWidth}
          ariaLabel={`${title} by ${o.granularity === 'daily' ? 'day' : 'month'}`}
        />
      )}
    />
  );
}
