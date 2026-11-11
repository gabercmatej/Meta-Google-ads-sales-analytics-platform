// Independent reference implementation for the Sedem Ads showcase. Not production source.
//
// Offline quickstart. No network, no credentials, no environment variables.
// Build the library first:  npm run build -w packages/analytics-core   (or `npm run example`).

import { pathToFileURL } from 'node:url';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const lib = await import(pathToFileURL(resolve(here, '../packages/analytics-core/dist/index.js')).href).catch(() => {
  console.error('The library is not built yet. Run: npm run build -w packages/analytics-core');
  process.exit(1);
});

const {
  SYNTHETIC_LABEL, generateDataset, resolvePreset, buildCanonicalSpend, platformSpend, spendChartSeries, monthlySpendTable,
  reconcileSpend, roundToMoney, partitionOrders, sourceSurplus, attributableRoas, formatMoney, ctr, cpc, safeRatio,
  SimulatedWriteAdapter, WriteWorkflow, answerQuestion, summarize, compareSources,
} = lib;

const line = (t = '') => console.log(t);
const h = (t) => { line(); line(`== ${t} ==`); };

const ds = generateDataset({ seed: 42 });
const now = new Date('2026-01-01T09:00:00Z'); // the demo data ends on 2025-12-31
line(SYNTHETIC_LABEL);
line(`Dataset: ${ds.campaigns.length} campaigns, ${ds.ads.length} ads, ${ds.daily.length} daily rows, ${ds.orders.length} orders (seed ${ds.seed})`);

// 1. Completed days in the account time zone.
const range = resolvePreset('last30', { now, timeZone: ds.timeZone });
h(`1. Period (completed days, ${ds.timeZone})`);
line(`last30 -> ${range.start} to ${range.end}`);

// 2. Canonical spend: card = chart = monthly.
const byDay = (platform) => {
  const m = new Map();
  for (const r of ds.daily) if (r.platform === platform && r.date >= range.start && r.date <= range.end) m.set(r.date, (m.get(r.date) ?? 0) + r.spendMinor);
  return [...m].map(([date, spendMinor]) => ({ date, spendMinor }));
};
const meta = byDay('meta');
const google = byDay('google');
const spend = buildCanonicalSpend({ range, meta, google });
h('2. One canonical spend path');
line(`Total ${formatMoney(spend.totalMinor)} (Meta ${formatMoney(spend.metaMinor)}, Google ${formatMoney(spend.googleMinor)}), complete days ${spend.completeDays}/${spend.expectedDays}`);
const rec = reconcileSpend({ cardMinor: spend.totalMinor, chartSeries: spendChartSeries(spend), monthlyTable: monthlySpendTable(spend) });
line(`Card, chart and monthly table agree: ${rec.status}`);
const withGap = buildCanonicalSpend({ range, meta, google: google.slice(1) });
line(`With one Google day missing: total ${formatMoney(withGap.totalMinor)}, partial=${withGap.partial}, missing ${withGap.missingDates.join(', ')}`);
line(`Google spend alone with no rows at all: ${platformSpend([], range, 'google').totalMinor} (null means "no data", never 0)`);

// 3. Ratios come from sums.
const rows = ds.daily.filter((r) => r.platform === 'meta' && r.date >= range.start && r.date <= range.end);
const clicks = rows.reduce((a, r) => a + r.clicks, 0);
const impressions = rows.reduce((a, r) => a + r.impressions, 0);
h('3. Ratios of sums');
line(`Meta CTR ${(ctr(clicks, impressions) * 100).toFixed(2)}%, CPC ${formatMoney(roundToMoney(cpc(spend.metaMinor, clicks)))}, CTR with zero impressions: ${ctr(5, 0)}`);

// 4. Sales by source: parts reconcile, subtotal is a subset.
const part = partitionOrders(ds.orders, { range, timeZone: ds.timeZone });
h('4. Sales by source (paid orders)');
for (const p of part.parts) line(`${p.source.padEnd(15)} ${String(p.orders).padStart(4)} orders  ${formatMoney(p.revenueMinor)}`);
line(`Parts reconcile to the total: ${part.reconciles}. Selected-sources subtotal (a subset): ${formatMoney(part.selected.revenueMinor)}`);
const surplus = sourceSurplus(part.selected.revenueMinor, spend.metaMinor, spend.googleMinor);
line(`Source surplus ${formatMoney(surplus.surplusMinor)}  flags: ${surplus.flags.join(', ')}`);

// 5. Attributable ROAS: hard evidence only.
const paid = ds.orders.filter((o) => o.status === 'paid' && o.orderedAt.slice(0, 10) >= range.start && o.orderedAt.slice(0, 10) <= range.end);
const roas = attributableRoas(paid, { meta: spend.metaMinor, google: spend.googleMinor });
h('5. Attributable ROAS (hard evidence only)');
for (const p of roas.platforms) line(`${p.platform}: ${p.attributedOrders} orders, ${formatMoney(p.attributedRevenueMinor)} -> ROAS ${p.roas === null ? 'no data' : p.roas.toFixed(2)}`);
line(`Not attributed: label-only ${roas.notAttributed.sourceOnly.orders}, unknown ${roas.notAttributed.unknown.orders}, conflicting ${roas.notAttributed.conflict.orders}`);

// 6. Write safety, with a simulated adapter only.
h('6. Human-confirmed write (simulated adapter)');
const adapter = new SimulatedWriteAdapter();
adapter.seed(ds.accounts.meta, { id: 'meta-c1', type: 'campaign', name: 'Demo campaign', status: 'ACTIVE', dailyBudgetMinor: 5500 });
const wf = new WriteWorkflow({ adapters: { meta: adapter }, allowedAccounts: { meta: [ds.accounts.meta] }, now: () => now });
const draft = wf.createProposal({ platform: 'meta', accountId: ds.accounts.meta, operation: { type: 'pause', entityType: 'campaign', entityId: 'meta-c1' }, actor: { id: 'assistant', kind: 'ai', role: 'ADMIN' } });
line(`AI draft: ${draft.status} (origin ${draft.origin}), platform calls so far: ${adapter.readCalls + adapter.mutateCalls}`);
await wf.preview(draft.id);
wf.validate(draft.id);
try { wf.confirm(draft.id, { id: 'assistant', kind: 'ai', role: 'ADMIN' }); } catch (e) { line(`AI confirm refused: ${e.code}`); }
try { await wf.execute(draft.id); } catch (e) { line(`Execute before confirmation refused: ${e.code}`); }
wf.confirm(draft.id, { id: 'demo-editor', kind: 'human', role: 'EDITOR' });
const done = await wf.execute(draft.id);
line(`After human confirmation: ${done.status}, read-back status ${done.execution.readBack.status}, mutate calls ${adapter.mutateCalls}`);
line(`Audit log: ${wf.auditLog.map((e) => e.action).join(' > ')}`);

// 7. Grounded assistant, no LLM.
h('7. Grounded assistant (deterministic, no model)');
const ctx = { dataset: ds, now };
const answer = answerQuestion(ctx, 'How much did we spend in total in the last 30 days?');
line(answer.text);
line(`Grounded: ${answer.grounding.grounded}`);
line(answerQuestion(ctx, 'Who is my biggest customer?').text);

// 8. Audit model.
h('8. Audit statuses');
const checks = [
  compareSources('spend.total', 'Dashboard vs platform spend', spend.totalMinor, spend.totalMinor),
  compareSources('revenue.vat', 'Gross vs net revenue', 12200, 10000, { explainedBy: 'intentional_basis_difference' }),
  compareSources('leads', 'Leads vs source', null, 12),
];
for (const c of checks) line(`${c.status}${c.category ? ` (${c.category})` : ''}  ${c.title}`);
line(`Overall: ${summarize(checks).overall}`);
line();
line(`Ratio with a missing denominator is null: ${safeRatio(1, null)}`);
