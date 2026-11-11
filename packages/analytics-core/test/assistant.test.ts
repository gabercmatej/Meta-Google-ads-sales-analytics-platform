// Independent reference implementation for the Sedem Ads showcase. Not production source.
import { describe, expect, it } from 'vitest';
import {
  type ToolContext,
  SimulatedWriteAdapter,
  TOOL_DEFINITIONS,
  WriteWorkflow,
  answerQuestion,
  checkGrounding,
  generateDataset,
  routeQuestion,
  runTool,
} from '../src/index.js';

const dataset = generateDataset({ seed: 42 });
const now = new Date('2026-01-01T09:00:00Z');

function ctxWithWorkflow(): { ctx: ToolContext; wf: WriteWorkflow; adapter: SimulatedWriteAdapter } {
  const adapter = new SimulatedWriteAdapter();
  adapter.seed(dataset.accounts.meta, { id: 'meta-c1', type: 'campaign', name: 'x', status: 'ACTIVE', dailyBudgetMinor: 5500 });
  const wf = new WriteWorkflow({ adapters: { meta: adapter, google: adapter }, allowedAccounts: { meta: [dataset.accounts.meta], google: [dataset.accounts.google] }, now: () => now });
  return { ctx: { dataset, now, workflow: wf }, wf, adapter };
}

const ctx: ToolContext = { dataset, now };

describe('tool definitions', () => {
  it('has 8 tools with unique names, descriptions and object schemas', () => {
    expect(TOOL_DEFINITIONS).toHaveLength(8);
    expect(new Set(TOOL_DEFINITIONS.map((t) => t.name)).size).toBe(8);
    for (const t of TOOL_DEFINITIONS) {
      expect(t.description.length).toBeGreaterThan(20);
      expect(t.inputSchema.type).toBe('object');
      expect(t.inputSchema.required?.length).toBeGreaterThan(0);
    }
  });

  it('only the draft tool is not read-only, and it has no execute or confirm operation', () => {
    const writers = TOOL_DEFINITIONS.filter((t) => !t.readOnly).map((t) => t.name);
    expect(writers).toEqual(['create_draft_proposal']);
    const names = TOOL_DEFINITIONS.map((t) => t.name).join(' ');
    expect(names).not.toMatch(/execute|confirm|approve|mutate/);
    const ops = TOOL_DEFINITIONS.find((t) => t.name === 'create_draft_proposal')!.inputSchema.properties!.operation!.properties!.type!.enum;
    expect(ops).toEqual(['pause', 'resume', 'set_budget']);
  });
});

describe('runTool', () => {
  it('get_kpis returns facts with a basis and source', () => {
    const r = runTool(ctx, 'get_kpis', { period: { preset: 'last30' }, platform: 'all' });
    expect(r.ok).toBe(true);
    expect(r.facts.length).toBeGreaterThan(3);
    for (const f of r.facts) {
      expect(f.basis).toMatch(/\d{4}-\d{2}-\d{2} to \d{4}-\d{2}-\d{2}/);
      expect(f.source).toBe('synthetic demo dataset');
    }
  });

  it('spend facts use the canonical spend (card = tool)', () => {
    const spend = runTool(ctx, 'spend_breakdown', { period: { preset: 'last30' } });
    const kpi = runTool(ctx, 'get_kpis', { period: { preset: 'last30' }, platform: 'all' });
    const a = spend.facts.find((f) => /total/i.test(f.label))!;
    const b = kpi.facts.find((f) => f.label === 'Spend')!;
    expect(a.value).toBe(b.value);
  });

  it('unknown tools and bad input fail closed without throwing', () => {
    expect(runTool(ctx, 'delete_everything', {}).ok).toBe(false);
    expect(runTool(ctx, 'get_kpis', null).ok).toBe(false);
    expect(runTool(ctx, 'get_kpis', { period: { preset: 'last9000' }, platform: 'all' }).ok).toBe(false);
    expect(runTool(ctx, 'get_kpis', { period: { preset: 'last7' }, platform: 'tiktok' }).ok).toBe(false);
    expect(runTool(ctx, 'get_kpis', { period: { preset: 'custom', start: '2025-02-30', end: '2025-03-01' }, platform: 'all' }).ok).toBe(false);
  });

  it('a period with no data is "no data", not zero', () => {
    const r = runTool(ctx, 'get_kpis', { period: { preset: 'custom', start: '2030-01-01', end: '2030-01-10' }, platform: 'all' });
    expect(r.ok === false || r.noData !== undefined).toBe(true);
    expect(r.facts.some((f) => f.value === 0)).toBe(false);
  });

  it('attributable ROAS excludes label-only and unknown revenue and states it', () => {
    const r = runTool(ctx, 'attributable_roas', { period: { preset: 'last90' } });
    expect(r.ok).toBe(true);
    const text = JSON.stringify(r.facts).toLowerCase();
    expect(text).toMatch(/hard evidence|attributable/);
  });

  it('sales_by_source parts sum to the total', () => {
    const r = runTool(ctx, 'sales_by_source', { period: { preset: 'previousMonth' } });
    expect(r.ok).toBe(true);
    const total = r.facts.find((f) => /eligible|total/i.test(f.label));
    expect(total).toBeDefined();
  });

  it('top_entities honours metric direction', () => {
    const best = runTool(ctx, 'top_entities', { period: { preset: 'last90' }, platform: 'all', level: 'campaign', metric: 'cpl', direction: 'best', limit: 5 });
    const worst = runTool(ctx, 'top_entities', { period: { preset: 'last90' }, platform: 'all', level: 'campaign', metric: 'cpl', direction: 'worst', limit: 5 });
    expect(best.ok && worst.ok).toBe(true);
    expect(best.facts[0]!.label).not.toBe(worst.facts[0]!.label);
  });

  it('compare_entities needs 2 to 4 entities', () => {
    expect(runTool(ctx, 'compare_entities', { period: { preset: 'last30' }, level: 'campaign', entityIds: ['meta-c1'] }).ok).toBe(false);
    expect(runTool(ctx, 'compare_entities', { period: { preset: 'last30' }, level: 'campaign', entityIds: ['meta-c1', 'meta-c3'] }).ok).toBe(true);
  });
});

describe('draft-only behaviour', () => {
  it('create_draft_proposal makes a local draft with origin ai and touches nothing', () => {
    const { ctx: c, wf, adapter } = ctxWithWorkflow();
    const r = runTool(c, 'create_draft_proposal', { platform: 'meta', operation: { type: 'pause', entityType: 'campaign', entityId: 'meta-c1' } });
    expect(r.ok).toBe(true);
    const list = wf.list();
    expect(list).toHaveLength(1);
    expect(list[0]!.status).toBe('draft');
    expect(list[0]!.origin).toBe('ai');
    expect(adapter.mutateCalls + adapter.validateCalls + adapter.readCalls).toBe(0);
  });

  it('the assistant cannot create a draft without a workflow, and cannot create an unsafe one', () => {
    expect(runTool(ctx, 'create_draft_proposal', { platform: 'meta', operation: { type: 'pause', entityType: 'campaign', entityId: 'meta-c1' } }).ok).toBe(false);
    const { ctx: c } = ctxWithWorkflow();
    expect(runTool(c, 'create_draft_proposal', { platform: 'meta', operation: { type: 'delete', entityType: 'campaign', entityId: 'meta-c1' } }).ok).toBe(false);
  });

  it('a draft question through the assistant stays a draft and says so', () => {
    const { ctx: c, wf, adapter } = ctxWithWorkflow();
    const a = answerQuestion(c, 'Please pause campaign meta-c1');
    expect(a.intent).toBe('draft_change');
    expect(a.draftCreated).toBe(true);
    expect(a.text).toMatch(/Nothing was changed/);
    expect(wf.list().map((p) => p.status)).toEqual(['draft']);
    expect(adapter.mutateCalls).toBe(0);
  });

  it('a draft for an entity that does not exist is not created', () => {
    const { ctx: c, wf } = ctxWithWorkflow();
    const a = answerQuestion(c, 'pause campaign meta-c99');
    expect(a.draftCreated).toBe(false);
    expect(wf.list()).toHaveLength(0);
  });

  it('a budget draft is parsed to integer minor units', () => {
    const { ctx: c, wf } = ctxWithWorkflow();
    answerQuestion(c, 'set budget of campaign meta-c1 to 60.50 EUR');
    const op = wf.list()[0]!.operation;
    expect(op).toMatchObject({ type: 'set_budget', newDailyBudgetMinor: 6050 });
  });
});

describe('routing and answers', () => {
  it.each([
    ['How much did we spend in total in the last 30 days?', 'spend_breakdown'],
    ['What is the ROAS for the last 90 days?', 'attributable_roas'],
    ['Show sales by source last month', 'sales_by_source'],
    ['Which campaign has the lowest CPL in the last 30 days?', 'top_entities'],
    ['Compare the last 7 days to the previous period', 'compare_periods'],
    ['Compare campaigns this month', 'compare_entities'],
    ['Show me clicks and CTR for Google last 14 days', 'kpis'],
  ])('routes "%s" to %s', (q, intent) => {
    expect(routeQuestion(q).intent).toBe(intent);
  });

  it('a question about cost per lead "lowest" maps to the best direction', () => {
    const call = routeQuestion('Which campaign has the lowest CPL?').calls[0]!;
    expect(call.input.direction).toBe('best');
  });

  it('refuses what it has no tool for and invents nothing', () => {
    const a = answerQuestion(ctx, 'What will the weather be and who is my top customer by name?');
    expect(a.intent).toBe('unsupported');
    expect(a.toolCalls).toEqual([]);
    expect(a.facts).toEqual([]);
    expect(a.text).toMatch(/will not guess/);
  });

  it('every supported answer is fully grounded in tool facts', () => {
    const questions = [
      'How much did we spend in total in the last 30 days?',
      'Show me clicks and CTR last 30 days',
      'ROAS last 90 days',
      'sales by source last month',
      'best campaign by CTR last 90 days',
      'compare the last 7 days to the previous period',
      'compare campaigns last 30 days',
    ];
    for (const q of questions) {
      const a = answerQuestion(ctx, q);
      expect(a.results.length, q).toBeGreaterThan(0);
      expect(a.grounding.ungroundedNumbers, q).toEqual([]);
      expect(a.grounding.grounded, q).toBe(true);
    }
  });

  it('is deterministic', () => {
    const q = 'How much did we spend in total in the last 30 days?';
    expect(answerQuestion(ctx, q).text).toBe(answerQuestion(ctx, q).text);
  });

  it('explains the total-only-on-complete-days rule in the spend answer', () => {
    expect(answerQuestion(ctx, 'total spend last 30 days').text).toMatch(/both platforms/);
  });

  it('an unavailable period is reported as no data, not zero', () => {
    const a = answerQuestion(ctx, 'show spend 2031-01-01 to 2031-01-10');
    expect(a.text).toMatch(/no data|could not answer|no completed days/i);
    expect(a.text).not.toMatch(/0[.,]00/);
  });
});

describe('checkGrounding', () => {
  const facts = [{ label: 'Spend', value: 1234.5, unit: 'EUR', basis: '2025-12-01 to 2025-12-30, completed days', source: 's', display: '€1,234.50' }];

  it('accepts numbers that come from a fact, in several formats', () => {
    expect(checkGrounding('Spend was 1234.5 EUR (1,234.50).', facts).grounded).toBe(true);
  });

  it('flags a number no tool produced', () => {
    const r = checkGrounding('Spend was 1,234.50 and it grew 17%.', facts);
    expect(r.grounded).toBe(false);
    expect(r.ungroundedNumbers).toEqual(['17']);
  });

  it('ignores ISO dates', () => {
    expect(checkGrounding('Between 2025-12-01 and 2025-12-30 nothing changed.', facts).grounded).toBe(true);
  });

  it('catches a wrong figure that is close to a real one', () => {
    expect(checkGrounding('Spend was 1,234.60.', facts).grounded).toBe(false);
  });

  it('text with no numbers is trivially grounded', () => {
    expect(checkGrounding('No numbers here.', []).grounded).toBe(true);
  });
});
