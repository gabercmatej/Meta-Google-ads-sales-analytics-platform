// Figures for the Combined overview. One pure function feeds the page and the reconciliation tests,
// so the numbers shown and the numbers checked are the same ones.
import { attributionOverview, performanceTotals, salesOverview, type DateRange, type ShowcaseDataset } from '@sedem-ads/analytics-core';

/** Display groups. "Unknown / unattributed" folds in conflicting-evidence orders so the groups still reconcile. */
export const SOURCE_GROUPS = ['meta', 'google', 'partner_portal', 'chatbot_ai', 'other_verified', 'unattributed'] as const;
export type SourceGroup = (typeof SOURCE_GROUPS)[number];

export const GROUP_LABEL: Record<SourceGroup, string> = {
  meta: 'Meta',
  google: 'Google',
  partner_portal: 'Partner portal',
  chatbot_ai: 'Chatbot/AI',
  other_verified: 'Other verified sources',
  unattributed: 'Unknown/unattributed',
};

export interface GroupPart {
  group: SourceGroup;
  orders: number;
  revenueMinor: number;
}

export interface CombinedFigures {
  range: DateRange;
  spend: { metaMinor: number | null; googleMinor: number | null; totalMinor: number | null; completeDays: number; expectedDays: number; metaDays: number; googleDays: number };
  paidOrders: number;
  paidRevenueMinor: number;
  groups: GroupPart[];
  /** Meta + Google + Chatbot/AI. A subset of the groups, never an extra part. */
  selected: { orders: number; revenueMinor: number };
  verified: { meta: { orders: number; revenueMinor: number }; google: { orders: number; revenueMinor: number } };
  roas: { meta: number | null; google: number | null; combined: number | null };
  surplusMinor: number | null;
  costPerCustomerMinor: number | null;
  crm: {
    all: { orders: number; revenueMinor: number };
    paid: { orders: number; revenueMinor: number };
    unpaid: { orders: number; revenueMinor: number };
    excluded: { orders: number; revenueMinor: number };
    paidByPayment: { orders: number; revenueMinor: number };
  };
  reconciles: boolean;
}

export function combinedFigures(ds: ShowcaseDataset, range: DateRange): CombinedFigures {
  const attr = attributionOverview(ds, { range });
  const sales = salesOverview(ds, { range });
  const byPayment = salesOverview(ds, { range, basis: 'payment' });
  const meta = performanceTotals(ds, 'meta', range);
  const google = performanceTotals(ds, 'google', range);
  const total = performanceTotals(ds, 'combined', range);
  const part = sales.partition;

  const groups: GroupPart[] = SOURCE_GROUPS.map((group) => ({ group, orders: 0, revenueMinor: 0 }));
  for (const p of part.parts) {
    const key: SourceGroup = p.source === 'unknown' || p.source === 'conflicting' ? 'unattributed' : (p.source as SourceGroup);
    const g = groups.find((x) => x.group === key);
    if (!g) continue;
    g.orders += p.orders;
    g.revenueMinor += p.revenueMinor;
  }
  const sc = sales.statusCounts;
  const verifiedOrders = attr.verified.meta.orders + attr.verified.google.orders;
  return {
    range,
    spend: {
      metaMinor: attr.spend.metaMinor,
      googleMinor: attr.spend.googleMinor,
      totalMinor: attr.spend.totalMinor,
      completeDays: total.completeDays,
      expectedDays: total.expectedDays,
      metaDays: meta.completeDays,
      googleDays: google.completeDays,
    },
    paidOrders: part.eligibleOrders,
    paidRevenueMinor: part.eligibleRevenueMinor,
    groups,
    selected: { orders: part.selected.orders, revenueMinor: part.selected.revenueMinor },
    verified: { meta: attr.verified.meta, google: attr.verified.google },
    roas: attr.roas,
    surplusMinor: attr.surplusMinor,
    costPerCustomerMinor: attr.spend.totalMinor !== null && verifiedOrders > 0 ? Math.round(attr.spend.totalMinor / verifiedOrders) : null,
    crm: {
      all: {
        orders: sc.paid.orders + sc.unpaid.orders + sc.cancelled.orders + sc.refunded.orders,
        revenueMinor: sc.paid.revenueMinor + sc.unpaid.revenueMinor + sc.cancelled.revenueMinor + sc.refunded.revenueMinor,
      },
      paid: sc.paid,
      unpaid: sc.unpaid,
      excluded: { orders: sc.cancelled.orders + sc.refunded.orders, revenueMinor: sc.cancelled.revenueMinor + sc.refunded.revenueMinor },
      paidByPayment: { orders: byPayment.partition.eligibleOrders, revenueMinor: byPayment.partition.eligibleRevenueMinor },
    },
    reconciles: part.reconciles,
  };
}

export function relChange(cur: number | null | undefined, prev: number | null | undefined): number | null {
  if (cur === null || cur === undefined || prev === null || prev === undefined || prev === 0) return null;
  return ((cur - prev) / Math.abs(prev)) * 100;
}
