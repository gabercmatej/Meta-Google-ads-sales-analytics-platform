// View helpers for the Campaigns & ads hierarchy: result selector, classification, per-row trend, columns.
import { adSeries, type DateRange, type EntityPerformanceRow, type ShowcaseDataset } from '@sedem-ads/analytics-core';

export type TableLevel = 'campaigns' | 'adsets' | 'ads';
export type ResultKind = 'leads' | 'clicks' | 'lpv' | 'purchases';

export const RESULT_OPTIONS: readonly { value: ResultKind; label: string; unit: string }[] = [
  { value: 'leads', label: 'Leads', unit: 'leads' },
  { value: 'clicks', label: 'Link clicks', unit: 'link clicks' },
  { value: 'lpv', label: 'Landing page views', unit: 'landing page views' },
  { value: 'purchases', label: 'Purchases', unit: 'verified purchases' },
];

/** Results are never summed across kinds. Landing page views are not part of the demo data, so they are null (no data). */
export function resultOf(r: EntityPerformanceRow, kind: ResultKind): number | null {
  switch (kind) {
    case 'leads': return r.current.leads;
    case 'clicks': return r.current.clicks;
    case 'lpv': return null;
    case 'purchases': return r.current.verifiedOrders;
  }
}

export function costPerResult(r: EntityPerformanceRow, kind: ResultKind): number | null {
  const res = resultOf(r, kind);
  const spend = r.current.spendMinor;
  if (res === null || res <= 0 || spend === null) return null;
  return Math.round(spend / res);
}

export type Classification = 'strong' | 'average' | 'attention' | 'fatigue' | 'no_results';

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

export function classify(r: EntityPerformanceRow, medianCpl: number | null): Classification {
  if (r.level === 'campaign' && r.tier) return r.tier === 'strong' ? 'strong' : r.tier === 'weak' ? 'attention' : 'average';
  if (r.fatigued) return 'fatigue';
  const leads = r.current.leads;
  if (leads === null || leads === 0) return 'no_results';
  const cpl = r.current.cplMinor;
  if (cpl === null || medianCpl === null) return 'average';
  if (cpl <= medianCpl * 0.85) return 'strong';
  if (cpl >= medianCpl * 1.25) return 'attention';
  return 'average';
}

export const CLASS_LABEL: Record<Classification, string> = {
  strong: 'Strong',
  average: 'Average',
  attention: 'Needs attention',
  fatigue: 'Fatigue',
  no_results: 'No results',
};

export function isAssetGroupName(name: string): boolean {
  return name.startsWith('Asset group |');
}

export function isPmax(ds: ShowcaseDataset, campaignId: string): boolean {
  return ds.campaigns.find((c) => c.id === campaignId)?.channelType === 'PERFORMANCE_MAX';
}

/** Keyword count only where the targeting string lists them ("Keywords: a, b"); otherwise null (no data). */
export function keywordCount(targeting: string | undefined): number | null {
  if (!targeting) return null;
  const m = /^Keywords:\s*(.+)$/i.exec(targeting.trim());
  if (!m) return null;
  return m[1]!.split(',').map((s) => s.trim()).filter(Boolean).length;
}

/** Ad ids that belong to an entity (a campaign, ad set / ad group, or the ad itself). */
export function adIdsOf(ds: ShowcaseDataset, r: Pick<EntityPerformanceRow, 'id' | 'level'>): string[] {
  if (r.level === 'ad') return [r.id];
  if (r.level === 'ad_group') return ds.ads.filter((a) => a.adGroupId === r.id).map((a) => a.id);
  return ds.ads.filter((a) => a.campaignId === r.id).map((a) => a.id);
}

/** Daily results trend for one entity (sum over its ads; null when no ad has data that day). */
export function resultTrend(ds: ShowcaseDataset, r: Pick<EntityPerformanceRow, 'id' | 'level'>, kind: ResultKind, range: DateRange): (number | null)[] {
  if (kind === 'lpv' || kind === 'purchases') return [];
  const ids = adIdsOf(ds, r);
  if (ids.length === 0) return [];
  const pts = adSeries(ds, { adIds: ids, metric: kind === 'leads' ? 'leads' : 'clicks', range, granularity: 'daily' });
  return pts.map((p) => {
    let sum = 0;
    let any = false;
    for (const id of ids) {
      const v = p.values[id];
      if (v !== null && v !== undefined) {
        sum += v;
        any = true;
      }
    }
    return any ? sum : null;
  });
}

// ---- columns ----
export type ColumnId = 'status' | 'performance' | 'spend' | 'results' | 'cpl' | 'ctr' | 'cpc' | 'trend' | 'budget' | 'dates';
export interface ColumnDef {
  id: ColumnId;
  label: string;
  group: 'Status' | 'Performance' | 'Budget';
}
export const COLUMNS: readonly ColumnDef[] = [
  { id: 'status', label: 'Status', group: 'Status' },
  { id: 'performance', label: 'Performance', group: 'Status' },
  { id: 'spend', label: 'Spend', group: 'Performance' },
  { id: 'results', label: 'Results', group: 'Performance' },
  { id: 'cpl', label: 'Cost per result', group: 'Performance' },
  { id: 'ctr', label: 'CTR', group: 'Performance' },
  { id: 'cpc', label: 'CPC', group: 'Performance' },
  { id: 'trend', label: 'Results per day', group: 'Performance' },
  { id: 'budget', label: 'Budget', group: 'Budget' },
  { id: 'dates', label: 'Dates', group: 'Budget' },
];
export const DEFAULT_COLUMNS: readonly ColumnId[] = COLUMNS.map((c) => c.id);
export const COLUMNS_KEY = 'showcase-demo-columns-v1';

export function loadColumns(): ColumnId[] {
  try {
    const raw = localStorage.getItem(COLUMNS_KEY);
    if (!raw) return [...DEFAULT_COLUMNS];
    const arr: unknown = JSON.parse(raw);
    if (!Array.isArray(arr)) return [...DEFAULT_COLUMNS];
    const ok = arr.filter((x): x is ColumnId => typeof x === 'string' && DEFAULT_COLUMNS.includes(x as ColumnId));
    return ok.length ? ok : [...DEFAULT_COLUMNS];
  } catch {
    return [...DEFAULT_COLUMNS];
  }
}
export function saveColumns(cols: readonly ColumnId[]): void {
  try {
    localStorage.setItem(COLUMNS_KEY, JSON.stringify(cols));
  } catch {
    /* storage unavailable: the choice just does not persist */
  }
}

export type PillId = 'active' | 'all' | 'no_results' | 'high_cpl' | 'highest_spend' | 'best_results' | 'attention';
export const PILLS: readonly { id: PillId; label: string }[] = [
  { id: 'active', label: 'Active' },
  { id: 'all', label: 'All' },
  { id: 'no_results', label: 'No results' },
  { id: 'high_cpl', label: 'High CPL' },
  { id: 'highest_spend', label: 'Highest spend' },
  { id: 'best_results', label: 'Best results' },
  { id: 'attention', label: 'Needs attention' },
];
