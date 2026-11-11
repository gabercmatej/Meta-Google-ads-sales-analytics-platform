// Independent reference implementation for the Sedem Ads showcase. Not production source.
import { describe, expect, it } from 'vitest';
import { aggregateRatio, conversionRate, cpc, cpl, cpm, ctr, describeMetric, meanOfRatios, roas, safeRatio, toMetricValue } from '../src/index.js';

describe('metric formulas', () => {
  it('compute basic ratios', () => {
    expect(ctr(50, 1000)).toBe(0.05);
    expect(cpc(10000, 50)).toBe(200);
    expect(cpm(5000, 1000)).toBe(5000);
    expect(cpl(10000, 4)).toBe(2500);
    expect(conversionRate(5, 100)).toBe(0.05);
    expect(roas(30000, 10000)).toBe(3);
  });

  it('return null for zero, negative or missing denominators', () => {
    for (const f of [ctr, cpc, cpm, cpl, conversionRate, roas, safeRatio]) {
      expect(f(10, 0)).toBeNull();
      expect(f(10, null)).toBeNull();
      expect(f(null, 10)).toBeNull();
      expect(f(10, undefined)).toBeNull();
    }
    expect(safeRatio(10, -5)).toBeNull();
  });

  it('never yields NaN or Infinity', () => {
    expect(safeRatio(Number.NaN, 5)).toBeNull();
    expect(safeRatio(5, Number.POSITIVE_INFINITY)).toBeNull();
    expect(safeRatio(0, 10)).toBe(0); // a real zero stays zero
  });
});

describe('ratio of sums vs mean of ratios', () => {
  const rows = [
    { numerator: 1, denominator: 10 }, // 10%
    { numerator: 90, denominator: 900 }, // 10%
    { numerator: 0, denominator: 100 }, // 0%
  ];
  it('weights by denominator', () => {
    expect(aggregateRatio(rows)).toBeCloseTo(91 / 1010, 12);
    expect(meanOfRatios(rows)).toBeCloseTo((0.1 + 0.1 + 0) / 3, 12);
    expect(aggregateRatio(rows)).not.toBeCloseTo(meanOfRatios(rows)!, 3);
  });

  it('strict mode refuses to aggregate over a missing row', () => {
    const withGap = [...rows, { numerator: null, denominator: 50 }];
    expect(aggregateRatio(withGap)).toBeNull();
    expect(aggregateRatio(withGap, { mode: 'lenient' })).toBeCloseTo(91 / 1010, 12);
  });

  it('is null when nothing can be aggregated', () => {
    expect(aggregateRatio([])).toBeNull();
    expect(meanOfRatios([{ numerator: 1, denominator: 0 }])).toBeNull();
  });
});

describe('MetricValue distinguishes zero, value and no data', () => {
  it('keeps the three states apart', () => {
    expect(toMetricValue(0)).toEqual({ kind: 'zero' });
    expect(toMetricValue(12)).toEqual({ kind: 'value', value: 12 });
    expect(toMetricValue(null)).toEqual({ kind: 'no-data', reason: 'missing' });
    expect(toMetricValue(null, { nullReason: 'zero_denominator' })).toEqual({ kind: 'no-data', reason: 'zero_denominator' });
  });

  it('an unreachable source wins over any number', () => {
    expect(toMetricValue(0, { sourceUnavailable: true })).toEqual({ kind: 'no-data', reason: 'source_unavailable' });
  });

  it('describes each state differently', () => {
    const f = (n: number): string => `${n} EUR`;
    expect(describeMetric(toMetricValue(0), f)).toBe('0 EUR');
    expect(describeMetric(toMetricValue(null), f)).toBe('no data');
    expect(describeMetric(toMetricValue(1, { sourceUnavailable: true }), f)).toBe('source unavailable');
  });
});
