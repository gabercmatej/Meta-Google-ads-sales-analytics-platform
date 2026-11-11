// Independent reference implementation for the Sedem Ads showcase. Not production source.
//
// A deterministic, LLM-free simulation of a grounded analytics assistant. It routes a question
// to read-only tools, then writes an answer in which every number is copied from a tool fact.
// `checkGrounding` is the guard a real LLM-backed assistant would also have to pass: any number
// in an answer that no tool produced is reported as ungrounded.

import { type Fact, type ToolContext, type ToolResult, runTool } from './tools.js';

export type Intent =
  | 'kpis'
  | 'compare_periods'
  | 'compare_entities'
  | 'top_entities'
  | 'sales_by_source'
  | 'attributable_roas'
  | 'spend_breakdown'
  | 'draft_change'
  | 'unsupported';

export interface ToolCall {
  name: string;
  input: Record<string, unknown>;
}

export interface AssistantAnswer {
  question: string;
  intent: Intent;
  toolCalls: ToolCall[];
  results: ToolResult[];
  text: string;
  facts: Fact[];
  grounding: GroundingReport;
  /** The assistant never executes anything. True only when a local draft was created. */
  draftCreated: boolean;
}

export interface GroundingReport {
  grounded: boolean;
  ungroundedNumbers: string[];
}

// ---------------------------------------------------------------------------------------------
// routing

function detectPeriod(q: string): Record<string, unknown> {
  if (/\b(last|past) 7 days\b|\blast week\b/.test(q)) return { preset: 'last7' };
  if (/\b(last|past) 14 days\b/.test(q)) return { preset: 'last14' };
  if (/\b(last|past) 90 days\b/.test(q)) return { preset: 'last90' };
  if (/\b(last|past) 30 days\b/.test(q)) return { preset: 'last30' };
  if (/\b(last|previous) month\b/.test(q)) return { preset: 'previousMonth' };
  if (/\bthis month\b/.test(q)) return { preset: 'thisMonth' };
  if (/\b(this year|year to date|ytd)\b/.test(q)) return { preset: 'yearToDate' };
  const range = /(\d{4}-\d{2}-\d{2})\s*(?:to|until|-|–)\s*(\d{4}-\d{2}-\d{2})/.exec(q);
  if (range) return { preset: 'custom', start: range[1], end: range[2] };
  return { preset: 'last30' };
}

function detectPlatform(q: string): 'meta' | 'google' | 'all' {
  const meta = /\b(meta|facebook|instagram)\b/.test(q);
  const google = /\bgoogle\b/.test(q);
  if (meta && !google) return 'meta';
  if (google && !meta) return 'google';
  return 'all';
}

function detectLevel(q: string): 'campaign' | 'ad' {
  return /\bads?\b/.test(q) && !/\bcampaigns?\b/.test(q) ? 'ad' : 'campaign';
}

function detectMetric(q: string): string {
  if (/\bcpl\b|cost per lead/.test(q)) return 'cpl';
  if (/\bcpc\b|cost per click/.test(q)) return 'cpc';
  if (/\bcpm\b/.test(q)) return 'cpm';
  if (/\bctr\b|click.through/.test(q)) return 'ctr';
  if (/conversion rate/.test(q)) return 'conversionRate';
  if (/\bleads?\b/.test(q)) return 'leads';
  return 'spend';
}

export function routeQuestion(question: string): { intent: Intent; calls: ToolCall[] } {
  const q = question.toLowerCase();
  const period = detectPeriod(q);
  const platform = detectPlatform(q);

  if (/\b(pause|resume|stop|start|set .*budget|change .*budget|increase .*budget|decrease .*budget)\b/.test(q)) {
    return { intent: 'draft_change', calls: [] }; // parsed by the draft path, never executed
  }
  if (/\broas\b|return on ad spend/.test(q)) return { intent: 'attributable_roas', calls: [{ name: 'attributable_roas', input: { period } }] };
  if (/\b(sales|revenue|orders)\b.*\b(source|channel|by)\b|\bby source\b/.test(q)) {
    return { intent: 'sales_by_source', calls: [{ name: 'sales_by_source', input: { period } }] };
  }
  if (/\b(compare|versus|vs\.?)\b.*\b(period|previous|before|last)\b|\bcompared to\b|\bchange\b.*\bfrom\b/.test(q)) {
    return { intent: 'compare_periods', calls: [{ name: 'compare_periods', input: { period, platform } }] };
  }
  if (/\b(compare|versus|vs\.?)\b.*\b(campaigns?|ads?)\b/.test(q)) {
    return { intent: 'compare_entities', calls: [{ name: 'compare_entities', input: { period, level: detectLevel(q) } }] };
  }
  if (/\b(best|worst|top|bottom|lowest|highest)\b/.test(q) && /\b(campaigns?|ads?|creatives?)\b/.test(q)) {
    const worst = /\b(worst|bottom)\b/.test(q);
    const metric = detectMetric(q);
    // "lowest CPL" means best for a cost metric; "highest CTR" means best for a rate metric.
    const lowerBetter = metric === 'cpl' || metric === 'cpc' || metric === 'cpm';
    let direction: 'best' | 'worst' = worst ? 'worst' : 'best';
    if (/\blowest\b/.test(q)) direction = lowerBetter ? 'best' : 'worst';
    if (/\bhighest\b/.test(q)) direction = lowerBetter ? 'worst' : 'best';
    return { intent: 'top_entities', calls: [{ name: 'top_entities', input: { period, platform, level: detectLevel(q), metric, direction, limit: 3 } }] };
  }
  if (/\bspend\b|\bspent\b|\bcost\b/.test(q) && platform === 'all' && /\b(total|combined|both)\b/.test(q)) {
    return { intent: 'spend_breakdown', calls: [{ name: 'spend_breakdown', input: { period } }] };
  }
  if (/\b(spend|spent|impressions|clicks|leads|ctr|cpc|cpm|cpl|kpis?|performance)\b/.test(q)) {
    return { intent: 'kpis', calls: [{ name: 'get_kpis', input: { period, platform } }] };
  }
  return { intent: 'unsupported', calls: [] };
}

// ---------------------------------------------------------------------------------------------
// draft path

function parseDraft(q: string, ctx: ToolContext): ToolCall | null {
  const lower = q.toLowerCase();
  const platform = /\bgoogle\b/.test(lower) ? 'google' : 'meta';
  const id = /\b((?:meta|google)-[a-z0-9-]+)\b/i.exec(q)?.[1]?.toLowerCase();
  if (!id) return null;
  const ds = ctx.dataset;
  const entityType = ds.campaigns.some((c) => c.id === id) ? 'campaign' : ds.adGroups.some((g) => g.id === id) ? 'ad_set' : ds.ads.some((x) => x.id === id) ? 'ad' : null;
  if (!entityType) return null;
  if (/\bresume|start\b/.test(lower)) return { name: 'create_draft_proposal', input: { platform, operation: { type: 'resume', entityType, entityId: id } } };
  if (/\bpause|stop\b/.test(lower)) return { name: 'create_draft_proposal', input: { platform, operation: { type: 'pause', entityType, entityId: id } } };
  const eur = /(\d+(?:\.\d{1,2})?)\s*(?:eur|€)/i.exec(q);
  if (eur && /budget/.test(lower)) {
    const minor = Math.round(Number(eur[1]) * 100);
    return { name: 'create_draft_proposal', input: { platform, operation: { type: 'set_budget', entityType, entityId: id, newDailyBudgetMinor: minor } } };
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// grounding

const NUMBER_RE = /-?\d[\d,]*(?:\.\d+)?/g;

function normalizeNumber(s: string): string {
  const n = Number(s.replace(/,/g, ''));
  return Number.isFinite(n) ? String(n) : s;
}

/** All numeric tokens (digits only) that a fact makes legitimate to quote. */
function allowedNumbers(facts: readonly Fact[]): Set<string> {
  const allowed = new Set<string>();
  for (const f of facts) {
    for (const text of [f.display, f.basis, String(f.value), f.label]) {
      for (const m of text.matchAll(NUMBER_RE)) allowed.add(normalizeNumber(m[0]));
    }
    if (typeof f.value === 'number') {
      allowed.add(normalizeNumber(String(f.value)));
      allowed.add(normalizeNumber(f.value.toFixed(2)));
    }
  }
  return allowed;
}

/**
 * Every number quoted in `text` must appear in the facts (value, display, label or basis).
 * Numbers that are part of an ISO date are ignored.
 */
export function checkGrounding(text: string, facts: readonly Fact[]): GroundingReport {
  const allowed = allowedNumbers(facts);
  const stripped = text.replace(/\d{4}-\d{2}-\d{2}/g, ' ');
  const ungrounded: string[] = [];
  for (const m of stripped.matchAll(NUMBER_RE)) {
    const raw = m[0].replace(/[,.]$/, '');
    if (!allowed.has(normalizeNumber(raw))) ungrounded.push(raw);
  }
  return { grounded: ungrounded.length === 0, ungroundedNumbers: ungrounded };
}

// ---------------------------------------------------------------------------------------------
// answer composition

function lines(facts: readonly Fact[], max = 12): string {
  return facts.slice(0, max).map((f) => `- ${f.label}: ${f.display}`).join('\n');
}

function compose(intent: Intent, results: ToolResult[]): string {
  const r = results[0];
  if (!r) return '';
  if (!r.ok) return `I could not answer that: ${r.error}.`;
  if (r.noData) return `There is no data to answer this (${r.noData}). That is not the same as zero.`;
  const basis = r.facts[0]?.basis ?? '';
  const head: Record<Intent, string> = {
    kpis: 'Here are the figures',
    compare_periods: 'Here is the period comparison',
    compare_entities: 'Here is the side-by-side comparison',
    top_entities: 'Here is the ranking',
    sales_by_source: 'Paid sales by source (the parts add up to the total; the selected-sources subtotal is a subset)',
    attributable_roas: 'Attributable ROAS counts only orders with hard evidence of a paid ad. Label-only and unknown orders are excluded',
    spend_breakdown: 'Spend breakdown (the total only counts days where both platforms have data)',
    draft_change: 'A local draft was created. Nothing was changed in any ad account; a human must review and confirm it',
    unsupported: '',
  };
  return `${head[intent]} (${basis}):\n${lines(r.facts)}`;
}

export function answerQuestion(ctx: ToolContext, question: string): AssistantAnswer {
  const routed = routeQuestion(question);
  let calls = routed.calls;
  if (routed.intent === 'draft_change') {
    const draft = parseDraft(question, ctx);
    calls = draft ? [draft] : [];
    if (!draft) {
      const text = 'I can only prepare a local draft, and I need an existing entity id and an operation (pause, resume, or a budget in EUR).';
      return { question, intent: 'draft_change', toolCalls: [], results: [], text, facts: [], grounding: checkGrounding(text, []), draftCreated: false };
    }
  }
  if (routed.intent === 'unsupported') {
    const text = 'I can answer questions about KPIs, period comparisons, campaign or ad rankings, sales by source, attributable ROAS and spend. I will not guess beyond those tools.';
    return { question, intent: 'unsupported', toolCalls: [], results: [], text, facts: [], grounding: { grounded: true, ungroundedNumbers: [] }, draftCreated: false };
  }
  const results = calls.map((c) => runTool(ctx, c.name, c.input));
  const text = compose(routed.intent, results);
  const facts = results.flatMap((r) => r.facts);
  const draftCreated = results.some((r) => r.tool === 'create_draft_proposal' && r.ok);
  return { question, intent: routed.intent, toolCalls: calls, results, text, facts, grounding: checkGrounding(text, facts), draftCreated };
}
