import { describe, expect, it } from 'vitest';
import { entityPerformance, performanceTotals, resolveShowcaseRange } from '@sedem-ads/analytics-core';
import { getDataset } from '../src/lib/data';
import { answerQuestion, ASSISTANT_LABEL, INTENT_EXAMPLES, SUGGESTED_QUESTIONS } from '../src/ai/engine';
import { count, money } from '../src/lib/format';

const ds = getDataset();
const range = resolveShowcaseRange(ds, 'last30')!;
const ctx: { platform: 'combined' | 'meta' | 'google'; range: typeof range; periodLabel: string } = { platform: 'combined', range, periodLabel: 'Last 30 days' };
const ask = (q: string, c = ctx) => answerQuestion(q, c, ds);

/** Alternative phrasings that must reach the same intent as the catalogue example. */
const PHRASINGS: Record<string, string[]> = {
  help: ['help', 'what can you do'],
  spend_summary: ['how much did we spend', 'give me an overview of spend and leads'],
  platform_compare: ['meta vs google', 'compare google and meta performance'],
  best_campaign_cpl: ['best performing campaign by cpl', 'which campaign has the lowest cost per lead'],
  worst_campaign: ['which campaign is the worst', 'weakest campaign'],
  cpl_rise: ['why did cost per lead go up', 'why is cpl increasing'],
  creative_fatigue: ['is there ad fatigue', 'which creatives are tired'],
  top_ads_ctr: ['top ads by ctr', 'which ads have the best click-through rate'],
  budget_realloc: ['should I reallocate budget', 'where to shift budget'],
  lead_trend: ['lead trend', 'are leads going up or down'],
  sales_by_source: ['sales by source', 'which source brings the most revenue'],
  attributable_roas: ['what is roas', 'attributable roas'],
  surplus: ['advertising surplus', 'is there a surplus'],
  refunds: ['how many refunds', 'show cancellations and refunds'],
  unknown_source: ['orders with unknown source', 'how many sales have no source'],
  google_label: ['google labelled orders without evidence', 'why are google-labelled orders not attributed'],
  data_quality: ['data quality problems', 'are there missing days in the data'],
  month_over_month: ['month over month comparison', 'this month vs last month'],
  forecast: ['forecast leads for next month', 'predict leads next month'],
  campaign_specific: ['tell me about Search | Brand Terms', 'how is the Display | Broad Awareness campaign doing'],
  compare_ads: ['compare ads', 'compare two ads'],
  how_attribution: ['how does attribution work', 'explain attribution'],
};

describe('assistant intents', () => {
  it('covers 18 to 22 intents and exposes the required label and at least 8 chips', () => {
    expect(INTENT_EXAMPLES.length).toBeGreaterThanOrEqual(18);
    expect(INTENT_EXAMPLES.length).toBeLessThanOrEqual(22);
    expect(ASSISTANT_LABEL).toBe('Demo AI Assistant — simulated, data-grounded analysis');
    expect(SUGGESTED_QUESTIONS.length).toBeGreaterThanOrEqual(8);
  });

  it.each(INTENT_EXAMPLES)('routes the catalogue example for $id', ({ id, example }) => {
    expect(ask(example).intent).toBe(id);
  });

  it.each(Object.entries(PHRASINGS))('routes alternative phrasings of %s', (id, phrasings) => {
    for (const p of phrasings) expect(ask(p).intent, p).toBe(id);
  });

  it('every answer has all five sections and every number is grounded', () => {
    for (const { example } of INTENT_EXAMPLES) {
      const a = ask(example);
      const s = a.sections;
      expect(s.summary.length, example).toBeGreaterThan(10);
      expect(s.evidence.length, example).toBeGreaterThan(0);
      expect(s.recs.length, example).toBeGreaterThan(0);
      expect(s.limits.length, example).toBeGreaterThan(0);
      expect(a.trace.grounding.grounded, `${example}: ${a.trace.grounding.ungrounded.join(',')}`).toBe(true);
      expect(a.trace.grounding.verified).toBe(a.trace.grounding.total);
    }
  });

  it('key numbers equal the analytics query results', () => {
    const a = ask('Summarise spend and leads');
    const t = performanceTotals(ds, 'combined', range);
    const row = (label: string) => a.sections.rows.find((r) => r.label === label)?.value;
    expect(row('Spend')).toBe(money(t.spendMinor));
    expect(row('Leads')).toBe(count(t.leads));
    expect(row('CPL')).toBe(money(t.cplMinor));
    expect(a.trace.tools.length).toBeGreaterThan(0);
  });

  it('best-CPL answer names the campaign with the lowest CPL among those with enough leads', () => {
    const rows = entityPerformance(ds, { level: 'campaign', view: 'combined', range })
      .filter((r) => r.current.cplMinor !== null && (r.current.leads ?? 0) >= 5)
      .sort((x, y) => (x.current.cplMinor ?? 0) - (y.current.cplMinor ?? 0));
    const a = ask('Which campaign has the best CPL?');
    expect(a.sections.summary).toContain(rows[0]!.name);
    expect(a.sections.summary).toContain(money(rows[0]!.current.cplMinor));
  });

  it('is deterministic', () => {
    const q = 'Where should I move budget?';
    expect(ask(q).text).toBe(ask(q).text);
  });

  it('respects the global platform and an explicit period in the question', () => {
    const meta = ask('Summarise spend and leads', { ...ctx, platform: 'meta' });
    const total = ask('Summarise spend and leads');
    expect(meta.trace.platform).toBe('meta');
    expect(meta.sections.rows[0]?.value).not.toBe(total.sections.rows[0]?.value);
    const week = ask('Summarise spend and leads in the last 7 days');
    expect(week.trace.period.explicit).toBe(true);
    expect(week.trace.period.range).not.toBe(total.trace.period.range);
    const metaWeek = ask('How much did google spend in the last 7 days?');
    expect(metaWeek.trace.platform).toBe('google');
  });

  it('returns an honest limitation with three alternatives for unsupported questions', () => {
    for (const q of ['Write me a poem about ads', 'What is my competitor spending?', 'Show me the email address of the last customer', 'What is the weather in Ljubljana?']) {
      const a = ask(q);
      expect(a.unsupported, q).toBe(true);
      expect(a.intent).toBe('unsupported');
      expect(a.alternatives, q).toHaveLength(3);
      expect(a.sections.limits.length).toBeGreaterThan(0);
      expect(a.trace.grounding.grounded).toBe(true);
    }
  });

  it('never claims a model was trained or that a language model answers', () => {
    const help = ask('What can you do?').text.toLowerCase();
    expect(help).not.toMatch(/fine-?tuned|trained on/);
    expect(help).toMatch(/do not run a language model|no language model/);
  });
});
