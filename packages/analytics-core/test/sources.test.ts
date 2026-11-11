// Independent reference implementation for the Sedem Ads showcase. Not production source.
import { describe, expect, it } from 'vitest';
import { type Order, partitionOrders, sourceSurplus } from '../src/index.js';

const TZ = 'Europe/Ljubljana';
const range = { start: '2025-03-01', end: '2025-03-31' };

function order(id: string, source: string, amountMinor: number, orderedAt: string, extra: Partial<Order> = {}): Order {
  return { id, status: 'paid', orderedAt, amountMinor, source, ...extra };
}

const orders: Order[] = [
  order('o1', 'meta', 10000, '2025-03-05T10:00:00Z'),
  order('o2', 'google', 20000, '2025-03-06T10:00:00Z'),
  order('o3', 'chatbot_ai', 3000, '2025-03-07T10:00:00Z'),
  order('o4', 'partner_portal', 5000, '2025-03-08T10:00:00Z'),
  order('o5', 'unknown', 700, '2025-03-09T10:00:00Z'),
  order('o6', 'meta', 1000, '2025-03-10T10:00:00Z', { status: 'refunded' }),
  order('o7', 'meta', 1000, '2025-03-10T10:00:00Z', { status: 'unpaid' }),
  order('o8', 'meta', 99900, '2025-04-02T10:00:00Z'), // outside range
];

describe('sales source partition', () => {
  const p = partitionOrders(orders, { range, timeZone: TZ });

  it('parts add up exactly to the eligible total', () => {
    expect(p.eligibleOrders).toBe(5);
    expect(p.eligibleRevenueMinor).toBe(38700);
    expect(p.parts.reduce((a, x) => a + x.revenueMinor, 0)).toBe(p.eligibleRevenueMinor);
    expect(p.reconciles).toBe(true);
  });

  it('only paid orders are revenue; the others are counted as excluded', () => {
    expect(p.excluded.notPaid).toBe(2);
  });

  it('the selected subtotal is a subset, not an extra part', () => {
    expect(p.selected.revenueMinor).toBe(33000);
    expect(p.selected.orders).toBe(3);
    const withSubtotalAdded = p.parts.reduce((a, x) => a + x.revenueMinor, 0) + p.selected.revenueMinor;
    expect(withSubtotalAdded).not.toBe(p.eligibleRevenueMinor);
  });

  it('unrecognised source keys fall back to unknown and stay reconciled', () => {
    const q = partitionOrders([...orders, order('o9', 'weird-source', 400, '2025-03-11T10:00:00Z')], { range, timeZone: TZ });
    expect(q.remappedToFallback).toBe(1);
    expect(q.parts.find((x) => x.source === 'unknown')!.revenueMinor).toBe(1100);
    expect(q.reconciles).toBe(true);
  });

  it('duplicate order ids are counted once', () => {
    const q = partitionOrders([...orders, orders[0]!], { range, timeZone: TZ });
    expect(q.excluded.duplicateIds).toBe(1);
    expect(q.eligibleRevenueMinor).toBe(p.eligibleRevenueMinor);
  });

  it('places orders by the account day: 23:30 UTC on 31 March is already 1 April in Ljubljana', () => {
    const edge = [order('e1', 'meta', 500, '2025-03-31T22:30:00Z')];
    expect(partitionOrders(edge, { range, timeZone: TZ }).eligibleOrders).toBe(0);
    expect(partitionOrders(edge, { range, timeZone: 'UTC' }).eligibleOrders).toBe(1);
  });

  it('payment basis uses the payment date and never falls back to the order date', () => {
    const o = [
      order('p1', 'meta', 100, '2025-02-28T10:00:00Z', { paidAt: '2025-03-02T10:00:00Z' }),
      order('p2', 'meta', 200, '2025-03-03T10:00:00Z', { paidAt: null }),
      order('p3', 'meta', 400, '2025-03-04T10:00:00Z', { paidAt: '2025-04-01T10:00:00Z' }),
    ];
    const byPayment = partitionOrders(o, { range, timeZone: TZ, basis: 'payment' });
    expect(byPayment.eligibleRevenueMinor).toBe(100);
    expect(byPayment.excluded.missingPaymentDate).toBe(1);
    expect(partitionOrders(o, { range, timeZone: TZ, basis: 'order' }).eligibleRevenueMinor).toBe(600);
  });

  it('validates configuration', () => {
    expect(() => partitionOrders(orders, { range, timeZone: TZ, sources: ['meta'], fallbackSource: 'unknown' })).toThrow();
    expect(() => partitionOrders(orders, { range, timeZone: TZ, selected: ['nope'] })).toThrow();
  });

  it('rejects fractional amounts instead of rounding them', () => {
    expect(() => partitionOrders([order('f', 'meta', 10.5, '2025-03-05T10:00:00Z')], { range, timeZone: TZ })).toThrow(RangeError);
  });

  it('an empty period reconciles at zero orders, which is a real zero for orders', () => {
    const q = partitionOrders([], { range, timeZone: TZ });
    expect(q.eligibleOrders).toBe(0);
    expect(q.reconciles).toBe(true);
  });
});

describe('source surplus', () => {
  it('is selected revenue minus Meta and Google spend, always flagged as not profit', () => {
    const s = sourceSurplus(33000, 10000, 5000, { revenueIsNetOfVat: true });
    expect(s.surplusMinor).toBe(18000);
    expect(s.flags).toContain('not_accounting_profit');
    expect(s.flags).not.toContain('vat_basis_mismatch');
  });

  it('flags a VAT basis mismatch unless the revenue is stated to be net', () => {
    expect(sourceSurplus(33000, 10000, 5000).flags).toContain('vat_basis_mismatch');
  });

  it('negative surplus is a real value', () => {
    expect(sourceSurplus(1000, 10000, 5000).surplusMinor).toBe(-14000);
  });

  it('is null, never 0, when anything is missing', () => {
    expect(sourceSurplus(null, 1, 1).surplusMinor).toBeNull();
    expect(sourceSurplus(1, null, 1).flags).toContain('spend_missing');
    expect(sourceSurplus(1, 1, null).surplusMinor).toBeNull();
    expect(sourceSurplus(null, 1, 1).flags).toContain('revenue_missing');
  });
});
