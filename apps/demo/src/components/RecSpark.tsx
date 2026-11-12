// Two-line sparkline for recommendation cards: solid = selected period, dashed grey = previous period (ghost).
// Both lines share one scale. A missing day breaks the line; it is never drawn as zero.
import type { SparkData } from '../ai/recDetail';

function path(values: readonly (number | null)[], lo: number, span: number, W: number, H: number): string {
  const n = values.length;
  let d = '';
  let pen = false;
  values.forEach((v, i) => {
    if (v === null || !Number.isFinite(v)) {
      pen = false;
      return;
    }
    const x = n <= 1 ? 0 : (i / (n - 1)) * W;
    const y = H - 3 - ((v - lo) / span) * (H - 6);
    d += `${pen ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)} `;
    pen = true;
  });
  return d.trim();
}

export function RecSpark({ data, label }: { data: SparkData; label: string }) {
  const all = [...data.current, ...(data.previous ?? [])].filter((v): v is number => v !== null && Number.isFinite(v));
  if (all.length < 4) return <p className="text-2xs text-ink-3">Not enough daily data for a trend line.</p>;
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const span = hi - lo || 1;
  const W = 240;
  const H = 44;
  return (
    <figure className="m-0">
      <svg role="img" aria-label={label} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-11 w-full overflow-visible" data-testid="rec-spark">
        {data.previous && <path d={path(data.previous, lo, span, W, H)} fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />}
        <path d={path(data.current, lo, span, W, H)} fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <figcaption className="mt-1 flex items-center gap-3 text-2xs text-ink-3">
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-0.5 w-4 bg-brand" /> This period
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
