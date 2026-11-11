// Independent reference implementation for the Sedem Ads showcase. Not production source.
//
// Regenerates the JSON files in examples/samples/. Fully deterministic: same seed, same bytes.
// Usage:  npm run build -w packages/analytics-core && node examples/generate-samples.mjs

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const lib = await import(pathToFileURL(resolve(here, '../packages/analytics-core/dist/index.js')).href);
const { SYNTHETIC_LABEL, generateDataset, buildCanonicalSpend, partitionOrders, attributableRoas, answerQuestion, monthlySpendTable, SimulatedWriteAdapter, WriteWorkflow } = lib;

const out = resolve(here, 'samples');
mkdirSync(out, { recursive: true });
const write = (name, payload) => writeFileSync(resolve(out, name), JSON.stringify({ label: SYNTHETIC_LABEL, ...payload }, null, 2) + '\n');

const ds = generateDataset({ seed: 42 });
const range = { start: '2025-11-01', end: '2025-11-30' };
const now = new Date('2026-01-01T09:00:00Z');
const inR = (d) => d >= range.start && d <= range.end;
const byDay = (platform) => {
  const m = new Map();
  for (const r of ds.daily) if (r.platform === platform && inR(r.date)) m.set(r.date, (m.get(r.date) ?? 0) + r.spendMinor);
  return [...m].map(([date, spendMinor]) => ({ date, spendMinor }));
};

const spend = buildCanonicalSpend({ range, meta: byDay('meta'), google: byDay('google') });
write('spend-canonical.json', { note: 'Amounts are integer minor units (cents). Total counts only days where both platforms have data.', range, spend, monthly: monthlySpendTable(spend) });

const gap = buildCanonicalSpend({ range, meta: byDay('meta'), google: byDay('google').filter((r) => r.date !== '2025-11-15') });
write('spend-with-missing-day.json', { note: 'One Google day removed. The day is a gap (no data), not a zero; the total excludes it and says so.', range, spend: gap });

write('sales-by-source.json', { note: 'Paid orders. Parts sum to the total; the selected subtotal is a subset.', range, partition: partitionOrders(ds.orders, { range, timeZone: ds.timeZone }) });

const paid = ds.orders.filter((o) => o.status === 'paid' && inR(o.orderedAt.slice(0, 10)));
write('attributable-roas.json', { note: 'Only orders with hard evidence enter the numerator.', range, report: attributableRoas(paid, { meta: spend.metaMinor, google: spend.googleMinor }) });

const ctx = { dataset: ds, now };
const questions = ['How much did we spend in total in the last 30 days?', 'Which campaign has the lowest CPL in the last 90 days?', 'What is the ROAS for the last 90 days?', 'Who is my biggest customer?'];
write('assistant-answers.json', {
  note: 'Deterministic, LLM-free. Every number in an answer is checked against the tool facts.',
  answers: questions.map((q) => { const a = answerQuestion(ctx, q); return { question: q, intent: a.intent, toolCalls: a.toolCalls, text: a.text, grounded: a.grounding.grounded }; }),
});

const adapter = new SimulatedWriteAdapter();
adapter.seed(ds.accounts.meta, { id: 'meta-c1', type: 'campaign', name: 'Demo campaign', status: 'ACTIVE', dailyBudgetMinor: 5500 });
let tick = 0;
const wf = new WriteWorkflow({ adapters: { meta: adapter }, allowedAccounts: { meta: [ds.accounts.meta] }, now: () => new Date(now.getTime() + 1000 * tick++) });
const p = wf.createProposal({ platform: 'meta', accountId: ds.accounts.meta, operation: { type: 'pause', entityType: 'campaign', entityId: 'meta-c1' }, actor: { id: 'assistant', kind: 'ai', role: 'ADMIN' } });
await wf.preview(p.id);
wf.validate(p.id);
wf.confirm(p.id, { id: 'demo-editor', kind: 'human', role: 'EDITOR' });
await wf.execute(p.id);
write('write-audit-log.json', { note: 'AI draft, then human confirmation, one simulated write, read-back, audit log. No real platform is involved.', proposal: wf.get(p.id), auditLog: wf.auditLog });

console.log('Wrote 6 sample files to examples/samples/');
