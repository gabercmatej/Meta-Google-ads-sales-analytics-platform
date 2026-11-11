// Deterministic assistant engine. question -> intent router -> analytics tools -> five sections.
// No language model runs here and nothing leaves the browser.
import type { PlatformView, ShowcaseDataset } from '@sedem-ads/analytics-core';
import { INTENT_EXAMPLES } from './catalog';
import { FactBook, checkGrounding } from './factbook';
import { HANDLERS } from './intents';
import { resolvePeriod } from './periods';
import { MAX_BUDGET_SHIFT } from './rules';
import { routeQuestion } from './router';
import { Tracer } from './tools';
import type { AssistantAnswer, AssistantContext, Body, Ctx, IntentId } from './types';

export { INTENT_EXAMPLES } from './catalog';
export type { AssistantAnswer, AssistantContext } from './types';

export const ASSISTANT_LABEL = 'Demo AI Assistant — simulated, data-grounded analysis';

/** Suggested questions shown as chips. */
export const SUGGESTED_QUESTIONS: string[] = INTENT_EXAMPLES.filter((i) => ['spend_summary', 'platform_compare', 'best_campaign_cpl', 'cpl_rise', 'creative_fatigue', 'budget_realloc', 'sales_by_source', 'attributable_roas', 'unknown_source', 'month_over_month'].includes(i.id)).map((i) => i.example);

const FALLBACK_ALTERNATIVES = ['Summarise spend and leads', 'Which campaign has the best CPL?', 'What is the attributable ROAS?'];

function alternativesFor(reason: string | undefined, q: string): string[] {
  if (/predict|forecast|future/.test(reason ?? '') || /next|forecast|will/.test(q)) return ['How is lead volume trending?', 'Compare this month with the previous month', 'Which campaign has the best CPL?'];
  if (/competitor|market/.test(reason ?? '')) return ['Compare Meta and Google', 'Which ads have the highest CTR?', 'Summarise spend and leads'];
  if (/personal/.test(reason ?? '')) return ['Show sales by source', 'How many orders have an unknown source?', 'What is the attributable ROAS?'];
  return FALLBACK_ALTERNATIVES;
}

function unsupportedBody(reason: string | undefined, q: string, alts: string[]): Body {
  return {
    summary: `I cannot answer that: ${reason ?? 'it is outside what this demo can do'}. I only answer from the synthetic dataset using a fixed set of analytics tools, and I would rather say so than make something up.`,
    rows: [],
    evidence: ['No analytics tool was called because the question did not map to a supported topic.', 'Supported topics: spend and leads, platform comparison, campaign and ad rankings, CPL changes, creative fatigue, budget suggestions, sales by source, attributable ROAS, surplus, refunds, unknown sources, data quality.'],
    recs: alts.map((a) => ({ text: `Try asking: "${a}"`, ask: a })),
    limits: ['This assistant has no language model, no internet access and no knowledge outside the demo dataset. It will not guess, forecast or invent figures.'],
  };
}

function platformFromQuestion(q: string, fallback: PlatformView): PlatformView {
  const m = /\b(meta|facebook|instagram)\b/.test(q);
  const g = /\bgoogle\b/.test(q);
  if (m && !g) return 'meta';
  if (g && !m) return 'google';
  return fallback;
}

export function renderText(b: Body): string {
  const lines: string[] = ['Summary', b.summary, '', 'Key numbers'];
  if (b.rows.length === 0) lines.push('No figures for this question.');
  for (const r of b.rows) lines.push(`${r.label}: ${r.value}`);
  lines.push('', 'Evidence', ...b.evidence.map((e) => `- ${e}`), '', 'Recommendations', ...b.recs.map((r) => `- ${r.text}`), '', 'Limits', ...b.limits.map((l) => `- ${l}`));
  return lines.join('\n');
}

export function answerQuestion(question: string, ctx: AssistantContext, ds: ShowcaseDataset): AssistantAnswer {
  const raw = question.trim();
  const q = raw.toLowerCase();
  const book = new FactBook();
  const tools = new Tracer();
  // Static phrases that legitimately contain digits.
  book.source = 'rules';
  book.pct(MAX_BUDGET_SHIFT, 'maximum single budget change', 0);
  book.input('Last 90 days');
  book.source = 'router';

  const route = routeQuestion(q, ds);
  const period = resolvePeriod(ds, q, ctx.range, ctx.periodLabel);
  const view = platformFromQuestion(q, ctx.platform);

  let intent: IntentId = route.intent;
  let body: Body;
  let alternatives: string[] = [];
  if (intent === 'unsupported' || !period) {
    intent = 'unsupported';
    alternatives = alternativesFor(route.reason, q);
    body = unsupportedBody(route.reason ?? 'no data period could be resolved', q, alternatives);
  } else {
    const c: Ctx = { ds, view, period, q, raw, book, tools };
    book.source = route.intent;
    try {
      body = HANDLERS[intent](c);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown error';
      body = {
        summary: 'An analytics tool failed, so I cannot answer this. A failed tool is not a zero result.',
        rows: [],
        evidence: [`Tool error: ${message}`],
        recs: [{ text: 'Try a different period or question.', ask: FALLBACK_ALTERNATIVES[0] }],
        limits: ['No figures are shown because none could be verified.'],
      };
    }
  }

  const text = renderText(body);
  const grounding = checkGrounding(text, book);
  const info = INTENT_EXAMPLES.find((i) => i.id === intent);
  return {
    question: raw,
    intent,
    intentLabel: info?.label ?? 'Unsupported question',
    unsupported: intent === 'unsupported',
    sections: body,
    alternatives,
    text,
    trace: {
      intent,
      matchedBy: route.matchedBy,
      period: period ? { label: period.label, range: `${period.range.start}..${period.range.end}`, explicit: period.explicit } : { label: 'none', range: '', explicit: false },
      platform: view,
      tools: tools.calls,
      facts: book.facts,
      grounding,
    },
  };
}
