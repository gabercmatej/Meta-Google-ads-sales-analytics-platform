// Independent reference implementation for the Sedem Ads showcase. Not production source.
import { describe, expect, it } from 'vitest';
import {
  type EntityTotals,
  compareEntities,
  compareSources,
  comparePeriods,
  delta,
  entityMetrics,
  hasEnoughVolume,
  makeCheck,
  pickBest,
  summarize,
  DEFAULT_VOLUME_GUARD,
} from '../src/index.js';

function e(id: string, spendMinor: number | null, impressions: number | null, clicks: number | null, leads: number | null): EntityTotals {
  return { id, name: id, spendMinor, impressions, clicks, leads };
}

describe('delta and period comparison', () => {
  it('computes absolute and relative change', () => {
    expect(delta(150, 100)).toEqual({ current: 150, previous: 100, absolute: 50, relative: 0.5 });
    expect(delta(50, 100).relative).toBe(-0.5);
  });

  it('relative change is against the absolute previous value', () => {
    expect(delta(-50, -100).relative).toBe(0.5);
  });

  it('a zero baseline gives no relative change, not Infinity', () => {
    const d = delta(10, 0);
    expect(d.absolute).toBe(10);
    expect(d.relative).toBeNull();
  });

  it('a missing side gives a null delta, not a delta against zero', () => {
    expect(delta(null, 100).absolute).toBeNull();
    expect(delta(100, null).relative).toBeNull();
    expect(delta(0, 100).absolute).toBe(-100);
  });

  it('compares against the equal-length window just before', () => {
    const c = comparePeriods({ start: '2025-06-08', end: '2025-06-14' }, { clicks: 10, leads: null }, { clicks: 5, leads: 2, spend: 1 });
    expect(c.previousRange).toEqual({ start: '2025-06-01', end: '2025-06-07' });
    expect(c.metrics.clicks!.relative).toBe(1);
    expect(c.metrics.leads!.absolute).toBeNull();
    expect(c.metrics.spend!.current).toBeNull();
  });
});

describe('entity comparison', () => {
  const a = e('a', 10000, 50000, 500, 25); // cpl 4.00
  const b = e('b', 9000, 40000, 300, 30); // cpl 3.00
  const tiny = e('tiny', 100, 10, 1, 1); // cheap but meaningless volume

  it('computes per-entity metrics as ratios of sums', () => {
    expect(entityMetrics(a).ctr).toBeCloseTo(0.01, 12);
    expect(entityMetrics(a).cpl).toBeCloseTo(400, 12);
  });

  it('respects metric direction when choosing the best entity', () => {
    expect(pickBest([a, b], 'cpl', DEFAULT_VOLUME_GUARD)).toEqual({ status: 'winner', entityId: 'b', value: 300 });
    expect(pickBest([a, b], 'ctr', DEFAULT_VOLUME_GUARD)).toMatchObject({ status: 'winner', entityId: 'a' });
  });

  it('a low-volume entity cannot win on a lucky ratio', () => {
    const r = pickBest([a, b, tiny], 'cpl', DEFAULT_VOLUME_GUARD);
    expect(r).toMatchObject({ status: 'winner', entityId: 'b' });
    expect(hasEnoughVolume(tiny, 'cpl', DEFAULT_VOLUME_GUARD)).toBe(false);
  });

  it('declares insufficient data rather than a winner when fewer than two qualify', () => {
    expect(pickBest([a, tiny], 'cpl', DEFAULT_VOLUME_GUARD).status).toBe('insufficient_data');
  });

  it('reports a tie', () => {
    const r = pickBest([a, { ...a, id: 'a2' }], 'cpl', DEFAULT_VOLUME_GUARD);
    expect(r).toMatchObject({ status: 'tie', entityIds: ['a', 'a2'] });
  });

  it('null inputs produce null metrics and no volume', () => {
    const n = e('n', null, null, null, null);
    expect(Object.values(entityMetrics(n)).every((v) => v === null)).toBe(true);
    expect(hasEnoughVolume(n, 'ctr', DEFAULT_VOLUME_GUARD)).toBe(false);
  });

  it('needs 2 to 4 distinct entities', () => {
    expect(() => compareEntities([a])).toThrow(RangeError);
    expect(() => compareEntities([a, b, tiny, e('d', 1, 1, 1, 1), e('x', 1, 1, 1, 1)])).toThrow(RangeError);
    expect(() => compareEntities([a, a])).toThrow(/Duplicate/);
    const c = compareEntities([a, b]);
    expect(Object.keys(c.table)).toEqual(['a', 'b']);
    expect(c.best.cpl).toMatchObject({ entityId: 'b' });
  });

  it('the guard can be tightened by the caller', () => {
    const c = compareEntities([a, b], { minLeads: 28 });
    expect(c.best.cpl.status).toBe('insufficient_data');
  });
});

describe('audit model', () => {
  it('PARTIAL requires a category, other statuses forbid one', () => {
    expect(() => makeCheck({ id: 'x', title: 'x', status: 'PARTIAL' })).toThrow(/category/);
    expect(() => makeCheck({ id: 'x', title: 'x', status: 'PASS', category: 'source_limitation' })).toThrow();
    expect(makeCheck({ id: 'x', title: 'x', status: 'PARTIAL', category: 'source_limitation' }).category).toBe('source_limitation');
  });

  it('compareSources: equal is PASS, within tolerance is PASS, beyond is FAIL', () => {
    expect(compareSources('s', 'spend', 100, 100).status).toBe('PASS');
    expect(compareSources('s', 'spend', 100, 101, { toleranceMinor: 1 }).status).toBe('PASS');
    expect(compareSources('s', 'spend', 100, 102, { toleranceMinor: 1 }).status).toBe('FAIL');
  });

  it('an explained difference is PARTIAL with its category, never a quiet PASS', () => {
    const c = compareSources('vat', 'revenue', 12200, 10000, { explainedBy: 'intentional_basis_difference' });
    expect(c.status).toBe('PARTIAL');
    expect(c.category).toBe('intentional_basis_difference');
  });

  it('a source with no data is UNKNOWN: not a pass and not a defect', () => {
    expect(compareSources('s', 'spend', null, 100).status).toBe('UNKNOWN');
    expect(compareSources('s', 'spend', null, null).status).toBe('UNKNOWN');
  });

  it('summary: worst status wins and PARTIAL categories are counted', () => {
    const pass = makeCheck({ id: '1', title: 'a', status: 'PASS' });
    const part = makeCheck({ id: '2', title: 'b', status: 'PARTIAL', category: 'missing_evidence' });
    const unk = makeCheck({ id: '3', title: 'c', status: 'UNKNOWN' });
    const fail = makeCheck({ id: '4', title: 'd', status: 'FAIL' });
    expect(summarize([pass]).overall).toBe('PASS');
    expect(summarize([pass, unk]).overall).toBe('UNKNOWN');
    expect(summarize([pass, unk, part]).overall).toBe('PARTIAL');
    const s = summarize([pass, part, unk, fail]);
    expect(s.overall).toBe('FAIL');
    expect(s.counts).toEqual({ PASS: 1, PARTIAL: 1, FAIL: 1, UNKNOWN: 1 });
    expect(s.partialByCategory.missing_evidence).toBe(1);
  });

  it('an empty audit is UNKNOWN, not a pass', () => {
    expect(summarize([]).overall).toBe('UNKNOWN');
  });
});
