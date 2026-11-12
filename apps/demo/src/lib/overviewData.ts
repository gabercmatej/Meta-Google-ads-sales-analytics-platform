// Figures shared by the Meta and Google overview pages. Pure functions on top of the showcase queries.
import {
  attributionOverview,
  entityPerformance,
  metricSeries,
  monthKey,
  performanceTotals,
  salesOverview,
  type DateRange,
  type EntityPerformanceRow,
  type Granularity,
  type ShowcaseDataset,
} from '@sedem-ads/analytics-core';
import type { ChartRow } from '../components/charts/TimeSeriesChart';

export function rel(cur: number | null | undefined, prev: number | null | undefined): number | null {
  if (cur === null || cur === undefined || prev === null || prev === undefined || prev === 0) return null;
  return ((cur - prev) / Math.abs(prev)) * 100;
}

const ratio = (n: number | null, d: number | null): number | null => (n === null || d === null || d === 0 ? null : n / d);
const sumOrNull = (xs: (number | null)[]): number | null => {
  const v = xs.filter((x): x is number => x !== null);
  return v.length === 0 ? null : v.reduce((a, b) => a + b, 0);
};

export interface PlatformSnapshot {
  totals: ReturnType<typeof performanceTotals>;
  attr: ReturnType<typeof attributionOverview>;
  verifiedOrders: number;
  verifiedRevenueMinor: number;
  sourceOrders: number;
  sourceRevenueMinor: number;
  spendMinor: number | null;
  roas: number | null;
  costPerCustomerMinor: number | null;
  aovMinor: number | null;
}

export function platformSnapshot(ds: ShowcaseDataset, view: 'meta' | 'google', range: DateRange): PlatformSnapshot {
  const totals = performanceTotals(ds, view, range);
  const attr = attributionOverview(ds, { range });
  const part = salesOverview(ds, { range }).partition.parts.find((x) => x.source === view);
  const v = attr.verified[view];
  const spendMinor = view === 'meta' ? attr.spend.metaMinor : attr.spend.googleMinor;
  return {
    totals,
    attr,
    verifiedOrders: v.orders,
    verifiedRevenueMinor: v.revenueMinor,
    sourceOrders: part?.orders ?? 0,
    sourceRevenueMinor: part?.revenueMinor ?? 0,
    spendMinor,
    roas: attr.roas[view],
    costPerCustomerMinor: spendMinor !== null && v.orders > 0 ? Math.round(spendMinor / v.orders) : null,
    aovMinor: v.orders > 0 ? Math.round(v.revenueMinor / v.orders) : null,
  };
}

/** Meta "sections": the account's campaigns grouped into three product areas. */
export interface SectionDef {
  id: string;
  name: string;
  color: string;
  campaignIds: readonly string[];
}

export const META_SECTIONS: readonly SectionDef[] = [
  { id: 'consultations', name: 'Consultations', color: '#2563eb', campaignIds: ['meta-c1', 'meta-c2', 'meta-c3'] },
  { id: 'documents', name: 'Guides and documents', color: '#0d9488', campaignIds: ['meta-c4', 'meta-c5'] },
  { id: 'events', name: 'Events and promotions', color: '#7c3aed', campaignIds: ['meta-c6', 'meta-c7'] },
];

export interface SectionFigures {
  def: SectionDef;
  campaigns: number;
  activeCampaigns: number;
  spendMinor: number | null;
  impressions: number | null;
  clicks: number | null;
  leads: number | null;
  cplMinor: number | null;
  ctr: number | null;
  verifiedOrders: number;
  verifiedRevenueMinor: number;
  roas: number | null;
}

export function sectionFigures(rows: readonly EntityPerformanceRow[]): SectionFigures[] {
  return META_SECTIONS.map((def) => {
    const own = rows.filter((r) => def.campaignIds.includes(r.id));
    const spendMinor = sumOrNull(own.map((r) => r.current.spendMinor));
    const leads = sumOrNull(own.map((r) => r.current.leads));
    const impressions = sumOrNull(own.map((r) => r.current.impressions));
    const clicks = sumOrNull(own.map((r) => r.current.clicks));
    const verifiedRevenueMinor = own.reduce((a, r) => a + r.current.verifiedRevenueMinor, 0);
    return {
      def,
      campaigns: own.length,
      activeCampaigns: own.filter((r) => (r.current.spendMinor ?? 0) > 0).length,
      spendMinor,
      impressions,
      clicks,
      leads,
      cplMinor: ratio(spendMinor, leads),
      ctr: ratio(clicks, impressions),
      verifiedOrders: own.reduce((a, r) => a + r.current.verifiedOrders, 0),
      verifiedRevenueMinor,
      roas: spendMinor !== null && spendMinor > 0 && verifiedRevenueMinor > 0 ? verifiedRevenueMinor / spendMinor : null,
    };
  });
}

export function campaignRows(ds: ShowcaseDataset, view: 'meta' | 'google', range: DateRange): EntityPerformanceRow[] {
  return entityPerformance(ds, { level: 'campaign', view, range });
}

/** Daily or monthly spend per Meta section (sum of its campaigns; a bucket with no rows stays empty). */
export function sectionSpendRows(ds: ShowcaseDataset, range: DateRange, granularity: Granularity): ChartRow[] {
  const skeleton = metricSeries(ds, { metric: 'spend', range, granularity });
  const keyOf = (d: string) => (granularity === 'monthly' ? monthKey(d) : d);
  const acc = new Map<string, Map<string, number>>();
  for (const r of ds.daily) {
    if (r.platform !== 'meta' || r.date < range.start || r.date > range.end) continue;
    const sec = META_SECTIONS.find((s) => s.campaignIds.includes(r.campaignId));
    if (!sec) continue;
    const k = keyOf(r.date);
    const m = acc.get(k) ?? new Map<string, number>();
    m.set(sec.id, (m.get(sec.id) ?? 0) + r.spendMinor);
    acc.set(k, m);
  }
  return skeleton.map((p) => {
    const row: ChartRow = { key: p.key, label: p.label, incomplete: p.incomplete };
    const m = acc.get(p.key);
    for (const s of META_SECTIONS) row[s.id] = m && m.has(s.id) ? m.get(s.id)! : null;
    return row;
  });
}

export type GoogleDailyMetric = 'spend' | 'impressions' | 'clicks' | 'conversions';

/** Google daily values for one metric, optionally for a single campaign. */
export function googleDailyRows(ds: ShowcaseDataset, range: DateRange, granularity: Granularity, metric: GoogleDailyMetric): ChartRow[] {
  const skeleton = metricSeries(ds, { metric: 'spend', range, granularity });
  const keyOf = (d: string) => (granularity === 'monthly' ? monthKey(d) : d);
  const acc = new Map<string, number>();
  for (const r of ds.daily) {
    if (r.platform !== 'google' || r.date < range.start || r.date > range.end) continue;
    const v = metric === 'spend' ? r.spendMinor : metric === 'impressions' ? r.impressions : metric === 'clicks' ? r.clicks : r.platformConversions;
    acc.set(keyOf(r.date), (acc.get(keyOf(r.date)) ?? 0) + v);
  }
  return skeleton.map((p) => ({ key: p.key, label: p.label, incomplete: p.incomplete, value: acc.has(p.key) ? acc.get(p.key)! : null }));
}

/** Platform-reported conversions per Google campaign (not verified sales). */
export function googleConversionsByCampaign(ds: ShowcaseDataset, range: DateRange): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of ds.daily) {
    if (r.platform !== 'google' || r.date < range.start || r.date > range.end) continue;
    out.set(r.campaignId, (out.get(r.campaignId) ?? 0) + r.platformConversions);
  }
  return out;
}
