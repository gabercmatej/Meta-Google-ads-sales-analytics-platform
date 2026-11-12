// Chart bodies used by the Overview page and by the KPI "expanded chart" dialog.
// Each reads the global view (platform, range, granularity) so card and dialog always agree.
import { useMemo } from 'react';
import { metricSeries, salesSeries, type PlatformView, type SeriesMetric } from '@sedem-ads/analytics-core';
import { useAppState } from '../state/AppState';
import { getDataset } from '../lib/data';
import { bucketFacts, dailyFacts, platformDefs, platformRows, roasRows, SELECTED_SOURCES, SURPLUS_NOTE, surplusRows } from '../lib/analytics';
import { count, countAxis, money, moneyAxis, multiple, pct } from '../lib/format';
import { StackedBar, TimeSeriesChart, type ChartRow, type ChartSeries } from './charts/TimeSeriesChart';
import { COLOR, SOURCE_KEYS, sourceColor, sourceLabel } from './charts/colors';

export interface BodyProps {
  height: number;
  fixedWidth?: number;
  /** Platform view; defaults to the global header platform. Workspace pages pass meta or google. */
  view?: PlatformView;
}

export const METRIC_FORMAT: Record<SeriesMetric, { value: (n: number) => string; axis: (n: number) => string; label: string }> = {
  spend: { value: (n) => money(n), axis: moneyAxis, label: 'Spend' },
  impressions: { value: (n) => count(n), axis: countAxis, label: 'Impressions' },
  clicks: { value: (n) => count(n), axis: countAxis, label: 'Clicks' },
  leads: { value: (n) => count(n), axis: countAxis, label: 'Leads' },
  ctr: { value: (n) => pct(n), axis: (n) => pct(n, 1), label: 'CTR' },
  cpc: { value: (n) => money(n), axis: moneyAxis, label: 'CPC' },
  cpl: { value: (n) => money(n), axis: moneyAxis, label: 'CPL' },
  cpm: { value: (n) => money(n), axis: moneyAxis, label: 'CPM' },
};

export function MetricChart({ metric, height, fixedWidth, kind, view }: BodyProps & { metric: SeriesMetric; kind?: 'line' | 'bar' }) {
  const app = useAppState();
  const { range, granularity } = app;
  const platform = view ?? app.platform;
  const f = METRIC_FORMAT[metric];
  const rows = useMemo(() => (range ? platformRows(metricSeries(getDataset(), { metric, range, granularity })) : []), [metric, range, granularity]);
  const series = useMemo(() => platformDefs(platform, f.value, { kind }), [platform, f.value, kind]);
  return <TimeSeriesChart data={rows} series={series} yFormat={f.axis} height={height} fixedWidth={fixedWidth} ariaLabel={`${f.label} by ${granularity === 'daily' ? 'day' : 'month'}`} />;
}

function salesRowsFor(platform: PlatformView, rows: ReturnType<typeof salesSeries>): { data: ChartRow[]; series: ChartSeries[]; note?: string } {
  const revenueOf = (p: (typeof rows)[number]) => (platform === 'combined' ? p.totalMinor : (p.bySource[platform] ?? 0));
  const data: ChartRow[] = rows.map((p) => ({ key: p.key, label: p.label, incomplete: p.incomplete, revenue: revenueOf(p), orders: platform === 'combined' ? p.orders : null }));
  const series: ChartSeries[] = [
    {
      key: 'revenue',
      label: platform === 'combined' ? 'Paid revenue (incl. VAT)' : `Paid revenue, ${sourceLabel(platform)} customers (incl. VAT)`,
      color: COLOR.combined,
      kind: 'bar',
      shape: 'square',
      format: (v) => money(v),
    },
  ];
  if (platform === 'combined') series.push({ key: 'orders', label: 'Paid orders', color: '#0d9488', kind: 'line', axis: 'right', shape: 'diamond', format: (v) => count(v) });
  return { data, series, note: platform === 'combined' ? undefined : 'Order counts by source are shown in the Sales page; this chart shows revenue for the selected platform’s customers.' };
}

export function SalesChart({ height, fixedWidth, view }: BodyProps) {
  const app = useAppState();
  const { range, granularity } = app;
  const platform = view ?? app.platform;
  const { data, series } = useMemo(() => salesRowsFor(platform, range ? salesSeries(getDataset(), { range, granularity }) : []), [platform, range, granularity]);
  return <TimeSeriesChart data={data} series={series} yFormat={moneyAxis} rightFormat={countAxis} height={height} fixedWidth={fixedWidth} ariaLabel="Paid orders and revenue" />;
}

export const SELECTED_LABEL = 'Meta + Google + Chatbot/AI';

export function SourcesChart({ height, fixedWidth, basis }: BodyProps & { basis?: 'order' | 'payment' }) {
  const { range, granularity } = useAppState();
  const { data, series } = useMemo(() => {
    const pts = range ? salesSeries(getDataset(), { range, granularity, basis }) : [];
    const data: ChartRow[] = pts.map((p) => {
      const row: ChartRow = { key: p.key, label: p.label, incomplete: p.incomplete, selected: SELECTED_SOURCES.reduce((a, k) => a + (p.bySource[k] ?? 0), 0) };
      for (const k of SOURCE_KEYS) row[k] = p.bySource[k] ?? 0;
      return row;
    });
    const series: ChartSeries[] = [
      ...SOURCE_KEYS.map<ChartSeries>((k) => ({ key: k, label: sourceLabel(k), color: sourceColor(k), kind: 'bar', stackId: 's', format: (v) => money(v) })),
      { key: 'selected', label: `Subtotal: ${SELECTED_LABEL}`, color: '#111827', kind: 'line', shape: 'diamond', format: (v) => money(v) },
    ];
    return { data, series };
  }, [range, granularity, basis]);
  return <StackedBar data={data} series={series} yFormat={moneyAxis} height={height} fixedWidth={fixedWidth} ariaLabel="Sales by source" tooltipNote="The subtotal is derived from the stacked parts; it is not an additional part." />;
}

function useBuckets() {
  const { range, granularity } = useAppState();
  return useMemo(() => {
    if (!range) return [];
    const ds = getDataset();
    const skeleton = metricSeries(ds, { metric: 'spend', range, granularity });
    return bucketFacts(dailyFacts(ds, range), skeleton, granularity);
  }, [range, granularity]);
}

export function RoasChart({ height, fixedWidth, view }: BodyProps) {
  const app = useAppState();
  const { granularity } = app;
  const platform = view ?? app.platform;
  const buckets = useBuckets();
  const rows = useMemo(() => roasRows(buckets), [buckets]);
  const series = useMemo(() => platformDefs(platform, (v) => multiple(v), { totalLabel: 'Combined' }), [platform]);
  return (
    <TimeSeriesChart
      data={rows}
      series={series}
      yFormat={(v) => multiple(v, 1)}
      height={height}
      fixedWidth={fixedWidth}
      ariaLabel={`Attributable ROAS by ${granularity === 'daily' ? 'day' : 'month'}`}
      tooltipNote="Verified attributed revenue ÷ spend. Ratios are computed from sums, never averaged."
    />
  );
}

export function SurplusChart({ height, fixedWidth, view }: BodyProps) {
  const app = useAppState();
  const { granularity } = app;
  const platform = view ?? app.platform;
  const buckets = useBuckets();
  const rows = useMemo(() => surplusRows(buckets, platform), [buckets, platform]);
  const series: ChartSeries[] = useMemo(
    () => [{ key: 'surplus', label: 'Advertising surplus', color: COLOR.good, negativeColor: COLOR.bad, kind: 'bar', shape: 'square', format: (v) => money(v) }],
    [],
  );
  return (
    <TimeSeriesChart
      data={rows}
      series={series}
      yFormat={moneyAxis}
      height={height}
      fixedWidth={fixedWidth}
      ariaLabel={`Advertising surplus by ${granularity === 'daily' ? 'day' : 'month'}`}
      tooltipNote={SURPLUS_NOTE}
    />
  );
}

/** Tiny inline trend line for KPI cards. Null values break the line (no data is not zero). */
export function Spark({ values, color = COLOR.combined, label }: { values: readonly (number | null)[]; color?: string; label: string }) {
  const nums = values.filter((v): v is number => v !== null && Number.isFinite(v));
  if (nums.length < 2) return null;
  const lo = Math.min(...nums);
  const hi = Math.max(...nums);
  const span = hi - lo || 1;
  const W = 80;
  const H = 32;
  const x = (i: number) => (i / (values.length - 1)) * W;
  const y = (v: number) => H - 3 - ((v - lo) / span) * (H - 6);
  let d = '';
  let pen = false;
  values.forEach((v, i) => {
    if (v === null || !Number.isFinite(v)) {
      pen = false;
      return;
    }
    d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`;
    pen = true;
  });
  return (
    <svg role="img" aria-label={label} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-full w-full">
      <path d={d} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** Daily series per KPI for sparklines (completed days of the selected range). */
export function useSparks(view: PlatformView): Record<string, (number | null)[]> {
  const { range } = useAppState();
  return useMemo(() => {
    if (!range) return {} as Record<string, (number | null)[]>;
    const ds = getDataset();
    const pick = (m: SeriesMetric) => metricSeries(ds, { metric: m, range, granularity: 'daily' }).map((p) => (view === 'meta' ? p.meta : view === 'google' ? p.google : p.total));
    const sales = salesSeries(ds, { range, granularity: 'daily' });
    const skeleton = metricSeries(ds, { metric: 'spend', range, granularity: 'daily' });
    const buckets = bucketFacts(dailyFacts(ds, range), skeleton, 'daily');
    const roas = roasRows(buckets).map((r) => (typeof r[view === 'combined' ? 'total' : view] === 'number' ? (r[view === 'combined' ? 'total' : view] as number) : null));
    const surplus = surplusRows(buckets, view).map((r) => (typeof r.surplus === 'number' ? r.surplus : null));
    const rev = sales.map((p) => (view === 'combined' ? p.totalMinor : (p.bySource[view] ?? 0)));
    return {
      spend: pick('spend'),
      impressions: pick('impressions'),
      clicks: pick('clicks'),
      leads: pick('leads'),
      ctr: pick('ctr'),
      cpc: pick('cpc'),
      cpl: pick('cpl'),
      orders: sales.map((p) => p.orders),
      revenue: rev,
      roas,
      surplus,
    };
  }, [range, view]);
}
