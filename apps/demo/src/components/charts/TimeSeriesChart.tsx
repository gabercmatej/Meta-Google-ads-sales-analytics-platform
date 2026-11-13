import { useEffect, useId, useState } from 'react';
import { useChartHost, useChartRole } from './ChartHost';
import { Area, Bar, CartesianGrid, Cell, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { NO_DATA, date } from '../../lib/format';
import type { MarkerShape } from './colors';

export interface ChartSeries {
  key: string;
  label: string;
  color: string;
  kind?: 'line' | 'area' | 'bar';
  /** Series with the same stackId stack (bars / areas). */
  stackId?: string;
  axis?: 'left' | 'right';
  /** Tooltip value formatter. Defaults to the chart's yFormat. */
  format?: (v: number) => string;
  shape?: MarkerShape;
  /** Bars: colour used for negative values (e.g. a negative surplus). */
  negativeColor?: string;
  /** Line width in px; by default it follows the role. */
  width?: number;
  /** Dashed on screen (print and PDF force solid lines). */
  dashed?: boolean;
  /** total / subtotal lines are drawn thickest and on top; components thinner and lighter. */
  role?: 'total' | 'subtotal' | 'component';
}

export interface ChartRow {
  /** Unique x key: ISO date or YYYY-MM. */
  key: string;
  /** Short axis label. */
  label: string;
  /** Partial day/month or one with missing days. */
  incomplete?: boolean;
  [series: string]: string | number | boolean | null | undefined;
}

export interface TimeSeriesChartProps {
  data: readonly ChartRow[];
  series: readonly ChartSeries[];
  /** Axis tick formatter (compact). */
  yFormat: (v: number) => string;
  rightFormat?: (v: number) => string;
  height?: number;
  /** Fixed pixel width (print sheet, tests). Omit for responsive. */
  fixedWidth?: number;
  /** Footer line in the tooltip, e.g. "Surplus is not profit". */
  tooltipNote?: string;
  ariaLabel: string;
  /** Shown below the legend. */
  legendNote?: string;
}

const hasValue = (row: ChartRow, key: string): boolean => typeof row[key] === 'number' && Number.isFinite(row[key] as number);

type Role = 'total' | 'subtotal' | 'component' | 'plain';
function roleFor(s: ChartSeries): Role {
  if (s.role) return s.role;
  if (s.key === 'total') return 'total';
  if (s.key === 'selected') return 'subtotal';
  return 'plain';
}
const isStrong = (s: ChartSeries) => roleFor(s) === 'total' || roleFor(s) === 'subtotal';

/** Line width by role; the expanded view draws slightly heavier lines. */
function lineWidth(s: ChartSeries, zoom: boolean): number {
  if (s.width) return s.width;
  const r = roleFor(s);
  if (r === 'total' || r === 'subtotal') return zoom ? 3 : 2.5;
  if (r === 'component') return zoom ? 1.75 : 1.5;
  return zoom ? 2.25 : 1.75;
}

const TICK = '#64748b';
const GRID = '#e8edf3';

export function LegendGlyph(props: { shape: MarkerShape; color: string; kind?: 'line' | 'area' | 'bar'; hollow?: boolean; dashed?: boolean }) {
  return (
    <svg width="16" height="10" viewBox="0 0 16 10" aria-hidden="true" className="shrink-0">
      {props.kind === 'bar' ? (
        <rect x="3" y="1" width="10" height="8" rx="2" fill={props.color} />
      ) : (
        <line x1="1.5" y1="5" x2="14.5" y2="5" stroke={props.color} strokeWidth="2.5" strokeLinecap="round" strokeDasharray={props.dashed ? '3 3' : undefined} />
      )}
    </svg>
  );
}

/** "2026-11-03" -> "Tue, 3 Nov 2026"; "2026-11" -> "November 2026". */
export function longDate(key: string, fallback = key): string {
  if (/^\d{4}-\d{2}$/.test(key)) {
    return new Intl.DateTimeFormat('en-IE', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${key}-01T00:00:00Z`));
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(key)) {
    const wd = new Intl.DateTimeFormat('en-IE', { weekday: 'short', timeZone: 'UTC' }).format(new Date(`${key}T00:00:00Z`));
    return `${wd}, ${date(key)}`;
  }
  return fallback;
}

interface TipProps {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: ChartRow }>;
  series: readonly ChartSeries[];
  yFormat: (v: number) => string;
  note?: string;
}

function ChartTooltip({ active, payload, series, yFormat, note }: TipProps) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  const parts = series.filter((s) => !isStrong(s));
  const subs = series.filter((s) => roleFor(s) === 'subtotal');
  const totals = series.filter((s) => roleFor(s) === 'total');
  const isMonth = /^\d{4}-\d{2}$/.test(row.key);
  const item = (s: ChartSeries, cls: string) => {
    const v = row[s.key];
    const ok = typeof v === 'number' && Number.isFinite(v);
    return (
      <div className={`flex items-center gap-2 py-px ${cls}`} key={s.key}>
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: s.color }} aria-hidden="true" />
        <span className="flex-1">{s.label}</span>
        <span className={`tabular ${ok ? '' : 'font-normal normal-case text-slate-300'}`}>{ok ? (s.format ?? yFormat)(v) : `${NO_DATA} no data`}</span>
      </div>
    );
  };
  const partCls = parts.length > 1 || subs.length + totals.length > 0 ? 'text-ink-3' : 'font-semibold text-ink';
  return (
    <div className="min-w-48 max-w-[300px] rounded-xl border border-line bg-white px-3 py-2.5 text-xs shadow-pop" role="tooltip">
      <div className="mb-1.5 font-semibold text-ink">{longDate(row.key, row.label)}</div>
      {parts.map((s) => item(s, partCls))}
      {subs.length > 0 && <div className="mt-1 border-t border-line pt-1">{subs.map((s) => item(s, 'font-semibold text-ink-2'))}</div>}
      {totals.length > 0 && <div className="mt-1 border-t border-line pt-1">{totals.map((s) => item(s, 'font-bold uppercase tracking-wide text-ink'))}</div>}
      {row.incomplete && (
        <div className="mt-1.5 border-t border-line pt-1.5 text-[11px] leading-snug text-ink-3">
          {isMonth ? 'Incomplete month: only the days with data are counted.' : 'Incomplete day: data for this day is partial.'}
        </div>
      )}
      {note && <div className="mt-1.5 border-t border-line pt-1.5 text-[11px] leading-snug text-ink-3">{note}</div>}
    </div>
  );
}

export function TimeSeriesChart(props: TimeSeriesChartProps) {
  const { data, yFormat, height = 300 } = props;
  const host = useChartHost();
  const role = useChartRole();
  const uid = useId().replace(/:/g, '');
  const [localHidden, setLocalHidden] = useState<ReadonlySet<string>>(() => new Set());
  const hidden = host ? host.hidden : localHidden;
  const toggle = (key: string) => {
    if (host) return host.toggle(key, props.series.length);
    setLocalHidden((h) => {
      const next = new Set(h);
      if (next.has(key)) next.delete(key);
      else if (next.size < props.series.length - 1) next.add(key);
      return next;
    });
  };
  const report = host?.report;
  useEffect(() => {
    report?.(role, { data, series: props.series, yFormat, ariaLabel: props.ariaLabel, tooltipNote: props.tooltipNote });
  }, [report, role, data, props.series, yFormat, props.ariaLabel, props.tooltipNote]);

  const zoom = height >= 350;
  const grid = host?.options.grid ?? true;
  const allLines = props.series.every((s) => (s.kind ?? 'line') === 'line');
  const asBars = (host?.options.bars ?? false) && allLines;
  const series = props.series.filter((s) => !hidden.has(s.key)).map((s) => (asBars ? { ...s, kind: 'bar' as const } : s));
  const labelByKey = new Map(data.map((d) => [d.key, d.label]));
  const anyValue = data.some((d) => series.some((s) => hasValue(d, s.key)));
  const anyIncomplete = data.some((d) => d.incomplete);
  const anyGap = data.some((d) => series.some((s) => !hasValue(d, s.key)));
  const hasRight = series.some((s) => s.axis === 'right');
  const canObserve = typeof ResizeObserver !== 'undefined';

  if (!anyValue) {
    return (
      <div className="grid place-items-center rounded-lg border border-dashed border-line-strong bg-slate-50 text-sm text-ink-3" style={{ height }} role="img" aria-label={`${props.ariaLabel}: no data for this period`}>
        {NO_DATA} No data for this period
      </div>
    );
  }

  const bars = series.filter((s) => s.kind === 'bar');
  const nonBars = series.filter((s) => s.kind !== 'bar');
  // Bars first, then component lines, then total/subtotal lines on top.
  const drawOrder = [...bars, ...nonBars.filter((s) => !isStrong(s)), ...nonBars.filter((s) => roleFor(s) === 'subtotal'), ...nonBars.filter((s) => roleFor(s) === 'total')];
  const legendOrder = [...props.series.filter(isStrong), ...props.series.filter((s) => !isStrong(s))];
  // Count series (whole numbers only) get integer ticks so the axis never shows 0.3 / 0.5 or duplicate labels.
  const wholeOnly = (axis: 'left' | 'right') => {
    const ss = series.filter((s) => (s.axis === 'right' ? 'right' : 'left') === axis);
    return ss.length > 0 && data.every((d) => ss.every((s) => !hasValue(d, s.key) || Number.isInteger(d[s.key] as number)));
  };
  const hasNegative = data.some((d) => series.some((s) => typeof d[s.key] === 'number' && (d[s.key] as number) < 0));
  const fontSize = zoom ? 13 : 12;
  const tickCount = zoom ? 6 : 4;
  const showDots = data.length <= 14;
  const stacked = (s: ChartSeries) => !!s.stackId && bars.filter((b) => b.stackId === s.stackId).length > 1;
  const topOfStack = (s: ChartSeries) => {
    const same = bars.filter((b) => b.stackId === s.stackId);
    return same[same.length - 1]?.key === s.key;
  };
  const hatchId = (i: number) => `${uid}-hatch-${i}`;

  const chart = (
    <ComposedChart data={data as ChartRow[]} margin={{ top: 8, right: hasRight ? 4 : 12, bottom: 2, left: 0 }} barCategoryGap="28%" accessibilityLayer={false}>
      <defs>
        {bars.map((s, i) => (
          <pattern key={s.key} id={hatchId(i)} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="6" height="6" fill={s.color} fillOpacity="0.28" />
            <line x1="0" y1="0" x2="0" y2="6" stroke={s.color} strokeWidth="2.5" />
          </pattern>
        ))}
      </defs>
      {grid && <CartesianGrid stroke={GRID} vertical={false} />}
      <XAxis
        dataKey="key"
        tickFormatter={(k: string) => labelByKey.get(k) ?? k}
        tick={{ fontSize, fill: TICK }}
        tickLine={false}
        axisLine={{ stroke: '#cbd5e1' }}
        tickMargin={6}
        minTickGap={zoom ? 28 : 22}
        interval="preserveStartEnd"
      />
      <YAxis yAxisId="left" allowDecimals={!wholeOnly('left')} tickCount={tickCount} tickFormatter={yFormat} tick={{ fontSize, fill: TICK }} tickLine={false} axisLine={false} width={zoom ? 64 : 56} domain={[(min: number) => Math.min(0, min), 'auto']} />
      {hasRight && (
        <YAxis yAxisId="right" allowDecimals={!wholeOnly('right')} tickCount={tickCount} orientation="right" tickFormatter={props.rightFormat ?? yFormat} tick={{ fontSize, fill: TICK }} tickLine={false} axisLine={false} width={zoom ? 54 : 48} domain={[0, 'auto']} />
      )}
      {hasNegative && <ReferenceLine yAxisId="left" y={0} stroke="#64748b" />}
      <Tooltip
        isAnimationActive={false}
        cursor={bars.length > 0 ? { fill: '#f1f5f9', fillOpacity: 0.7 } : { stroke: '#94a3b8', strokeWidth: 1, strokeDasharray: '3 3' }}
        content={(p: unknown) => <ChartTooltip {...(p as Pick<TipProps, 'active' | 'payload'>)} series={series} yFormat={yFormat} note={props.tooltipNote} />}
      />
      {drawOrder.map((s) => {
        const yAxisId = s.axis === 'right' ? 'right' : 'left';
        const width = lineWidth(s, zoom);
        const component = roleFor(s) === 'component';
        const activeDot = { r: 4, stroke: '#fff', strokeWidth: 2, fill: s.color };
        const plainDot = showDots && !component ? { r: 2, fill: s.color, strokeWidth: 0 } : false;
        // An incomplete period on a line is an open dot (the line counterpart of a hatched bar).
        const dot = anyIncomplete
          ? (p: { cx?: number; cy?: number; index?: number; payload?: ChartRow }) => {
              const k = `${s.key}-${p.index}`;
              if (p.cx === undefined || p.cy === undefined || !p.payload || !hasValue(p.payload, s.key)) return <g key={k} />;
              if (p.payload?.incomplete) return <circle key={k} cx={p.cx} cy={p.cy} r={zoom ? 4 : 3} fill="#fff" stroke={s.color} strokeWidth={2} />;
              return plainDot ? <circle key={k} cx={p.cx} cy={p.cy} r={2} fill={s.color} /> : <g key={k} />;
            }
          : plainDot;
        if (s.kind === 'bar') {
          const bi = bars.indexOf(s);
          const radius: [number, number, number, number] = !stacked(s) || topOfStack(s) ? [4, 4, 0, 0] : [0, 0, 0, 0];
          return (
            <Bar key={s.key} dataKey={s.key} yAxisId={yAxisId} stackId={s.stackId} fill={s.color} isAnimationActive={false} maxBarSize={zoom ? 28 : 18} radius={radius} name={s.label}>
              {data.map((d) => {
                const v = d[s.key];
                const neg = typeof v === 'number' && v < 0 && s.negativeColor;
                const fill = d.incomplete ? `url(#${hatchId(bi)})` : neg ? s.negativeColor : s.color;
                return <Cell key={d.key} fill={fill || s.color} />;
              })}
            </Bar>
          );
        }
        if (s.kind === 'area') {
          return <Area key={s.key} dataKey={s.key} yAxisId={yAxisId} type="monotone" stackId={s.stackId} stroke={s.color} fill={s.color} fillOpacity={0.12} strokeWidth={width} connectNulls={false} isAnimationActive={false} dot={dot} activeDot={activeDot} name={s.label} />;
        }
        return (
          <Line
            key={s.key}
            dataKey={s.key}
            yAxisId={yAxisId}
            type="monotone"
            stroke={s.color}
            strokeOpacity={component && zoom ? 0.7 : 1}
            strokeWidth={width}
            strokeDasharray={s.dashed ? '6 4' : undefined}
            strokeLinecap="round"
            strokeLinejoin="round"
            connectNulls={false}
            isAnimationActive={false}
            dot={dot}
            activeDot={activeDot}
            name={s.label}
          />
        );
      })}
    </ComposedChart>
  );

  const fixed = props.fixedWidth ?? (canObserve ? undefined : 640);

  return (
    <figure className="m-0 min-w-0" aria-label={props.ariaLabel}>
      <figcaption className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs text-ink-2" data-print-legend>
        <ul className="flex flex-wrap gap-x-1.5 gap-y-1.5" aria-label="Legend">
          {legendOrder.map((s) => {
            const off = hidden.has(s.key);
            return (
              <li key={s.key}>
                <button
                  type="button"
                  aria-pressed={!off}
                  title={off ? `Show ${s.label}` : `Hide ${s.label}`}
                  onClick={() => toggle(s.key)}
                  className={`inline-flex items-center gap-1.5 rounded-full bg-slate-50 px-2 py-0.5 ring-1 ring-inset ring-line transition-colors hover:bg-slate-100 ${isStrong(s) ? 'font-semibold text-ink' : ''}`}
                >
                  <LegendGlyph shape="circle" color={s.color} kind={s.kind === 'bar' || asBars ? 'bar' : 'line'} dashed={s.dashed} />
                  <span className={off ? 'line-through opacity-60' : ''}>{s.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
        {(anyIncomplete || anyGap || props.legendNote) && (
          <span className="basis-full text-[11px] leading-snug text-ink-3">
            {anyIncomplete && `${[bars.length > 0 && 'Hatched bars', nonBars.length > 0 && 'open dots'].filter(Boolean).join(' and ').replace(/^o/, 'O')} = incomplete period (partial or missing days). `}
            {anyGap && 'Gaps = no data (not zero). '}
            {props.legendNote}
          </span>
        )}
        {bars.length > 1 && <span className="sr-only">Stacked bars</span>}
      </figcaption>
      <div className="w-full min-w-0 [&_svg]:max-w-full" style={{ height }} role="img" aria-label={`${props.ariaLabel}. ${data.length} points.`} data-chart-plot>
        {fixed ? (
          <ComposedChart {...(chart.props as object)} width={fixed} height={height} />
        ) : (
          <ResponsiveContainer width="100%" height={height} initialDimension={{ width: 640, height }}>
            {chart}
          </ResponsiveContainer>
        )}
      </div>
    </figure>
  );
}

/** Stacked columns (e.g. sales by source). Optional extra line series (e.g. a subtotal) can be overlaid. */
export function StackedBar(props: Omit<TimeSeriesChartProps, 'series'> & { series: readonly ChartSeries[]; stackId?: string }) {
  const stackId = props.stackId ?? 'stack';
  const series = props.series.map((s) => (s.kind === 'line' || s.kind === 'area' ? s : { ...s, kind: 'bar' as const, stackId: s.stackId ?? stackId }));
  return <TimeSeriesChart {...props} series={series} />;
}
