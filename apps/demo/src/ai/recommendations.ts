// Deterministic recommendation rules over the selected period vs the previous equal-length period.
// Pure: same dataset + range + view always gives the same cards. Nothing here changes any entity.
import { entityPerformance, type DateRange, type EntityPerformanceRow, type Platform, type PlatformView, type ShowcaseDataset } from '@sedem-ads/analytics-core';
import { change, count, dateRange, money, pct } from '../lib/format';
import type { EntityRef } from '../sim/contract';
import { MAX_BUDGET_SHIFT, MIN_IMPRESSIONS_FOR_CTR, MIN_LEADS_FOR_CPL, budgetShift, usablePrevious } from './rules';

export type RecType = 'rising_cpl' | 'falling_ctr' | 'creative_fatigue' | 'budget_shift' | 'scale_creative' | 'poor_efficiency';
export type RecPriority = 'high' | 'medium' | 'low';

export const REC_TYPE_LABEL: Record<RecType, string> = {
  rising_cpl: 'Rising CPL',
  falling_ctr: 'Falling CTR',
  creative_fatigue: 'Creative fatigue',
  budget_shift: 'Budget reallocation',
  scale_creative: 'Scale strong creative',
  poor_efficiency: 'Poor efficiency',
};
export const REC_TYPES = Object.keys(REC_TYPE_LABEL) as RecType[];
export const PRIORITY_LABEL: Record<RecPriority, string> = { high: 'High', medium: 'Medium', low: 'Low' };
const RANK: Record<RecPriority, number> = { high: 0, medium: 1, low: 2 };

export interface EvidenceRow {
  label: string;
  current: string;
  previous: string;
  change: string;
}

export interface PrepareAction {
  entity: EntityRef;
  kind: 'pause' | 'set_budget';
  newDailyBudgetMinor?: number;
}

export interface Recommendation {
  /** Stable key used for dismiss/restore. Does not depend on the period. */
  key: string;
  type: RecType;
  priority: RecPriority;
  platform: Platform;
  level: EntityPerformanceRow['level'];
  entityId: string;
  entityName: string;
  title: string;
  evidence: EvidenceRow[];
  explanation: string;
  nextStep: string;
  /** Question to hand to the assistant. */
  ask: string;
  /** Route of the entity (campaign page). */
  openTo: string;
  /** Ad comparison link where it makes sense. */
  compareTo?: string;
  prepare?: PrepareAction;
}

export interface RecommendationSet {
  current: DateRange;
  previous: DateRange | null;
  /** Human label such as "17 Oct – 15 Nov 2026 vs 17 Sep – 16 Oct 2026". */
  comparisonLabel: string;
  items: Recommendation[];
}

// Thresholds (documented in the UI "How rules work" note).
export const THRESHOLDS = {
  cplRise: 0.15,
  cplRiseHigh: 0.35,
  ctrFall: 0.08,
  ctrFallHigh: 0.35,
  fatigueHigh: 0.25,
  poorEfficiencyMultiple: 1.5,
  poorEfficiencyHigh: 2,
  poorMinSpendShare: 0.08,
  scaleCplFactor: 0.85,
} as const;

function ref(r: EntityPerformanceRow): EntityRef {
  return { id: r.id, level: r.level, platform: r.platform, name: r.name, status: r.status, dailyBudgetMinor: r.dailyBudgetMinor };
}

const camp = (id: string) => `/campaigns/${id}`;

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? (s[mid] ?? null) : ((s[mid - 1] ?? 0) + (s[mid] ?? 0)) / 2;
}

const byKey = (a: Recommendation, b: Recommendation) => RANK[a.priority] - RANK[b.priority] || a.key.localeCompare(b.key);

export function buildRecommendations(ds: ShowcaseDataset, view: PlatformView, range: DateRange): RecommendationSet {
  const prevRange = usablePrevious(range);
  const campaigns = entityPerformance(ds, { level: 'campaign', view, range });
  const ads = entityPerformance(ds, { level: 'ad', view, range });
  const items: Recommendation[] = [];
  const periodsText = prevRange ? `${dateRange(range)} vs ${dateRange(prevRange)}` : `${dateRange(range)} (no earlier period of equal length available)`;

  // --- Rising CPL (campaign)
  for (const r of campaigns) {
    const ch = r.change.cpl;
    if (ch === null || ch < THRESHOLDS.cplRise) continue;
    if ((r.current.leads ?? 0) < MIN_LEADS_FOR_CPL || (r.previous.leads ?? 0) < MIN_LEADS_FOR_CPL) continue;
    const priority: RecPriority = ch >= THRESHOLDS.cplRiseHigh ? 'high' : ch >= 0.22 ? 'medium' : 'low';
    items.push({
      key: `rising_cpl:${r.id}`,
      type: 'rising_cpl',
      priority,
      platform: r.platform,
      level: 'campaign',
      entityId: r.id,
      entityName: r.name,
      title: `CPL is rising in ${r.name}`,
      evidence: [
        { label: 'CPL', current: money(r.current.cplMinor), previous: money(r.previous.cplMinor), change: change(ch) },
        { label: 'Spend', current: money(r.current.spendMinor), previous: money(r.previous.spendMinor), change: change(r.change.spend) },
        { label: 'Leads', current: count(r.current.leads), previous: count(r.previous.leads), change: change(r.change.leads) },
      ],
      explanation: `Each lead costs more than in the previous period (${periodsText}). The change comes from spend and leads moving differently, not from a data gap.`,
      nextStep: 'Open the campaign, check which ads lost efficiency, and consider pausing the weakest one before touching the budget.',
      ask: `Why did CPL rise in ${r.name}?`,
      openTo: camp(r.id),
      prepare: r.status === 'ACTIVE' && priority === 'high' ? { entity: ref(r), kind: 'pause' } : undefined,
    });
  }

  // --- Falling CTR (ad)
  for (const r of ads) {
    const ch = r.change.ctr;
    if (ch === null || ch > -THRESHOLDS.ctrFall) continue;
    if ((r.current.impressions ?? 0) < MIN_IMPRESSIONS_FOR_CTR || (r.previous.impressions ?? 0) < MIN_IMPRESSIONS_FOR_CTR) continue;
    if (r.fatigued) continue; // shown as creative fatigue instead, never twice for the same ad
    const priority: RecPriority = ch <= -THRESHOLDS.ctrFallHigh ? 'high' : ch <= -0.25 ? 'medium' : 'low';
    items.push({
      key: `falling_ctr:${r.id}`,
      type: 'falling_ctr',
      priority,
      platform: r.platform,
      level: 'ad',
      entityId: r.id,
      entityName: r.name,
      title: `CTR is falling on ${r.name}`,
      evidence: [
        { label: 'CTR', current: pct(r.current.ctr), previous: pct(r.previous.ctr), change: change(ch) },
        { label: 'Impressions', current: count(r.current.impressions), previous: count(r.previous.impressions), change: '–' },
        { label: 'CPC', current: money(r.current.cpcMinor), previous: money(r.previous.cpcMinor), change: change(r.change.cpc) },
      ],
      explanation: `Fewer people click per impression than in the previous period (${periodsText}). Audience saturation or a weaker message are both possible; the data cannot tell which.`,
      nextStep: 'Compare this ad with the strongest ad in the same campaign and test a new headline.',
      ask: `Why is the CTR of ${r.name} falling?`,
      openTo: camp(r.campaignId),
      compareTo: `/compare?ads=${r.id}`,
    });
  }

  // --- Creative fatigue (ad)
  for (const r of ads) {
    if (!r.fatigued || (r.current.impressions ?? 0) < MIN_IMPRESSIONS_FOR_CTR) continue;
    const ch = r.change.ctr;
    const priority: RecPriority = ch !== null && ch <= -THRESHOLDS.fatigueHigh ? 'high' : 'medium';
    items.push({
      key: `creative_fatigue:${r.id}`,
      type: 'creative_fatigue',
      priority,
      platform: r.platform,
      level: 'ad',
      entityId: r.id,
      entityName: r.name,
      title: `${r.name} shows creative fatigue`,
      evidence: [
        { label: 'CTR', current: pct(r.current.ctr), previous: pct(r.previous.ctr), change: change(ch) },
        { label: 'CPL', current: money(r.current.cplMinor), previous: money(r.previous.cplMinor), change: change(r.change.cpl) },
        { label: 'Spend', current: money(r.current.spendMinor), previous: money(r.previous.spendMinor), change: change(r.change.spend) },
      ],
      explanation: `This ad has been running a long time and its CTR keeps declining (${periodsText}). That pattern usually means the audience has seen it too often.`,
      nextStep: 'Prepare a fresh creative variant, keep this one paused rather than deleted, and re-check CTR after a week.',
      ask: `Is ${r.name} fatigued?`,
      openTo: camp(r.campaignId),
      compareTo: `/compare?ads=${r.id}`,
      prepare: r.status === 'ACTIVE' ? { entity: ref(r), kind: 'pause' } : undefined,
    });
  }

  // --- Budget reallocation (weak -> strong, capped at 30%)
  const shift = budgetShift(campaigns, range);
  if (shift) {
    const { from, to } = shift;
    const ratio = (from.current.cplMinor ?? 0) / Math.max(1, to.current.cplMinor ?? 1);
    const priority: RecPriority = ratio >= 1.5 ? 'high' : ratio >= 1.25 ? 'medium' : 'low';
    const budget = from.dailyBudgetMinor;
    const canPrepare = budget !== null && budget > 0 && from.status === 'ACTIVE';
    items.push({
      key: `budget_shift:${from.id}`,
      type: 'budget_shift',
      priority,
      platform: from.platform,
      level: 'campaign',
      entityId: from.id,
      entityName: from.name,
      title: `Move budget from ${from.name} to ${to.name}`,
      evidence: [
        { label: `CPL ${from.name}`, current: money(from.current.cplMinor), previous: money(from.previous.cplMinor), change: change(from.change.cpl) },
        { label: `CPL ${to.name}`, current: money(to.current.cplMinor), previous: money(to.previous.cplMinor), change: change(to.change.cpl) },
        { label: 'Suggested move per day', current: money(shift.shiftMinor), previous: '–', change: `${pct(MAX_BUDGET_SHIFT, 0)} of source (maximum)` },
      ],
      explanation: `${from.name} pays more per lead than ${to.name} in ${dateRange(range)}. Moving a small share of daily budget tests whether the stronger campaign can absorb it. A single change never exceeds ${pct(MAX_BUDGET_SHIFT, 0)}.`,
      nextStep: canPrepare
        ? `Reduce ${from.name} by ${money(shift.shiftMinor)} per day, then raise ${to.name} separately after reviewing the preview.`
        : `Open ${from.name} and adjust budgets at ad set level; this campaign has no budget of its own.`,
      ask: 'Where should I move budget?',
      openTo: camp(from.id),
      prepare: canPrepare ? { entity: ref(from), kind: 'set_budget', newDailyBudgetMinor: budget - shift.shiftMinor } : undefined,
    });
  }

  // --- Strong creatives to scale
  const eligibleAds = ads.filter((a) => a.status === 'ACTIVE' && (a.current.impressions ?? 0) >= MIN_IMPRESSIONS_FOR_CTR && (a.current.leads ?? 0) >= MIN_LEADS_FOR_CPL && a.current.cplMinor !== null && a.current.ctr !== null);
  const medCpl = median(eligibleAds.map((a) => a.current.cplMinor ?? 0));
  const medCtr = median(eligibleAds.map((a) => a.current.ctr ?? 0));
  if (medCpl !== null && medCtr !== null) {
    const strong = eligibleAds
      .filter((a) => (a.current.cplMinor ?? Infinity) <= medCpl * THRESHOLDS.scaleCplFactor && (a.current.ctr ?? 0) >= medCtr && !a.fatigued)
      .sort((a, b) => (a.current.cplMinor ?? 0) - (b.current.cplMinor ?? 0) || a.id.localeCompare(b.id))
      .slice(0, 3);
    for (const [i, r] of strong.entries()) {
      items.push({
        key: `scale_creative:${r.id}`,
        type: 'scale_creative',
        priority: i === 0 ? 'medium' : 'low',
        platform: r.platform,
        level: 'ad',
        entityId: r.id,
        entityName: r.name,
        title: `${r.name} is a strong creative to scale`,
        evidence: [
          { label: 'CPL', current: money(r.current.cplMinor), previous: money(r.previous.cplMinor), change: change(r.change.cpl) },
          { label: 'CTR', current: pct(r.current.ctr), previous: pct(r.previous.ctr), change: change(r.change.ctr) },
          { label: 'Leads', current: count(r.current.leads), previous: count(r.previous.leads), change: change(r.change.leads) },
        ],
        explanation: `CPL is clearly below the median of comparable active ads and CTR is at or above the median in ${dateRange(range)}. It is not flagged as fatigued.`,
        nextStep: 'Reuse its message in other ad sets and raise its campaign budget in steps of at most 30%.',
        ask: 'Which ads have the highest CTR?',
        openTo: camp(r.campaignId),
        compareTo: `/compare?ads=${r.id}`,
      });
    }
  }

  // --- Poor efficiency (campaign)
  const totalSpend = campaigns.reduce((s, r) => s + (r.current.spendMinor ?? 0), 0);
  const totalLeads = campaigns.reduce((s, r) => s + (r.current.leads ?? 0), 0);
  const avgCpl = totalLeads > 0 ? totalSpend / totalLeads : null;
  if (avgCpl !== null) {
    for (const r of campaigns) {
      const spend = r.current.spendMinor;
      const cpl = r.current.cplMinor;
      if (r.status !== 'ACTIVE' || spend === null || cpl === null) continue;
      if ((r.current.leads ?? 0) < MIN_LEADS_FOR_CPL) continue;
      const mult = cpl / avgCpl;
      if (mult < THRESHOLDS.poorEfficiencyMultiple) continue;
      if (totalSpend > 0 && spend / totalSpend < THRESHOLDS.poorMinSpendShare) continue;
      items.push({
        key: `poor_efficiency:${r.id}`,
        type: 'poor_efficiency',
        priority: mult >= THRESHOLDS.poorEfficiencyHigh ? 'high' : 'medium',
        platform: r.platform,
        level: 'campaign',
        entityId: r.id,
        entityName: r.name,
        title: `${r.name} is far less efficient than the average`,
        evidence: [
          { label: 'CPL (campaign)', current: money(cpl), previous: money(r.previous.cplMinor), change: change(r.change.cpl) },
          { label: 'CPL (all campaigns in view)', current: money(Math.round(avgCpl)), previous: '–', change: '–' },
          { label: 'Share of spend', current: pct(spend / totalSpend, 1), previous: '–', change: '–' },
        ],
        explanation: `The campaign spends a meaningful share of budget at a much higher cost per lead than the average of the campaigns in this view in ${dateRange(range)}. Ratios are computed from summed spend and leads.`,
        nextStep: 'Pause or reduce the weakest ad sets, or prepare a pause of the whole campaign and review the preview before confirming.',
        ask: 'Which campaign is performing worst?',
        openTo: camp(r.id),
        prepare: { entity: ref(r), kind: 'pause' },
      });
    }
  }

  const seen = new Set<string>();
  const unique = items.filter((i) => (seen.has(i.key) ? false : (seen.add(i.key), true)));
  return { current: range, previous: prevRange, comparisonLabel: periodsText, items: unique.sort(byKey) };
}
