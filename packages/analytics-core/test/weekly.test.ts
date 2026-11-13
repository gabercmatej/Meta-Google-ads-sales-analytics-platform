// Independent reference implementation for the Sedem Ads showcase. Not production source.
import { describe, expect, it } from 'vitest';
import { enumerateDays, groupSeries, isoWeekEnd, isoWeekKey, isoWeekStart, periodKeysInRange, periodSlice, ratioSeries, seriesWithGaps } from '../src/index.js';
import { generateShowcaseDataset } from '../src/showcase/generate.js';
import * as q from '../src/showcase/queries.js';

describe('ISO weeks (Monday to Sunday)', () => {
  it('the week year is the year of its Thursday, so New Year can sit in week 53 or week 1', () => {
    expect(isoWeekKey('2026-12-31')).toBe('2026-W53');
    expect(isoWeekKey('2027-01-03')).toBe('2026-W53');
    expect(isoWeekKey('2027-01-04')).toBe('2027-W01');
    expect(isoWeekKey('2024-12-30')).toBe('2025-W01');
    expect(isoWeekStart('2026-W53')).toBe('2026-12-28');
    expect(isoWeekEnd('2026-W53')).toBe('2027-01-03');
    expect(isoWeekStart('2025-W01')).toBe('2024-12-30');
  });

  it('every day of a range lands in exactly one week, between that week\'s Monday and Sunday', () => {
    const range = { start: '2026-08-15', end: '2027-01-10' };
    const keys = periodKeysInRange(range, 'weekly');
    const days = enumerateDays(range);
    const covered = keys.flatMap((k) => enumerateDays(periodSlice(k, range, 'weekly')!));
    expect(covered).toEqual(days);
    for (const d of days) expect(d >= isoWeekStart(isoWeekKey(d)) && d <= isoWeekEnd(isoWeekKey(d))).toBe(true);
  });

  it('clips the first and last week to the selected range', () => {
    // 2026-10-13 is a Tuesday, 2026-11-11 a Wednesday.
    const range = { start: '2026-10-13', end: '2026-11-11' };
    const keys = periodKeysInRange(range, 'weekly');
    expect(periodSlice(keys[0]!, range, 'weekly')).toEqual({ start: '2026-10-13', end: '2026-10-18' });
    expect(periodSlice(keys.at(-1)!, range, 'weekly')).toEqual({ start: '2026-11-09', end: '2026-11-11' });
  });

  it('weekly grouping sums, keeps missing days visible as partial coverage, and ratios are ratios of sums', () => {
    const range = { start: '2026-11-01', end: '2026-11-03' }; // Sunday, Monday, Tuesday
    const rows = [
      { date: '2026-11-01', c: 1, i: 10 },
      { date: '2026-11-02', c: 50, i: 100 },
      // 2026-11-03 missing
    ];
    expect(groupSeries(seriesWithGaps(rows, range, 'c'), 'weekly')).toEqual([
      { key: '2026-W44', value: 1, partial: false, coverage: { expected: 1, present: 1 } },
      { key: '2026-W45', value: 50, partial: true, coverage: { expected: 2, present: 1 } },
    ]);
    const r2 = { start: '2026-11-02', end: '2026-11-03' };
    const both = [{ date: '2026-11-02', c: 1, i: 10 }, { date: '2026-11-03', c: 50, i: 100 }];
    expect(ratioSeries(both, r2, 'c', 'i', 'weekly')[0]!.value).toBeCloseTo(51 / 110, 12);
  });
});

describe('showcase weekly series', () => {
  const ds = generateShowcaseDataset();
  const range = q.resolveShowcaseRange(ds, 'last30')!;

  it('weekly points sum to the daily points for Meta, Google and combined', () => {
    for (const metric of ['spend', 'clicks', 'leads'] as const) {
      const daily = q.metricSeries(ds, { metric, range, granularity: 'daily' });
      const weekly = q.metricSeries(ds, { metric, range, granularity: 'weekly' });
      for (const k of ['meta', 'google', 'total'] as const) {
        expect(weekly.reduce((a, p) => a + (p[k] ?? 0), 0)).toBe(daily.reduce((a, p) => a + (p[k] ?? 0), 0));
      }
    }
  });

  it('a week cut by the range edge or containing the reference date is marked incomplete; full weeks are not', () => {
    const weekly = q.metricSeries(ds, { metric: 'spend', range, granularity: 'weekly' });
    const full = (key: string): boolean => isoWeekStart(key) >= range.start && isoWeekEnd(key) < ds.referenceDate;
    expect(weekly.length).toBeGreaterThanOrEqual(5);
    for (const p of weekly) expect(p.incomplete).toBe(!full(p.key));
    expect(weekly.some((p) => !p.incomplete)).toBe(true);
    expect(weekly[0]!.label).toMatch(/^\d{1,2}( [A-Z][a-z]{2})?–\d{1,2} [A-Z][a-z]{2}$/);
  });

  it('weekly sales and leads add up to the period totals', () => {
    const leads = q.leadsOverview(ds, { range, view: 'combined' });
    expect(q.leadsSeries(ds, { range, view: 'combined', granularity: 'weekly' }).reduce((a, d) => a + d.total, 0)).toBe(leads.total);
  });

  it('the integrity audit checks daily = weekly for every summable metric', () => {
    const ids = q.integrityChecks(ds, range).filter((c) => c.id.endsWith('daily_vs_weekly'));
    expect(ids.map((c) => c.status)).toEqual(['PASS', 'PASS', 'PASS', 'PASS']);
  });
});
