// Supporting numbers for recommendation cards and the detail page. Pure and deterministic: every
// figure is derived from the synthetic dataset (daily ad facts) or from the same entityPerformance
// rows the rules used, so the detail page can never disagree with the card.
import { adSeries, entityPerformance, type DateRange, type EntityPerformanceRow, type PlatformView, type ShowcaseDataset } from '@sedem-ads/analytics-core';
import { date, money, pct } from '../lib/format';
import { MIN_LEADS_FOR_CPL } from './rules';
import type { RecType, Recommendation } from './recommendations';

export type HeadlineMetric = 'cpl' | 'ctr';

export function headlineMetric(type: RecType): HeadlineMetric {
  return type === 'falling_ctr' || type === 'creative_fatigue' ? 'ctr' : 'cpl';
}

export interface Narrative {
  why: string;
  /** What the rule hopes to move: arrow + metric + plain sentence. */
  impact: { arrow: '↑' | '↓'; metric: string; text: string };
  risks: string[];
}

const NARRATIVE: Record<RecType, Narrative> = {
  rising_cpl: {
    why: 'When each lead costs more, the same budget buys fewer enquiries. The gap grows with every day the campaign keeps spending at the higher cost.',
    impact: { arrow: '↓', metric: 'CPL', text: 'Removing the weakest ad should bring cost per lead back toward the previous period.' },
    risks: ['Pausing an ad lowers volume while CPL recovers.', 'The previous period may have been unusually cheap, so the target could be too optimistic.'],
  },
  falling_ctr: {
    why: 'A lower click-through rate means more impressions are needed for each visit, which raises CPC and, later, cost per lead.',
    impact: { arrow: '↑', metric: 'CTR', text: 'A fresher headline or image should lift clicks per impression.' },
    risks: ['A new variant can also perform worse than the current ad.', 'Results need several days of delivery before they can be judged.'],
  },
  creative_fatigue: {
    why: 'A creative that people have seen many times is clicked less. Spend keeps flowing to it while efficiency erodes.',
    impact: { arrow: '↑', metric: 'CTR', text: 'Rotating in a new creative should recover click-through and stabilise CPL.' },
    risks: ['Pausing the ad removes its remaining conversions.', 'Learning restarts when a new creative enters the ad set.'],
  },
  budget_shift: {
    why: 'Budget is the main lever. Spending a little more where leads are cheaper improves the blended cost per lead without raising total spend.',
    impact: { arrow: '↓', metric: 'Blended CPL', text: 'Total spend stays the same while more of it goes to the cheaper campaign.' },
    risks: ['The stronger campaign may not keep its CPL at higher spend.', 'A change above 30% at once would reset delivery, so the move is capped.'],
  },
  scale_creative: {
    why: 'An ad that is cheaper per lead than its peers and clicks at least as well is the best candidate for more reach.',
    impact: { arrow: '↑', metric: 'Leads', text: 'More budget behind this creative should add leads at a similar cost.' },
    risks: ['CPL often rises as spend grows.', 'A short strong period can be noise; check the volume before scaling.'],
  },
  poor_efficiency: {
    why: 'A campaign that takes a material share of spend at a much higher cost per lead drags down the whole account.',
    impact: { arrow: '↓', metric: 'CPL', text: 'Cutting or fixing the weakest part should pull the blended CPL down.' },
    risks: ['Some leads from this campaign may be more valuable than the average lead.', 'Pausing the whole campaign removes all its volume at once.'],
  },
};

export function narrativeOf(type: RecType): Narrative {
  return NARRATIVE[type];
}

export interface DailyAgg {
  days: string[];
  spend: (number | null)[];
  leads: (number | null)[];
  clicks: (number | null)[];
  impressions: (number | null)[];
}

function sum(values: (number | null | undefined)[]): number | null {
  let s = 0;
  let any = false;
  for (const v of values) {
    if (typeof v === 'number' && Number.isFinite(v)) {
      s += v;
      any = true;
    }
  }
  return any ? s : null;
}

export function entityAdIds(ds: ShowcaseDataset, rec: Pick<Recommendation, 'level' | 'entityId'>): string[] {
  if (rec.level === 'ad') return [rec.entityId];
  return ds.ads.filter((a) => a.campaignId === rec.entityId).map((a) => a.id);
}

/** Daily totals for the recommendation entity (a campaign is the sum of its ads). A day without data stays null. */
export function entityDaily(ds: ShowcaseDataset, rec: Pick<Recommendation, 'level' | 'entityId'>, range: DateRange): DailyAgg {
  const adIds = entityAdIds(ds, rec);
  const out: DailyAgg = { days: [], spend: [], leads: [], clicks: [], impressions: [] };
  const per = (metric: 'spend' | 'leads' | 'clicks' | 'impressions') => adSeries(ds, { adIds, metric, range, granularity: 'daily' });
  const spend = per('spend');
  const leads = per('leads');
  const clicks = per('clicks');
  const imps = per('impressions');
  spend.forEach((p, i) => {
    out.days.push(p.key);
    out.spend.push(sum(adIds.map((id) => p.values[id])));
    out.leads.push(sum(adIds.map((id) => leads[i]!.values[id])));
    out.clicks.push(sum(adIds.map((id) => clicks[i]!.values[id])));
    out.impressions.push(sum(adIds.map((id) => imps[i]!.values[id])));
  });
  return out;
}

/** Rolling ratio over `window` days from summed numerators and denominators (never an average of daily ratios). */
export function rollingRatio(num: (number | null)[], den: (number | null)[], window: number): (number | null)[] {
  return num.map((_, i) => {
    const from = Math.max(0, i - window + 1);
    const n = sum(num.slice(from, i + 1));
    const d = sum(den.slice(from, i + 1));
    return n === null || d === null || d === 0 ? null : n / d;
  });
}

export interface SparkData {
  metric: HeadlineMetric;
  current: (number | null)[];
  previous: (number | null)[] | null;
}

/** Card sparkline: 7-day rolling headline metric for the period and, as a ghost line, the previous period. */
export function sparkFor(ds: ShowcaseDataset, rec: Recommendation, range: DateRange, previous: DateRange | null): SparkData {
  const metric = headlineMetric(rec.type);
  const pick = (d: DailyAgg) => (metric === 'cpl' ? rollingRatio(d.spend, d.leads, 7) : rollingRatio(d.clicks, d.impressions, 7));
  return { metric, current: pick(entityDaily(ds, rec, range)), previous: previous ? pick(entityDaily(ds, rec, previous)) : null };
}

export interface Anomaly {
  day: string;
  label: string;
  metric: 'CPL' | 'CTR';
  value: string;
  typical: string;
  direction: 'above' | 'below';
}

/** Days whose value is at least two standard deviations from the period mean (needs 14 days with data). */
export function findAnomalies(daily: DailyAgg, metric: HeadlineMetric): Anomaly[] {
  const vals = daily.days.map((_, i) => {
    if (metric === 'cpl') {
      const s = daily.spend[i];
      const l = daily.leads[i];
      return s == null || l == null || l === 0 ? null : s / l;
    }
    const c = daily.clicks[i];
    const im = daily.impressions[i];
    return c == null || im == null || im === 0 ? null : c / im;
  });
  const nums = vals.filter((v): v is number => v !== null);
  if (nums.length < 14) return [];
  const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
  const sd = Math.sqrt(nums.reduce((a, b) => a + (b - mean) ** 2, 0) / nums.length);
  if (sd === 0) return [];
  const fmt = (v: number) => (metric === 'cpl' ? money(Math.round(v)) : pct(v));
  const out: Anomaly[] = [];
  vals.forEach((v, i) => {
    if (v === null) return;
    const z = (v - mean) / sd;
    if (Math.abs(z) < 2) return;
    out.push({ day: daily.days[i]!, label: date(daily.days[i]!), metric: metric === 'cpl' ? 'CPL' : 'CTR', value: fmt(v), typical: fmt(mean), direction: z > 0 ? 'above' : 'below' });
  });
  return out.slice(0, 5);
}

export interface PeerRow {
  id: string;
  name: string;
  value: number | null;
  display: string;
  isSelf: boolean;
  rank: number | null;
}

/** Peers ranked by the headline metric: lowest CPL first, highest CTR first. Entities below the volume guard are listed unranked. */
export function peerTable(ds: ShowcaseDataset, rec: Recommendation, view: PlatformView, range: DateRange): { rows: PeerRow[]; medianDisplay: string } {
  const metric = headlineMetric(rec.type);
  const all = entityPerformance(ds, { level: rec.level, view, range });
  const self = all.find((r) => r.id === rec.entityId);
  const peers: EntityPerformanceRow[] = all.filter((r) => r.platform === rec.platform && (rec.level === 'campaign' || r.campaignId === self?.campaignId));
  const valueOf = (r: EntityPerformanceRow) => (metric === 'cpl' ? ((r.current.leads ?? 0) >= MIN_LEADS_FOR_CPL ? r.current.cplMinor : null) : r.current.ctr);
  const show = (v: number | null) => (v === null ? '–' : metric === 'cpl' ? money(v) : pct(v));
  const ranked = peers.filter((r) => valueOf(r) !== null).sort((a, b) => (metric === 'cpl' ? valueOf(a)! - valueOf(b)! : valueOf(b)! - valueOf(a)!) || a.id.localeCompare(b.id));
  const rows: PeerRow[] = ranked.map((r, i) => ({ id: r.id, name: r.name, value: valueOf(r), display: show(valueOf(r)), isSelf: r.id === rec.entityId, rank: i + 1 }));
  for (const r of peers) if (valueOf(r) === null) rows.push({ id: r.id, name: r.name, value: null, display: `– (under ${MIN_LEADS_FOR_CPL} leads)`, isSelf: r.id === rec.entityId, rank: null });
  const vs = ranked.map((r) => valueOf(r)!).sort((a, b) => a - b);
  const med = vs.length === 0 ? null : vs.length % 2 ? vs[(vs.length - 1) / 2]! : (vs[vs.length / 2 - 1]! + vs[vs.length / 2]!) / 2;
  const head = rows.slice(0, 8);
  return { rows: head.some((r) => r.isSelf) ? head : [...rows.slice(0, 7), ...rows.filter((r) => r.isSelf)], medianDisplay: med === null ? '–' : show(Math.round(med)) };
}

export interface Scenario {
  baselineSpendPerDayMinor: number;
  baselineLeadsPerDay: number;
  cplMinor: number;
  /** Linear estimate at a budget change of `percent`: constant CPL, no saturation. */
  at: (percent: number) => { spendPerDayMinor: number; leadsPerDay: number };
}

export function scenarioFor(row: EntityPerformanceRow | undefined, range: DateRange): Scenario | null {
  if (!row) return null;
  const spend = row.current.spendMinor;
  const leads = row.current.leads;
  const cpl = row.current.cplMinor;
  if (spend === null || leads === null || cpl === null || leads < MIN_LEADS_FOR_CPL) return null;
  const days = Math.max(1, Math.round((Date.parse(`${range.end}T00:00:00Z`) - Date.parse(`${range.start}T00:00:00Z`)) / 86_400_000) + 1);
  const s = spend / days;
  const l = leads / days;
  return { baselineSpendPerDayMinor: Math.round(s), baselineLeadsPerDay: l, cplMinor: cpl, at: (p) => ({ spendPerDayMinor: Math.round(s * (1 + p / 100)), leadsPerDay: l * (1 + p / 100) }) };
}
