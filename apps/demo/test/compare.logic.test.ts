import { describe, expect, it } from 'vitest';
import { bestId, buildVerdict, judge, relChange } from '../src/lib/compareLogic';

describe('comparison better/worse logic', () => {
  it('lower cost is better, higher rate is better', () => {
    expect(judge('cpl', 800, 1000)).toBe('better');
    expect(judge('cpl', 1200, 1000)).toBe('worse');
    expect(judge('cpc', 50, 60)).toBe('better');
    expect(judge('ctr', 0.02, 0.01)).toBe('better');
    expect(judge('ctr', 0.005, 0.01)).toBe('worse');
    expect(judge('leads', 3, 9)).toBe('worse');
  });
  it('spend is never judged, and missing data is unknown rather than zero', () => {
    expect(judge('spend', 5000, 100)).toBe('neutral');
    expect(judge('cpl', null, 1000)).toBe('unknown');
    expect(judge('cpl', 0, null)).toBe('unknown');
    expect(relChange(0, 1000)).toBe(-1);
    expect(relChange(10, 0)).toBeNull();
  });
  it('best needs a clear, single winner', () => {
    expect(bestId('cpl', [{ id: 'a', value: 900 }, { id: 'b', value: 700 }, { id: 'c', value: null }])).toBe('b');
    expect(bestId('cpl', [{ id: 'a', value: 700 }, { id: 'b', value: 700 }])).toBeNull();
    expect(bestId('ctr', [{ id: 'a', value: 0.01 }, { id: 'b', value: 0.02 }])).toBe('b');
    expect(bestId('cpl', [{ id: 'a', value: 700 }])).toBeNull();
    expect(bestId('spend', [{ id: 'a', value: 1 }, { id: 'b', value: 2 }])).toBeNull();
  });
});

describe('verdict', () => {
  const ad = (id: string, cplMinor: number | null, leads: number) => ({ id, label: id, spendMinor: 10000, impressions: 5000, clicks: 100, leads, ctr: 0.02, cplMinor, cpcMinor: 100 });
  it('names the cheaper ad with reasons and volume', () => {
    const v = buildVerdict([ad('A', 2000, 20), ad('B', 1000, 30)]);
    expect(v.winnerId).toBe('B');
    expect(v.reasons[0]).toContain('€10.00');
    expect(v.reasons[0]).toContain('50.0% lower');
  });
  it('refuses to call a winner on too few leads', () => {
    const v = buildVerdict([ad('A', 2000, 20), ad('B', 500, 2)]);
    expect(v.winnerId).toBeNull();
    expect(v.caveats.join(' ')).toContain('fewer than');
  });
});
