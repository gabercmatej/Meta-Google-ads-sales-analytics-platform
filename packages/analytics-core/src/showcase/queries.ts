// Independent reference implementation for the Sedem Ads showcase. Not production source.
//
// Read-only query layer used by the interactive demo. Every function is pure: same dataset and
// arguments -> same result. Money in integer cents, ratios as fractions, null = no data.
//
// Rules applied everywhere:
//  - Ratios are computed from summed numerators and denominators, never averaged.
//  - Missing data (gap days, no rows) is null, never 0.
//  - Combined (Meta + Google) values exist only for days where BOTH platforms have data.
//  - Money ratios (CPC, CPL, CPM) are rounded to whole cents; CTR stays an unrounded fraction.

import { type AuditCheck, makeCheck } from '../audit.js';
import { type AttributionResult, classifyOrder, platformNamedByLabel, sourceFromAttribution } from '../attribution.js';
import {
  type DatePreset,
  type DateRange,
  type ISODate,
  enumerateDays,
  inRange,
  monthEnd,
  monthKey,
  monthKeysInRange,
  monthSlice,
  previousPeriod,
  rangeLength,
  resolvePreset,
} from '../dates.js';
import { safeRatio } from '../metrics.js';
import { DEFAULT_SOURCES, partitionOrders, sourceSurplus } from '../sources.js';
import { type CanonicalSpend, type Platform, buildCanonicalSpend, monthlySpendTable, reconcileSpend, spendChartSeries } from '../spend.js';
import type { AdDailyRow } from '../synthetic/generate.js';
import type {
  AdSeriesPoint,
  AttributionOverview,
  DataSourceId,
  DataSourceStatus,
  EntityLevel,
  EntityMetrics,
  EntityPerformanceRow,
  Granularity,
  LeadChannel,
  LeadStatus,
  LeadsOverview,
  LeadsSeriesPoint,
  OrderAttributionRow,
  PerformanceTotals,
  PlatformSeriesPoint,
  PlatformView,
  SalesOverview,
  SalesSeriesPoint,
  SalesStatusCounts,
  SeriesMetric,
  ShowcaseCustomer,
  ShowcaseDataset,
  ShowcaseLead,
  ShowcaseOrder,
} from './types.js';

// ---------------------------------------------------------------------------------------------
// index (cached per dataset object)

interface Agg {
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
  conversions: number;
}

const emptyAgg = (): Agg => ({ spend: 0, impressions: 0, clicks: 0, leads: 0, conversions: 0 });
function addInto(target: Agg, src: Agg): void {
  target.spend += src.spend;
  target.impressions += src.impressions;
  target.clicks += src.clicks;
  target.leads += src.leads;
  target.conversions += src.conversions;
}
function addRow(target: Agg, r: AdDailyRow): void {
  target.spend += r.spendMinor;
  target.impressions += r.impressions;
  target.clicks += r.clicks;
  target.leads += r.leads;
  target.conversions += r.platformConversions;
}

interface VerifiedOrder {
  day: ISODate;
  platform: Platform;
  campaignId: string | null;
  adGroupId: string | null;
  adId: string | null;
  amountMinor: number;
}

interface Index {
  platDay: Record<Platform, Map<ISODate, Agg>>;
  gaps: Record<Platform, Map<ISODate, 'missing' | 'source_error'>>;
  partial: Record<DataSourceId, Set<ISODate>>;
  entity: Record<EntityLevel, Map<string, Map<ISODate, Agg>>>;
  cls: Map<string, AttributionResult>;
  customers: Map<string, ShowcaseCustomer>;
  orderDay: Map<string, ISODate>;
  payDay: Map<string, ISODate>;
  leadDay: Map<string, ISODate>;
  verified: VerifiedOrder[];
  partitions: Map<string, ReturnType<typeof partitionOrders>>;
}

const dayFormatters = new Map<string, Intl.DateTimeFormat>();
/** Calendar day of an instant in a time zone. Formatter is cached: Intl construction is slow. */
function calendarDateInZone(iso: string, timeZone: string): ISODate {
  let f = dayFormatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
    dayFormatters.set(timeZone, f);
  }
  return f.format(new Date(iso)) as ISODate;
}

function partitionFor(ds: ShowcaseDataset, idx: Index, range: DateRange, basis: Basis): ReturnType<typeof partitionOrders> {
  const key = `${basis}|${range.start}|${range.end}`;
  let hit = idx.partitions.get(key);
  if (!hit) {
    hit = partitionOrders(ds.orders, { range, timeZone: ds.timeZone, basis });
    idx.partitions.set(key, hit);
  }
  return hit;
}

const cache = new WeakMap<ShowcaseDataset, Index>();

function indexOf(ds: ShowcaseDataset): Index {
  const hit = cache.get(ds);
  if (hit) return hit;
  const platDay: Index['platDay'] = { meta: new Map(), google: new Map() };
  const entity: Index['entity'] = { campaign: new Map(), ad_group: new Map(), ad: new Map() };
  const bump = (m: Map<string, Map<ISODate, Agg>>, id: string, r: AdDailyRow): void => {
    let byDay = m.get(id);
    if (!byDay) {
      byDay = new Map();
      m.set(id, byDay);
    }
    let a = byDay.get(r.date);
    if (!a) {
      a = emptyAgg();
      byDay.set(r.date, a);
    }
    addRow(a, r);
  };
  for (const r of ds.daily) {
    let a = platDay[r.platform].get(r.date);
    if (!a) {
      a = emptyAgg();
      platDay[r.platform].set(r.date, a);
    }
    addRow(a, r);
    bump(entity.campaign, r.campaignId, r);
    bump(entity.ad_group, r.adGroupId, r);
    bump(entity.ad, r.adId, r);
  }
  const gaps: Index['gaps'] = { meta: new Map(), google: new Map() };
  const partial: Index['partial'] = { meta: new Set(), google: new Set(), crm: new Set(), payments: new Set(), leads: new Set() };
  for (const s of ds.sourceDays) {
    if (s.status === 'partial') partial[s.source].add(s.date);
    else if (s.source === 'meta' || s.source === 'google') gaps[s.source].set(s.date, s.status);
  }
  const tz = ds.timeZone;
  const cls = new Map<string, AttributionResult>();
  const orderDay = new Map<string, ISODate>();
  const payDay = new Map<string, ISODate>();
  const leadById = new Map(ds.leads.map((l) => [l.id, l]));
  const verified: VerifiedOrder[] = [];
  for (const o of ds.orders) {
    const c = classifyOrder(o);
    cls.set(o.id, c);
    const od = calendarDateInZone(o.orderedAt, tz);
    orderDay.set(o.id, od);
    if (o.paidAt) payDay.set(o.id, calendarDateInZone(o.paidAt, tz));
    if (o.status === 'paid' && c.status === 'attributed_paid_ad') {
      const lead = o.leadId ? leadById.get(o.leadId) : undefined;
      const sameCampaign = lead !== undefined && c.campaignId !== null && lead.campaignId === c.campaignId;
      verified.push({
        day: od,
        platform: c.platform,
        campaignId: c.campaignId,
        adGroupId: sameCampaign ? lead.adGroupId : null,
        adId: sameCampaign ? lead.adId : null,
        amountMinor: o.amountMinor,
      });
    }
  }
  const leadDay = new Map(ds.leads.map((l) => [l.id, calendarDateInZone(l.createdAt, tz)]));
  const idx: Index = {
    platDay,
    gaps,
    partial,
    entity,
    cls,
    customers: new Map(ds.customers.map((c) => [c.id, c])),
    orderDay,
    payDay,
    leadDay,
    verified,
    partitions: new Map(),
  };
  cache.set(ds, idx);
  return idx;
}

// ---------------------------------------------------------------------------------------------
// small helpers

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dayLabel = (d: ISODate): string => `${Number(d.slice(8, 10))} ${MONTHS[Number(d.slice(5, 7)) - 1]!}`;
const monthLabel = (key: string): string => `${MONTHS[Number(key.slice(5, 7)) - 1]!} ${key.slice(0, 4)}`;
const roundMinor = (x: number | null): number | null => (x === null ? null : Math.round(x));

function metricOf(metric: SeriesMetric, a: Agg | null): number | null {
  if (a === null) return null;
  switch (metric) {
    case 'spend': return a.spend;
    case 'impressions': return a.impressions;
    case 'clicks': return a.clicks;
    case 'leads': return a.leads;
    case 'ctr': return safeRatio(a.clicks, a.impressions);
    case 'cpc': return roundMinor(safeRatio(a.spend, a.clicks));
    case 'cpl': return roundMinor(safeRatio(a.spend, a.leads));
    case 'cpm': {
      const r = safeRatio(a.spend, a.impressions);
      return r === null ? null : Math.round(r * 1000);
    }
  }
}

/** Sum of the platform's present days inside the range; null when it has no data at all. */
function platformAgg(idx: Index, platform: Platform, range: DateRange): { agg: Agg | null; present: number; missing: ISODate[] } {
  const agg = emptyAgg();
  let present = 0;
  const missing: ISODate[] = [];
  for (const d of enumerateDays(range)) {
    const cell = idx.platDay[platform].get(d);
    if (cell) {
      addInto(agg, cell);
      present += 1;
    } else missing.push(d);
  }
  return { agg: present === 0 ? null : agg, present, missing };
}

/** Sum over days where BOTH platforms have data. */
function combinedAgg(idx: Index, range: DateRange): { agg: Agg | null; complete: number; missing: ISODate[] } {
  const agg = emptyAgg();
  let complete = 0;
  const missing: ISODate[] = [];
  for (const d of enumerateDays(range)) {
    const m = idx.platDay.meta.get(d);
    const g = idx.platDay.google.get(d);
    if (m && g) {
      addInto(agg, m);
      addInto(agg, g);
      complete += 1;
    } else missing.push(d);
  }
  return { agg: complete === 0 ? null : agg, complete, missing };
}

function canonicalSpend(idx: Index, range: DateRange): CanonicalSpend {
  const days = enumerateDays(range);
  return buildCanonicalSpend({
    range,
    meta: days.map((date) => ({ date, spendMinor: idx.platDay.meta.get(date)?.spend ?? null })),
    google: days.map((date) => ({ date, spendMinor: idx.platDay.google.get(date)?.spend ?? null })),
  });
}

function hasPartialDay(idx: Index, view: PlatformView, range: DateRange): boolean {
  const sources: DataSourceId[] = view === 'combined' ? ['meta', 'google'] : [view];
  return sources.some((s) => [...idx.partial[s]].some((d) => inRange(d, range)));
}

// ---------------------------------------------------------------------------------------------
// range

/**
 * Resolve a date preset against the dataset's fixed reference clock, completed days only
 * (today is partial and excluded). Custom ranges are clamped to the available history.
 */
export function resolveShowcaseRange(ds: ShowcaseDataset, preset: DatePreset, custom?: DateRange): DateRange | null {
  if (preset === 'custom' && !custom) return null;
  const resolved = resolvePreset(preset, { now: ds.referenceNow, timeZone: ds.timeZone, completedDaysOnly: true, custom });
  if (!resolved) return null;
  const start = resolved.start < ds.range.start ? ds.range.start : resolved.start;
  return start > resolved.end ? null : { start, end: resolved.end };
}

// ---------------------------------------------------------------------------------------------
// performance

export function performanceTotals(ds: ShowcaseDataset, view: PlatformView, range: DateRange): PerformanceTotals {
  const idx = indexOf(ds);
  const expected = rangeLength(range);
  let agg: Agg | null;
  let complete: number;
  let missing: ISODate[];
  if (view === 'combined') {
    const c = combinedAgg(idx, range);
    ({ agg, complete, missing } = { agg: c.agg, complete: c.complete, missing: c.missing });
  } else {
    const p = platformAgg(idx, view, range);
    ({ agg, complete, missing } = { agg: p.agg, complete: p.present, missing: p.missing });
  }
  return {
    spendMinor: agg ? agg.spend : null,
    impressions: agg ? agg.impressions : null,
    clicks: agg ? agg.clicks : null,
    leads: agg ? agg.leads : null,
    platformConversions: agg ? agg.conversions : null,
    ctr: metricOf('ctr', agg),
    cpcMinor: metricOf('cpc', agg),
    cplMinor: metricOf('cpl', agg),
    cpmMinor: metricOf('cpm', agg),
    completeDays: complete,
    expectedDays: expected,
    missingDates: missing,
    partial: missing.length > 0 || hasPartialDay(idx, view, range),
  };
}

export function metricSeries(
  ds: ShowcaseDataset,
  args: { metric: SeriesMetric; range: DateRange; granularity: Granularity },
): PlatformSeriesPoint[] {
  const idx = indexOf(ds);
  const { metric, range, granularity } = args;
  if (granularity === 'daily') {
    return enumerateDays(range).map((d): PlatformSeriesPoint => {
      const m = idx.platDay.meta.get(d) ?? null;
      const g = idx.platDay.google.get(d) ?? null;
      let total: Agg | null = null;
      if (m && g) {
        total = emptyAgg();
        addInto(total, m);
        addInto(total, g);
      }
      const dayStatus = m && g ? 'complete' : !m && !g ? 'missing_both' : !m ? 'missing_meta' : 'missing_google';
      return {
        key: d,
        label: dayLabel(d),
        meta: metricOf(metric, m),
        google: metricOf(metric, g),
        total: metricOf(metric, total),
        incomplete: idx.partial.meta.has(d) || idx.partial.google.has(d) || dayStatus !== 'complete',
        dayStatus,
      };
    });
  }
  return monthKeysInRange(range).map((key): PlatformSeriesPoint => {
    const slice = monthSlice(key, range)!;
    const meta = platformAgg(idx, 'meta', slice);
    const google = platformAgg(idx, 'google', slice);
    const both = combinedAgg(idx, slice);
    const unfinished = monthEnd(key) >= ds.referenceDate;
    return {
      key,
      label: monthLabel(key),
      meta: metricOf(metric, meta.agg),
      google: metricOf(metric, google.agg),
      total: metricOf(metric, both.agg),
      incomplete: unfinished || both.missing.length > 0 || hasPartialDay(idx, 'combined', slice),
    };
  });
}

// ---------------------------------------------------------------------------------------------
// entities

function entityMetrics(idx: Index, level: EntityLevel, id: string, range: DateRange, verified: VerifiedOrder[]): EntityMetrics {
  const byDay = idx.entity[level].get(id);
  const agg = emptyAgg();
  let present = 0;
  if (byDay) {
    for (const d of enumerateDays(range)) {
      const cell = byDay.get(d);
      if (cell) {
        addInto(agg, cell);
        present += 1;
      }
    }
  }
  const a = present === 0 ? null : agg;
  let orders = 0;
  let revenue = 0;
  for (const v of verified) {
    if (!inRange(v.day, range)) continue;
    const key = level === 'campaign' ? v.campaignId : level === 'ad_group' ? v.adGroupId : v.adId;
    if (key === id) {
      orders += 1;
      revenue += v.amountMinor;
    }
  }
  return {
    spendMinor: a ? a.spend : null,
    impressions: a ? a.impressions : null,
    clicks: a ? a.clicks : null,
    leads: a ? a.leads : null,
    ctr: metricOf('ctr', a),
    cpcMinor: metricOf('cpc', a),
    cplMinor: metricOf('cpl', a),
    cpmMinor: metricOf('cpm', a),
    verifiedOrders: orders,
    verifiedRevenueMinor: revenue,
    roas: a ? safeRatio(revenue, a.spend) : null,
  };
}

const relChange = (cur: number | null, prev: number | null): number | null => (cur === null || prev === null || prev === 0 ? null : (cur - prev) / prev);

/** Creative fatigue rule (ad level): >= 2000 impressions in both periods and CTR <= 85% of the previous period. */
export const FATIGUE_MIN_IMPRESSIONS = 2000;
export const FATIGUE_CTR_RATIO = 0.85;

export function entityPerformance(
  ds: ShowcaseDataset,
  args: { level: EntityLevel; view: PlatformView; range: DateRange; campaignId?: string; adGroupId?: string },
): EntityPerformanceRow[] {
  const idx = indexOf(ds);
  const { level, view, range } = args;
  const prevRange = previousPeriod(range);
  const campaignById = new Map(ds.campaigns.map((c) => [c.id, c]));
  const groupById = new Map(ds.adGroups.map((g) => [g.id, g]));
  const platformOk = (p: Platform): boolean => view === 'combined' || view === p;

  type Base = Pick<EntityPerformanceRow, 'id' | 'platform' | 'name' | 'status' | 'campaignId' | 'adGroupId' | 'creativeId'>;
  const bases: Base[] = [];
  if (level === 'campaign') {
    for (const c of ds.campaigns) if (platformOk(c.platform)) bases.push({ id: c.id, platform: c.platform, name: c.name, status: c.status, campaignId: c.id, adGroupId: null, creativeId: null });
  } else if (level === 'ad_group') {
    for (const g of ds.adGroups) {
      if (!platformOk(g.platform) || (args.campaignId && g.campaignId !== args.campaignId)) continue;
      bases.push({ id: g.id, platform: g.platform, name: g.name, status: g.status, campaignId: g.campaignId, adGroupId: g.id, creativeId: null });
    }
  } else {
    for (const a of ds.ads) {
      if (!platformOk(a.platform) || (args.campaignId && a.campaignId !== args.campaignId) || (args.adGroupId && a.adGroupId !== args.adGroupId)) continue;
      bases.push({ id: a.id, platform: a.platform, name: a.name, status: a.status, campaignId: a.campaignId, adGroupId: a.adGroupId, creativeId: a.creativeId });
    }
  }

  return bases.map((b): EntityPerformanceRow => {
    const current = entityMetrics(idx, level, b.id, range, idx.verified);
    const previous = entityMetrics(idx, level, b.id, prevRange, idx.verified);
    const campaign = campaignById.get(b.campaignId)!;
    const group = b.adGroupId ? groupById.get(b.adGroupId) : undefined;
    const fatigued =
      level === 'ad' &&
      (current.impressions ?? 0) >= FATIGUE_MIN_IMPRESSIONS &&
      (previous.impressions ?? 0) >= FATIGUE_MIN_IMPRESSIONS &&
      current.ctr !== null &&
      previous.ctr !== null &&
      current.ctr <= FATIGUE_CTR_RATIO * previous.ctr;
    return {
      ...b,
      level,
      channelType: campaign.channelType,
      objective: campaign.objective,
      dailyBudgetMinor: level === 'campaign' ? campaign.dailyBudgetMinor : level === 'ad_group' ? (group?.dailyBudgetMinor ?? null) : null,
      tier: level === 'campaign' ? campaign.tier : null,
      fatigued,
      current,
      previous,
      change: {
        spend: relChange(current.spendMinor, previous.spendMinor),
        ctr: relChange(current.ctr, previous.ctr),
        cpc: relChange(current.cpcMinor, previous.cpcMinor),
        cpl: relChange(current.cplMinor, previous.cplMinor),
        leads: relChange(current.leads, previous.leads),
      },
    };
  });
}

export function adSeries(
  ds: ShowcaseDataset,
  args: { adIds: readonly string[]; metric: SeriesMetric; range: DateRange; granularity: Granularity },
): AdSeriesPoint[] {
  const idx = indexOf(ds);
  const { adIds, metric, range, granularity } = args;
  const adById = new Map(ds.ads.map((a) => [a.id, a]));
  if (granularity === 'daily') {
    return enumerateDays(range).map((d) => {
      const values: Record<string, number | null> = {};
      for (const id of adIds) values[id] = metricOf(metric, idx.entity.ad.get(id)?.get(d) ?? null);
      const partialDay = idx.partial.meta.has(d) || idx.partial.google.has(d);
      return { key: d, label: dayLabel(d), incomplete: partialDay, values };
    });
  }
  return monthKeysInRange(range).map((key) => {
    const slice = monthSlice(key, range)!;
    const values: Record<string, number | null> = {};
    let gap = false;
    for (const id of adIds) {
      const byDay = idx.entity.ad.get(id);
      const agg = emptyAgg();
      let present = 0;
      for (const d of enumerateDays(slice)) {
        const cell = byDay?.get(d);
        if (cell) {
          addInto(agg, cell);
          present += 1;
        }
      }
      values[id] = present === 0 ? null : metricOf(metric, agg);
      const platform = adById.get(id)?.platform;
      if (platform && [...idx.gaps[platform].keys()].some((d) => inRange(d, slice))) gap = true;
    }
    return { key, label: monthLabel(key), incomplete: monthEnd(key) >= ds.referenceDate || gap || hasPartialDay(idx, 'combined', slice), values };
  });
}

// ---------------------------------------------------------------------------------------------
// sales

type Basis = 'order' | 'payment';

function dayOfOrder(idx: Index, o: ShowcaseOrder, basis: Basis): ISODate {
  if (basis === 'payment' && o.paidAt) return idx.payDay.get(o.id)!;
  return idx.orderDay.get(o.id)!;
}

export function salesOverview(ds: ShowcaseDataset, args: { range: DateRange; basis?: Basis }): SalesOverview {
  const idx = indexOf(ds);
  const basis = args.basis ?? 'order';
  const partition = partitionFor(ds, idx, args.range, basis);
  const statusCounts: SalesStatusCounts = {
    paid: { orders: 0, revenueMinor: 0 },
    unpaid: { orders: 0, revenueMinor: 0 },
    cancelled: { orders: 0, revenueMinor: 0 },
    refunded: { orders: 0, revenueMinor: 0 },
  };
  for (const o of ds.orders) {
    if (!inRange(dayOfOrder(idx, o, basis), args.range)) continue;
    statusCounts[o.status].orders += 1;
    statusCounts[o.status].revenueMinor += o.amountMinor;
  }
  return {
    range: args.range,
    basis,
    partition,
    statusCounts,
    averageOrderMinor: roundMinor(safeRatio(partition.eligibleRevenueMinor, partition.eligibleOrders)),
    vatRatePercent: ds.vatRatePercent,
  };
}

export function salesSeries(
  ds: ShowcaseDataset,
  args: { range: DateRange; granularity: Granularity; basis?: Basis },
): SalesSeriesPoint[] {
  const idx = indexOf(ds);
  const basis = args.basis ?? 'order';
  const keyOf = (d: ISODate): string => (args.granularity === 'daily' ? d : monthKey(d));
  const keys = args.granularity === 'daily' ? enumerateDays(args.range) : monthKeysInRange(args.range);
  const points = new Map<string, SalesSeriesPoint>(
    keys.map((key) => {
      const bySource: Record<string, number> = {};
      for (const s of DEFAULT_SOURCES) bySource[s] = 0;
      const incomplete = args.granularity === 'daily' ? key >= ds.referenceDate : monthEnd(key) >= ds.referenceDate;
      return [key, { key, label: args.granularity === 'daily' ? dayLabel(key) : monthLabel(key), incomplete, bySource, totalMinor: 0, orders: 0 }];
    }),
  );
  for (const o of ds.orders) {
    if (o.status !== 'paid') continue;
    const day = dayOfOrder(idx, o, basis);
    if (!inRange(day, args.range)) continue;
    const p = points.get(keyOf(day))!;
    p.bySource[o.source] = (p.bySource[o.source] ?? 0) + o.amountMinor;
    p.totalMinor += o.amountMinor;
    p.orders += 1;
  }
  return keys.map((k) => points.get(k)!);
}

// ---------------------------------------------------------------------------------------------
// attribution

export function attributionOverview(ds: ShowcaseDataset, args: { range: DateRange }): AttributionOverview {
  const idx = indexOf(ds);
  const { range } = args;
  const partition = partitionFor(ds, idx, range, 'order');
  const verified: AttributionOverview['verified'] = { meta: { orders: 0, revenueMinor: 0 }, google: { orders: 0, revenueMinor: 0 } };
  const label: AttributionOverview['labelWithoutEvidence'] = { meta: { orders: 0, revenueMinor: 0 }, google: { orders: 0, revenueMinor: 0 } };
  const sourceOnly = { orders: 0, revenueMinor: 0 };
  const unknown = { orders: 0, revenueMinor: 0 };
  const conflict = { orders: 0, revenueMinor: 0 };
  for (const o of ds.orders) {
    if (o.status !== 'paid' || !inRange(idx.orderDay.get(o.id)!, range)) continue;
    const c = idx.cls.get(o.id)!;
    const bump = (b: { orders: number; revenueMinor: number }): void => {
      b.orders += 1;
      b.revenueMinor += o.amountMinor;
    };
    if (c.status === 'attributed_paid_ad') bump(verified[c.platform]);
    else if (c.status === 'source_only') {
      bump(sourceOnly);
      const named = platformNamedByLabel(c.label);
      if (named) bump(label[named]);
    } else if (c.status === 'unknown') bump(unknown);
    else bump(conflict);
  }
  const spend = canonicalSpend(idx, range);
  const surplus = sourceSurplus(partition.selected.revenueMinor, spend.metaMinor, spend.googleMinor);
  return {
    range,
    paidOrders: partition.eligibleOrders,
    paidRevenueMinor: partition.eligibleRevenueMinor,
    selectedSourceRevenueMinor: partition.selected.revenueMinor,
    verified,
    sourceOnly,
    unknown,
    conflict,
    spend: { metaMinor: spend.metaMinor, googleMinor: spend.googleMinor, totalMinor: spend.totalMinor, partial: spend.partial },
    roas: {
      meta: safeRatio(verified.meta.revenueMinor, spend.metaMinor),
      google: safeRatio(verified.google.revenueMinor, spend.googleMinor),
      combined: safeRatio(verified.meta.revenueMinor + verified.google.revenueMinor, spend.totalMinor),
    },
    surplusMinor: surplus.surplusMinor,
    labelWithoutEvidence: label,
  };
}

export function orderAttributionRows(
  ds: ShowcaseDataset,
  args: { range: DateRange; status?: OrderAttributionRow['attribution']['status']; limit?: number },
): OrderAttributionRow[] {
  const idx = indexOf(ds);
  const rows: OrderAttributionRow[] = [];
  for (const o of ds.orders) {
    if (!inRange(idx.orderDay.get(o.id)!, args.range)) continue;
    const attribution = idx.cls.get(o.id)!;
    if (args.status && attribution.status !== args.status) continue;
    rows.push({ order: o, customer: idx.customers.get(o.customerId)!, attribution });
  }
  rows.sort((a, b) => (a.order.orderedAt < b.order.orderedAt ? 1 : a.order.orderedAt > b.order.orderedAt ? -1 : a.order.id < b.order.id ? 1 : -1));
  return args.limit === undefined ? rows : rows.slice(0, args.limit);
}

// ---------------------------------------------------------------------------------------------
// leads

const CHANNELS: LeadChannel[] = ['meta_lead_form', 'google_lead_form', 'website_form', 'chatbot_ai', 'partner_portal', 'phone'];
const STATUSES: LeadStatus[] = ['new', 'contacted', 'qualified', 'converted', 'lost'];
const zeroChannels = (): Record<LeadChannel, number> => Object.fromEntries(CHANNELS.map((c) => [c, 0])) as Record<LeadChannel, number>;
const zeroStatuses = (): Record<LeadStatus, number> => Object.fromEntries(STATUSES.map((c) => [c, 0])) as Record<LeadStatus, number>;
const leadInView = (l: ShowcaseLead, view: PlatformView): boolean => view === 'combined' || l.platform === view;

export function leadsOverview(ds: ShowcaseDataset, args: { range: DateRange; view: PlatformView }): LeadsOverview {
  const idx = indexOf(ds);
  const byChannel = zeroChannels();
  const byStatus = zeroStatuses();
  const byPlatform = { meta: 0, google: 0, none: 0 };
  let total = 0;
  for (const l of ds.leads) {
    if (!leadInView(l, args.view) || !inRange(idx.leadDay.get(l.id)!, args.range)) continue;
    total += 1;
    byChannel[l.channel] += 1;
    byStatus[l.status] += 1;
    byPlatform[l.platform ?? 'none'] += 1;
  }
  return { range: args.range, total, byChannel, byStatus, byPlatform, converted: byStatus.converted, conversionRate: safeRatio(byStatus.converted, total) };
}

export function leadsSeries(
  ds: ShowcaseDataset,
  args: { range: DateRange; view: PlatformView; granularity: Granularity },
): LeadsSeriesPoint[] {
  const idx = indexOf(ds);
  const keyOf = (d: ISODate): string => (args.granularity === 'daily' ? d : monthKey(d));
  const keys = args.granularity === 'daily' ? enumerateDays(args.range) : monthKeysInRange(args.range);
  const points = new Map<string, LeadsSeriesPoint>(
    keys.map((key) => [
      key,
      {
        key,
        label: args.granularity === 'daily' ? dayLabel(key) : monthLabel(key),
        incomplete: args.granularity === 'daily' ? key >= ds.referenceDate : monthEnd(key) >= ds.referenceDate,
        byChannel: zeroChannels(),
        total: 0,
      },
    ]),
  );
  for (const l of ds.leads) {
    if (!leadInView(l, args.view)) continue;
    const day = idx.leadDay.get(l.id)!;
    if (!inRange(day, args.range)) continue;
    const p = points.get(keyOf(day))!;
    p.byChannel[l.channel] += 1;
    p.total += 1;
  }
  return keys.map((k) => points.get(k)!);
}

// ---------------------------------------------------------------------------------------------
// data sources

export function dataSourceStatus(ds: ShowcaseDataset): DataSourceStatus[] {
  const issues = (s: DataSourceId): DataSourceStatus['issues'] => ds.sourceDays.filter((d) => d.source === s).sort((a, b) => (a.date < b.date ? -1 : 1));
  const rows = (p: Platform): number => ds.daily.filter((r) => r.platform === p).length;
  const entries: [DataSourceId, string, string, number][] = [
    ['meta', 'Meta Ads', 'Simulated daily ad-level performance rows (spend, impressions, clicks, leads).', rows('meta')],
    ['google', 'Google Ads', 'Simulated daily ad-level performance rows (spend, impressions, clicks, leads).', rows('google')],
    ['crm', 'CRM / orders', 'Simulated customers and orders with evidence of where each order came from.', ds.orders.length + ds.customers.length],
    ['payments', 'Payments', 'Simulated payment and refund events attached to orders.', ds.orders.filter((o) => o.paidAt || o.refundedAt).length],
    ['leads', 'Leads', 'Simulated lead records from ad lead forms, the website, chatbot, partners and phone.', ds.leads.length],
  ];
  return entries.map(([id, name, description, recordCount]) => ({
    id,
    name,
    description,
    mode: 'simulated' as const,
    lastSyncAt: ds.referenceNow,
    coverage: ds.range,
    issues: issues(id),
    recordCount,
  }));
}

// ---------------------------------------------------------------------------------------------
// integrity checks

const sumNums = (xs: readonly (number | null)[]): number | null => {
  let any = false;
  let s = 0;
  for (const x of xs) if (x !== null) {
    any = true;
    s += x;
  }
  return any ? s : null;
};

/** Integrity checks shown on the Data Sources page; the same invariants are unit-tested. */
export function integrityChecks(ds: ShowcaseDataset, range: DateRange): AuditCheck[] {
  const idx = indexOf(ds);
  const checks: AuditCheck[] = [];
  const pass = (id: string, title: string, detail: string, expected?: number | string | null, actual?: number | string | null): void => {
    checks.push(makeCheck({ id, title, status: 'PASS', detail, expected, actual }));
  };
  const fail = (id: string, title: string, detail: string, expected?: number | string | null, actual?: number | string | null): void => {
    checks.push(makeCheck({ id, title, status: 'FAIL', detail, expected, actual }));
  };
  const partial = (id: string, title: string, category: 'intentional_basis_difference' | 'source_limitation' | 'missing_evidence', detail: string): void => {
    checks.push(makeCheck({ id, title, status: 'PARTIAL', category, detail }));
  };
  const eq = (id: string, title: string, a: number | null, b: number | null, okDetail: string): void => {
    if (a === b) pass(id, title, okDetail, a, b);
    else fail(id, title, `Values differ: ${String(a)} vs ${String(b)}.`, a, b);
  };

  const canon = canonicalSpend(idx, range);
  const gapDaysInRange = [...idx.gaps.meta.keys(), ...idx.gaps.google.keys()].filter((d) => inRange(d, range));

  // 1. daily series sums to monthly series
  for (const metric of ['spend', 'impressions', 'clicks', 'leads'] as const) {
    const daily = metricSeries(ds, { metric, range, granularity: 'daily' });
    const monthly = metricSeries(ds, { metric, range, granularity: 'monthly' });
    const sum = (pts: PlatformSeriesPoint[], k: 'meta' | 'google' | 'total'): number | null => sumNums(pts.map((p) => p[k]));
    const ok = (['meta', 'google', 'total'] as const).every((k) => sum(daily, k) === sum(monthly, k));
    if (ok) pass(`series.${metric}.daily_vs_monthly`, `Daily ${metric} adds up to monthly ${metric}`, 'Meta, Google and combined daily points sum to the calendar-month points.', sum(daily, 'total'), sum(monthly, 'total'));
    else fail(`series.${metric}.daily_vs_monthly`, `Daily ${metric} adds up to monthly ${metric}`, 'Daily and monthly series disagree.', sum(daily, 'total'), sum(monthly, 'total'));
  }

  // 2. combined = meta + google on complete days
  const dailySpend = metricSeries(ds, { metric: 'spend', range, granularity: 'daily' });
  const combinedOk = dailySpend.every((p) => (p.meta !== null && p.google !== null ? p.total === p.meta + p.google : p.total === null));
  if (combinedOk) pass('spend.combined_is_sum', 'Combined spend = Meta + Google', 'Equal on every complete day; null on any day where either platform is missing.');
  else fail('spend.combined_is_sum', 'Combined spend = Meta + Google', 'A combined day does not equal Meta + Google.');

  // 3. card = chart = monthly
  const card = performanceTotals(ds, 'combined', range).spendMinor;
  const rec = reconcileSpend({ cardMinor: card, chartSeries: spendChartSeries(canon), monthlyTable: monthlySpendTable(canon) });
  if (rec.status === 'PASS') pass('spend.card_chart_monthly', 'Spend card = chart = monthly table', 'One canonical spend path feeds all three.', rec.cardMinor, rec.chartMinor);
  else fail('spend.card_chart_monthly', 'Spend card = chart = monthly table', `Mismatch in: ${rec.mismatches.join(', ')}.`, rec.cardMinor, rec.chartMinor);

  // 4-5. partitions
  for (const basis of ['order', 'payment'] as const) {
    const so = salesOverview(ds, { range, basis });
    const sumParts = so.partition.parts.reduce((a, p) => a + p.revenueMinor, 0);
    const sumOrders = so.partition.parts.reduce((a, p) => a + p.orders, 0);
    if (so.partition.reconciles && sumParts === so.partition.eligibleRevenueMinor && sumOrders === so.partition.eligibleOrders) {
      pass(`sales.partition.${basis}`, `Sales sources add up to paid total (${basis} date)`, 'Every paid order is in exactly one source.', so.partition.eligibleRevenueMinor, sumParts);
    } else fail(`sales.partition.${basis}`, `Sales sources add up to paid total (${basis} date)`, 'Source parts do not sum to the paid total.', so.partition.eligibleRevenueMinor, sumParts);
  }
  {
    const so = salesOverview(ds, { range });
    const part = (s: string): number => so.partition.parts.find((p) => p.source === s)!.revenueMinor;
    eq('sales.selected_subtotal', 'Selected sources = Meta + Google + Chatbot/AI', so.partition.selected.revenueMinor, part('meta') + part('google') + part('chatbot_ai'), 'The subtotal is a subset of the parts, not an extra part.');
  }

  // 6. duplicate ids
  const ids = new Set(ds.orders.map((o) => o.id));
  if (ids.size === ds.orders.length) pass('orders.unique_ids', 'No duplicate order ids', `${ds.orders.length} orders, all ids unique.`);
  else fail('orders.unique_ids', 'No duplicate order ids', 'Duplicate order ids found.', ds.orders.length, ids.size);

  // 7. lead reconciliation (days that have platform rows)
  {
    let expectedMeta = 0;
    let expectedGoogle = 0;
    let rowMeta = 0;
    let rowGoogle = 0;
    for (const d of enumerateDays(range)) {
      const m = idx.platDay.meta.get(d);
      const g = idx.platDay.google.get(d);
      if (m) rowMeta += m.leads;
      if (g) rowGoogle += g.leads;
    }
    for (const l of ds.leads) {
      const d = idx.leadDay.get(l.id)!;
      if (!inRange(d, range) || l.platform === null) continue;
      if (l.platform === 'meta' && idx.platDay.meta.has(d)) expectedMeta += 1;
      if (l.platform === 'google' && idx.platDay.google.has(d)) expectedGoogle += 1;
    }
    if (rowMeta !== expectedMeta || rowGoogle !== expectedGoogle) {
      fail('leads.reconcile', 'CRM leads = platform-reported leads', 'Lead-form leads do not match platform rows.', rowMeta + rowGoogle, expectedMeta + expectedGoogle);
    } else if (gapDaysInRange.length > 0) {
      partial('leads.reconcile', 'CRM leads = platform-reported leads', 'source_limitation', `Equal on every day that has platform rows. ${gapDaysInRange.length} gap day(s) in range are excluded because the platform export is missing.`);
    } else pass('leads.reconcile', 'CRM leads = platform-reported leads', 'Equal on every day in range.', rowMeta + rowGoogle, expectedMeta + expectedGoogle);
  }

  // 8. ratios from raw sums (independent recomputation from ds.daily)
  {
    const complete = new Set(canon.days.filter((d) => d.totalMinor !== null).map((d) => d.date));
    const raw = emptyAgg();
    for (const r of ds.daily) if (complete.has(r.date)) addRow(raw, r);
    const t = performanceTotals(ds, 'combined', range);
    const ok =
      (complete.size === 0 && t.ctr === null) ||
      (t.ctr === safeRatio(raw.clicks, raw.impressions) &&
        t.cpcMinor === roundMinor(safeRatio(raw.spend, raw.clicks)) &&
        t.cplMinor === roundMinor(safeRatio(raw.spend, raw.leads)) &&
        t.cpmMinor === (safeRatio(raw.spend, raw.impressions) === null ? null : Math.round(safeRatio(raw.spend, raw.impressions)! * 1000)));
    if (ok) pass('ratios.from_sums', 'Ratios are computed from sums', 'CTR, CPC, CPL and CPM equal summed numerator over summed denominator, never an average of daily ratios.');
    else fail('ratios.from_sums', 'Ratios are computed from sums', 'A ratio differs from sum(numerator) / sum(denominator).');
  }

  // 9. entity rows sum to platform totals
  {
    let ok = true;
    for (const platform of ['meta', 'google'] as const) {
      const rows = entityPerformance(ds, { level: 'campaign', view: platform, range });
      const entitySpend = sumNums(rows.map((r) => r.current.spendMinor));
      if (entitySpend !== performanceTotals(ds, platform, range).spendMinor) ok = false;
      const adRows = entityPerformance(ds, { level: 'ad', view: platform, range });
      if (sumNums(adRows.map((r) => r.current.spendMinor)) !== entitySpend) ok = false;
    }
    if (ok) pass('entities.sum_to_platform', 'Campaigns and ads add up to platform totals', 'Campaign-level and ad-level spend both equal the platform total.');
    else fail('entities.sum_to_platform', 'Campaigns and ads add up to platform totals', 'Entity spend does not equal the platform total.');
  }

  // 10. gaps are null, not 0
  {
    const gaps = dailySpend.filter((p) => p.dayStatus !== 'complete');
    const ok = gaps.every((p) => p.total === null && (p.dayStatus === 'missing_google' ? p.google === null : true) && (p.dayStatus === 'missing_meta' ? p.meta === null : true));
    if (!ok) fail('gaps.null_not_zero', 'Gap days are no data, not zero', 'A gap day shows a value.');
    else pass('gaps.null_not_zero', 'Gap days are no data, not zero', gaps.length === 0 ? 'No gap days in this range.' : `${gaps.length} gap day(s) in range are null for the missing platform and for the combined total.`);
  }

  // 11. attribution is separate from source
  {
    const ao = attributionOverview(ds, { range });
    const so = salesOverview(ds, { range });
    const part = (s: string): number => so.partition.parts.find((p) => p.source === s)!.revenueMinor;
    const ok = ao.verified.meta.revenueMinor <= part('meta') && ao.verified.google.revenueMinor <= part('google');
    const labelOnly = ao.labelWithoutEvidence.meta.orders + ao.labelWithoutEvidence.google.orders;
    if (!ok) fail('attribution.separate_from_source', 'Verified attribution is a subset of source labels', 'Verified revenue exceeds the source partition.');
    else if (labelOnly > 0) {
      partial('attribution.separate_from_source', 'Verified attribution is a subset of source labels', 'missing_evidence', `${labelOnly} paid order(s) are labelled Meta/Google by the customer but have no hard evidence. They stay in the source partition and out of ROAS.`);
    } else pass('attribution.separate_from_source', 'Verified attribution is a subset of source labels', 'Every platform-sourced order in range has hard evidence.');
  }

  // 12. order.source consistent with classification
  {
    const bad = ds.orders.filter((o) => o.source !== sourceFromAttribution(idx.cls.get(o.id)!));
    if (bad.length === 0) pass('orders.source_consistent', 'Order source matches its evidence', `All ${ds.orders.length} orders: stored source equals the source derived from their evidence.`);
    else fail('orders.source_consistent', 'Order source matches its evidence', `${bad.length} order(s) disagree.`, 0, bad.length);
  }

  // 13. surplus basis
  partial('surplus.basis', 'Advertising surplus basis', 'intentional_basis_difference', `Revenue includes ${ds.vatRatePercent}% VAT; ad spend is net. The surplus is not profit and ignores all other costs.`);

  // 14. integer money
  {
    const bad =
      ds.daily.some((r) => !Number.isInteger(r.spendMinor)) ||
      ds.orders.some((o) => !Number.isInteger(o.amountMinor)) ||
      ds.campaigns.some((c) => c.dailyBudgetMinor !== null && !Number.isInteger(c.dailyBudgetMinor));
    if (bad) fail('money.integers', 'Money is stored as integer cents', 'A money value is not an integer.');
    else pass('money.integers', 'Money is stored as integer cents', 'All spend, order and budget amounts are integers.');
  }

  // 15. nothing after the reference time
  {
    const now = ds.referenceNow;
    const late =
      ds.daily.some((r) => r.date > ds.referenceDate) ||
      ds.orders.some((o) => o.orderedAt > now || (o.paidAt ?? '') > now || (o.refundedAt ?? '') > now || (o.cancelledAt ?? '') > now) ||
      ds.leads.some((l) => l.createdAt > now);
    if (late) fail('time.no_future_records', 'No records after the reference time', 'A record is dated after the reference clock.');
    else pass('time.no_future_records', 'No records after the reference time', `Latest record is not after ${now}.`);
  }

  // 16. hierarchy
  {
    const camp = new Map(ds.campaigns.map((c) => [c.id, c]));
    const grp = new Map(ds.adGroups.map((g) => [g.id, g]));
    const ad = new Map(ds.ads.map((a) => [a.id, a]));
    const creatives = new Set(ds.creatives.map((c) => c.id));
    const ok =
      ds.adGroups.every((g) => camp.get(g.campaignId)?.platform === g.platform) &&
      ds.ads.every((a) => grp.get(a.adGroupId)?.campaignId === a.campaignId && creatives.has(a.creativeId)) &&
      ds.daily.every((r) => ad.get(r.adId)?.adGroupId === r.adGroupId && ad.get(r.adId)?.campaignId === r.campaignId && ad.get(r.adId)?.platform === r.platform) &&
      ds.orders.every((o) => idx.customers.has(o.customerId));
    if (ok) pass('hierarchy.ids_valid', 'Campaign, ad set, ad and customer ids resolve', 'Every row points to an existing parent.');
    else fail('hierarchy.ids_valid', 'Campaign, ad set, ad and customer ids resolve', 'A row points to a missing or mismatched parent.');
  }

  // 17. coverage
  {
    const months = monthKeysInRange(ds.range).length;
    if (gapDaysInRange.length > 0) {
      partial('coverage.history', 'History coverage', 'source_limitation', `${months} calendar months of history. ${gapDaysInRange.length} gap day(s) in this range: Meta source error or Google missing export. They are shown as no data.`);
    } else pass('coverage.history', 'History coverage', `${months} calendar months of history, no gap days in this range.`);
  }

  return checks;
}
