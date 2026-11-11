// Page-level derivations on top of the showcase queries. Pure functions; no React.
import {
  calendarDateInZone,
  metricSeries,
  monthKey,
  orderAttributionRows,
  salesSeries,
  type DateRange,
  type Granularity,
  type PlatformSeriesPoint,
  type PlatformView,
  type ShowcaseDataset,
} from '@sedem-ads/analytics-core';
import type { ChartRow, ChartSeries } from '../components/charts/TimeSeriesChart';
import { COLOR } from '../components/charts/colors';

export const SELECTED_SOURCES = ['meta', 'google', 'chatbot_ai'] as const;
export const SURPLUS_NOTE = 'Surplus is not profit: revenue includes 22% VAT and excludes other costs.';

export function ratio(num: number | null, den: number | null): number | null {
  if (num === null || den === null || den === 0) return null;
  return num / den;
}

/** metricSeries points -> chart rows with meta / google / total keys. */
export function platformRows(points: readonly PlatformSeriesPoint[]): ChartRow[] {
  return points.map((p) => ({ key: p.key, label: p.label, incomplete: p.incomplete, meta: p.meta, google: p.google, total: p.total }));
}

/** Series definitions for a platform view: Meta, Google and (combined view only) the combined line. */
export function platformDefs(view: PlatformView, format: (v: number) => string, opts: { kind?: 'line' | 'bar'; totalLabel?: string; stack?: boolean } = {}): ChartSeries[] {
  const kind = opts.kind ?? 'line';
  const stackId = opts.stack ? 'platforms' : undefined;
  const defs: ChartSeries[] = [];
  if (view !== 'google') defs.push({ key: 'meta', label: 'Meta', color: COLOR.meta, shape: 'circle', kind, stackId, format });
  if (view !== 'meta') defs.push({ key: 'google', label: 'Google', color: COLOR.google, shape: 'square', kind, stackId, format });
  if (view === 'combined' && !opts.stack) defs.push({ key: 'total', label: opts.totalLabel ?? 'Combined', color: COLOR.combined, shape: 'triangle', kind: 'line', format });
  return defs;
}

export interface DayFacts {
  date: string;
  spendMeta: number | null;
  spendGoogle: number | null;
  spendTotal: number | null;
  verifiedMeta: number;
  verifiedGoogle: number;
  selectedRevenue: number;
  /** Paid revenue whose customer source is Meta / Google (classification, not proof). */
  sourceMeta: number;
  sourceGoogle: number;
}

const dayOf = (ds: ShowcaseDataset, instant: string) => calendarDateInZone(instant, ds.timeZone);

/**
 * Daily facts used for the ratio charts (attributable ROAS, surplus). Spend is the canonical
 * spend: a day contributes to a ratio only if the spend it is divided by has data.
 */
export function dailyFacts(ds: ShowcaseDataset, range: DateRange): DayFacts[] {
  const spend = metricSeries(ds, { metric: 'spend', range, granularity: 'daily' });
  const sales = salesSeries(ds, { range, granularity: 'daily' });
  const salesByKey = new Map(sales.map((s) => [s.key, s]));
  const verified = new Map<string, { meta: number; google: number }>();
  for (const row of orderAttributionRows(ds, { range, limit: 1_000_000 })) {
    if (row.order.status !== 'paid' || row.attribution.status !== 'attributed_paid_ad') continue;
    const d = dayOf(ds, row.order.paidAt ?? row.order.orderedAt);
    const cur = verified.get(d) ?? { meta: 0, google: 0 };
    cur[row.attribution.platform] += row.order.amountMinor;
    verified.set(d, cur);
  }
  return spend.map((p) => {
    const s = salesByKey.get(p.key);
    const v = verified.get(p.key);
    return {
      date: p.key,
      spendMeta: p.meta,
      spendGoogle: p.google,
      spendTotal: p.total,
      verifiedMeta: v?.meta ?? 0,
      verifiedGoogle: v?.google ?? 0,
      selectedRevenue: s ? SELECTED_SOURCES.reduce((a, k) => a + (s.bySource[k] ?? 0), 0) : 0,
      sourceMeta: s?.bySource.meta ?? 0,
      sourceGoogle: s?.bySource.google ?? 0,
    };
  });
}

interface Bucket {
  key: string;
  label: string;
  incomplete: boolean;
  spendMeta: number | null;
  spendGoogle: number | null;
  spendTotal: number | null;
  revMeta: number;
  revGoogle: number;
  revTotalVerified: number;
  revSelected: number;
  srcMeta: number;
  srcGoogle: number;
}

/** Re-bucket daily facts into the requested granularity; flags/labels come from a matching metricSeries. */
export function bucketFacts(facts: readonly DayFacts[], skeleton: readonly PlatformSeriesPoint[], granularity: Granularity): Bucket[] {
  const keyOf = (d: string) => (granularity === 'monthly' ? monthKey(d) : d);
  const map = new Map<string, Bucket>(
    skeleton.map((p) => [p.key, { key: p.key, label: p.label, incomplete: p.incomplete, spendMeta: null, spendGoogle: null, spendTotal: null, revMeta: 0, revGoogle: 0, revTotalVerified: 0, revSelected: 0, srcMeta: 0, srcGoogle: 0 }]),
  );
  const add = (a: number | null, b: number) => (a === null ? b : a + b);
  for (const f of facts) {
    const b = map.get(keyOf(f.date));
    if (!b) continue;
    if (f.spendMeta !== null) {
      b.spendMeta = add(b.spendMeta, f.spendMeta);
      b.revMeta += f.verifiedMeta;
      b.srcMeta += f.sourceMeta;
    }
    if (f.spendGoogle !== null) {
      b.spendGoogle = add(b.spendGoogle, f.spendGoogle);
      b.revGoogle += f.verifiedGoogle;
      b.srcGoogle += f.sourceGoogle;
    }
    if (f.spendTotal !== null) {
      b.spendTotal = add(b.spendTotal, f.spendTotal);
      b.revTotalVerified += f.verifiedMeta + f.verifiedGoogle;
      b.revSelected += f.selectedRevenue;
    }
  }
  return [...map.values()];
}

export function roasRows(buckets: readonly Bucket[]): ChartRow[] {
  return buckets.map((b) => ({
    key: b.key,
    label: b.label,
    incomplete: b.incomplete,
    meta: ratio(b.spendMeta === null ? null : b.revMeta, b.spendMeta),
    google: ratio(b.spendGoogle === null ? null : b.revGoogle, b.spendGoogle),
    total: ratio(b.spendTotal === null ? null : b.revTotalVerified, b.spendTotal),
  }));
}

/** Surplus = selected-source revenue minus spend (combined) or that platform's source revenue minus its spend. */
export function surplusRows(buckets: readonly Bucket[], view: PlatformView = 'combined'): ChartRow[] {
  return buckets.map((b) => {
    let surplus: number | null;
    if (view === 'meta') surplus = b.spendMeta === null ? null : b.srcMeta - b.spendMeta;
    else if (view === 'google') surplus = b.spendGoogle === null ? null : b.srcGoogle - b.spendGoogle;
    else surplus = b.spendTotal === null ? null : b.revSelected - b.spendTotal;
    return { key: b.key, label: b.label, incomplete: b.incomplete, surplus };
  });
}

/**
 * Daily/monthly series for ONE campaign, computed from the daily rows. Ratios come from sums.
 * A bucket with no delivery rows for the campaign is "no data" (null), not zero.
 */
export function campaignSeries(
  ds: ShowcaseDataset,
  args: { campaignId: string; platform: 'meta' | 'google'; metric: 'spend' | 'impressions' | 'clicks' | 'leads' | 'ctr' | 'cpc' | 'cpl'; range: DateRange; granularity: Granularity },
): ChartRow[] {
  const skeleton = metricSeries(ds, { metric: 'spend', range: args.range, granularity: args.granularity });
  const keyOf = (d: string) => (args.granularity === 'monthly' ? monthKey(d) : d);
  const acc = new Map<string, { spend: number; impressions: number; clicks: number; leads: number }>();
  for (const r of ds.daily) {
    if (r.campaignId !== args.campaignId || r.date < args.range.start || r.date > args.range.end) continue;
    const k = keyOf(r.date);
    const cur = acc.get(k) ?? { spend: 0, impressions: 0, clicks: 0, leads: 0 };
    cur.spend += r.spendMinor;
    cur.impressions += r.impressions;
    cur.clicks += r.clicks;
    cur.leads += r.leads;
    acc.set(k, cur);
  }
  return skeleton.map((p) => {
    const a = acc.get(p.key);
    let value: number | null = null;
    if (a) {
      switch (args.metric) {
        case 'spend': value = a.spend; break;
        case 'impressions': value = a.impressions; break;
        case 'clicks': value = a.clicks; break;
        case 'leads': value = a.leads; break;
        case 'ctr': value = ratio(a.clicks, a.impressions); break;
        case 'cpc': value = ratio(a.spend, a.clicks); break;
        case 'cpl': value = ratio(a.spend, a.leads); break;
      }
    }
    return { key: p.key, label: p.label, incomplete: p.incomplete, value };
  });
}
