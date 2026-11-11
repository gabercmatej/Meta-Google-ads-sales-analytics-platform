// Shared, pure rules used by both the assistant and the recommendation engine.
import { SHOWCASE_HISTORY_START, compareDates, previousPeriod, rangeLength, type DateRange, type EntityPerformanceRow, type ShowcaseDataset } from '@sedem-ads/analytics-core';

/** A single budget change may not exceed this share of the current daily budget (WriteWorkflow rule). */
export const MAX_BUDGET_SHIFT = 0.3;
/** Minimum leads before a CPL is treated as meaningful. */
export const MIN_LEADS_FOR_CPL = 5;
/** Minimum impressions before a CTR is treated as meaningful. */
export const MIN_IMPRESSIONS_FOR_CTR = 1000;

/** Previous equal-length window, or null when it would start before the available history. */
export function usablePrevious(range: DateRange): DateRange | null {
  const prev = previousPeriod(range);
  return compareDates(prev.start, SHOWCASE_HISTORY_START) < 0 ? null : prev;
}

export function hasCpl(r: EntityPerformanceRow): boolean {
  return r.current.cplMinor !== null && (r.current.leads ?? 0) >= MIN_LEADS_FOR_CPL;
}

export interface BudgetShift {
  from: EntityPerformanceRow;
  to: EntityPerformanceRow;
  /** Daily amount moved, integer cents; never more than MAX_BUDGET_SHIFT of the source budget. */
  shiftMinor: number;
  fromBudgetMinor: number;
  toBudgetMinor: number | null;
  /** Share of the source budget that is moved (<= MAX_BUDGET_SHIFT). */
  shareOfSource: number;
  /** Whether the budget figure comes from the configured campaign budget or from average daily spend. */
  basis: 'configured_budget' | 'average_daily_spend';
}

/**
 * Weak -> strong reallocation among ACTIVE campaigns with enough leads. Deterministic: the weakest
 * is the highest CPL, the strongest is the lowest CPL on the same platform when possible.
 * The move is capped at 30% of the source's daily budget.
 */
export function budgetShift(campaigns: readonly EntityPerformanceRow[], range: DateRange): BudgetShift | null {
  const days = rangeLength(range);
  const pool = campaigns.filter((c) => c.status === 'ACTIVE' && hasCpl(c));
  if (pool.length < 2) return null;
  const byCplDesc = [...pool].sort((a, b) => (b.current.cplMinor ?? 0) - (a.current.cplMinor ?? 0) || a.id.localeCompare(b.id));
  const from = byCplDesc[0];
  if (!from) return null;
  const candidates = pool
    .filter((c) => c.id !== from.id && (c.current.cplMinor ?? Infinity) < (from.current.cplMinor ?? 0))
    .sort((a, b) => (a.current.cplMinor ?? 0) - (b.current.cplMinor ?? 0) || a.id.localeCompare(b.id));
  const samePlatform = candidates.find((c) => c.platform === from.platform);
  const to = samePlatform ?? candidates[0];
  if (!to) return null;
  const configured = from.dailyBudgetMinor;
  const avg = from.current.spendMinor === null ? null : Math.round(from.current.spendMinor / days);
  const fromBudgetMinor = configured ?? avg;
  if (fromBudgetMinor === null || fromBudgetMinor <= 0) return null;
  const shiftMinor = Math.floor(fromBudgetMinor * MAX_BUDGET_SHIFT);
  if (shiftMinor <= 0) return null;
  return {
    from,
    to,
    shiftMinor,
    fromBudgetMinor,
    toBudgetMinor: to.dailyBudgetMinor,
    shareOfSource: shiftMinor / fromBudgetMinor,
    basis: configured !== null ? 'configured_budget' : 'average_daily_spend',
  };
}

/**
 * Campaign named in a (lower-cased) question: the full name, or one unique, reasonably long segment
 * of it ("Brand Terms" for "Search | Brand Terms"). Ambiguous short segments never match.
 */
export function matchCampaign(q: string, ds: ShowcaseDataset) {
  const full = [...ds.campaigns].sort((a, b) => b.name.length - a.name.length).find((c) => q.includes(c.name.toLowerCase()));
  if (full) return full;
  const segs = new Map<string, string[]>();
  for (const c of ds.campaigns) for (const part of c.name.split('|').map((x) => x.trim().toLowerCase())) segs.set(part, [...(segs.get(part) ?? []), c.id]);
  for (const [part, ids] of segs) {
    if (part.length >= 8 && ids.length === 1 && q.includes(part)) return ds.campaigns.find((c) => c.id === ids[0]);
  }
  return undefined;
}
