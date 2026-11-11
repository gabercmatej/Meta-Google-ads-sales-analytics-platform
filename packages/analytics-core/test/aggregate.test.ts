// Independent reference implementation for the Sedem Ads showcase. Not production source.
import { describe, expect, it } from 'vitest';
import { aggregateMonthly, groupSeries, monthlyRatio, ratioSeries, seriesWithGaps } from '../src/index.js';

const range = { start: '2025-01-30', end: '2025-02-03' };
const rows = [
  { date: '2025-01-30', clicks: 10, impressions: 100 },
  { date: '2025-01-31', clicks: 20, impressions: 200 },
  { date: '2025-02-01', clicks: 30, impressions: 300 },
  // 2025-02-02 is missing entirely
  { date: '2025-02-03', clicks: 0, impressions: 100 },
];

describe('monthly aggregation with coverage', () => {
  const b = aggregateMonthly(rows, range, ['clicks', 'impressions']);

  it('buckets by month and keeps only the in-range slice', () => {
    expect(b.map((x) => x.month)).toEqual(['2025-01', '2025-02']);
    expect(b[0]!.range).toEqual({ start: '2025-01-30', end: '2025-01-31' });
    expect(b[0]!.totals).toEqual({ clicks: 30, impressions: 300 });
  });

  it('flags a month with a missing day as partial and lists the gap', () => {
    expect(b[0]!.complete).toBe(true);
    expect(b[1]!.complete).toBe(false);
    expect(b[1]!.missingDates).toEqual(['2025-02-02']);
    expect(b[1]!.presentDays).toBe(2);
  });

  it('a real zero is not a gap', () => {
    expect(b[1]!.totals.clicks).toBe(30);
    expect(b[1]!.coverage.clicks).toEqual({ expected: 3, present: 2 });
    const zeroOnly = aggregateMonthly([{ date: '2025-02-03', clicks: 0 }], { start: '2025-02-03', end: '2025-02-03' }, ['clicks']);
    expect(zeroOnly[0]!.totals.clicks).toBe(0);
  });

  it('a metric with no values at all is null, not 0', () => {
    const empty = aggregateMonthly([], { start: '2025-02-01', end: '2025-02-03' }, ['clicks']);
    expect(empty[0]!.totals.clicks).toBeNull();
    expect(empty[0]!.presentDays).toBe(0);
  });

  it('refuses duplicate days instead of double counting', () => {
    const dup = [...rows, { date: '2025-01-30', clicks: 1, impressions: 1 }];
    expect(() => aggregateMonthly(dup, range, ['clicks'])).toThrow(/Duplicate/);
  });

  it('partial months give a null ratio unless explicitly allowed', () => {
    expect(monthlyRatio(b[0]!, 'clicks', 'impressions')).toBeCloseTo(0.1, 12);
    expect(monthlyRatio(b[1]!, 'clicks', 'impressions')).toBeNull();
    expect(monthlyRatio(b[1]!, 'clicks', 'impressions', { allowPartial: true })).toBeCloseTo(30 / 400, 12);
  });

  it('a metric that is null on one day makes the month incomplete', () => {
    const r = { start: '2025-03-01', end: '2025-03-02' };
    const x = aggregateMonthly([{ date: '2025-03-01', a: 1, b: 2 }, { date: '2025-03-02', a: 1, b: null }], r, ['a', 'b']);
    expect(x[0]!.complete).toBe(false);
    expect(x[0]!.coverage.b).toEqual({ expected: 2, present: 1 });
  });
});

describe('series', () => {
  it('daily series has null gaps, never zeros', () => {
    expect(seriesWithGaps(rows, range, 'clicks').map((p) => p.value)).toEqual([10, 20, 30, null, 0]);
  });

  it('monthly grouping sums, flags partial months and keeps empty months null', () => {
    const m = groupSeries(seriesWithGaps(rows, range, 'clicks'), 'monthly');
    expect(m).toEqual([
      { key: '2025-01', value: 30, partial: false, coverage: { expected: 2, present: 2 } },
      { key: '2025-02', value: 30, partial: true, coverage: { expected: 3, present: 2 } },
    ]);
    expect(groupSeries([{ key: '2025-05-01', value: null }], 'monthly')[0]!.value).toBeNull();
  });

  it('monthly ratio series is ratio of sums, not the average of daily ratios', () => {
    const r = { start: '2025-01-01', end: '2025-01-02' };
    const data = [{ date: '2025-01-01', c: 1, i: 10 }, { date: '2025-01-02', c: 50, i: 100 }];
    const monthly = ratioSeries(data, r, 'c', 'i', 'monthly');
    expect(monthly[0]!.value).toBeCloseTo(51 / 110, 12);
    expect(ratioSeries(data, r, 'c', 'i', 'daily').map((p) => p.value)).toEqual([0.1, 0.5]);
    expect((0.1 + 0.5) / 2).not.toBeCloseTo(monthly[0]!.value!, 3);
  });

  it('daily ratio is null on a missing day', () => {
    const daily = ratioSeries(rows, range, 'clicks', 'impressions', 'daily');
    expect(daily.map((p) => p.value === null)).toEqual([false, false, false, true, false]);
  });
});
