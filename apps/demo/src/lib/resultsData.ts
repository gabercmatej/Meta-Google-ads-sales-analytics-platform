// Figures for the Sales, Leads and Attribution pages. Pure functions on top of the showcase queries so
// that the numbers shown and the numbers tested are the same. Nothing here matches an order to an ad by
// name, amount or date: a link exists only where the attribution engine found hard evidence.
import {
  metricSeries,
  periodKey,
  orderAttributionRows,
  salesOverview,
  sourceFromAttribution,
  type AttributionResult,
  type DateRange,
  type Granularity,
  type ShowcaseDataset,
  type ShowcaseLead,
  type ShowcaseOrder,
} from '@sedem-ads/analytics-core';
import type { Workspace } from '../state/AppState';
import { META_SECTIONS } from './overviewData';

export type Basis = 'order' | 'payment';

const dayFormat = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Ljubljana', year: 'numeric', month: '2-digit', day: '2-digit' });
const dayCache = new Map<string, string>();
/** Calendar day in Europe/Ljubljana for a UTC instant. */
export function ljDay(iso: string): string {
  let d = dayCache.get(iso);
  if (d === undefined) {
    d = dayFormat.format(new Date(iso));
    dayCache.set(iso, d);
  }
  return d;
}

export const inDays = (d: string, r: DateRange): boolean => d >= r.start && d <= r.end;
export function orderDayOf(o: ShowcaseOrder, basis: Basis): string {
  return basis === 'payment' && o.paidAt ? ljDay(o.paidAt) : ljDay(o.orderedAt);
}

const ALL_TIME: DateRange = { start: '2000-01-01', end: '2100-12-31' };
const classCache = new WeakMap<ShowcaseDataset, Map<string, AttributionResult>>();
/** Attribution result per order id (every order, any status). */
export function attributionMap(ds: ShowcaseDataset): Map<string, AttributionResult> {
  let m = classCache.get(ds);
  if (!m) {
    m = new Map(orderAttributionRows(ds, { range: ALL_TIME }).map((r) => [r.order.id, r.attribution]));
    classCache.set(ds, m);
  }
  return m;
}

export const keyOfDay = (day: string, g: Granularity): string => (g === 'daily' ? day : periodKey(day, g));
export function skeleton(ds: ShowcaseDataset, range: DateRange, g: Granularity): { key: string; label: string; incomplete: boolean }[] {
  return metricSeries(ds, { metric: 'spend', range, granularity: g }).map((p) => ({ key: p.key, label: p.label, incomplete: p.incomplete }));
}

/** Verified link of an order to a paid platform (lead match or click id of the matching platform). */
export function verifiedPlatform(a: AttributionResult | undefined): 'meta' | 'google' | null {
  return a && a.status === 'attributed_paid_ad' ? a.platform : null;
}
const hasLeadMatch = (a: AttributionResult | undefined): boolean => !!a && a.status === 'attributed_paid_ad' && a.evidence.some((e) => e.kind === 'verified_lead_match');

// ---------------------------------------------------------------------------------------------
// Sales

export interface SalesDay {
  key: string;
  label: string;
  incomplete: boolean;
  allOrders: number;
  paidOrders: number;
  allValue: number;
  paidValue: number;
  linkedOrders: number;
  linkedValue: number;
}

/** Orders per day or month on a date basis. "Linked" = paid orders with verified evidence of `platform`. */
export function salesDays(ds: ShowcaseDataset, range: DateRange, g: Granularity, basis: Basis, platform: Workspace): SalesDay[] {
  const rows = skeleton(ds, range, g).map<SalesDay>((s) => ({ ...s, allOrders: 0, paidOrders: 0, allValue: 0, paidValue: 0, linkedOrders: 0, linkedValue: 0 }));
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const cls = attributionMap(ds);
  for (const o of ds.orders) {
    const day = orderDayOf(o, basis);
    if (!inDays(day, range)) continue;
    const r = byKey.get(keyOfDay(day, g));
    if (!r) continue;
    r.allOrders += 1;
    r.allValue += o.amountMinor;
    if (o.status === 'paid') {
      r.paidOrders += 1;
      r.paidValue += o.amountMinor;
      if (verifiedPlatform(cls.get(o.id)) === platform) {
        r.linkedOrders += 1;
        r.linkedValue += o.amountMinor;
      }
    }
  }
  return rows;
}

export interface ServiceRow {
  service: string;
  allOrders: number;
  paidOrders: number;
  paidValue: number;
  allValue: number;
}

export function servicesBreakdown(ds: ShowcaseDataset, range: DateRange, basis: Basis): ServiceRow[] {
  const m = new Map<string, ServiceRow>();
  for (const o of ds.orders) {
    if (!inDays(orderDayOf(o, basis), range)) continue;
    const r = m.get(o.product) ?? { service: o.product, allOrders: 0, paidOrders: 0, paidValue: 0, allValue: 0 };
    r.allOrders += 1;
    r.allValue += o.amountMinor;
    if (o.status === 'paid') {
      r.paidOrders += 1;
      r.paidValue += o.amountMinor;
    }
    m.set(o.product, r);
  }
  return [...m.values()].sort((a, b) => b.paidValue - a.paidValue);
}

export type OrderStatus = ShowcaseOrder['status'];
export const STATUS_ORDER: readonly OrderStatus[] = ['paid', 'unpaid', 'cancelled', 'refunded'];
export const STATUS_LABEL: Record<OrderStatus, string> = { paid: 'Paid', unpaid: 'Unpaid', cancelled: 'Cancelled', refunded: 'Refunded' };

/** Orders with verified evidence of `platform`, by order status. */
export function linkedByStatus(ds: ShowcaseDataset, range: DateRange, basis: Basis, platform: Workspace): Record<OrderStatus, { orders: number; valueMinor: number }> {
  const out = Object.fromEntries(STATUS_ORDER.map((s) => [s, { orders: 0, valueMinor: 0 }])) as Record<OrderStatus, { orders: number; valueMinor: number }>;
  const cls = attributionMap(ds);
  for (const o of ds.orders) {
    if (!inDays(orderDayOf(o, basis), range) || verifiedPlatform(cls.get(o.id)) !== platform) continue;
    out[o.status].orders += 1;
    out[o.status].valueMinor += o.amountMinor;
  }
  return out;
}

export interface SalesFigures {
  basis: Basis;
  all: { orders: number; valueMinor: number };
  paid: { orders: number; valueMinor: number };
  averagePaidMinor: number | null;
  /** Partition totals; must equal `paid`. */
  partitionPaid: { orders: number; valueMinor: number };
  statuses: Record<OrderStatus, { orders: number; revenueMinor: number }>;
  partition: ReturnType<typeof salesOverview>['partition'];
  vatRatePercent: number;
}

export function salesFigures(ds: ShowcaseDataset, range: DateRange, basis: Basis): SalesFigures {
  const o = salesOverview(ds, { range, basis });
  const sc = o.statusCounts;
  const all = STATUS_ORDER.reduce((a, s) => ({ orders: a.orders + sc[s].orders, valueMinor: a.valueMinor + sc[s].revenueMinor }), { orders: 0, valueMinor: 0 });
  return {
    basis,
    all,
    paid: { orders: sc.paid.orders, valueMinor: sc.paid.revenueMinor },
    averagePaidMinor: o.averageOrderMinor,
    partitionPaid: { orders: o.partition.eligibleOrders, valueMinor: o.partition.eligibleRevenueMinor },
    statuses: sc,
    partition: o.partition,
    vatRatePercent: o.vatRatePercent,
  };
}

// ---------------------------------------------------------------------------------------------
// Leads

export interface LeadCohort {
  leads: ShowcaseLead[];
  /** lead id -> paid orders linked by a verified lead-id match. */
  paidByLead: Map<string, ShowcaseOrder[]>;
}

/** Leads of one platform created in the range (Ljubljana day) and the paid orders verified against them. */
export function leadCohort(ds: ShowcaseDataset, range: DateRange, platform: Workspace): LeadCohort {
  const cls = attributionMap(ds);
  const leads = ds.leads.filter((l) => l.platform === platform && inDays(ljDay(l.createdAt), range));
  const ids = new Set(leads.map((l) => l.id));
  const paidByLead = new Map<string, ShowcaseOrder[]>();
  for (const o of ds.orders) {
    if (o.status !== 'paid' || !o.leadId || !ids.has(o.leadId)) continue;
    const a = cls.get(o.id);
    if (!hasLeadMatch(a) || verifiedPlatform(a) !== platform) continue;
    const arr = paidByLead.get(o.leadId) ?? [];
    arr.push(o);
    paidByLead.set(o.leadId, arr);
  }
  return { leads, paidByLead };
}

export interface LeadGroupRow {
  id: string;
  name: string;
  leads: number;
  sold: number;
  payingCustomers: number;
  revenueMinor: number;
  spendMinor: number | null;
  customerIds: string[];
}

/** Lead figures per campaign (spend from the platform rows of the same campaign and range). */
export function leadsByCampaign(ds: ShowcaseDataset, range: DateRange, platform: Workspace, cohort: LeadCohort): LeadGroupRow[] {
  const spend = new Map<string, number>();
  for (const r of ds.daily) if (r.platform === platform && inDays(r.date, range)) spend.set(r.campaignId, (spend.get(r.campaignId) ?? 0) + r.spendMinor);
  const rows = new Map<string, LeadGroupRow & { customers: Set<string> }>();
  for (const c of ds.campaigns) {
    if (c.platform !== platform) continue;
    rows.set(c.id, { id: c.id, name: c.name, leads: 0, sold: 0, payingCustomers: 0, revenueMinor: 0, spendMinor: spend.has(c.id) ? spend.get(c.id)! : null, customerIds: [], customers: new Set() });
  }
  for (const l of cohort.leads) {
    const r = l.campaignId ? rows.get(l.campaignId) : undefined;
    if (!r) continue;
    r.leads += 1;
    const paid = cohort.paidByLead.get(l.id);
    if (paid?.length) {
      r.sold += 1;
      for (const o of paid) {
        r.revenueMinor += o.amountMinor;
        r.customers.add(o.customerId);
      }
    }
  }
  return [...rows.values()].map(({ customers, ...r }) => ({ ...r, payingCustomers: customers.size, customerIds: [...customers] })).filter((r) => r.leads > 0 || (r.spendMinor ?? 0) > 0);
}

/** Campaigns grouped into topics: product sections for Meta, campaign type for Google. */
export function leadsByTopic(ds: ShowcaseDataset, platform: Workspace, rows: readonly LeadGroupRow[]): LeadGroupRow[] {
  const groups: { id: string; name: string; campaignIds: string[] }[] =
    platform === 'meta'
      ? META_SECTIONS.map((s) => ({ id: s.id, name: s.name, campaignIds: [...s.campaignIds] }))
      : [...new Set(ds.campaigns.filter((c) => c.platform === 'google').map((c) => c.channelType ?? 'Other'))].map((t) => ({
          id: t,
          name: t,
          campaignIds: ds.campaigns.filter((c) => c.platform === 'google' && (c.channelType ?? 'Other') === t).map((c) => c.id),
        }));
  return groups.map((s) => {
    const part = rows.filter((r) => s.campaignIds.includes(r.id));
    const spends = part.map((r) => r.spendMinor).filter((v): v is number => v !== null);
    const customerIds = [...new Set(part.flatMap((r) => r.customerIds))];
    return {
      id: s.id,
      name: s.name,
      leads: part.reduce((a, r) => a + r.leads, 0),
      sold: part.reduce((a, r) => a + r.sold, 0),
      payingCustomers: customerIds.length,
      revenueMinor: part.reduce((a, r) => a + r.revenueMinor, 0),
      spendMinor: spends.length ? spends.reduce((a, b) => a + b, 0) : null,
      customerIds,
    };
  });
}

export interface LeadDay {
  key: string;
  label: string;
  incomplete: boolean;
  leads: number;
  byGroup: Record<string, number>;
  byStatus: Record<string, number>;
  /** Paid orders (verified lead match) by their order day. */
  paidFromLeads: number;
  /** Platform-reported leads (ad platform rows) and spend for the same bucket. */
  reportedLeads: number | null;
  spendMinor: number | null;
  conversions: number | null;
  /** Leads of the bucket that have a verified paid order (lead-cohort view). */
  soldLeads: number;
}

export function leadDays(ds: ShowcaseDataset, range: DateRange, g: Granularity, platform: Workspace, cohort: LeadCohort, groupOf: (l: ShowcaseLead) => string): LeadDay[] {
  const rows = skeleton(ds, range, g).map<LeadDay>((s) => ({ ...s, leads: 0, byGroup: {}, byStatus: {}, paidFromLeads: 0, reportedLeads: null, spendMinor: null, conversions: null, soldLeads: 0 }));
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const leadById = new Map(cohort.leads.map((l) => [l.id, l]));
  for (const l of cohort.leads) {
    const r = byKey.get(keyOfDay(ljDay(l.createdAt), g));
    if (!r) continue;
    r.leads += 1;
    const grp = groupOf(l);
    r.byGroup[grp] = (r.byGroup[grp] ?? 0) + 1;
    r.byStatus[l.status] = (r.byStatus[l.status] ?? 0) + 1;
    if (cohort.paidByLead.get(l.id)?.length) r.soldLeads += 1;
  }
  for (const [leadId, orders] of cohort.paidByLead) {
    if (!leadById.has(leadId)) continue;
    for (const o of orders) {
      const day = ljDay(o.orderedAt);
      if (!inDays(day, range)) continue;
      const r = byKey.get(keyOfDay(day, g));
      if (r) r.paidFromLeads += 1;
    }
  }
  for (const d of ds.daily) {
    if (d.platform !== platform || !inDays(d.date, range)) continue;
    const r = byKey.get(keyOfDay(d.date, g));
    if (!r) continue;
    r.reportedLeads = (r.reportedLeads ?? 0) + d.leads;
    r.spendMinor = (r.spendMinor ?? 0) + d.spendMinor;
    r.conversions = (r.conversions ?? 0) + d.platformConversions;
  }
  return rows;
}

export const ratioOrNull = (n: number | null, d: number | null): number | null => (n === null || d === null || d === 0 ? null : n / d);

export interface CampaignConversionRow {
  id: string;
  name: string;
  type: string;
  clicks: number;
  conversions: number;
  spendMinor: number | null;
}

/** Google: platform-reported conversions per campaign. These are not verified sales. */
export function googleConversionRows(ds: ShowcaseDataset, range: DateRange): CampaignConversionRow[] {
  const acc = new Map<string, { clicks: number; conversions: number; spend: number; rows: number }>();
  for (const r of ds.daily) {
    if (r.platform !== 'google' || !inDays(r.date, range)) continue;
    const a = acc.get(r.campaignId) ?? { clicks: 0, conversions: 0, spend: 0, rows: 0 };
    a.clicks += r.clicks;
    a.conversions += r.platformConversions;
    a.spend += r.spendMinor;
    a.rows += 1;
    acc.set(r.campaignId, a);
  }
  return ds.campaigns
    .filter((c) => c.platform === 'google' && acc.has(c.id))
    .map((c) => {
      const a = acc.get(c.id)!;
      return { id: c.id, name: c.name, type: c.channelType ?? '', clicks: a.clicks, conversions: a.conversions, spendMinor: a.rows > 0 ? a.spend : null };
    });
}

// ---------------------------------------------------------------------------------------------
// Attribution

export type SourceTileKey = 'meta' | 'google' | 'partner_portal' | 'chatbot_ai' | 'other_verified' | 'unknown' | 'conflicting';
export const TILE_KEYS: readonly SourceTileKey[] = ['meta', 'google', 'partner_portal', 'chatbot_ai', 'other_verified', 'unknown', 'conflicting'];

export interface EvidenceRow {
  key: string;
  label: string;
  hint: string;
  orders: number;
  revenueMinor: number;
}

export interface AttributionFigures {
  tiles: { key: SourceTileKey; orders: number; revenueMinor: number; verifiedOrders: number; verifiedRevenueMinor: number }[];
  paidOrders: number;
  paidRevenueMinor: number;
  verifiedOrders: number;
  verifiedRevenueMinor: number;
  labels: { label: string; group: string; orders: number; revenueMinor: number }[];
  evidence: EvidenceRow[];
  /** Reasons a paid order has no verified paid-ad link. */
  notLinked: { key: string; label: string; orders: number }[];
  leads: { total: number; qualified: number; sold: number; payingCustomers: number; revenueMinor: number };
}

const EVIDENCE_DEFS: readonly { key: string; label: string; hint: string }[] = [
  { key: 'lead_match', label: 'Verified lead match', hint: 'The order carries the platform lead id of a lead form submission.' },
  { key: 'click_id', label: 'Click id', hint: 'gclid is valid only for Google, fbclid only for Meta.' },
  { key: 'label', label: 'Source label only', hint: 'What the customer or operator recorded. A classification, not proof.' },
  { key: 'none', label: 'No evidence', hint: 'No label and no hard identifier.' },
  { key: 'conflict', label: 'Conflicting evidence', hint: 'Hard evidence for both platforms. Flagged, not resolved.' },
];

export function attributionFigures(ds: ShowcaseDataset, range: DateRange): AttributionFigures {
  const part = salesOverview(ds, { range }).partition;
  const cls = attributionMap(ds);
  const rows = orderAttributionRows(ds, { range }).filter((r) => r.order.status === 'paid');

  const tiles = TILE_KEYS.map((key) => {
    const p = part.parts.find((x) => x.source === key);
    return { key, orders: p?.orders ?? 0, revenueMinor: p?.revenueMinor ?? 0, verifiedOrders: 0, verifiedRevenueMinor: 0 };
  });
  const labelMap = new Map<string, { label: string; group: string; orders: number; revenueMinor: number }>();
  const ev = new Map(EVIDENCE_DEFS.map((d) => [d.key, { ...d, orders: 0, revenueMinor: 0 }]));
  const notLinked = new Map<string, { key: string; label: string; orders: number }>();
  const bumpNot = (key: string, label: string) => notLinked.set(key, { key, label, orders: (notLinked.get(key)?.orders ?? 0) + 1 });
  let verifiedOrders = 0;
  let verifiedRevenueMinor = 0;
  const bump = (k: string, amount: number) => {
    const e = ev.get(k)!;
    e.orders += 1;
    e.revenueMinor += amount;
  };

  for (const r of rows) {
    const a = r.attribution;
    const group = sourceFromAttribution(a);
    const tile = tiles.find((t) => t.key === group);
    const amount = r.order.amountMinor;
    if (a.status === 'attributed_paid_ad') {
      verifiedOrders += 1;
      verifiedRevenueMinor += amount;
      if (tile) {
        tile.verifiedOrders += 1;
        tile.verifiedRevenueMinor += amount;
      }
      bump(a.evidence.some((e) => e.kind === 'verified_lead_match') ? 'lead_match' : 'click_id', amount);
    } else if (a.status === 'source_only') {
      bump('label', amount);
      const named = a.label.toLowerCase();
      bumpNot(named.includes('google') ? 'label_google' : named.includes('facebook') || named.includes('meta') || named.includes('instagram') ? 'label_meta' : 'label_other', named.includes('google') ? 'Label names Google, no click id' : named.includes('facebook') || named.includes('meta') || named.includes('instagram') ? 'Label names Meta, no lead match' : 'Other label without evidence');
    } else if (a.status === 'conflict') {
      bump('conflict', amount);
      bumpNot('conflict', 'Evidence for both platforms');
    } else {
      bump('none', amount);
      bumpNot('none', 'No label and no identifier');
    }
    if (a.status !== 'attributed_paid_ad' && a.ignoredEvidence.includes('platform_reported')) bumpNot('platform_reported', 'Only an aggregate platform conversion count (not order-level proof)');
    const raw = r.customer.sourceLabel.trim();
    const lk = raw === '' ? '(no label)' : raw;
    const lm = labelMap.get(lk) ?? { label: lk, group: raw === '' ? 'unknown' : group, orders: 0, revenueMinor: 0 };
    lm.orders += 1;
    lm.revenueMinor += amount;
    labelMap.set(lk, lm);
  }

  // Lead funnel: ad-platform leads created in the range and what is verifiably linked to them.
  const funnelLeads = ds.leads.filter((l) => l.platform !== null && inDays(ljDay(l.createdAt), range));
  const ids = new Set(funnelLeads.map((l) => l.id));
  const customers = new Set<string>();
  const soldIds = new Set<string>();
  let leadRevenue = 0;
  for (const o of ds.orders) {
    if (o.status !== 'paid' || !o.leadId || !ids.has(o.leadId) || !hasLeadMatch(cls.get(o.id))) continue;
    soldIds.add(o.leadId);
    customers.add(o.customerId);
    leadRevenue += o.amountMinor;
  }

  return {
    tiles,
    paidOrders: part.eligibleOrders,
    paidRevenueMinor: part.eligibleRevenueMinor,
    verifiedOrders,
    verifiedRevenueMinor,
    labels: [...labelMap.values()].sort((a, b) => b.revenueMinor - a.revenueMinor),
    evidence: [...ev.values()],
    notLinked: [...notLinked.values()].sort((a, b) => b.orders - a.orders),
    leads: {
      total: funnelLeads.length,
      qualified: funnelLeads.filter((l) => l.status === 'qualified' || l.status === 'converted').length,
      sold: soldIds.size,
      payingCustomers: customers.size,
      revenueMinor: leadRevenue,
    },
  };
}

export interface EntityLinkRow {
  id: string;
  name: string;
  leads: number;
  paidOrders: number;
  revenueMinor: number;
  spendMinor: number | null;
}

/** Meta: verified paid orders per campaign / ad set / ad through the lead each order carries. */
export function metaLinkByLevel(ds: ShowcaseDataset, range: DateRange, level: 'campaign' | 'adset' | 'ad'): EntityLinkRow[] {
  const cohort = leadCohort(ds, range, 'meta');
  const leadKey = (l: ShowcaseLead): string | null => (level === 'campaign' ? l.campaignId : level === 'adset' ? l.adGroupId : l.adId);
  const names = new Map<string, string>();
  const spend = new Map<string, number>();
  for (const e of level === 'campaign' ? ds.campaigns : level === 'adset' ? ds.adGroups : ds.ads) if (e.platform === 'meta') names.set(e.id, e.name);
  for (const r of ds.daily) {
    if (r.platform !== 'meta' || !inDays(r.date, range)) continue;
    const k = level === 'campaign' ? r.campaignId : level === 'adset' ? r.adGroupId : r.adId;
    spend.set(k, (spend.get(k) ?? 0) + r.spendMinor);
  }
  const rows = new Map<string, EntityLinkRow>();
  for (const l of cohort.leads) {
    const k = leadKey(l);
    if (!k || !names.has(k)) continue;
    const r = rows.get(k) ?? { id: k, name: names.get(k)!, leads: 0, paidOrders: 0, revenueMinor: 0, spendMinor: spend.has(k) ? spend.get(k)! : null };
    r.leads += 1;
    for (const o of cohort.paidByLead.get(l.id) ?? []) {
      r.paidOrders += 1;
      r.revenueMinor += o.amountMinor;
    }
    rows.set(k, r);
  }
  return [...rows.values()].sort((a, b) => b.revenueMinor - a.revenueMinor || b.leads - a.leads);
}

/** Google: verified paid orders per campaign through a stored click id (gclid). */
export function googleLinkByCampaign(ds: ShowcaseDataset, range: DateRange): (EntityLinkRow & { unnamed?: false })[] & { unassigned: { orders: number; revenueMinor: number } } {
  const spend = new Map<string, number>();
  for (const r of ds.daily) if (r.platform === 'google' && inDays(r.date, range)) spend.set(r.campaignId, (spend.get(r.campaignId) ?? 0) + r.spendMinor);
  const rows = new Map<string, EntityLinkRow>();
  const unassigned = { orders: 0, revenueMinor: 0 };
  for (const r of orderAttributionRows(ds, { range })) {
    const a = r.attribution;
    if (r.order.status !== 'paid' || a.status !== 'attributed_paid_ad' || a.platform !== 'google') continue;
    if (!a.campaignId) {
      unassigned.orders += 1;
      unassigned.revenueMinor += r.order.amountMinor;
      continue;
    }
    const c = ds.campaigns.find((x) => x.id === a.campaignId);
    const row = rows.get(a.campaignId) ?? { id: a.campaignId, name: c?.name ?? a.campaignId, leads: 0, paidOrders: 0, revenueMinor: 0, spendMinor: spend.has(a.campaignId) ? spend.get(a.campaignId)! : null };
    row.paidOrders += 1;
    row.revenueMinor += r.order.amountMinor;
    rows.set(a.campaignId, row);
  }
  return Object.assign([...rows.values()].sort((a, b) => b.revenueMinor - a.revenueMinor), { unassigned });
}
