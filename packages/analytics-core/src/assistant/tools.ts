// Independent reference implementation for the Sedem Ads showcase. Not production source.
//
// Tool contracts for a grounded analytics assistant, plus deterministic handlers over an
// in-memory synthetic dataset. All tools except create_draft_proposal are read-only; the
// exception can only create a local DRAFT that a human must confirm elsewhere. Every result
// carries `facts` so that an answer can cite exactly the numbers the tools produced.

import { type AttributableOrder, attributableRoas } from '../attribution.js';
import { comparePeriods, compareEntities, entityMetrics, hasEnoughVolume, DEFAULT_VOLUME_GUARD, METRIC_DIRECTION, type EntityMetricName, type EntityTotals } from '../comparison.js';
import { type DatePreset, type DateRange, calendarDateInZone, compareDates, enumerateDays, inRange, isValidISODate, previousPeriod, resolvePreset } from '../dates.js';
import { cpc, cpl, cpm, ctr } from '../metrics.js';
import { formatMoney } from '../money.js';
import { partitionOrders } from '../sources.js';
import { type Platform, buildCanonicalSpend, platformSpend, type PlatformSpendDay } from '../spend.js';
import type { SyntheticDataset } from '../synthetic/generate.js';
import type { Operation, WriteWorkflow } from '../write-safety.js';

export interface JsonSchema {
  type: 'object' | 'string' | 'number' | 'integer' | 'array' | 'boolean';
  description?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  enum?: readonly (string | number)[];
  items?: JsonSchema;
  minItems?: number;
  maxItems?: number;
  minimum?: number;
  maximum?: number;
  additionalProperties?: boolean;
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: JsonSchema & { type: 'object' };
  /** True for every tool that cannot change anything outside a local draft list. */
  readOnly: boolean;
}

export interface Fact {
  label: string;
  value: number | string;
  unit: string;
  basis: string;
  source: string;
  /** Human-readable rendering of value. Answers may quote either value or display. */
  display: string;
}

export interface ToolResult {
  tool: string;
  ok: boolean;
  error?: string;
  /** Present when the question was valid but the data cannot answer it (no data is not zero). */
  noData?: string;
  data?: unknown;
  facts: Fact[];
}

export interface ToolContext {
  dataset: SyntheticDataset;
  /** Fixed "current" instant for reproducible results. */
  now: Date;
  /** Required only for create_draft_proposal. */
  workflow?: WriteWorkflow;
}

const PERIOD_PRESETS = ['last7', 'last14', 'last30', 'last90', 'thisMonth', 'previousMonth', 'yearToDate', 'custom'] as const;

const periodSchema: JsonSchema = {
  type: 'object',
  description: 'Reporting window in the account time zone. Completed days only (today excluded).',
  properties: {
    preset: { type: 'string', enum: PERIOD_PRESETS },
    start: { type: 'string', description: 'ISO date, only for preset custom' },
    end: { type: 'string', description: 'ISO date, only for preset custom' },
  },
  required: ['preset'],
};
const platformSchema: JsonSchema = { type: 'string', enum: ['meta', 'google', 'all'], description: 'Ad platform, or all' };
const levelSchema: JsonSchema = { type: 'string', enum: ['campaign', 'ad'] };
const entityMetricEnum = ['ctr', 'cpc', 'cpm', 'cpl', 'conversionRate', 'spend', 'leads'] as const;

export const TOOL_DEFINITIONS: readonly ToolDefinition[] = [
  {
    name: 'get_kpis',
    description: 'Spend, impressions, clicks, platform-reported leads, CTR, CPC, CPM and CPL for a period and platform. Ratios are computed from sums.',
    inputSchema: { type: 'object', properties: { period: periodSchema, platform: platformSchema }, required: ['period', 'platform'] },
    readOnly: true,
  },
  {
    name: 'compare_periods',
    description: 'Compare a period with the equal-length period immediately before it: absolute and relative change per metric.',
    inputSchema: { type: 'object', properties: { period: periodSchema, platform: platformSchema }, required: ['period', 'platform'] },
    readOnly: true,
  },
  {
    name: 'compare_entities',
    description: 'Side-by-side comparison of 2 to 4 campaigns or ads, with best-per-metric and a minimum-volume guard.',
    inputSchema: {
      type: 'object',
      properties: {
        period: periodSchema,
        level: levelSchema,
        entityIds: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 4, description: 'Optional; defaults to the 4 largest by spend' },
      },
      required: ['period', 'level'],
    },
    readOnly: true,
  },
  {
    name: 'top_entities',
    description: 'Rank campaigns or ads by a metric (best or worst). Entities below the minimum volume are excluded and counted.',
    inputSchema: {
      type: 'object',
      properties: {
        period: periodSchema,
        platform: platformSchema,
        level: levelSchema,
        metric: { type: 'string', enum: entityMetricEnum },
        direction: { type: 'string', enum: ['best', 'worst'] },
        limit: { type: 'integer', minimum: 1, maximum: 10 },
      },
      required: ['period', 'level', 'metric', 'direction'],
    },
    readOnly: true,
  },
  {
    name: 'sales_by_source',
    description: 'Paid orders and revenue partitioned by source. Parts sum to the eligible total; the selected-sources subtotal is a subset.',
    inputSchema: {
      type: 'object',
      properties: { period: periodSchema, basis: { type: 'string', enum: ['order', 'payment'] } },
      required: ['period'],
    },
    readOnly: true,
  },
  {
    name: 'attributable_roas',
    description: 'Attributable ROAS per platform: revenue of paid orders with hard evidence divided by that platform spend. Label-only and unknown orders are excluded.',
    inputSchema: { type: 'object', properties: { period: periodSchema }, required: ['period'] },
    readOnly: true,
  },
  {
    name: 'spend_breakdown',
    description: 'Canonical spend for a period: Meta, Google and total (total only on days where both platforms have data) with coverage.',
    inputSchema: { type: 'object', properties: { period: periodSchema }, required: ['period'] },
    readOnly: true,
  },
  {
    name: 'create_draft_proposal',
    description: 'Create a LOCAL DRAFT change proposal (pause, resume, set_budget). It is never executed by the assistant; a human with the right role must preview, validate and confirm it.',
    inputSchema: {
      type: 'object',
      properties: {
        platform: { type: 'string', enum: ['meta', 'google'] },
        operation: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['pause', 'resume', 'set_budget'] },
            entityType: { type: 'string', enum: ['campaign', 'ad_set', 'ad'] },
            entityId: { type: 'string' },
            newDailyBudgetMinor: { type: 'integer', minimum: 1 },
          },
          required: ['type', 'entityType', 'entityId'],
        },
      },
      required: ['platform', 'operation'],
    },
    readOnly: false,
  },
];

// ---------------------------------------------------------------------------------------------
// helpers

const SOURCE = 'synthetic demo dataset';

function fmtCount(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

function eurFact(label: string, minor: number, basis: string, source = SOURCE): Fact {
  const rounded = Math.round(minor);
  return { label, value: rounded / 100, unit: 'EUR', basis, source, display: formatMoney(rounded) };
}

function countFact(label: string, n: number, basis: string, source = SOURCE): Fact {
  return { label, value: Math.round(n), unit: 'count', basis, source, display: fmtCount(n) };
}

function pctFact(label: string, fraction: number, basis: string, source = SOURCE): Fact {
  const v = Math.round(fraction * 10000) / 100;
  return { label, value: v, unit: '%', basis, source, display: `${v.toFixed(2)}%` };
}

function textFact(label: string, value: string, basis: string, source = SOURCE): Fact {
  return { label, value, unit: 'text', basis, source, display: value };
}

function fail(tool: string, error: string): ToolResult {
  return { tool, ok: false, error, facts: [] };
}

type Obj = Record<string, unknown>;
const isObj = (x: unknown): x is Obj => typeof x === 'object' && x !== null && !Array.isArray(x);

function resolvePeriod(ctx: ToolContext, raw: unknown): DateRange | string {
  const p = typeof raw === 'string' ? { preset: raw } : raw;
  if (!isObj(p) || typeof p.preset !== 'string' || !(PERIOD_PRESETS as readonly string[]).includes(p.preset)) {
    return 'period.preset must be one of ' + PERIOD_PRESETS.join(', ');
  }
  let custom: DateRange | undefined;
  if (p.preset === 'custom') {
    if (typeof p.start !== 'string' || typeof p.end !== 'string' || !isValidISODate(p.start) || !isValidISODate(p.end)) {
      return 'custom period needs valid ISO start and end dates';
    }
    if (compareDates(p.start, p.end) > 0) return 'custom period start is after end';
    custom = { start: p.start, end: p.end };
  }
  const range = resolvePreset(p.preset as DatePreset, { now: ctx.now, timeZone: ctx.dataset.timeZone, completedDaysOnly: true, custom });
  return range ?? 'the selected period contains no completed days yet';
}

function pickPlatform(raw: unknown): 'meta' | 'google' | 'all' | string {
  if (raw === 'meta' || raw === 'google' || raw === 'all') return raw;
  return 'platform must be meta, google or all';
}

const isPlatformChoice = (x: string): x is 'meta' | 'google' | 'all' => x === 'meta' || x === 'google' || x === 'all';

function periodBasis(range: DateRange, platform?: string): string {
  return `${platform ? platform + ', ' : ''}${range.start} to ${range.end}, completed days`;
}

interface Totals {
  spendMinor: number | null;
  impressions: number | null;
  clicks: number | null;
  leads: number | null;
  platformConversions: number | null;
  presentDays: number;
  expectedDays: number;
}

function platformDays(ds: SyntheticDataset, range: DateRange, platform: Platform): Map<string, { spend: number; impressions: number; clicks: number; leads: number; conv: number }> {
  const m = new Map<string, { spend: number; impressions: number; clicks: number; leads: number; conv: number }>();
  for (const r of ds.daily) {
    if (r.platform !== platform || !inRange(r.date, range)) continue;
    const cur = m.get(r.date) ?? { spend: 0, impressions: 0, clicks: 0, leads: 0, conv: 0 };
    cur.spend += r.spendMinor;
    cur.impressions += r.impressions;
    cur.clicks += r.clicks;
    cur.leads += r.leads;
    cur.conv += r.platformConversions;
    m.set(r.date, cur);
  }
  return m;
}

/** KPI totals. For 'all', only days present on BOTH platforms count, matching canonical spend. */
function kpiTotals(ds: SyntheticDataset, range: DateRange, platform: 'meta' | 'google' | 'all'): Totals {
  const days = enumerateDays(range);
  const meta = platform === 'google' ? null : platformDays(ds, range, 'meta');
  const google = platform === 'meta' ? null : platformDays(ds, range, 'google');
  const t = { spend: 0, impressions: 0, clicks: 0, leads: 0, conv: 0 };
  let present = 0;
  for (const d of days) {
    const a = meta?.get(d);
    const b = google?.get(d);
    if ((meta && !a) || (google && !b)) continue;
    present += 1;
    for (const x of [a, b]) {
      if (!x) continue;
      t.spend += x.spend;
      t.impressions += x.impressions;
      t.clicks += x.clicks;
      t.leads += x.leads;
      t.conv += x.conv;
    }
  }
  if (present === 0) {
    return { spendMinor: null, impressions: null, clicks: null, leads: null, platformConversions: null, presentDays: 0, expectedDays: days.length };
  }
  return { spendMinor: t.spend, impressions: t.impressions, clicks: t.clicks, leads: t.leads, platformConversions: t.conv, presentDays: present, expectedDays: days.length };
}

function spendInputs(ds: SyntheticDataset, range: DateRange): { meta: PlatformSpendDay[]; google: PlatformSpendDay[] } {
  const build = (p: Platform): PlatformSpendDay[] => [...platformDays(ds, range, p)].map(([date, v]) => ({ date, spendMinor: v.spend }));
  return { meta: build('meta'), google: build('google') };
}

function entityTotals(ds: SyntheticDataset, range: DateRange, level: 'campaign' | 'ad', platform: 'meta' | 'google' | 'all'): EntityTotals[] {
  const names = new Map<string, string>();
  const plat = new Map<string, Platform>();
  if (level === 'campaign') for (const c of ds.campaigns) { names.set(c.id, c.name); plat.set(c.id, c.platform); }
  else for (const a of ds.ads) { names.set(a.id, `${ds.campaigns.find((c) => c.id === a.campaignId)?.name ?? a.campaignId} / ${a.name}`); plat.set(a.id, a.platform); }
  const acc = new Map<string, { spend: number; impressions: number; clicks: number; leads: number }>();
  for (const r of ds.daily) {
    if (!inRange(r.date, range)) continue;
    if (platform !== 'all' && r.platform !== platform) continue;
    const id = level === 'campaign' ? r.campaignId : r.adId;
    const cur = acc.get(id) ?? { spend: 0, impressions: 0, clicks: 0, leads: 0 };
    cur.spend += r.spendMinor;
    cur.impressions += r.impressions;
    cur.clicks += r.clicks;
    cur.leads += r.leads;
    acc.set(id, cur);
  }
  return [...acc].map(([id, v]) => ({ id, name: names.get(id) ?? id, spendMinor: v.spend, impressions: v.impressions, clicks: v.clicks, leads: v.leads }));
}

function metricFact(label: string, metric: EntityMetricName | 'spend' | 'leads', value: number | null, basis: string): Fact | null {
  if (value === null) return null;
  if (metric === 'ctr' || metric === 'conversionRate') return pctFact(label, value, basis);
  if (metric === 'leads') return countFact(label, value, basis);
  return eurFact(label, value, basis);
}

function kpiFacts(prefix: string, t: Totals, basis: string): Fact[] {
  const facts: Fact[] = [];
  const add = (f: Fact | null): void => { if (f) facts.push(f); };
  if (t.spendMinor !== null) add(eurFact(`${prefix}Spend`, t.spendMinor, basis));
  if (t.impressions !== null) add(countFact(`${prefix}Impressions`, t.impressions, basis));
  if (t.clicks !== null) add(countFact(`${prefix}Clicks`, t.clicks, basis));
  if (t.leads !== null) add(countFact(`${prefix}Platform-reported leads`, t.leads, `${basis}; platform-reported, not verified orders`));
  const rates: [string, number | null, 'pct' | 'eur'][] = [
    [`${prefix}CTR`, ctr(t.clicks, t.impressions), 'pct'],
    [`${prefix}CPC`, cpc(t.spendMinor, t.clicks), 'eur'],
    [`${prefix}CPM`, cpm(t.spendMinor, t.impressions), 'eur'],
    [`${prefix}CPL`, cpl(t.spendMinor, t.leads), 'eur'],
  ];
  for (const [label, v, kind] of rates) if (v !== null) add(kind === 'pct' ? pctFact(label, v, basis) : eurFact(label, v, basis));
  return facts;
}

// ---------------------------------------------------------------------------------------------
// handlers

function getKpis(ctx: ToolContext, input: Obj): ToolResult {
  const range = resolvePeriod(ctx, input.period);
  if (typeof range === 'string') return fail('get_kpis', range);
  const platform = pickPlatform(input.platform);
  if (!isPlatformChoice(platform)) return fail('get_kpis', platform);
  const t = kpiTotals(ctx.dataset, range, platform);
  if (t.presentDays === 0) return { tool: 'get_kpis', ok: true, noData: 'no data for this period and platform', facts: [] };
  const basis = periodBasis(range, platform);
  const facts = kpiFacts('', t, basis);
  facts.push(countFact('Days with data', t.presentDays, basis), countFact('Days in period', t.expectedDays, basis));
  return { tool: 'get_kpis', ok: true, data: { range, platform, totals: t }, facts };
}

function comparePeriodsTool(ctx: ToolContext, input: Obj): ToolResult {
  const range = resolvePeriod(ctx, input.period);
  if (typeof range === 'string') return fail('compare_periods', range);
  const platform = pickPlatform(input.platform);
  if (!isPlatformChoice(platform)) return fail('compare_periods', platform);
  const prev = previousPeriod(range);
  const cur = kpiTotals(ctx.dataset, range, platform);
  const old = kpiTotals(ctx.dataset, prev, platform);
  if (cur.presentDays === 0 || old.presentDays === 0) {
    return { tool: 'compare_periods', ok: true, noData: 'one of the two periods has no data', facts: [] };
  }
  const toMetrics = (t: Totals): Record<string, number | null> => ({
    spend: t.spendMinor, clicks: t.clicks, leads: t.leads, ctr: ctr(t.clicks, t.impressions), cpl: cpl(t.spendMinor, t.leads),
  });
  const cmp = comparePeriods(range, toMetrics(cur), toMetrics(old));
  const basis = `${platform}, ${range.start} to ${range.end} vs ${prev.start} to ${prev.end}`;
  const facts: Fact[] = [];
  const kinds: Record<string, 'eur' | 'count' | 'pct'> = { spend: 'eur', clicks: 'count', leads: 'count', ctr: 'pct', cpl: 'eur' };
  for (const [key, d] of Object.entries(cmp.metrics)) {
    const kind = kinds[key]!;
    const mk = (label: string, v: number): Fact => (kind === 'eur' ? eurFact(label, v, basis) : kind === 'pct' ? pctFact(label, v, basis) : countFact(label, v, basis));
    if (d.current !== null) facts.push(mk(`Current ${key}`, d.current));
    if (d.previous !== null) facts.push(mk(`Previous ${key}`, d.previous));
    if (d.relative !== null) facts.push({ label: `Change in ${key}`, value: Math.round(d.relative * 10000) / 100, unit: '%', basis, source: SOURCE, display: `${(Math.round(d.relative * 10000) / 100).toFixed(2)}%` });
  }
  return { tool: 'compare_periods', ok: true, data: cmp, facts };
}

function compareEntitiesTool(ctx: ToolContext, input: Obj): ToolResult {
  const range = resolvePeriod(ctx, input.period);
  if (typeof range === 'string') return fail('compare_entities', range);
  if (input.level !== 'campaign' && input.level !== 'ad') return fail('compare_entities', 'level must be campaign or ad');
  const all = entityTotals(ctx.dataset, range, input.level, 'all');
  let chosen: EntityTotals[];
  if (input.entityIds !== undefined) {
    if (!Array.isArray(input.entityIds) || input.entityIds.some((x) => typeof x !== 'string')) return fail('compare_entities', 'entityIds must be an array of strings');
    const wanted = input.entityIds as string[];
    chosen = wanted.map((id) => all.find((e) => e.id === id)).filter((e): e is EntityTotals => !!e);
    if (chosen.length !== wanted.length) return fail('compare_entities', 'one or more entities have no data in this period');
  } else {
    chosen = [...all].sort((a, b) => (b.spendMinor ?? 0) - (a.spendMinor ?? 0)).slice(0, 4);
  }
  if (chosen.length < 2 || chosen.length > 4) return fail('compare_entities', 'need between 2 and 4 entities');
  const cmp = compareEntities(chosen);
  const basis = periodBasis(range);
  const facts: Fact[] = [];
  for (const e of chosen) {
    const m = cmp.table[e.id]!;
    for (const key of ['ctr', 'cpl'] as const) {
      const f = metricFact(`${e.name} ${key.toUpperCase()}`, key, m[key], basis);
      if (f) facts.push(f);
    }
    if (e.spendMinor !== null) facts.push(eurFact(`${e.name} spend`, e.spendMinor, basis));
  }
  for (const key of ['ctr', 'cpl'] as const) {
    const b = cmp.best[key];
    if (b.status === 'winner') facts.push(textFact(`Best ${key.toUpperCase()}`, chosen.find((e) => e.id === b.entityId)!.name, `${basis}; ${METRIC_DIRECTION[key]}`));
    else facts.push(textFact(`Best ${key.toUpperCase()}`, b.status === 'tie' ? 'tie' : 'insufficient data', basis));
  }
  return { tool: 'compare_entities', ok: true, data: cmp, facts };
}

function topEntities(ctx: ToolContext, input: Obj): ToolResult {
  const range = resolvePeriod(ctx, input.period);
  if (typeof range === 'string') return fail('top_entities', range);
  const platform = input.platform === undefined ? 'all' : pickPlatform(input.platform);
  if (!isPlatformChoice(platform)) return fail('top_entities', platform);
  if (input.level !== 'campaign' && input.level !== 'ad') return fail('top_entities', 'level must be campaign or ad');
  const metric = input.metric as string;
  if (!(entityMetricEnum as readonly string[]).includes(metric)) return fail('top_entities', `metric must be one of ${entityMetricEnum.join(', ')}`);
  if (input.direction !== 'best' && input.direction !== 'worst') return fail('top_entities', 'direction must be best or worst');
  const limit = input.limit === undefined ? 3 : Number(input.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 10) return fail('top_entities', 'limit must be an integer 1-10');

  const all = entityTotals(ctx.dataset, range, input.level, platform);
  const m = metric as EntityMetricName | 'spend' | 'leads';
  const guarded = m === 'spend' || m === 'leads' ? all : all.filter((e) => hasEnoughVolume(e, m, DEFAULT_VOLUME_GUARD));
  const scored = guarded
    .map((e) => ({ e, v: m === 'spend' ? e.spendMinor : m === 'leads' ? e.leads : entityMetrics(e)[m] }))
    .filter((x): x is { e: EntityTotals; v: number } => x.v !== null);
  const lowerBetter = m !== 'spend' && m !== 'leads' && METRIC_DIRECTION[m] === 'lower_is_better';
  const bestFirst = input.direction === 'best';
  scored.sort((a, b) => ((lowerBetter ? a.v - b.v : b.v - a.v) * (bestFirst ? 1 : -1)) || a.e.id.localeCompare(b.e.id));
  const top = scored.slice(0, limit);
  const basis = periodBasis(range, platform);
  const facts: Fact[] = [];
  for (const x of top) {
    const f = metricFact(`${x.e.name} ${m}`, m, x.v, basis);
    if (f) facts.push(f);
  }
  const excluded = all.length - guarded.length;
  if (excluded > 0) facts.push(countFact('Excluded for low volume', excluded, `${basis}; minimum ${DEFAULT_VOLUME_GUARD.minImpressions} impressions / ${DEFAULT_VOLUME_GUARD.minClicks} clicks / ${DEFAULT_VOLUME_GUARD.minLeads} leads`));
  if (top.length === 0) return { tool: 'top_entities', ok: true, noData: 'no entity has enough volume for this metric', facts };
  return { tool: 'top_entities', ok: true, data: top.map((x) => ({ id: x.e.id, name: x.e.name, value: x.v })), facts };
}

function salesBySource(ctx: ToolContext, input: Obj): ToolResult {
  const range = resolvePeriod(ctx, input.period);
  if (typeof range === 'string') return fail('sales_by_source', range);
  const basisOpt = input.basis === undefined ? 'order' : input.basis;
  if (basisOpt !== 'order' && basisOpt !== 'payment') return fail('sales_by_source', 'basis must be order or payment');
  const part = partitionOrders(ctx.dataset.orders, { range, timeZone: ctx.dataset.timeZone, basis: basisOpt });
  const basis = `${range.start} to ${range.end}, ${basisOpt}-date basis, paid orders only, gross amounts`;
  const facts: Fact[] = [];
  for (const p of part.parts) {
    facts.push(eurFact(`${p.source} revenue`, p.revenueMinor, basis), countFact(`${p.source} orders`, p.orders, basis));
  }
  facts.push(eurFact('Total paid revenue', part.eligibleRevenueMinor, basis), countFact('Total paid orders', part.eligibleOrders, basis));
  facts.push(eurFact(`Selected sources subtotal (${part.selected.sources.join(' + ')})`, part.selected.revenueMinor, `${basis}; subset of the parts, not an extra part`));
  return { tool: 'sales_by_source', ok: true, data: part, facts };
}

function attributableRoasTool(ctx: ToolContext, input: Obj): ToolResult {
  const range = resolvePeriod(ctx, input.period);
  if (typeof range === 'string') return fail('attributable_roas', range);
  const ds = ctx.dataset;
  const inPeriod: AttributableOrder[] = ds.orders.filter((o) => inRange(calendarDateInZone(o.orderedAt, ds.timeZone), range));
  const spendRows = spendInputs(ds, range);
  const spend = { meta: platformSpend(spendRows.meta, range, 'meta').totalMinor, google: platformSpend(spendRows.google, range, 'google').totalMinor };
  const report = attributableRoas(inPeriod, spend);
  const basis = `${range.start} to ${range.end}, order-date basis; revenue only from orders with hard evidence (verified lead match or click id)`;
  const facts: Fact[] = [];
  for (const p of report.platforms) {
    facts.push(eurFact(`${p.platform} attributed revenue`, p.attributedRevenueMinor, basis), countFact(`${p.platform} attributed orders`, p.attributedOrders, basis));
    if (p.spendMinor !== null) facts.push(eurFact(`${p.platform} spend`, p.spendMinor, periodBasis(range, p.platform)));
    if (p.roas !== null) facts.push({ label: `${p.platform} attributable ROAS`, value: Math.round(p.roas * 100) / 100, unit: 'x', basis, source: SOURCE, display: `${p.roas.toFixed(2)}x` });
  }
  facts.push(eurFact('Label-only revenue (not in ROAS)', report.notAttributed.sourceOnly.revenueMinor, basis), eurFact('Unknown-source revenue (not in ROAS)', report.notAttributed.unknown.revenueMinor, basis));
  return { tool: 'attributable_roas', ok: true, data: report, facts };
}

function spendBreakdown(ctx: ToolContext, input: Obj): ToolResult {
  const range = resolvePeriod(ctx, input.period);
  if (typeof range === 'string') return fail('spend_breakdown', range);
  const canon = buildCanonicalSpend({ range, ...spendInputs(ctx.dataset, range) });
  if (canon.totalMinor === null) return { tool: 'spend_breakdown', ok: true, noData: 'no complete day with data on both platforms', facts: [] };
  const basis = `${range.start} to ${range.end}, days with data on both platforms`;
  const facts = [
    eurFact('Meta spend', canon.metaMinor ?? 0, basis),
    eurFact('Google spend', canon.googleMinor ?? 0, basis),
    eurFact('Total spend', canon.totalMinor, basis),
    countFact('Complete days', canon.completeDays, basis),
    countFact('Days in period', canon.expectedDays, basis),
  ];
  return { tool: 'spend_breakdown', ok: true, data: { totalMinor: canon.totalMinor, partial: canon.partial, missingDates: canon.missingDates }, facts };
}

function createDraft(ctx: ToolContext, input: Obj): ToolResult {
  if (!ctx.workflow) return fail('create_draft_proposal', 'no draft store configured');
  if (input.platform !== 'meta' && input.platform !== 'google') return fail('create_draft_proposal', 'platform must be meta or google');
  const op = input.operation;
  if (!isObj(op) || !['pause', 'resume', 'set_budget'].includes(op.type as string)) return fail('create_draft_proposal', 'operation.type must be pause, resume or set_budget');
  if (typeof op.entityId !== 'string' || !['campaign', 'ad_set', 'ad'].includes(op.entityType as string)) return fail('create_draft_proposal', 'operation needs entityType and entityId');
  let operation: Operation;
  if (op.type === 'set_budget') {
    if (typeof op.newDailyBudgetMinor !== 'number') return fail('create_draft_proposal', 'set_budget needs newDailyBudgetMinor');
    operation = { type: 'set_budget', entityType: op.entityType as 'campaign', entityId: op.entityId, newDailyBudgetMinor: op.newDailyBudgetMinor };
  } else {
    operation = { type: op.type as 'pause' | 'resume', entityType: op.entityType as 'campaign', entityId: op.entityId };
  }
  let draft;
  try {
    draft = ctx.workflow.createProposal({
      platform: input.platform,
      accountId: ctx.dataset.accounts[input.platform],
      operation,
      actor: { id: 'assistant', kind: 'ai', role: 'VIEWER' },
    });
  } catch (e) {
    return fail('create_draft_proposal', e instanceof Error ? e.message : 'draft rejected');
  }
  return {
    tool: 'create_draft_proposal',
    ok: true,
    data: { proposalId: draft.id, status: draft.status },
    facts: [textFact('Draft proposal status', draft.status, 'local draft only; needs human preview, validation and confirmation', 'write workflow')],
  };
}

const HANDLERS: Record<string, (ctx: ToolContext, input: Obj) => ToolResult> = {
  get_kpis: getKpis,
  compare_periods: comparePeriodsTool,
  compare_entities: compareEntitiesTool,
  top_entities: topEntities,
  sales_by_source: salesBySource,
  attributable_roas: attributableRoasTool,
  spend_breakdown: spendBreakdown,
  create_draft_proposal: createDraft,
};

/** Run a tool by name. Unknown tools and malformed input return `ok: false`; nothing throws. */
export function runTool(ctx: ToolContext, name: string, input: unknown): ToolResult {
  const handler = HANDLERS[name];
  if (!handler) return fail(name, `unknown tool "${name}"`);
  if (!isObj(input)) return fail(name, 'input must be an object');
  return handler(ctx, input);
}
