import { describe, expect, it } from 'vitest';
import { monthKey } from '../src/dates.js';
import { generateShowcaseDataset } from '../src/showcase/generate.js';
import * as q from '../src/showcase/queries.js';

const ds = generateShowcaseDataset();
// Completed days only: 2026-11-11 is the flagged partial reference day.
const FULL = { start: '2024-11-01', end: '2026-10-31' };
const daily = q.metricSeries(ds, { metric: 'spend', range: { start: '2024-11-01', end: '2026-11-10' }, granularity: 'daily' });
const monthly = q.metricSeries(ds, { metric: 'spend', range: FULL, granularity: 'monthly' });

type Sums = { spend: number; impressions: number; clicks: number; leads: number };
const sumRows = (from: string, to: string, platform: 'meta' | 'google' | null): Sums => {
  const a: Sums = { spend: 0, impressions: 0, clicks: 0, leads: 0 };
  for (const r of ds.daily) {
    if (r.date < from || r.date > to) continue;
    if (platform && r.platform !== platform) continue;
    a.spend += r.spendMinor;
    a.impressions += r.impressions;
    a.clicks += r.clicks;
    a.leads += r.leads;
  }
  return a;
};
const monthBounds = (key: string) => [`${key}-01`, `${key}-31`] as const;

describe('showcase generated data reconciles', () => {
  it('is deterministic: same seed gives a deep-equal dataset', () => {
    expect(generateShowcaseDataset({ seed: 12345 })).toEqual(generateShowcaseDataset({ seed: 12345 }));
  });

  it('has no duplicated daily rows (unique date + adId) and integer money', () => {
    const keys = new Set(ds.daily.map((r) => `${r.date}|${r.adId}`));
    expect(keys.size).toBe(ds.daily.length);
    expect(ds.daily.every((r) => Number.isInteger(r.spendMinor) && r.spendMinor >= 0)).toBe(true);
  });

  it('Meta + Google = combined per day and per month; daily values sum to the monthly value', () => {
    for (const p of daily) expect(p.meta! + p.google!).toBe(p.total);
    for (const m of monthly) {
      expect(m.meta! + m.google!).toBe(m.total);
      const days = daily.filter((d) => monthKey(d.key) === m.key);
      expect(days.reduce((a, d) => a + d.meta!, 0)).toBe(m.meta);
      expect(days.reduce((a, d) => a + d.google!, 0)).toBe(m.google);
      expect(days.reduce((a, d) => a + d.total!, 0)).toBe(m.total);
    }
  });

  it('every completed day has both platforms; only the final partial day is flagged', () => {
    expect(daily.every((d) => d.dayStatus === 'complete')).toBe(true);
    expect(ds.sourceDays.every((s) => s.status === 'partial' && s.date === ds.referenceDate)).toBe(true);
  });

  it('monthly CTR/CPC/CPL equal sum(num)/sum(den), not the average of daily ratios', () => {
    const exact = {
      ctr: (a: Sums) => a.clicks / a.impressions,
      cpc: (a: Sums) => a.spend / a.clicks,
      cpl: (a: Sums) => a.spend / a.leads,
    };
    for (const metric of ['ctr', 'cpc', 'cpl'] as const) {
      const series = q.metricSeries(ds, { metric, range: FULL, granularity: 'monthly' });
      const dailySeries = q.metricSeries(ds, { metric, range: FULL, granularity: 'daily' });
      let differsFromAverage = 0;
      for (const m of series) {
        const [from, to] = monthBounds(m.key);
        const want = exact[metric](sumRows(from, to, null));
        // cpc / cpl are reported in (rounded) cents, ctr as a fraction
        if (metric === 'ctr') expect(m.total!).toBeCloseTo(want, 10);
        else expect(Math.abs(m.total! - want)).toBeLessThanOrEqual(0.5);
        const days = dailySeries.filter((d) => monthKey(d.key) === m.key).map((d) => d.total!);
        const avg = days.reduce((a, b) => a + b, 0) / days.length;
        if (Math.abs(avg - m.total!) > 1e-9) differsFromAverage += 1;
      }
      expect(differsFromAverage).toBeGreaterThan(series.length / 2);
    }
  });

  it('ROAS over a month is verified revenue / summed spend', () => {
    const range = { start: '2026-09-01', end: '2026-09-30' };
    const ao = q.attributionOverview(ds, { range });
    const spend = sumRows(range.start, range.end, 'meta').spend;
    expect(ao.roas.meta).toBe(ao.verified.meta.revenueMinor / spend);
  });
});

describe('showcase realism: spend does not look like a repeating weekly pattern', () => {
  const meta = daily.slice(-180).map((d) => d.meta!);
  const autocorr = (x: number[], lag: number): number => {
    const mean = x.reduce((a, b) => a + b, 0) / x.length;
    let num = 0;
    let den = 0;
    for (let i = 0; i < x.length; i++) {
      den += (x[i]! - mean) ** 2;
      if (i + lag < x.length) num += (x[i]! - mean) * (x[i + lag]! - mean);
    }
    return num / den;
  };
  const cv = (x: number[]) => {
    const mean = x.reduce((a, b) => a + b, 0) / x.length;
    return Math.sqrt(x.reduce((a, b) => a + (b - mean) ** 2, 0) / x.length) / mean;
  };

  it('lag-7 autocorrelation of Meta daily spend over the last 180 days is far from a pure weekly repeat', () => {
    expect(autocorr(meta, 7)).toBeLessThan(0.85);
  });

  it('day-to-day values are autocorrelated (lines wander) rather than independent noise', () => {
    expect(autocorr(meta, 1)).toBeGreaterThan(0.3);
  });

  it('monthly Meta and Google spend over 24 months is not constant', () => {
    expect(monthly).toHaveLength(24);
    expect(cv(monthly.map((m) => m.meta!))).toBeGreaterThan(0.1);
    expect(cv(monthly.map((m) => m.google!))).toBeGreaterThan(0.1);
  });

  it('Christmas dip and a deliberate multi-day pause exist; planted-case campaigns never pause', () => {
    const avg = (a: string, b: string) => {
      const d = daily.filter((x) => x.key >= a && x.key <= b);
      return d.reduce((s, x) => s + x.total!, 0) / d.length;
    };
    expect(avg('2025-12-24', '2025-12-26')).toBeLessThan(avg('2025-12-01', '2025-12-14') * 0.8);
    const gaps = (id: string): number[] => {
      const d = [...new Set(ds.daily.filter((r) => r.campaignId === id).map((r) => r.date))].sort();
      const out: number[] = [];
      for (let i = 1; i < d.length; i++) out.push((Date.parse(d[i]!) - Date.parse(d[i - 1]!)) / 86_400_000 - 1);
      return out.filter((g) => g > 0);
    };
    for (const id of ['meta-c4', 'meta-c5', 'google-c2', 'google-c3']) {
      const g = gaps(id);
      expect(g).toHaveLength(1);
      expect(g[0]).toBeGreaterThanOrEqual(3);
      expect(g[0]).toBeLessThanOrEqual(8);
    }
    for (const id of ['meta-c1', 'meta-c3', 'google-c1']) expect(gaps(id)).toEqual([]);
  });

  it('monthly revenue wanders too (follows leads)', () => {
    const rev = q.salesSeries(ds, { range: { start: '2026-05-01', end: '2026-10-31' }, granularity: 'monthly' }).map((m) => m.totalMinor);
    expect(new Set(rev).size).toBe(rev.length);
    expect(Math.max(...rev) / Math.min(...rev)).toBeGreaterThan(1.1);
  });
});
