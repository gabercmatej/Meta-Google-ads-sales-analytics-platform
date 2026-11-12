import { describe, expect, it } from 'vitest';
import { entityPerformance } from '@sedem-ads/analytics-core';
import { getDataset } from '../src/lib/data';
import { isAssetGroupName, isPmax } from '../src/lib/campaignView';
import { allIssues, emptyForm, fromDraft, toDraftFields, wizardIssues, type FormState } from '../src/sim/DraftForm';

const range = { start: '2026-10-12', end: '2026-11-10' };

describe('campaign hierarchy integrity', () => {
  const ds = getDataset();
  for (const view of ['meta', 'google'] as const) {
    it(`${view}: ad-level spend equals campaign-level spend`, () => {
      const sum = (level: 'campaign' | 'ad_group' | 'ad') =>
        entityPerformance(ds, { level, view, range }).reduce((a, r) => a + (r.current.spendMinor ?? 0), 0);
      expect(sum('ad')).toBe(sum('campaign'));
    });
    it(`${view}: each campaign's ad groups never exceed it`, () => {
      const camps = entityPerformance(ds, { level: 'campaign', view, range });
      for (const c of camps) {
        const groups = entityPerformance(ds, { level: 'ad_group', view, range, campaignId: c.id });
        const gs = groups.reduce((a, r) => a + (r.current.spendMinor ?? 0), 0);
        expect(gs).toBeLessThanOrEqual(c.current.spendMinor ?? 0);
      }
    });
  }

  it('Performance Max has asset groups only, no ad groups', () => {
    expect(isPmax(ds, 'google-c4')).toBe(true);
    const groups = ds.adGroups.filter((g) => g.campaignId === 'google-c4');
    expect(groups.length).toBeGreaterThan(0);
    expect(groups.every((g) => isAssetGroupName(g.name))).toBe(true);
    const others = ds.adGroups.filter((g) => g.campaignId !== 'google-c4' && g.platform === 'google');
    expect(others.some((g) => isAssetGroupName(g.name))).toBe(false);
  });
});

function valid(platform: 'meta' | 'google'): FormState {
  const f = emptyForm(platform);
  f.campaignName = 'Test campaign';
  f.budgetText = '20';
  f.includeAd = false;
  if (platform === 'google') {
    f.objective = 'SEARCH';
    f.wiz = { ...f.wiz, keywords: 'alpha', headlines: ['A', 'B', 'C'], descriptions: ['One', 'Two'], networks: ['Search'] };
  }
  return f;
}

describe('wizard validation', () => {
  it('accepts a valid Meta and Google campaign', () => {
    expect(allIssues(valid('meta'))).toEqual([]);
    expect(allIssues(valid('google'))).toEqual([]);
  });
  it('rejects an empty name and out-of-range budgets', () => {
    const f = valid('meta');
    f.campaignName = '';
    expect(allIssues(f).length).toBeGreaterThan(0);
    for (const b of ['4', '1001', 'abc']) {
      const g = valid('meta');
      g.budgetText = b;
      expect(allIssues(g).length).toBeGreaterThan(0);
    }
  });
  it('checks Meta age range and manual placements', () => {
    const f = valid('meta');
    f.wiz = { ...f.wiz, ageMin: 16 };
    expect(wizardIssues(f).length).toBe(1);
    f.wiz = { ...f.wiz, ageMin: 40, ageMax: 30 };
    expect(wizardIssues(f).length).toBe(1);
    f.wiz = { ...f.wiz, ageMin: 25, ageMax: 55, placementsMode: 'manual', placements: [] };
    expect(wizardIssues(f).length).toBe(1);
  });
  it('checks Meta schedule order', () => {
    const f = valid('meta');
    f.wiz = { ...f.wiz, start: '2026-12-10', end: '2026-12-01' };
    expect(wizardIssues(f).length).toBe(1);
  });
  it('requires Google headlines, descriptions and length limits when an ad is included', () => {
    const f = valid('google');
    f.includeAd = true;
    f.wiz = { ...f.wiz, headlines: ['A', 'B'], descriptions: ['One'] };
    expect(wizardIssues(f).length).toBe(2);
    f.wiz = { ...f.wiz, headlines: ['A', 'B', 'x'.repeat(31)], descriptions: ['One', 'y'.repeat(91)] };
    expect(wizardIssues(f).length).toBe(2);
  });
  it('requires keywords for Search and an asset group for Performance Max', () => {
    const s = valid('google');
    s.wiz = { ...s.wiz, keywords: '  ' };
    expect(wizardIssues(s).length).toBe(1);
    const p = valid('google');
    p.objective = 'PERFORMANCE_MAX';
    expect(wizardIssues(p).length).toBe(1);
    p.wiz = { ...p.wiz, assetGroupName: 'Group' };
    expect(wizardIssues(p)).toEqual([]);
  });
  it('keeps wizard fields through a draft round trip', () => {
    const f = valid('google');
    f.wiz = { ...f.wiz, keywords: 'round trip' };
    const d = { ...toDraftFields(f), id: 'd1', createdAt: '2026-11-01T00:00:00Z', updatedAt: '2026-11-01T00:00:00Z' };
    expect(fromDraft(d).wiz.keywords).toBe('round trip');
  });
});
