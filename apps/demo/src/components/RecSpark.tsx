// Two-line sparkline for recommendation cards: solid = selected period, dashed grey = previous period (ghost).
// Both lines share one scale. A missing day breaks the line; it is never drawn as zero.
// The sparkline is a button that opens the shared chart dialog with both periods day by day.
import type { SparkData } from '../ai/recDetail';
import { useAppState } from '../state/AppState';
import { money, moneyAxis, pct } from '../lib/format';
import { ChartCard } from './charts/ChartCard';
import { monotonePath } from './charts/Sparkline';
import { TimeSeriesChart, type ChartRow } from './charts/TimeSeriesChart';
import { COLOR, GOOGLE_METRIC_COLOR, METRIC_COLOR } from './charts/colors';

function path(values: readonly (number | null)[], lo: number, span: number, W: number, H: number): string {
  const n = values.length;
  const runs: [number, number][][] = [];
  let cur: [number, number][] = [];
  values.forEach((v, i) => {
    if (v === null || !Number.isFinite(v)) {
      if (cur.length) runs.push(cur);
      cur = [];
      return;
    }
    cur.push([n <= 1 ? 0 : (i / (n - 1)) * W, H - 3 - ((v - lo) / span) * (H - 6)]);
  });
  if (cur.length) runs.push(cur);
  return runs.map(monotonePath).join(' ');
}

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function RecSpark({ data, label, title }: { data: SparkData; label: string; title?: string }) {
  const { range } = useAppState();
  const all = [...data.current, ...(data.previous ?? [])].filter((v): v is number => v !== null && Number.isFinite(v));
  if (all.length < 4) return <p className="text-2xs text-ink-3">Not enough daily data for a trend line.</p>;
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const span = hi - lo || 1;
  const W = 240;
  const H = 44;
  const color = data.metric === 'cpl' ? METRIC_COLOR.cpl : GOOGLE_METRIC_COLOR.ctr;
  const metricLabel = data.metric === 'cpl' ? 'CPL' : 'CTR';
  const fmt = data.metric === 'cpl' ? (v: number) => money(v) : (v: number) => pct(v);
  const axis = data.metric === 'cpl' ? moneyAxis : (v: number) => pct(v, 1);
  const svg = (
    <svg role="img" aria-label={label} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block h-11 w-full overflow-visible" data-testid="rec-spark">
      {data.previous && <path d={path(data.previous, lo, span, W, H)} fill="none" stroke={COLOR.previous} strokeWidth="1.5" strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />}
      <path d={path(data.current, lo, span, W, H)} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
  const rows: ChartRow[] = range
    ? data.current.map((v, i) => {
        const key = addDays(range.start, i);
        return { key, label: key, current: v, previous: data.previous?.[i] ?? null };
      })
    : [];
  return (
    <figure className="m-0">
      {range ? (
        <ChartCard
          variant="spark"
          title={title ?? `${label}`}
          trigger={svg}
          monthlyUnavailable={`7-day rolling ${metricLabel}, by day`}
          howCalculated={`Each day is the ${metricLabel} of the 7 days ending that day, computed from summed ${data.metric === 'cpl' ? 'spend and leads' : 'clicks and impressions'} (not an average of daily ratios). The previous period is aligned day by day.`}
          render={(o) => (
            <TimeSeriesChart
              data={rows}
              series={[
                { key: 'current', label: 'This period', color, kind: 'line', format: fmt, role: 'total' },
                ...(data.previous ? [{ key: 'previous', label: 'Previous period (same day of period)', color: COLOR.previous, kind: 'line' as const, format: fmt, dashed: true }] : []),
              ]}
              yFormat={axis}
              height={o.height}
              fixedWidth={o.fixedWidth}
              ariaLabel={`${title ?? label}, 7-day rolling ${metricLabel} by day`}
            />
          )}
        />
      ) : (
        svg
      )}
      <figcaption className="mt-1 flex items-center gap-3 text-2xs text-ink-3">
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-0.5 w-4" style={{ background: color }} /> This period
        </span>
        {data.previous && (
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-0 w-4 border-t-2 border-dashed border-slate-400" /> Previous period
          </span>
        )}
        <span className="ml-auto">7-day rolling {data.metric.toUpperCase()}</span>
      </figcaption>
    </figure>
  );
}
