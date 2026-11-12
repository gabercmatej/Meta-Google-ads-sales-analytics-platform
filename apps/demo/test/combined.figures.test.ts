import { describe, expect, it } from 'vitest';
import { getDataset } from '../src/lib/data';
import { combinedFigures } from '../src/lib/combined';

const RANGES = [
  { start: '2026-10-12', end: '2026-11-10' },
  { start: '2026-11-04', end: '2026-11-10' },
  { start: '2026-09-01', end: '2026-09-30' },
  { start: '2026-01-01', end: '2026-11-10' },
] as const;

describe('combined figures reconcile', () => {
  for (const r of RANGES) {
    const f = combinedFigures(getDataset(), { ...r });
    it(`source groups add up to total paid ${r.start}..${r.end}`, () => {
      expect(f.groups.reduce((a, g) => a + g.orders, 0)).toBe(f.paidOrders);
      expect(f.groups.reduce((a, g) => a + g.revenueMinor, 0)).toBe(f.paidRevenueMinor);
      expect(f.reconciles).toBe(true);
    });
    it(`Meta + Google spend equals total ${r.start}..${r.end}`, () => {
      expect(f.spend.metaMinor! + f.spend.googleMinor!).toBe(f.spend.totalMinor);
    });
    it(`surplus = selected revenue - total spend ${r.start}..${r.end}`, () => {
      const sel = f.groups.filter((g) => ['meta', 'google', 'chatbot_ai'].includes(g.group)).reduce((a, g) => a + g.revenueMinor, 0);
      expect(f.selected.revenueMinor).toBe(sel);
      expect(f.surplusMinor).toBe(sel - f.spend.totalMinor!);
    });
  }
});
