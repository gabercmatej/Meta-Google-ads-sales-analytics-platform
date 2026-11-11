// Independent reference implementation for the Sedem Ads showcase. Not production source.
import { describe, expect, it } from 'vitest';
import { buildCanonicalSpend, monthlySpendTable, platformSpend, reconcileSpend, spendChartSeries } from '../src/index.js';

const range = { start: '2025-01-30', end: '2025-02-03' };
const meta = [
  { date: '2025-01-30', spendMinor: 1000 },
  { date: '2025-01-31', spendMinor: 1100 },
  { date: '2025-02-01', spendMinor: 1200 },
  { date: '2025-02-02', spendMinor: 1300 },
  { date: '2025-02-03', spendMinor: 1400 },
];
const google = [
  { date: '2025-01-30', spendMinor: 500 },
  { date: '2025-01-31', spendMinor: 0 }, // a real zero-spend day
  { date: '2025-02-01', spendMinor: 700 },
  // 2025-02-02 missing
  { date: '2025-02-03', spendMinor: null }, // source error
];

describe('canonical spend', () => {
  const s = buildCanonicalSpend({ range, meta, google });

  it('total counts only days where both platforms have data', () => {
    expect(s.completeDays).toBe(3);
    expect(s.expectedDays).toBe(5);
    expect(s.partial).toBe(true);
    expect(s.totalMinor).toBe(1000 + 500 + 1100 + 0 + 1200 + 700);
    expect(s.metaMinor! + s.googleMinor!).toBe(s.totalMinor);
  });

  it('classifies each incomplete day and lists it', () => {
    expect(s.days.map((d) => d.status)).toEqual(['complete', 'complete', 'complete', 'missing_google', 'missing_google']);
    expect(s.missingDates).toEqual(['2025-02-02', '2025-02-03']);
  });

  it('a zero-spend day is complete, a null day is not', () => {
    expect(s.days[1]!.totalMinor).toBe(1100);
    expect(s.days[4]!.totalMinor).toBeNull();
  });

  it('is null (not 0) when no day is complete', () => {
    const none = buildCanonicalSpend({ range, meta: [], google: [] });
    expect(none.totalMinor).toBeNull();
    expect(none.metaMinor).toBeNull();
    expect(none.days.every((d) => d.status === 'missing_both')).toBe(true);
  });

  it('rejects duplicate rows and non-integer or negative amounts', () => {
    expect(() => buildCanonicalSpend({ range, meta: [...meta, meta[0]!], google })).toThrow(/Duplicate/);
    expect(() => buildCanonicalSpend({ range, meta: [{ date: '2025-02-01', spendMinor: 10.5 }], google })).toThrow(RangeError);
    expect(() => buildCanonicalSpend({ range, meta: [{ date: '2025-02-01', spendMinor: -1 }], google })).toThrow(RangeError);
  });

  it('ignores rows outside the range', () => {
    const x = buildCanonicalSpend({ range, meta: [...meta, { date: '2024-01-01', spendMinor: 99999 }], google });
    expect(x.totalMinor).toBe(s.totalMinor);
  });
});

describe('card = chart = monthly = PDF', () => {
  const s = buildCanonicalSpend({ range, meta, google });
  const chart = spendChartSeries(s);
  const monthly = monthlySpendTable(s);

  it('all surfaces derive the same number', () => {
    expect(monthly.map((m) => m.month)).toEqual(['2025-01', '2025-02']);
    expect(monthly[1]!.partial).toBe(true);
    const r = reconcileSpend({ cardMinor: s.totalMinor, chartSeries: chart, monthlyTable: monthly, pdfMinor: s.totalMinor });
    expect(r.status).toBe('PASS');
    expect(r.mismatches).toEqual([]);
  });

  it('a chart that quietly includes a partial day is caught to the cent', () => {
    const cheating = chart.map((p) => (p.date === '2025-02-02' ? { ...p, valueMinor: 1300 } : p));
    const r = reconcileSpend({ cardMinor: s.totalMinor, chartSeries: cheating, monthlyTable: monthly });
    expect(r.status).toBe('FAIL');
    expect(r.mismatches).toEqual(['chart']);
    expect(r.diffs.chart).toBe(1300);
  });

  it('flags a stale PDF figure separately', () => {
    const r = reconcileSpend({ cardMinor: s.totalMinor, chartSeries: chart, monthlyTable: monthly, pdfMinor: s.totalMinor! + 1 });
    expect(r.mismatches).toEqual(['pdf']);
    expect(r.diffs.pdf).toBe(1);
  });

  it('a null card only matches null surfaces', () => {
    const none = buildCanonicalSpend({ range, meta: [], google: [] });
    const ok = reconcileSpend({ cardMinor: none.totalMinor, chartSeries: spendChartSeries(none), monthlyTable: monthlySpendTable(none) });
    expect(ok.status).toBe('PASS');
    const bad = reconcileSpend({ cardMinor: null, chartSeries: chart, monthlyTable: monthly });
    expect(bad.status).toBe('FAIL');
  });
});

describe('single-platform spend', () => {
  it('has its own coverage, independent of the other platform', () => {
    const g = platformSpend(google, range, 'google');
    expect(g).toEqual({ totalMinor: 1200, presentDays: 3, expectedDays: 5, partial: true });
    const m = platformSpend(meta, range, 'meta');
    expect(m.partial).toBe(false);
    expect(m.totalMinor).toBe(6000);
    expect(platformSpend([], range, 'meta').totalMinor).toBeNull();
  });
});
