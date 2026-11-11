// Independent reference implementation for the Sedem Ads showcase. Not production source.
//
// Fictional CRM for the demo: leads, customers and orders derived from the (true) ad rows.
// Everything is generated from a seeded stream. Customers are numbered ("Customer #0042"); no
// names, emails or phone numbers exist anywhere in the data.

import { type Evidence, classifyOrder, sourceFromAttribution, DEFAULT_LABEL_MAP } from '../attribution.js';
import { type ISODate, calendarDateInZone, enumerateDays } from '../dates.js';
import type { OrderStatus } from '../sources.js';
import type { AdDailyRow } from '../synthetic/generate.js';
import type { Rand } from './rng.js';
import type { CampaignSpec } from './structure.js';
import type { CustomerSourceKey, LeadChannel, LeadStatus, ShowcaseAd, ShowcaseCustomer, ShowcaseLead, ShowcaseOrder } from './types.js';

const MIN = 60_000;
const DAY = 86_400_000;

const PRODUCTS = [
  { name: 'Quick answer', price: 2900, weight: 0.15 },
  { name: 'Document template pack', price: 4900, weight: 0.25 },
  { name: 'Contract review', price: 8900, weight: 0.25 },
  { name: 'Lease review', price: 6900, weight: 0.1 },
  { name: 'Family law consultation', price: 12900, weight: 0.15 },
  { name: 'Business setup package', price: 24900, weight: 0.1 },
];

const CONVERSION: Record<LeadChannel, number> = {
  meta_lead_form: 0.2,
  google_lead_form: 0.26,
  chatbot_ai: 0.3,
  partner_portal: 0.45,
  website_form: 0.18,
  phone: 0.35,
};

const SEASON = [1.2, 1.05, 1.0, 0.95, 0.95, 0.9, 0.85, 0.85, 1.2, 1.05, 1.0, 0.75];
const WEEKDAY = [0.7, 1.1, 1.1, 1.05, 1.05, 0.95, 0.75];

const ORGANIC: { channel: LeadChannel; lambda: number }[] = [
  { channel: 'chatbot_ai', lambda: 1.6 },
  { channel: 'partner_portal', lambda: 0.7 },
  { channel: 'website_form', lambda: 1.3 },
  { channel: 'phone', lambda: 0.3 },
];

/** Planted CRM orders (fixed instants). */
export const PLANTED_LABEL_ONLY = { orderedAt: '2026-10-27T09:12:00.000Z', paidAt: '2026-10-27T09:40:00.000Z', amountMinor: 8900 } as const;
export const PLANTED_CONFLICT = { orderedAt: '2026-10-22T10:05:00.000Z', amountMinor: 12900 } as const;
export const PLANTED_CROSS_MONTH = { orderedAt: '2026-09-30T20:30:00.000Z', paidAt: '2026-10-01T08:15:00.000Z', amountMinor: 4900 } as const;

interface LeadDraft {
  createdMs: number;
  platform: 'meta' | 'google' | null;
  campaignId: string | null;
  adGroupId: string | null;
  adId: string | null;
  channel: LeadChannel;
  id: string;
  platformLeadId: string | null;
  status: LeadStatus;
  customer: CustomerDraft | null;
}

interface CustomerDraft {
  firstSeenMs: number;
  label: string;
  tie: number;
  id: string;
  paidOrders: OrderDraft[];
}

interface OrderDraft {
  orderedMs: number;
  status: OrderStatus;
  paidMs: number | null;
  refundedMs: number | null;
  cancelledMs: number | null;
  amountMinor: number;
  product: string;
  evidence: Evidence[];
  customer: CustomerDraft;
  lead: LeadDraft | null;
  tie: number;
  planted?: 'labelOnly' | 'conflict' | 'crossMonth';
}

export interface CrmResult {
  leads: ShowcaseLead[];
  customers: ShowcaseCustomer[];
  orders: ShowcaseOrder[];
  planted: {
    labelOnlyGoogleOrderId: string;
    conflictOrderId: string;
    crossMonthPaidLaterOrderId: string;
    refundedOrderId: string;
    cancelledOrderId: string;
    unpaidOrderId: string;
    paidLaterOrderId: string;
  };
}

const iso = (ms: number): string => new Date(ms).toISOString();
const dayMs = (date: ISODate): number => Date.parse(`${date}T00:00:00.000Z`);
const pad = (n: number, w: number): string => String(n).padStart(w, '0');

export function buildCrm(input: {
  rand: Rand;
  /** TRUE rows (before gap days are removed): leads come from these. */
  rows: readonly AdDailyRow[];
  ads: readonly ShowcaseAd[];
  specs: readonly CampaignSpec[];
  startDate: ISODate;
  referenceDate: ISODate;
  referenceNow: string;
  timeZone: string;
}): CrmResult {
  const { rand, rows, referenceDate, startDate } = input;
  const nowMs = Date.parse(input.referenceNow);
  const specById = new Map(input.specs.map((s) => [s.id, s]));

  const hourFor = (date: ISODate): number => (date === referenceDate ? rand.int(5, 8) : rand.int(7, 17));
  const instant = (date: ISODate): number => dayMs(date) + hourFor(date) * 60 * MIN + rand.int(0, 59) * MIN + rand.int(0, 59) * 1000;

  // ---- leads ---------------------------------------------------------------------------
  const leadDrafts: LeadDraft[] = [];
  for (const row of rows) {
    for (let i = 0; i < row.leads; i++) {
      leadDrafts.push({
        createdMs: instant(row.date),
        platform: row.platform,
        campaignId: row.campaignId,
        adGroupId: row.adGroupId,
        adId: row.adId,
        channel: row.platform === 'meta' ? 'meta_lead_form' : 'google_lead_form',
        id: '',
        platformLeadId: null,
        status: 'new',
        customer: null,
      });
    }
  }
  for (const date of enumerateDays({ start: startDate, end: referenceDate })) {
    const month = Number(date.slice(5, 7)) - 1;
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
    const volume = date === referenceDate ? 0.45 : 1;
    for (const o of ORGANIC) {
      const n = rand.poisson(o.lambda * Math.sqrt(SEASON[month]!) * WEEKDAY[weekday]! * volume);
      for (let i = 0; i < n; i++) {
        leadDrafts.push({
          createdMs: instant(date), platform: null, campaignId: null, adGroupId: null, adId: null,
          channel: o.channel, id: '', platformLeadId: null, status: 'new', customer: null,
        });
      }
    }
  }
  leadDrafts.sort((a, b) => a.createdMs - b.createdMs);
  leadDrafts.forEach((l, i) => {
    l.id = `LD-${pad(i + 1, 6)}`;
    if (l.platform) l.platformLeadId = `PL-${pad(i + 1, 6)}`;
  });

  // ---- orders --------------------------------------------------------------------------
  const customers: CustomerDraft[] = [];
  const orders: OrderDraft[] = [];
  let tie = 0;
  const newCustomer = (firstSeenMs: number, label: string): CustomerDraft => {
    const c: CustomerDraft = { firstSeenMs, label, tie: tie++, id: '', paidOrders: [] };
    customers.push(c);
    return c;
  };
  const pickProduct = (): { name: string; price: number } => rand.weighted(PRODUCTS, PRODUCTS.map((p) => p.weight));

  const finalize = (orderedMs: number): Pick<OrderDraft, 'status' | 'paidMs' | 'refundedMs' | 'cancelledMs'> => {
    let status = rand.weighted<OrderStatus>(['paid', 'unpaid', 'cancelled', 'refunded'], [0.74, 0.1, 0.06, 0.1]);
    let paidMs: number | null = null;
    let refundedMs: number | null = null;
    let cancelledMs: number | null = null;
    if (status === 'paid' || status === 'refunded') {
      paidMs = orderedMs + (rand.chance(0.7) ? rand.int(3, 90) * MIN : rand.int(1, 3) * DAY + rand.int(0, 600) * MIN);
      if (paidMs > nowMs) {
        status = 'unpaid';
        paidMs = null;
      } else if (status === 'refunded') {
        refundedMs = paidMs + rand.int(2, 20) * DAY;
        if (refundedMs > nowMs) {
          status = 'paid';
          refundedMs = null;
        }
      }
    } else if (status === 'cancelled') {
      cancelledMs = orderedMs + rand.int(1, 5) * DAY;
      if (cancelledMs > nowMs) {
        status = 'unpaid';
        cancelledMs = null;
      }
    }
    return { status, paidMs, refundedMs, cancelledMs };
  };

  const addOrder = (customer: CustomerDraft, lead: LeadDraft | null, orderedMs: number, evidence: Evidence[], product?: { name: string; price: number }): OrderDraft => {
    const p = product ?? pickProduct();
    const o: OrderDraft = {
      orderedMs, ...finalize(orderedMs), amountMinor: p.price, product: p.name, evidence, customer, lead, tie: tie++,
    };
    orders.push(o);
    if (o.status === 'paid') customer.paidOrders.push(o);
    return o;
  };

  for (const lead of leadDrafts) {
    const spec = lead.campaignId ? specById.get(lead.campaignId) : undefined;
    const p = Math.min(0.7, CONVERSION[lead.channel] * (spec?.leadQuality ?? 1));
    let converted = false;
    if (rand.chance(p)) {
      const delay = rand.int(0, 10);
      const orderedMs = lead.createdMs + (delay * 1440 + rand.int(20, 400)) * MIN;
      if (orderedMs <= nowMs) {
        converted = true;
        const evidence: Evidence[] = [];
        let label = '';
        const n = lead.id.slice(3);
        if (lead.channel === 'meta_lead_form') {
          if (rand.chance(0.72)) {
            evidence.push({ kind: 'verified_lead_match', platform: 'meta', orderLeadId: lead.platformLeadId!, platformLeadId: lead.platformLeadId!, campaignId: lead.campaignId! });
            label = 'Facebook';
            if (rand.chance(0.012)) evidence.push({ kind: 'click_id', platform: 'google', clickIdType: 'gclid', clickId: `demo-gclid-x${n}` });
          } else if (rand.chance(0.55)) label = 'Facebook';
          if (rand.chance(0.08)) evidence.push({ kind: 'platform_reported', platform: 'meta', reportedConversions: 1 });
        } else if (lead.channel === 'google_lead_form') {
          if (rand.chance(0.55)) {
            evidence.push({ kind: 'click_id', platform: 'google', clickIdType: 'gclid', clickId: `demo-gclid-${n}`, campaignId: lead.campaignId! });
            label = 'Google';
            if (rand.chance(0.012)) evidence.push({ kind: 'click_id', platform: 'meta', clickIdType: 'fbclid', clickId: `demo-fbclid-x${n}` });
          } else if (rand.chance(0.55)) label = 'Google';
        } else if (lead.channel === 'chatbot_ai') label = 'Chatbot';
        else if (lead.channel === 'partner_portal') label = 'Partner portal';
        else if (lead.channel === 'website_form') label = rand.chance(0.5) ? 'Direct' : '';
        else label = rand.chance(0.4) ? 'Referral' : '';
        if (label) evidence.push({ kind: 'source_label', label });
        const customer = newCustomer(lead.createdMs, label);
        lead.customer = customer;
        lead.status = 'converted';
        addOrder(customer, lead, orderedMs, evidence);
      }
    }
    if (!converted) {
      const age = (nowMs - lead.createdMs) / DAY;
      lead.status = rand.weighted<LeadStatus>(
        ['new', 'contacted', 'qualified', 'lost'],
        age < 3 ? [0.5, 0.3, 0.17, 0.03] : age < 10 ? [0.1, 0.3, 0.3, 0.3] : [0.02, 0.18, 0.2, 0.6],
      );
    }
  }

  // Direct purchases from the Meta SALES campaign (no lead form): click id on the order.
  for (const row of rows) {
    if (row.campaignId !== 'meta-c5') continue;
    const n = rand.stochastic(row.platformConversions * 0.55);
    for (let i = 0; i < n; i++) {
      const orderedMs = instant(row.date);
      const evidence: Evidence[] = [];
      let label = '';
      if (rand.chance(0.45)) {
        evidence.push({ kind: 'click_id', platform: 'meta', clickIdType: 'fbclid', clickId: `demo-fbclid-${row.date}-${i}`, campaignId: 'meta-c5' });
        label = 'Facebook';
      } else if (rand.chance(0.5)) label = 'Facebook';
      if (label) evidence.push({ kind: 'source_label', label });
      addOrder(newCustomer(orderedMs, label), null, orderedMs, evidence, { name: 'Document template pack', price: 4900 });
    }
  }

  // Walk-in customers (direct or unlabeled).
  for (const date of enumerateDays({ start: startDate, end: referenceDate })) {
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
    const n = rand.poisson(0.7 * WEEKDAY[weekday]! * (date === referenceDate ? 0.45 : 1));
    for (let i = 0; i < n; i++) {
      const orderedMs = instant(date);
      const label = rand.weighted(['Direct', '', 'Referral', ''], [0.35, 0.35, 0.15, 0.15]);
      addOrder(newCustomer(orderedMs, label), null, orderedMs, label ? [{ kind: 'source_label', label }] : []);
    }
  }

  // Repeat orders: ~10% of customers with a paid order buy again 20-150 days later (label only).
  for (const c of [...customers]) {
    const first = c.paidOrders[0];
    if (!first || !rand.chance(0.1)) continue;
    const orderedMs = first.orderedMs + rand.int(20, 150) * DAY + rand.int(0, 600) * MIN;
    if (orderedMs > nowMs) continue;
    addOrder(c, null, orderedMs, c.label ? [{ kind: 'source_label', label: c.label }] : []);
  }

  // ---- planted orders ------------------------------------------------------------------
  const plantedLabel = newCustomer(Date.parse(PLANTED_LABEL_ONLY.orderedAt), 'Google');
  const labelOrder = addOrder(plantedLabel, null, Date.parse(PLANTED_LABEL_ONLY.orderedAt), [{ kind: 'source_label', label: 'Google' }], { name: 'Contract review', price: PLANTED_LABEL_ONLY.amountMinor });
  Object.assign(labelOrder, { status: 'paid', paidMs: Date.parse(PLANTED_LABEL_ONLY.paidAt), refundedMs: null, cancelledMs: null, planted: 'labelOnly' });
  if (!plantedLabel.paidOrders.includes(labelOrder)) plantedLabel.paidOrders.push(labelOrder);

  // Conflict: a REAL Meta lead (verified id match) whose order also carries a gclid.
  const conflictMs = Date.parse(PLANTED_CONFLICT.orderedAt);
  let conflictLead: LeadDraft | undefined;
  for (let i = leadDrafts.length - 1; i >= 0; i--) {
    const l = leadDrafts[i]!;
    if (l.channel === 'meta_lead_form' && l.customer === null && l.createdMs < conflictMs - 2 * DAY && l.createdMs > conflictMs - 6 * DAY) {
      conflictLead = l;
      break;
    }
  }
  if (!conflictLead) throw new Error('showcase generator: no Meta lead available for the planted conflict order');
  const conflictCustomer = newCustomer(conflictLead.createdMs, 'Facebook');
  conflictLead.customer = conflictCustomer;
  conflictLead.status = 'converted';
  const conflictOrder = addOrder(
    conflictCustomer, conflictLead, conflictMs,
    [
      { kind: 'verified_lead_match', platform: 'meta', orderLeadId: conflictLead.platformLeadId!, platformLeadId: conflictLead.platformLeadId!, campaignId: conflictLead.campaignId! },
      { kind: 'click_id', platform: 'google', clickIdType: 'gclid', clickId: 'demo-gclid-conflict' },
      { kind: 'source_label', label: 'Facebook' },
    ],
    { name: 'Family law consultation', price: PLANTED_CONFLICT.amountMinor },
  );
  Object.assign(conflictOrder, { status: 'paid', paidMs: conflictMs + 25 * MIN, refundedMs: null, cancelledMs: null, planted: 'conflict' });
  if (!conflictCustomer.paidOrders.includes(conflictOrder)) conflictCustomer.paidOrders.push(conflictOrder);

  const crossCustomer = newCustomer(Date.parse(PLANTED_CROSS_MONTH.orderedAt), 'Direct');
  const crossOrder = addOrder(crossCustomer, null, Date.parse(PLANTED_CROSS_MONTH.orderedAt), [{ kind: 'source_label', label: 'Direct' }], { name: 'Document template pack', price: PLANTED_CROSS_MONTH.amountMinor });
  Object.assign(crossOrder, { status: 'paid', paidMs: Date.parse(PLANTED_CROSS_MONTH.paidAt), refundedMs: null, cancelledMs: null, planted: 'crossMonth' });

  // ---- ids -----------------------------------------------------------------------------
  orders.sort((a, b) => a.orderedMs - b.orderedMs || a.tie - b.tie);
  customers.sort((a, b) => a.firstSeenMs - b.firstSeenMs || a.tie - b.tie);
  customers.forEach((c, i) => {
    c.id = `CUS-${pad(i + 1, 4)}`;
  });

  const customerOut: ShowcaseCustomer[] = customers.map((c) => ({
    id: c.id,
    displayName: `Customer #${c.id.slice(4)}`,
    firstSeenAt: iso(c.firstSeenMs),
    sourceLabel: c.label,
    source: ((DEFAULT_LABEL_MAP[c.label.trim().toLowerCase()] ?? 'unknown') as CustomerSourceKey),
  }));

  const orderOut: ShowcaseOrder[] = orders.map((o, i) => {
    const base = {
      id: `ORD-${pad(i + 1, 6)}`,
      status: o.status,
      orderedAt: iso(o.orderedMs),
      paidAt: o.paidMs === null ? null : iso(o.paidMs),
      amountMinor: o.amountMinor,
      source: 'unknown',
      evidence: o.evidence,
      customerId: o.customer.id,
      product: o.product,
      leadId: o.lead ? o.lead.id : null,
      refundedAt: o.refundedMs === null ? null : iso(o.refundedMs),
      cancelledAt: o.cancelledMs === null ? null : iso(o.cancelledMs),
    };
    return { ...base, source: sourceFromAttribution(classifyOrder(base)) };
  });
  const idOf = new Map(orders.map((o, i) => [o, orderOut[i]!.id]));

  const leadsOut: ShowcaseLead[] = leadDrafts.map((l) => ({
    id: l.id,
    createdAt: iso(l.createdMs),
    platform: l.platform,
    campaignId: l.campaignId,
    adGroupId: l.adGroupId,
    adId: l.adId,
    channel: l.channel,
    status: l.status,
    customerId: l.customer ? l.customer.id : null,
    platformLeadId: l.platformLeadId,
  }));

  // ---- planted examples for the status cases ------------------------------------------
  const recent = (o: ShowcaseOrder): boolean => o.orderedAt >= '2026-10-01T00:00:00.000Z' && o.orderedAt <= '2026-11-05T00:00:00.000Z';
  const firstWhere = (pred: (o: ShowcaseOrder) => boolean): string => {
    const found = orderOut.find((o) => recent(o) && pred(o));
    if (!found) throw new Error('showcase generator: missing planted status example');
    return found.id;
  };
  const planted = {
    labelOnlyGoogleOrderId: idOf.get(labelOrder)!,
    conflictOrderId: idOf.get(conflictOrder)!,
    crossMonthPaidLaterOrderId: idOf.get(crossOrder)!,
    refundedOrderId: firstWhere((o) => o.status === 'refunded'),
    cancelledOrderId: firstWhere((o) => o.status === 'cancelled'),
    unpaidOrderId: firstWhere((o) => o.status === 'unpaid'),
    paidLaterOrderId: firstWhere(
      (o) => o.status === 'paid' && !!o.paidAt && calendarDateInZone(o.paidAt, input.timeZone) > calendarDateInZone(o.orderedAt, input.timeZone) && o.leadId !== null,
    ),
  };
  return { leads: leadsOut, customers: customerOut, orders: orderOut, planted };
}
