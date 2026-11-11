// Independent reference implementation for the Sedem Ads showcase. Not production source.
//
// Sales-source partition. Every eligible (paid) order lands in exactly ONE source, so the parts
// sum to the eligible total. The "selected sources" subtotal is a derived subset of the parts,
// not an additional part, and must never be added on top of them.

import { type DateRange, calendarDateInZone, inRange } from './dates.js';

export type OrderStatus = 'paid' | 'unpaid' | 'cancelled' | 'refunded';

export interface Order {
  id: string;
  status: OrderStatus;
  /** UTC instant, ISO 8601. */
  orderedAt: string;
  /** UTC instant of payment, if known. */
  paidAt?: string | null;
  amountMinor: number;
  /** One of the configured source keys. Unrecognised keys are counted as unknown. */
  source: string;
}

export const DEFAULT_SOURCES = [
  'meta',
  'google',
  'chatbot_ai',
  'partner_portal',
  'other_verified',
  'unknown',
  'conflicting',
] as const;

export const DEFAULT_SELECTED_SOURCES = ['meta', 'google', 'chatbot_ai'] as const;

export type DateBasis = 'order' | 'payment';

export interface PartitionOptions {
  range: DateRange;
  timeZone: string;
  /** Which date places an order in the period. Default 'order'. */
  basis?: DateBasis;
  /** Configurable partition keys. Must contain `fallbackSource`. */
  sources?: readonly string[];
  /** Subset reported as a subtotal. Default meta + google + chatbot_ai. */
  selected?: readonly string[];
  /** Where orders with an unrecognised source go. Default 'unknown'. */
  fallbackSource?: string;
}

export interface SourcePart {
  source: string;
  orders: number;
  revenueMinor: number;
}

export interface SourcePartition {
  basis: DateBasis;
  range: DateRange;
  eligibleOrders: number;
  eligibleRevenueMinor: number;
  parts: SourcePart[];
  /** parts sum exactly to the eligible totals (orders and revenue). */
  reconciles: boolean;
  /** Derived subset. NOT an extra part. */
  selected: { sources: string[]; orders: number; revenueMinor: number };
  /** Why orders were left out, so exclusions are visible rather than silent. */
  excluded: {
    duplicateIds: number;
    /** Paid orders without a payment time, under the payment-date basis. */
    missingPaymentDate: number;
    /** Orders in the period (by order date) that are not paid. */
    notPaid: number;
  };
  /** Orders whose source key was not configured and were moved to the fallback. */
  remappedToFallback: number;
}

export function partitionOrders(orders: readonly Order[], options: PartitionOptions): SourcePartition {
  const basis = options.basis ?? 'order';
  const sources = [...(options.sources ?? DEFAULT_SOURCES)];
  const fallback = options.fallbackSource ?? 'unknown';
  const selected = [...(options.selected ?? DEFAULT_SELECTED_SOURCES)];
  if (!sources.includes(fallback)) throw new Error(`Fallback source "${fallback}" must be one of the configured sources`);
  for (const s of selected) {
    if (!sources.includes(s)) throw new Error(`Selected source "${s}" is not a configured source`);
  }
  if (new Set(sources).size !== sources.length) throw new Error('Duplicate source keys');

  const parts = new Map<string, SourcePart>(sources.map((s) => [s, { source: s, orders: 0, revenueMinor: 0 }]));
  const seen = new Set<string>();
  const excluded = { duplicateIds: 0, missingPaymentDate: 0, notPaid: 0 };
  let remapped = 0;
  let eligibleOrders = 0;
  let eligibleRevenue = 0;

  for (const o of orders) {
    if (seen.has(o.id)) {
      excluded.duplicateIds += 1;
      continue;
    }
    seen.add(o.id);
    if (!Number.isSafeInteger(o.amountMinor)) throw new RangeError(`Order ${o.id}: amountMinor must be an integer`);

    const orderDay = calendarDateInZone(o.orderedAt, options.timeZone);
    if (o.status !== 'paid') {
      // Non-paid orders are never revenue. They are only counted for transparency.
      if (inRange(orderDay, options.range)) excluded.notPaid += 1;
      continue;
    }
    let day: string;
    if (basis === 'payment') {
      if (!o.paidAt) {
        excluded.missingPaymentDate += 1;
        continue; // the order date does NOT stand in for a missing payment date
      }
      day = calendarDateInZone(o.paidAt, options.timeZone);
    } else {
      day = orderDay;
    }
    if (!inRange(day, options.range)) continue;

    let key = o.source;
    if (!parts.has(key)) {
      key = fallback;
      remapped += 1;
    }
    const part = parts.get(key)!;
    part.orders += 1;
    part.revenueMinor += o.amountMinor;
    eligibleOrders += 1;
    eligibleRevenue += o.amountMinor;
  }

  const list = [...parts.values()];
  const sumOrders = list.reduce((a, p) => a + p.orders, 0);
  const sumRevenue = list.reduce((a, p) => a + p.revenueMinor, 0);
  const sel = list.filter((p) => selected.includes(p.source));
  return {
    basis,
    range: options.range,
    eligibleOrders,
    eligibleRevenueMinor: eligibleRevenue,
    parts: list,
    reconciles: sumOrders === eligibleOrders && sumRevenue === eligibleRevenue,
    selected: {
      sources: selected,
      orders: sel.reduce((a, p) => a + p.orders, 0),
      revenueMinor: sel.reduce((a, p) => a + p.revenueMinor, 0),
    },
    excluded,
    remappedToFallback: remapped,
  };
}

export type SurplusFlag = 'not_accounting_profit' | 'vat_basis_mismatch' | 'spend_missing' | 'revenue_missing';

export interface SourceSurplus {
  surplusMinor: number | null;
  flags: SurplusFlag[];
}

/**
 * Source surplus = revenue of the selected sources - (meta spend + google spend).
 *
 * This is NOT accounting profit. It ignores staff, tooling, payment fees, refunds after the
 * period, taxes and every cost that is not ad spend. It also mixes bases when revenue is gross
 * (VAT included) and platform spend is net (VAT excluded): the `vat_basis_mismatch` flag is
 * always present unless the caller states that revenue was already converted to net.
 * Returns null (never 0) if revenue or either spend figure is missing.
 */
export function sourceSurplus(
  selectedRevenueMinor: number | null,
  metaSpendMinor: number | null,
  googleSpendMinor: number | null,
  options: { revenueIsNetOfVat?: boolean } = {},
): SourceSurplus {
  const flags: SurplusFlag[] = ['not_accounting_profit'];
  if (!options.revenueIsNetOfVat) flags.push('vat_basis_mismatch');
  if (selectedRevenueMinor === null) flags.push('revenue_missing');
  if (metaSpendMinor === null || googleSpendMinor === null) flags.push('spend_missing');
  if (selectedRevenueMinor === null || metaSpendMinor === null || googleSpendMinor === null) {
    return { surplusMinor: null, flags };
  }
  return { surplusMinor: selectedRevenueMinor - (metaSpendMinor + googleSpendMinor), flags };
}
