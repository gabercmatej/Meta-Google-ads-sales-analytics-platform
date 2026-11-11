// Independent reference implementation for the Sedem Ads showcase. Not production source.
import { describe, expect, it } from 'vitest';
import { SYNTHETIC_LABEL, buildCanonicalSpend, classifyOrder, datasetMonths, generateDataset, mulberry32, partitionOrders, platformSpend } from '../src/index.js';

const ds = generateDataset({ seed: 42 });

describe('determinism', () => {
  it('the same seed gives byte-identical data', () => {
    expect(JSON.stringify(generateDataset({ seed: 42 }))).toBe(JSON.stringify(ds));
  });

  it('a different seed gives different data', () => {
    const other = generateDataset({ seed: 43, start: '2025-01-01', end: '2025-01-31' });
    const same = generateDataset({ seed: 42, start: '2025-01-01', end: '2025-01-31' });
    expect(JSON.stringify(other.daily)).not.toBe(JSON.stringify(same.daily));
  });

  it('mulberry32 is stable and within [0,1)', () => {
    const a = mulberry32(1);
    const b = mulberry32(1);
    const xs = Array.from({ length: 1000 }, () => a());
    expect(xs).toEqual(Array.from({ length: 1000 }, () => b()));
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
    expect(new Set(xs).size).toBeGreaterThan(990);
  });
});

describe('labelling and safety of the data', () => {
  it('is labelled as synthetic in the object itself', () => {
    expect(ds.synthetic).toBe(true);
    expect(ds.label).toBe(SYNTHETIC_LABEL);
    expect(SYNTHETIC_LABEL).toBe('DEMO DATA — NOT REAL BUSINESS RESULTS');
    expect(ds.currency).toBe('EUR');
    expect(ds.timeZone).toBe('Europe/Ljubljana');
  });

  it('contains no emails, phone numbers or real-looking platform ids', () => {
    const text = JSON.stringify(ds);
    expect(text).not.toMatch(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,}/);
    expect(text).not.toMatch(/\+\d{6,}/);
    expect(text).not.toMatch(/act_\d+/);
    expect(text).not.toMatch(/\d{10,}/);
  });

  it('uses obviously fake account ids', () => {
    expect(ds.accounts).toEqual({ meta: 'meta-demo-account', google: 'google-demo-account' });
  });
});

describe('shape', () => {
  it('covers the requested range with 5 campaigns and 20 ads on both platforms', () => {
    expect(ds.range).toEqual({ start: '2025-01-01', end: '2025-12-31' });
    expect(ds.campaigns).toHaveLength(5);
    expect(ds.ads).toHaveLength(20);
    expect(new Set(ds.campaigns.map((c) => c.platform))).toEqual(new Set(['meta', 'google']));
    expect(ds.campaigns.filter((c) => c.underperforming)).toHaveLength(1);
  });

  it('has unique ids and a consistent hierarchy', () => {
    const ids = ds.ads.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    const groups = new Map(ds.adGroups.map((g) => [g.id, g]));
    for (const ad of ds.ads) expect(groups.get(ad.adGroupId)?.campaignId).toBe(ad.campaignId);
    const campaignIds = new Set(ds.campaigns.map((c) => c.id));
    expect(ds.daily.every((r) => campaignIds.has(r.campaignId))).toBe(true);
  });

  it('has one row per ad per day, with no duplicates', () => {
    const keys = new Set(ds.daily.map((r) => `${r.date}|${r.adId}`));
    expect(keys.size).toBe(ds.daily.length);
  });

  it('has sane integer values: no negatives, clicks <= impressions', () => {
    for (const r of ds.daily) {
      expect(Number.isInteger(r.spendMinor) && r.spendMinor >= 0).toBe(true);
      expect(r.clicks).toBeLessThanOrEqual(r.impressions);
      expect(r.leads).toBeGreaterThanOrEqual(0);
    }
    expect(ds.orders.every((o) => Number.isInteger(o.amountMinor) && o.amountMinor > 0)).toBe(true);
  });

  it('lists 12 months', () => {
    expect(datasetMonths(ds)).toHaveLength(12);
  });

  it('can generate a custom short range', () => {
    const small = generateDataset({ seed: 1, start: '2025-06-01', end: '2025-06-07' });
    expect(small.daily.every((r) => r.date >= '2025-06-01' && r.date <= '2025-06-07')).toBe(true);
  });
});

describe('reconciliation across the library', () => {
  const range = { start: '2025-06-01', end: '2025-06-30' };

  it('canonical spend matches the sum of the daily rows', () => {
    const rows = (p: 'meta' | 'google') => {
      const byDay = new Map<string, number>();
      for (const r of ds.daily) if (r.platform === p && r.date >= range.start && r.date <= range.end) byDay.set(r.date, (byDay.get(r.date) ?? 0) + r.spendMinor);
      return [...byDay].map(([date, spendMinor]) => ({ date, spendMinor }));
    };
    const meta = rows('meta');
    const google = rows('google');
    const s = buildCanonicalSpend({ range, meta, google });
    const manual = ds.daily.filter((r) => r.date >= range.start && r.date <= range.end).reduce((a, r) => a + r.spendMinor, 0);
    expect(s.partial).toBe(false);
    expect(s.totalMinor).toBe(manual);
    expect(platformSpend(meta, range, 'meta').totalMinor! + platformSpend(google, range, 'google').totalMinor!).toBe(manual);
  });

  it('the source partition reconciles on the generated orders', () => {
    const p = partitionOrders(ds.orders, { range, timeZone: ds.timeZone });
    expect(p.reconciles).toBe(true);
    expect(p.eligibleOrders).toBeGreaterThan(0);
  });

  it('orders carry a mix of hard evidence, label-only and unknown, and never any PII', () => {
    const kinds = new Set(ds.orders.map((o) => classifyOrder(o).status));
    expect(kinds.has('attributed_paid_ad')).toBe(true);
    expect(kinds.has('source_only') || kinds.has('unknown')).toBe(true);
    expect(JSON.stringify(ds.orders)).not.toMatch(/customer|email|phone/i);
  });

  it('platform-reported conversions are present but separate from orders', () => {
    const reported = ds.daily.reduce((a, r) => a + r.platformConversions, 0);
    expect(reported).toBeGreaterThan(0);
    expect(ds.orders.every((o) => !('platformConversions' in o))).toBe(true);
  });
});
