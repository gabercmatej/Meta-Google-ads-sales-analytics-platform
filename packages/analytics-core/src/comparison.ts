// Independent reference implementation for the Sedem Ads showcase. Not production source.
//
// Period-over-period and entity comparison. Null-safe throughout: a missing value produces a
// null delta, and "best" is only declared when each candidate has enough volume.

import { type DateRange, previousPeriod } from './dates.js';
import { conversionRate, cpc, cpl, cpm, ctr } from './metrics.js';

export interface MetricDelta {
  current: number | null;
  previous: number | null;
  /** current - previous; null if either side is missing. */
  absolute: number | null;
  /** (current - previous) / |previous|; null if previous is missing or 0. */
  relative: number | null;
}

export function delta(current: number | null, previous: number | null): MetricDelta {
  const absolute = current === null || previous === null ? null : current - previous;
  const relative = absolute === null || previous === null || previous === 0 ? null : absolute / Math.abs(previous);
  return { current, previous, absolute, relative };
}

export interface PeriodComparison {
  currentRange: DateRange;
  previousRange: DateRange;
  metrics: Record<string, MetricDelta>;
}

/** Compare one set of metrics against the equal-length window immediately before it. */
export function comparePeriods(
  currentRange: DateRange,
  current: Record<string, number | null>,
  previous: Record<string, number | null>,
): PeriodComparison {
  const metrics: Record<string, MetricDelta> = {};
  for (const key of new Set([...Object.keys(current), ...Object.keys(previous)])) {
    metrics[key] = delta(current[key] ?? null, previous[key] ?? null);
  }
  return { currentRange, previousRange: previousPeriod(currentRange), metrics };
}

export type MetricDirection = 'lower_is_better' | 'higher_is_better';

export type EntityMetricName = 'ctr' | 'cpc' | 'cpm' | 'cpl' | 'conversionRate';

export const METRIC_DIRECTION: Record<EntityMetricName, MetricDirection> = {
  ctr: 'higher_is_better',
  cpc: 'lower_is_better',
  cpm: 'lower_is_better',
  cpl: 'lower_is_better',
  conversionRate: 'higher_is_better',
};

export interface EntityTotals {
  id: string;
  name: string;
  spendMinor: number | null;
  impressions: number | null;
  clicks: number | null;
  leads: number | null;
}

export interface VolumeGuard {
  minImpressions: number;
  minClicks: number;
  minLeads: number;
}

export const DEFAULT_VOLUME_GUARD: VolumeGuard = { minImpressions: 1000, minClicks: 30, minLeads: 5 };

export function entityMetrics(e: EntityTotals): Record<EntityMetricName, number | null> {
  return {
    ctr: ctr(e.clicks, e.impressions),
    cpc: cpc(e.spendMinor, e.clicks),
    cpm: cpm(e.spendMinor, e.impressions),
    cpl: cpl(e.spendMinor, e.leads),
    conversionRate: conversionRate(e.leads, e.clicks),
  };
}

/** Does the entity have enough volume for this metric to be meaningful? */
export function hasEnoughVolume(e: EntityTotals, metric: EntityMetricName, guard: VolumeGuard): boolean {
  switch (metric) {
    case 'ctr':
    case 'cpm':
      return (e.impressions ?? 0) >= guard.minImpressions;
    case 'cpc':
      return (e.clicks ?? 0) >= guard.minClicks;
    case 'conversionRate':
      return (e.clicks ?? 0) >= guard.minClicks && (e.leads ?? 0) >= 1;
    case 'cpl':
      return (e.leads ?? 0) >= guard.minLeads;
  }
}

export type BestResult =
  | { status: 'winner'; entityId: string; value: number }
  | { status: 'tie'; entityIds: string[]; value: number }
  | { status: 'insufficient_data'; reason: string };

/**
 * Pick the best entity for a metric, respecting direction and the volume guard. A winner needs at
 * least two entities that pass the guard; otherwise there is nothing to compare and the result
 * is "insufficient data" rather than a misleading winner.
 */
export function pickBest(entities: readonly EntityTotals[], metric: EntityMetricName, guard: VolumeGuard): BestResult {
  const eligible = entities
    .filter((e) => hasEnoughVolume(e, metric, guard))
    .map((e) => ({ id: e.id, value: entityMetrics(e)[metric] }))
    .filter((x): x is { id: string; value: number } => x.value !== null);
  if (eligible.length < 2) {
    return { status: 'insufficient_data', reason: `fewer than two entities meet the minimum volume for ${metric}` };
  }
  const lower = METRIC_DIRECTION[metric] === 'lower_is_better';
  const best = eligible.reduce((a, b) => ((lower ? b.value < a.value : b.value > a.value) ? b : a));
  const tied = eligible.filter((x) => x.value === best.value);
  if (tied.length > 1) return { status: 'tie', entityIds: tied.map((t) => t.id), value: best.value };
  return { status: 'winner', entityId: best.id, value: best.value };
}

export interface EntityComparison {
  entities: EntityTotals[];
  table: Record<string, Record<EntityMetricName, number | null>>;
  best: Record<EntityMetricName, BestResult>;
  guard: VolumeGuard;
}

/** Side-by-side comparison of 2 to 4 ads or campaigns. */
export function compareEntities(
  entities: readonly EntityTotals[],
  guard: Partial<VolumeGuard> = {},
): EntityComparison {
  if (entities.length < 2 || entities.length > 4) {
    throw new RangeError('compareEntities needs between 2 and 4 entities');
  }
  if (new Set(entities.map((e) => e.id)).size !== entities.length) throw new Error('Duplicate entity ids');
  const g = { ...DEFAULT_VOLUME_GUARD, ...guard };
  const names = Object.keys(METRIC_DIRECTION) as EntityMetricName[];
  const table: EntityComparison['table'] = {};
  for (const e of entities) table[e.id] = entityMetrics(e);
  const best = {} as Record<EntityMetricName, BestResult>;
  for (const m of names) best[m] = pickBest(entities, m, g);
  return { entities: [...entities], table, best, guard: g };
}
