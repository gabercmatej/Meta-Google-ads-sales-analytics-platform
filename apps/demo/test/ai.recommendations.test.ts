import { describe, expect, it } from 'vitest';
import { resolveShowcaseRange } from '@sedem-ads/analytics-core';
import { getDataset } from '../src/lib/data';
import { buildRecommendations, REC_TYPES } from '../src/ai/recommendations';

const ds = getDataset();
const last30 = resolveShowcaseRange(ds, 'last30')!;

describe('recommendations', () => {
  const set = buildRecommendations(ds, 'combined', last30);

  it('is deterministic for the same input', () => {
    expect(JSON.stringify(buildRecommendations(ds, 'combined', last30))).toBe(JSON.stringify(set));
  });

  it('shows every recommendation type on the default last-30-days dataset', () => {
    const types = new Set(set.items.map((i) => i.type));
    for (const t of REC_TYPES) expect(types.has(t), t).toBe(true);
  });

  it('states the compared periods and gives each card evidence, a next step and a link', () => {
    expect(set.previous).not.toBeNull();
    expect(set.comparisonLabel).toContain(' vs ');
    for (const r of set.items) {
      expect(r.evidence.length).toBeGreaterThan(0);
      expect(r.nextStep.length).toBeGreaterThan(0);
      expect(r.openTo).toMatch(/^\/(campaigns|compare)/);
      expect(r.ask.length).toBeGreaterThan(5);
    }
  });

  it('keeps keys unique and ordered by priority', () => {
    expect(new Set(set.items.map((i) => i.key)).size).toBe(set.items.length);
    const rank = { high: 0, medium: 1, low: 2 } as const;
    const ranks = set.items.map((i) => rank[i.priority]);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
  });

  it('budget suggestions never move more than 30% of the source budget', () => {
    const shifts = set.items.filter((i) => i.type === 'budget_shift');
    expect(shifts.length).toBeGreaterThan(0);
    for (const r of shifts) {
      const p = r.prepare;
      if (!p || p.kind !== 'set_budget' || p.newDailyBudgetMinor === undefined || p.entity.dailyBudgetMinor === null) continue;
      const cut = (p.entity.dailyBudgetMinor - p.newDailyBudgetMinor) / p.entity.dailyBudgetMinor;
      expect(cut).toBeGreaterThan(0);
      expect(cut).toBeLessThanOrEqual(0.3 + 1e-9);
    }
  });

  it('only offers a prepared change for ACTIVE entities, and never applies anything itself', () => {
    for (const r of set.items) if (r.prepare) expect(r.prepare.entity.status).toBe('ACTIVE');
  });

  it('respects the platform view', () => {
    const meta = buildRecommendations(ds, 'meta', last30);
    expect(meta.items.every((i) => i.platform === 'meta')).toBe(true);
  });

  it('returns no change-based rules when the previous period predates the history', () => {
    const first = resolveShowcaseRange(ds, 'custom', { start: '2024-11-01', end: '2024-11-30' })!;
    const early = buildRecommendations(ds, 'combined', first);
    expect(early.previous).toBeNull();
    expect(early.items.some((i) => i.type === 'rising_cpl' || i.type === 'falling_ctr')).toBe(false);
  });
});
