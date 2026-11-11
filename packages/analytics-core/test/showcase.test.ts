import { describe, expect, it } from 'vitest';
import { enumerateDays, monthKey } from '../src/dates.js';
import { generateShowcaseDataset } from '../src/showcase/generate.js';
import * as q from '../src/showcase/queries.js';
import { SHOWCASE_SEED } from '../src/showcase/types.js';

interface NodeFs {
  readdirSync(dir: string): string[];
  readFileSync(file: string, enc: string): string;
}
const nodeProcess = (globalThis as unknown as { process: { getBuiltinModule(name: string): unknown } }).process;
const fs = nodeProcess.getBuiltinModule('node:fs') as NodeFs;
const url = nodeProcess.getBuiltinModule('node:url') as { fileURLToPath(u: string): string };

const ds = generateShowcaseDataset();
const FULL = { start: ds.range.start, end: '2026-11-10' };

describe('showcase generator', () => {
  it('is deterministic per seed and differs across seeds', () => {
    expect(generateShowcaseDataset({ seed: SHOWCASE_SEED })).toEqual(ds);
    expect(generateShowcaseDataset({ seed: 7 }).daily).not.toEqual(ds.daily);
  });

  it('covers 12+ calendar months and is generated quickly', () => {
    const t = Date.now();
    generateShowcaseDataset({ seed: 11 });
    expect(Date.now() - t).toBeLessThan(1500);
    const months = new Set(ds.daily.map((r) => monthKey(r.date)));
    expect(months.size).toBeGreaterThanOrEqual(12);
    expect(ds.range).toEqual({ start: '2025-10-01', end: '2026-11-11' });
  });

  it('stores money as integers and never emits forbidden patterns', () => {
    for (const r of ds.daily) {
      for (const v of [r.spendMinor, r.impressions, r.clicks, r.leads, r.platformConversions]) expect(Number.isInteger(v) && v >= 0).toBe(true);
      expect(r.clicks).toBeLessThanOrEqual(r.impressions);
      expect(r.leads).toBeLessThanOrEqual(r.clicks);
    }
    for (const o of ds.orders) expect(Number.isInteger(o.amountMinor) && o.amountMinor > 0).toBe(true);
    const text = JSON.stringify(ds);
    expect(text).not.toMatch(/[\w.+-]+@[\w-]+\.[a-z]{2,}/i);
    expect(text).not.toMatch(/act_\d/);
    expect(text).not.toMatch(/\d{15,}/);
    expect(text).not.toMatch(/\b\d{3}-\d{3}-\d{4}\b/);
    expect(text).not.toMatch(/https?:\/\/(?!example\.com\/)/);
  });

  it('source never uses Math.random or the clock', () => {
    const dir = url.fileURLToPath(new (globalThis as unknown as { URL: new (a: string, b: string) => { href: string } }).URL('../src/showcase/', (import.meta as unknown as { url: string }).url).href);
    for (const f of fs.readdirSync(dir)) {
      const src = fs.readFileSync(dir + f, 'utf8');
      expect(src, f).not.toMatch(/Math\.random|Date\.now|new Date\(\)/);
    }
  });

  it('has a valid hierarchy and no failing integrity check', () => {
    expect(q.integrityChecks(ds, FULL).filter((c) => c.status === 'FAIL')).toEqual([]);
  });
});

describe('planted cases', () => {
  const p = ds.planted!;
  const order = (id: string) => ds.orders.find((o) => o.id === id)!;

  it('Google gap day has no Google rows and Meta gap day has no Meta rows', () => {
    expect(p.googleMissingDate).toBe('2026-10-03');
    expect(p.metaSourceErrorDate).toBe('2026-10-19');
    expect(ds.daily.some((r) => r.platform === 'google' && r.date === p.googleMissingDate)).toBe(false);
    expect(ds.daily.some((r) => r.platform === 'meta' && r.date === p.googleMissingDate)).toBe(true);
    expect(ds.daily.some((r) => r.platform === 'meta' && r.date === p.metaSourceErrorDate)).toBe(false);
    expect(ds.sourceDays.find((s) => s.source === 'google' && s.date === p.googleMissingDate)?.status).toBe('missing');
    expect(ds.sourceDays.find((s) => s.source === 'meta' && s.date === p.metaSourceErrorDate)?.status).toBe('source_error');
  });

  it('gap days are null in series and excluded from combined totals', () => {
    const range = { start: '2026-10-01', end: '2026-10-05' };
    const gap = q.metricSeries(ds, { metric: 'spend', range, granularity: 'daily' }).find((d) => d.key === '2026-10-03')!;
    expect(gap.google).toBeNull();
    expect(gap.total).toBeNull();
    expect(gap.meta).toBeGreaterThan(0);
    expect(gap.dayStatus).toBe('missing_google');
    const t = q.performanceTotals(ds, 'combined', range);
    expect(t.missingDates).toEqual(['2026-10-03']);
    expect(t.completeDays).toBe(4);
    expect(t.partial).toBe(true);
  });

  it('partial final day is flagged and excluded from completed-day presets', () => {
    const partial = ds.sourceDays.filter((s) => s.status === 'partial' && s.date === '2026-11-11').map((s) => s.source);
    expect(partial.sort()).toEqual(['crm', 'google', 'leads', 'meta', 'payments']);
    expect(q.resolveShowcaseRange(ds, 'last7')!.end).toBe('2026-11-10');
    const series = q.metricSeries(ds, { metric: 'spend', range: { start: '2026-11-09', end: '2026-11-11' }, granularity: 'daily' });
    expect(series[2]!.incomplete).toBe(true);
  });

  it('exactly one ad is flagged fatigued and its CTR fell', () => {
    for (const preset of ['last14', 'last30'] as const) {
      const range = q.resolveShowcaseRange(ds, preset)!;
      const rows = q.entityPerformance(ds, { level: 'ad', view: 'combined', range });
      expect(rows.filter((r) => r.fatigued).map((r) => r.id)).toEqual([p.fatiguedAdId]);
      expect(rows.find((r) => r.id === p.fatiguedAdId)!.change.ctr!).toBeLessThan(-0.15);
    }
    const camps = q.entityPerformance(ds, { level: 'campaign', view: 'combined', range: q.resolveShowcaseRange(ds, 'last30')! });
    expect(camps.some((c) => c.fatigued)).toBe(false);
  });

  it('underperforming campaign has the steepest rise in cost per lead', () => {
    const rows = q.entityPerformance(ds, { level: 'campaign', view: 'meta', range: q.resolveShowcaseRange(ds, 'last30')! });
    const c3 = rows.find((r) => r.id === p.underperformingCampaignId)!;
    expect(c3.change.cpl!).toBeGreaterThan(0.25);
    const others = rows.filter((r) => r.id !== c3.id && r.change.cpl !== null).map((r) => r.change.cpl!);
    expect(c3.change.cpl!).toBeGreaterThan(Math.max(...others));
  });

  it('label-only Google order stays source-only, with no verified attribution', () => {
    const o = order(p.labelOnlyGoogleOrderId);
    expect(o.orderedAt).toBe('2026-10-27T09:12:00.000Z');
    const row = q.orderAttributionRows(ds, { range: { start: '2026-10-27', end: '2026-10-27' } }).find((r) => r.order.id === o.id)!;
    expect(row.attribution.status).toBe('source_only');
    expect(o.source).toBe('google');
  });

  it('conflict order is flagged as conflict', () => {
    const row = q.orderAttributionRows(ds, { range: { start: '2026-10-22', end: '2026-10-22' } }).find((r) => r.order.id === p.conflictOrderId)!;
    expect(row.attribution.status).toBe('conflict');
    expect(row.order.orderedAt).toBe('2026-10-22T10:05:00.000Z');
  });

  it('refund, cancel, unpaid and paid-later orders have the right states', () => {
    expect(order(p.refundedOrderId).status).toBe('refunded');
    expect(order(p.cancelledOrderId).status).toBe('cancelled');
    expect(order(p.unpaidOrderId).status).toBe('unpaid');
    const later = order(p.paidLaterOrderId);
    expect(later.paidAt! > later.orderedAt).toBe(true);
    const x = order(p.crossMonthPaidLaterOrderId);
    expect(x.orderedAt).toBe('2026-09-30T20:30:00.000Z');
    expect(x.paidAt).toBe('2026-10-01T08:15:00.000Z');
  });

  it('cross-month order moves between months by order date vs payment date', () => {
    const amount = order(p.crossMonthPaidLaterOrderId).amountMinor;
    const total = (range: { start: string; end: string }, basis: 'order' | 'payment') =>
      q.salesSeries(ds, { range, granularity: 'monthly', basis })[0]!.totalMinor;
    const sep = { start: '2026-09-01', end: '2026-09-30' };
    const oct = { start: '2026-10-01', end: '2026-10-31' };
    // the order is September by order date, October by payment date (Ljubljana time)
    expect(total(sep, 'order') - total(sep, 'payment')).toBeGreaterThanOrEqual(amount);
    expect(total(oct, 'payment') - total(oct, 'order')).toBeGreaterThan(0);
  });

  it('refunded revenue is shown but excluded from revenue', () => {
    const so = q.salesOverview(ds, { range: FULL });
    expect(so.statusCounts.refunded.orders).toBeGreaterThan(0);
    expect(so.partition.eligibleRevenueMinor).toBe(so.statusCounts.paid.revenueMinor);
    expect(so.vatRatePercent).toBe(22);
  });
});

describe('showcase queries', () => {
  it('resolves presets without the partial day and clamps custom ranges', () => {
    expect(q.resolveShowcaseRange(ds, 'custom')).toBeNull();
    expect(q.resolveShowcaseRange(ds, 'yearToDate')).toEqual({ start: '2026-01-01', end: '2026-11-10' });
    expect(q.resolveShowcaseRange(ds, 'custom', { start: '2020-01-01', end: '2020-01-31' })).toBeNull();
    expect(q.resolveShowcaseRange(ds, 'custom', { start: '2020-01-01', end: '2025-10-05' })!.start).toBe('2025-10-01');
  });

  it('computes ratios from sums, not averages of daily ratios', () => {
    const range = { start: '2026-08-01', end: '2026-08-31' };
    const t = q.performanceTotals(ds, 'meta', range);
    const rows = ds.daily.filter((r) => r.platform === 'meta' && r.date >= range.start && r.date <= range.end);
    const clicks = rows.reduce((a, r) => a + r.clicks, 0);
    const imps = rows.reduce((a, r) => a + r.impressions, 0);
    const spend = rows.reduce((a, r) => a + r.spendMinor, 0);
    expect(t.ctr).toBe(clicks / imps);
    expect(t.cpcMinor).toBe(Math.round(spend / clicks));
    const dailyCtr = q.metricSeries(ds, { metric: 'ctr', range, granularity: 'daily' }).map((p) => p.meta!);
    expect(t.ctr).not.toBe(dailyCtr.reduce((a, b) => a + b, 0) / dailyCtr.length);
  });

  it('combined equals Meta + Google exactly on complete days', () => {
    for (const p of q.metricSeries(ds, { metric: 'spend', range: FULL, granularity: 'daily' })) {
      if (p.meta !== null && p.google !== null) expect(p.total).toBe(p.meta + p.google);
      else expect(p.total).toBeNull();
    }
    const range = { start: '2026-07-01', end: '2026-07-31' };
    const m = q.performanceTotals(ds, 'meta', range).spendMinor!;
    const g = q.performanceTotals(ds, 'google', range).spendMinor!;
    expect(q.performanceTotals(ds, 'combined', range).spendMinor).toBe(m + g);
  });

  it('daily series summed by calendar month equals the monthly series', () => {
    for (const metric of ['spend', 'clicks', 'leads'] as const) {
      const daily = q.metricSeries(ds, { metric, range: FULL, granularity: 'daily' });
      const monthly = q.metricSeries(ds, { metric, range: FULL, granularity: 'monthly' });
      for (const m of monthly) {
        const days = daily.filter((d) => monthKey(d.key) === m.key);
        const sum = (k: 'meta' | 'google' | 'total') => days.reduce((a, d) => a + (d[k] ?? 0), 0);
        expect(m.meta).toBe(sum('meta'));
        expect(m.google).toBe(sum('google'));
        expect(m.total).toBe(sum('total'));
      }
    }
  });

  it('marks months with gaps or the current month as incomplete', () => {
    const monthly = q.metricSeries(ds, { metric: 'spend', range: { start: '2026-09-01', end: '2026-11-10' }, granularity: 'monthly' });
    expect(monthly.map((m) => m.incomplete)).toEqual([false, true, true]);
    expect(monthly[2]!.label).toBe('Nov 2026');
  });

  it('entity rows add up to platform totals at every level', () => {
    const range = q.resolveShowcaseRange(ds, 'last90')!;
    for (const view of ['meta', 'google'] as const) {
      const total = q.performanceTotals(ds, view, range).spendMinor!;
      for (const level of ['campaign', 'ad_group', 'ad'] as const) {
        const rows = q.entityPerformance(ds, { level, view, range });
        expect(rows.reduce((a, r) => a + (r.current.spendMinor ?? 0), 0)).toBe(total);
      }
    }
  });

  it('entity with no rows has null metrics, not zero', () => {
    const rows = q.entityPerformance(ds, { level: 'campaign', view: 'meta', range: { start: '2025-10-01', end: '2025-10-10' } });
    const c7 = rows.find((r) => r.id === 'meta-c7')!;
    expect(c7.current.spendMinor).toBeNull();
    expect(c7.current.ctr).toBeNull();
    expect(c7.change.spend).toBeNull();
  });

  it('sales partitions reconcile and selected = Meta + Google + Chatbot/AI', () => {
    for (const basis of ['order', 'payment'] as const) {
      const so = q.salesOverview(ds, { range: FULL, basis });
      expect(so.partition.reconciles).toBe(true);
      expect(so.partition.parts.reduce((a, x) => a + x.revenueMinor, 0)).toBe(so.partition.eligibleRevenueMinor);
      const part = (s: string) => so.partition.parts.find((x) => x.source === s)!.revenueMinor;
      expect(so.partition.selected.revenueMinor).toBe(part('meta') + part('google') + part('chatbot_ai'));
    }
  });

  it('monthly sales equal the sum of daily sales', () => {
    const range = { start: '2026-03-01', end: '2026-10-31' };
    const daily = q.salesSeries(ds, { range, granularity: 'daily' });
    const monthly = q.salesSeries(ds, { range, granularity: 'monthly' });
    for (const m of monthly) {
      const days = daily.filter((d) => monthKey(d.key) === m.key);
      expect(m.totalMinor).toBe(days.reduce((a, d) => a + d.totalMinor, 0));
      expect(m.orders).toBe(days.reduce((a, d) => a + d.orders, 0));
      expect(Object.values(m.bySource).reduce((a, b) => a + b, 0)).toBe(m.totalMinor);
    }
  });

  it('ROAS uses only verified revenue; unlinked revenue is not attributed', () => {
    const ao = q.attributionOverview(ds, { range: FULL });
    expect(ao.roas.meta).toBe(ao.verified.meta.revenueMinor / ao.spend.metaMinor!);
    expect(ao.roas.combined).toBe((ao.verified.meta.revenueMinor + ao.verified.google.revenueMinor) / ao.spend.totalMinor!);
    const classified = ao.verified.meta.revenueMinor + ao.verified.google.revenueMinor + ao.sourceOnly.revenueMinor + ao.unknown.revenueMinor + ao.conflict.revenueMinor;
    expect(classified).toBe(ao.paidRevenueMinor);
    expect(ao.labelWithoutEvidence.google.orders).toBeGreaterThan(0);
  });

  it('leads: totals follow the platform filter and monthly equals daily', () => {
    const all = q.leadsOverview(ds, { range: FULL, view: 'combined' });
    expect(q.leadsOverview(ds, { range: FULL, view: 'meta' }).total).toBe(all.byPlatform.meta);
    expect(q.leadsOverview(ds, { range: FULL, view: 'google' }).total).toBe(all.byPlatform.google);
    expect(Object.values(all.byChannel).reduce((a, b) => a + b, 0)).toBe(all.total);
    expect(Object.values(all.byStatus).reduce((a, b) => a + b, 0)).toBe(all.total);
    const daily = q.leadsSeries(ds, { range: FULL, view: 'combined', granularity: 'daily' });
    expect(daily).toHaveLength(enumerateDays(FULL).length);
    expect(daily.reduce((a, d) => a + d.total, 0)).toBe(all.total);
    expect(q.leadsSeries(ds, { range: FULL, view: 'combined', granularity: 'monthly' }).reduce((a, d) => a + d.total, 0)).toBe(all.total);
  });

  it('data source status lists five simulated sources with their gap days', () => {
    const st = q.dataSourceStatus(ds);
    expect(st).toHaveLength(5);
    expect(st.every((s) => s.mode === 'simulated' && s.lastSyncAt === ds.referenceNow)).toBe(true);
    expect(st.find((s) => s.id === 'google')!.issues.map((i) => i.status).sort()).toEqual(['missing', 'partial']);
  });

  it('integrity checks: none fail, PARTIAL always has a category', { timeout: 60_000 }, () => {
    for (const range of [FULL, q.resolveShowcaseRange(ds, 'last7')!, q.resolveShowcaseRange(ds, 'previousMonth')!]) {
      const checks = q.integrityChecks(ds, range);
      expect(checks.length).toBeGreaterThanOrEqual(15);
      expect(checks.filter((c) => c.status === 'FAIL')).toEqual([]);
      for (const c of checks) expect(c.status === 'PARTIAL' ? !!c.category : c.category === undefined).toBe(true);
      expect(new Set(checks.map((c) => c.id)).size).toBe(checks.length);
    }
  });
});
