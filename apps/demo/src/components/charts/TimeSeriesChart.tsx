import { Area, Bar, CartesianGrid, Cell, ComposedChart, Line, ReferenceLine, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { NO_DATA } from '../../lib/format';
import type { MarkerShape } from './colors';
import { SHAPES } from './colors';
import './charts.css';

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

function Marker(props: { cx: number; cy: number; shape: MarkerShape; color: string; hollow: boolean; r?: number }) {
  const { cx, cy, shape, color, hollow } = props;
  const r = props.r ?? 3.5;
  const common = { fill: hollow ? '#ffffff' : color, stroke: color, strokeWidth: 1.6 };
  switch (shape) {
    case 'square':
      return <rect x={cx - r} y={cy - r} width={r * 2} height={r * 2} {...common} />;
    case 'triangle':
      return <polygon points={`${cx},${cy - r - 0.5} ${cx + r + 0.5},${cy + r} ${cx - r - 0.5},${cy + r}`} {...common} />;
    case 'diamond':
      return <polygon points={`${cx},${cy - r - 1} ${cx + r + 1},${cy} ${cx},${cy + r + 1} ${cx - r - 1},${cy}`} {...common} />;
    default:
      return <circle cx={cx} cy={cy} r={r} {...common} />;
  }
}

export function LegendGlyph(props: { shape: MarkerShape; color: string; kind?: 'line' | 'area' | 'bar'; hollow?: boolean }) {
  return (
    <svg width="22" height="12" viewBox="0 0 22 12" aria-hidden="true" className="legend-glyph">
      {props.kind === 'bar' ? (
        <rect x="5" y="1" width="12" height="10" rx="1.5" fill={props.color} />
      ) : (
        <>
          <line x1="0" y1="6" x2="22" y2="6" stroke={props.color} strokeWidth="2.5" />
          <Marker cx={11} cy={6} shape={props.shape} color={props.color} hollow={props.hollow ?? false} r={3} />
        </>
      )}
    </svg>
  );
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
  return (
    <div className="chart-tip" role="tooltip">
      <div className="chart-tip-title">
        {row.label}
        {row.incomplete && <span className="chart-tip-flag"> · incomplete</span>}
      </div>
      {series.map((s) => {
        const v = row[s.key];
        const ok = typeof v === 'number' && Number.isFinite(v);
        return (
          <div className="chart-tip-row" key={s.key}>
            <span className="chart-tip-swatch" style={{ background: s.color }} aria-hidden="true" />
            <span className="chart-tip-name">{s.label}</span>
            <span className={`chart-tip-val ${ok ? '' : 'muted'}`}>{ok ? (s.format ?? yFormat)(v) : `${NO_DATA} No data`}</span>
          </div>
        );
      })}
      {row.incomplete && <div className="chart-tip-note">Incomplete: partial or missing days. Totals use only the days that have data.</div>}
      {note && <div className="chart-tip-note">{note}</div>}
    </div>
  );
}

function incompleteRuns(data: readonly ChartRow[]): Array<[string, string]> {
  const runs: Array<[string, string]> = [];
  let start: string | null = null;
  let last: string | null = null;
  for (const d of data) {
    if (d.incomplete) {
      start ??= d.key;
      last = d.key;
    } else if (start && last) {
      runs.push([start, last]);
      start = last = null;
    }
  }
  if (start && last) runs.push([start, last]);
  return runs;
}

export function TimeSeriesChart(props: TimeSeriesChartProps) {
  const { data, series, yFormat, height = 300 } = props;
  const labelByKey = new Map(data.map((d) => [d.key, d.label]));
  const anyValue = data.some((d) => series.some((s) => hasValue(d, s.key)));
  const anyIncomplete = data.some((d) => d.incomplete);
  const anyGap = data.some((d) => series.some((s) => !hasValue(d, s.key)));
  const hasRight = series.some((s) => s.axis === 'right');
  const showAllDots = data.length <= 35;
  const canObserve = typeof ResizeObserver !== 'undefined';

  if (!anyValue) {
    return (
      <div className="chart-empty" style={{ height }} role="img" aria-label={`${props.ariaLabel}: no data for this period`}>
        {NO_DATA} No data for this period
      </div>
    );
  }

  const bars = series.filter((s) => s.kind === 'bar');
  const hasNegative = data.some((d) => series.some((s) => typeof d[s.key] === 'number' && (d[s.key] as number) < 0));

  const chart = (
    <ComposedChart data={data as ChartRow[]} margin={{ top: 8, right: hasRight ? 4 : 12, bottom: 4, left: 0 }} accessibilityLayer={false}>
      <CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" vertical={false} />
      <XAxis
        dataKey="key"
        tickFormatter={(k: string) => labelByKey.get(k) ?? k}
        tick={{ fontSize: 11, fill: '#6b7280' }}
        tickLine={false}
        axisLine={{ stroke: '#d1d5db' }}
        minTickGap={22}
        interval="preserveStartEnd"
      />
      <YAxis yAxisId="left" tickFormatter={yFormat} tick={{ fontSize: 11, fill: '#6b7280' }} tickLine={false} axisLine={false} width={58} domain={[(min: number) => Math.min(0, min), 'auto']} />
      {hasRight && (
        <YAxis yAxisId="right" orientation="right" tickFormatter={props.rightFormat ?? yFormat} tick={{ fontSize: 11, fill: '#6b7280' }} tickLine={false} axisLine={false} width={50} domain={[0, 'auto']} />
      )}
      {incompleteRuns(data).map(([a, b]) => (
        <ReferenceArea key={`${a}-${b}`} yAxisId="left" x1={a} x2={b} fill="#94a3b8" fillOpacity={0.14} strokeOpacity={0} ifOverflow="visible" />
      ))}
      {hasNegative && <ReferenceLine yAxisId="left" y={0} stroke="#6b7280" />}
      <Tooltip
        isAnimationActive={false}
        cursor={{ stroke: '#9ca3af', strokeWidth: 1 }}
        content={(p: unknown) => <ChartTooltip {...(p as Pick<TipProps, 'active' | 'payload'>)} series={series} yFormat={yFormat} note={props.tooltipNote} />}
      />
      {series.map((s, i) => {
        const yAxisId = s.axis === 'right' ? 'right' : 'left';
        const shape = s.shape ?? SHAPES[i % SHAPES.length]!;
        if (s.kind === 'bar') {
          return (
            <Bar key={s.key} dataKey={s.key} yAxisId={yAxisId} stackId={s.stackId} fill={s.color} isAnimationActive={false} maxBarSize={36} name={s.label}>
              {data.map((d) => {
                const v = d[s.key];
                const neg = typeof v === 'number' && v < 0 && s.negativeColor;
                return <Cell key={d.key} fill={neg ? s.negativeColor : s.color} fillOpacity={d.incomplete ? 0.5 : 1} stroke={s.color} strokeWidth={d.incomplete ? 1 : 0} />;
              })}
            </Bar>
          );
        }
        const dot = (dp: unknown) => {
          const { cx, cy, index } = dp as { cx?: number; cy?: number; index: number };
          const row = data[index];
          if (cx == null || cy == null || !row || !hasValue(row, s.key)) return <g key={`dot-${s.key}-${index}`} />;
          const isolated = !(index > 0 && hasValue(data[index - 1]!, s.key)) && !(index < data.length - 1 && hasValue(data[index + 1]!, s.key));
          if (!(showAllDots || isolated || row.incomplete)) return <g key={`dot-${s.key}-${index}`} />;
          return <Marker key={`dot-${s.key}-${index}`} cx={cx} cy={cy} shape={shape} color={s.color} hollow={!!row.incomplete} r={showAllDots ? 3 : 3.5} />;
        };
        if (s.kind === 'area') {
          return (
            <Area key={s.key} dataKey={s.key} yAxisId={yAxisId} stackId={s.stackId} stroke={s.color} fill={s.color} fillOpacity={0.14} strokeWidth={2} connectNulls={false} isAnimationActive={false} dot={dot} activeDot={{ r: 5 }} name={s.label} />
          );
        }
        return <Line key={s.key} dataKey={s.key} yAxisId={yAxisId} type="linear" stroke={s.color} strokeWidth={2.25} connectNulls={false} isAnimationActive={false} dot={dot} activeDot={{ r: 5 }} name={s.label} />;
      })}
    </ComposedChart>
  );

  const fixed = props.fixedWidth ?? (canObserve ? undefined : 640);

  return (
    <figure className="chart" aria-label={props.ariaLabel}>
      <div className="chart-plot" style={{ height }} role="img" aria-label={`${props.ariaLabel}. ${data.length} points.`}>
        {fixed ? (
          <ComposedChart {...(chart.props as object)} width={fixed} height={height} />
        ) : (
          <ResponsiveContainer width="100%" height={height} initialDimension={{ width: 640, height }}>
            {chart}
          </ResponsiveContainer>
        )}
      </div>
      <figcaption className="chart-legend">
        {series.map((s, i) => (
          <span className="chart-legend-item" key={s.key}>
            <LegendGlyph shape={s.shape ?? SHAPES[i % SHAPES.length]!} color={s.color} kind={s.kind === 'bar' ? 'bar' : 'line'} />
            {s.label}
          </span>
        ))}
        {(anyIncomplete || anyGap || props.legendNote) && (
          <span className="chart-legend-note">
            {anyIncomplete && 'Shaded area, hollow markers and lighter bars = incomplete period (partial or missing days). '}
            {anyGap && 'Gaps = no data (not zero). '}
            {props.legendNote}
          </span>
        )}
        {bars.length > 1 && <span className="sr-only">Stacked bars</span>}
      </figcaption>
    </figure>
  );
}

/** Stacked columns (e.g. sales by source). Optional extra line series (e.g. a subtotal) can be overlaid. */
export function StackedBar(props: Omit<TimeSeriesChartProps, 'series'> & { series: readonly ChartSeries[]; stackId?: string }) {
  const stackId = props.stackId ?? 'stack';
  const series = props.series.map((s) => (s.kind === 'line' || s.kind === 'area' ? s : { ...s, kind: 'bar' as const, stackId: s.stackId ?? stackId }));
  return <TimeSeriesChart {...props} series={series} />;
}
