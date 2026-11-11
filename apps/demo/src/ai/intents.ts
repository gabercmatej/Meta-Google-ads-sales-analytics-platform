// Intent handlers. Each one runs read-only analytics queries (through the Tracer) and formats every
// number via the FactBook, so the final text can be checked against the tool results.
import {
  SHOWCASE_HISTORY_START,
  attributionOverview,
  compareDates,
  dataSourceStatus,
  entityPerformance,
  leadsOverview,
  metricSeries,
  performanceTotals,
  previousPeriod,
  rangeLength,
  resolveShowcaseRange,
  salesOverview,
  type DateRange,
  type EntityPerformanceRow,
  type PerformanceTotals,
  type PlatformView,
} from '@sedem-ads/analytics-core';
import { INTENT_EXAMPLES } from './catalog';
import { MAX_BUDGET_SHIFT, MIN_IMPRESSIONS_FOR_CTR, MIN_LEADS_FOR_CPL, budgetShift, hasCpl, usablePrevious } from './rules';
import { monthOverMonth } from './periods';
import { matchCampaign } from './rules';
import type { Body, Ctx, IntentId, KeyRow, Rec } from './types';

export const VIEW_LABEL: Record<PlatformView, string> = { combined: 'Meta + Google', meta: 'Meta Ads', google: 'Google Ads' };
const SOURCE_LABEL: Record<string, string> = {
  meta: 'Meta (customer source)',
  google: 'Google (customer source)',
  chatbot_ai: 'Chatbot / AI',
  partner_portal: 'Partner portal',
  other_verified: 'Other verified',
  unknown: 'Unknown',
  conflicting: 'Conflicting',
};

const campaignLink = (id: string) => `/campaigns/${id}`;

function periodLine(c: Ctx, view: PlatformView = c.view): string {
  const label = c.book.input(c.period.label);
  return `Period: ${label}${c.period.explicit ? ' (named in the question)' : ' (from the global filter)'}, ${c.book.range(c.period.range)}. Platform: ${VIEW_LABEL[view]}.`;
}

function coverage(c: Ctx, t: PerformanceTotals): string {
  const total = c.book.count(t.expectedDays);
  if (t.missingDates.length === 0) return `Coverage: all ${total} days have data.`;
  const shown = t.missingDates.slice(0, 4).map((d) => c.book.date(d)).join(', ');
  const more = t.missingDates.length > 4 ? ` and ${c.book.count(t.missingDates.length - 4)} more` : '';
  return `Coverage: ${c.book.count(t.completeDays)} of ${total} days have data. Missing: ${shown}${more}. Missing days are not zero.`;
}

function totalsOf(c: Ctx, view: PlatformView, range: DateRange): PerformanceTotals {
  return c.tools.run('performanceTotals', { view, range }, () => performanceTotals(c.ds, view, range), (r) => `spend=${r.spendMinor}, leads=${r.leads}, days=${r.completeDays}/${r.expectedDays}`);
}

function entitiesOf(c: Ctx, level: 'campaign' | 'ad', view: PlatformView = c.view, range: DateRange = c.period.range): EntityPerformanceRow[] {
  return c.tools.run('entityPerformance', { level, view, range }, () => entityPerformance(c.ds, { level, view, range }), (r) => `${r.length} rows`);
}

function safeRatioChange(cur: number | null, prev: number | null): number | null {
  if (cur === null || prev === null || prev === 0) return null;
  return (cur - prev) / prev;
}

const noPrev = (c: Ctx) => `No previous period of the same length exists before the start of the data (${c.book.date(SHOWCASE_HISTORY_START)}), so no comparison is shown.`;

function previousRangeOf(c: Ctx): DateRange | null {
  return usablePrevious(c.period.range);
}

// ---------------------------------------------------------------------------------------------

function help(c: Ctx): Body {
  const lines = INTENT_EXAMPLES.filter((i) => i.id !== 'help').map((i) => `${i.label}: "${i.example}"`);
  return {
    summary: 'I am a deterministic demo assistant. I route your question to one of a fixed set of analytics tools over the synthetic dataset and explain the result. I do not run a language model.',
    rows: [],
    evidence: ['No tools were called for this answer.', ...lines.map((l) => `Topic - ${l}`)],
    recs: [{ text: 'Try a suggested question to see the tool trace.', ask: 'Summarise spend and leads' }],
    limits: [`Answers cover only the synthetic demo data. You can name a period in the question (${c.book.input('last 7 days')}, this month, previous month, year to date, ${c.book.input('last 90 days')}).`],
  };
}

function spendSummary(c: Ctx): Body {
  const { book } = c;
  const t = totalsOf(c, c.view, c.period.range);
  const prevR = previousRangeOf(c);
  const p = prevR ? totalsOf(c, c.view, prevR) : null;
  const rows: KeyRow[] = [
    { label: 'Spend', value: book.money(t.spendMinor, 'spend') },
    { label: 'Impressions', value: book.count(t.impressions, 'impressions') },
    { label: 'Clicks', value: book.count(t.clicks, 'clicks') },
    { label: 'CTR', value: book.pct(t.ctr, 'ctr') },
    { label: 'CPC', value: book.money(t.cpcMinor, 'cpc') },
    { label: 'Leads', value: book.count(t.leads, 'leads') },
    { label: 'CPL', value: book.money(t.cplMinor, 'cpl') },
  ];
  if (p) {
    rows.push({ label: 'Spend vs previous period', value: book.change(safeRatioChange(t.spendMinor, p.spendMinor), 'spend change') });
    rows.push({ label: 'Leads vs previous period', value: book.change(safeRatioChange(t.leads, p.leads), 'leads change') });
  }
  const summary =
    t.spendMinor === null
      ? `There is no spend data for ${VIEW_LABEL[c.view]} in this period, so no totals are shown. This is missing data, not zero spend.`
      : `${VIEW_LABEL[c.view]} spent ${book.money(t.spendMinor)} and produced ${book.count(t.leads)} leads at a CPL of ${book.money(t.cplMinor)} in ${book.range(c.period.range)}.`;
  return {
    summary,
    rows,
    evidence: [periodLine(c), coverage(c, t), prevR ? `Comparison period: ${book.range(prevR)}.` : noPrev(c)],
    recs: [
      { text: 'Open the campaign list to see which campaigns drive these totals.', to: '/campaigns' },
      { text: 'Ask why CPL moved against the previous period.', ask: 'Why did CPL rise?' },
    ],
    limits: ['Leads are platform-reported form submissions, not sales. In the combined view only days where both platforms have data are summed.'],
  };
}

function platformCompare(c: Ctx): Body {
  const { book } = c;
  const m = totalsOf(c, 'meta', c.period.range);
  const g = totalsOf(c, 'google', c.period.range);
  const rows: KeyRow[] = [
    { label: 'Meta spend', value: book.money(m.spendMinor) },
    { label: 'Google spend', value: book.money(g.spendMinor) },
    { label: 'Meta leads', value: book.count(m.leads) },
    { label: 'Google leads', value: book.count(g.leads) },
    { label: 'Meta CPL', value: book.money(m.cplMinor) },
    { label: 'Google CPL', value: book.money(g.cplMinor) },
    { label: 'Meta CTR', value: book.pct(m.ctr) },
    { label: 'Google CTR', value: book.pct(g.ctr) },
  ];
  let summary: string;
  if (m.cplMinor === null || g.cplMinor === null) {
    summary = 'One of the two platforms has no CPL for this period, so no winner is declared.';
  } else {
    const cheaper = m.cplMinor <= g.cplMinor ? 'Meta' : 'Google';
    summary = `${cheaper} has the lower CPL in ${book.range(c.period.range)}: Meta ${book.money(m.cplMinor)} versus Google ${book.money(g.cplMinor)}.`;
  }
  return {
    summary,
    rows,
    evidence: [periodLine(c, 'combined'), `Meta - ${coverage(c, m)}`, `Google - ${coverage(c, g)}`],
    recs: [
      { text: 'Compare individual ads side by side before moving budget between platforms.', to: '/compare' },
      { text: 'Ask which campaign is the best CPL.', ask: 'Which campaign has the best CPL?' },
    ],
    limits: ['Meta lead forms and Google conversions are counted differently by each platform; CPL is a like-for-like proxy, not proof of sales quality.'],
  };
}

function rankedCampaigns(c: Ctx): EntityPerformanceRow[] {
  return entitiesOf(c, 'campaign').filter(hasCpl);
}

function bestCampaign(c: Ctx): Body {
  const { book } = c;
  const rows = rankedCampaigns(c).sort((a, b) => (a.current.cplMinor ?? 0) - (b.current.cplMinor ?? 0) || a.id.localeCompare(b.id));
  const top = rows.slice(0, 3);
  const best = top[0];
  if (!best) return noRanking(c, 'No campaign has enough leads for a reliable CPL in this period.');
  return {
    summary: `${book.name(best.name)} has the lowest CPL: ${book.money(best.current.cplMinor)} from ${book.count(best.current.leads)} leads on ${book.money(best.current.spendMinor)} spend.`,
    rows: top.map((r, i) => ({ label: `#${book.count(i + 1)} ${book.name(r.name)} (${VIEW_LABEL[r.platform]})`, value: `${book.money(r.current.cplMinor)} CPL, ${book.count(r.current.leads)} leads` })),
    evidence: [periodLine(c), `Tools: entityPerformance at campaign level. Entity IDs: ${top.map((r) => book.name(r.id)).join(', ')}.`, `Only campaigns with at least ${book.count(MIN_LEADS_FOR_CPL)} leads are ranked; ${book.count(rows.length)} campaigns qualified.`],
    recs: [
      { text: `Open ${book.name(best.name)} to see its ad sets and ads.`, to: campaignLink(best.id) },
      { text: 'Consider a budget increase of no more than 30% at a time and watch CPL.', ask: 'Where should I move budget?' },
    ],
    limits: ['A low CPL says nothing about lead quality or sales. Small samples are noisy, which is why a minimum lead count applies.'],
  };
}

function noRanking(c: Ctx, why: string): Body {
  return { summary: why, rows: [], evidence: [periodLine(c)], recs: [{ text: 'Select a longer period such as Last 90 days.', ask: 'Which campaign has the best CPL in the last 90 days?' }], limits: ['A ranking needs enough leads per campaign.'] };
}

function worstCampaign(c: Ctx): Body {
  const { book } = c;
  const rows = rankedCampaigns(c).sort((a, b) => (b.current.cplMinor ?? 0) - (a.current.cplMinor ?? 0) || a.id.localeCompare(b.id));
  const worst = rows[0];
  if (!worst) return noRanking(c, 'No campaign has enough leads for a reliable CPL in this period.');
  const share = c.view === 'combined' ? undefined : undefined;
  void share;
  const cur = worst.current;
  return {
    summary: `${book.name(worst.name)} is the weakest campaign by CPL: ${book.money(cur.cplMinor)} from ${book.count(cur.leads)} leads on ${book.money(cur.spendMinor)} spend.`,
    rows: [
      { label: 'CPL', value: book.money(cur.cplMinor) },
      { label: 'CPL change vs previous', value: book.change(worst.change.cpl) },
      { label: 'CTR', value: book.pct(cur.ctr) },
      { label: 'CTR change vs previous', value: book.change(worst.change.ctr) },
      { label: 'Spend', value: book.money(cur.spendMinor) },
      { label: 'Leads', value: book.count(cur.leads) },
    ],
    evidence: [periodLine(c), `Entity: ${book.name(worst.id)} (${VIEW_LABEL[worst.platform]}). Ranked among ${book.count(rows.length)} campaigns with at least ${book.count(MIN_LEADS_FOR_CPL)} leads.`],
    recs: [
      { text: `Inspect the ads of ${book.name(worst.name)} before changing anything.`, to: campaignLink(worst.id) },
      { text: 'Ask for a budget reallocation suggestion (capped at 30%).', ask: 'Suggest a budget reallocation' },
    ],
    limits: ['This ranks by CPL only. A campaign with a high CPL may still bring valuable customers; sales are not linked to campaigns unless verified.'],
  };
}

function cplRise(c: Ctx): Body {
  const { book } = c;
  const prevR = previousRangeOf(c);
  if (!prevR) return { summary: 'There is no earlier period of the same length to compare with, so I cannot explain a change in CPL.', rows: [], evidence: [periodLine(c), noPrev(c)], recs: [{ text: 'Pick a shorter period.', ask: 'Why did CPL rise in the last 7 days?' }], limits: ['A decomposition needs two comparable periods.'] };
  const cur = totalsOf(c, c.view, c.period.range);
  const prev = totalsOf(c, c.view, prevR);
  const spendCh = safeRatioChange(cur.spendMinor, prev.spendMinor);
  const leadsCh = safeRatioChange(cur.leads, prev.leads);
  const cplCh = safeRatioChange(cur.cplMinor, prev.cplMinor);
  const campaigns = entitiesOf(c, 'campaign').filter((r) => r.change.cpl !== null && (r.current.leads ?? 0) >= MIN_LEADS_FOR_CPL);
  const worstMover = [...campaigns].sort((a, b) => (b.change.cpl ?? 0) - (a.change.cpl ?? 0) || a.id.localeCompare(b.id))[0];
  let summary: string;
  if (cplCh === null || spendCh === null || leadsCh === null) {
    summary = 'CPL cannot be decomposed because spend, leads or CPL is missing in one of the two periods.';
  } else {
    const direction = cplCh > 0 ? 'rose' : cplCh < 0 ? 'fell' : 'did not change';
    const driver = leadsCh < spendCh ? 'each euro of spend produced fewer leads' : 'each euro of spend produced more leads';
    summary = `CPL ${direction} by ${book.change(cplCh)}: spend moved ${book.change(spendCh)} while leads moved ${book.change(leadsCh)}, so ${driver}.`;
  }
  const rows: KeyRow[] = [
    { label: 'CPL now', value: book.money(cur.cplMinor) },
    { label: 'CPL previous', value: book.money(prev.cplMinor) },
    { label: 'CPL change', value: book.change(cplCh) },
    { label: 'Spend change', value: book.change(spendCh) },
    { label: 'Leads change', value: book.change(leadsCh) },
  ];
  if (worstMover) rows.push({ label: `Largest CPL increase: ${book.name(worstMover.name)}`, value: book.change(worstMover.change.cpl) });
  return {
    summary,
    rows,
    evidence: [periodLine(c), `Comparison period: ${book.range(prevR)}.`, coverage(c, cur), worstMover ? `Largest campaign mover by CPL change: ${book.name(worstMover.id)}.` : 'No campaign had enough leads to rank movers.'],
    recs: [
      ...(worstMover ? [{ text: `Review ${book.name(worstMover.name)}, the campaign with the biggest CPL increase.`, to: campaignLink(worstMover.id) }] : []),
      { text: 'Check whether creatives are fatiguing.', ask: 'Are any creatives fatigued?' },
    ],
    limits: ['CPL = spend / leads. The decomposition only says which input moved; it does not prove why (seasonality, bids and creative changes are not in the data).'],
  };
}

function creativeFatigue(c: Ctx): Body {
  const { book } = c;
  const ads = entitiesOf(c, 'ad');
  const flagged = ads.filter((a) => a.fatigued);
  const drops = [...ads].filter((a) => a.change.ctr !== null && (a.current.impressions ?? 0) >= MIN_IMPRESSIONS_FOR_CTR).sort((a, b) => (a.change.ctr ?? 0) - (b.change.ctr ?? 0) || a.id.localeCompare(b.id));
  const list = (flagged.length ? flagged : drops).slice(0, 4);
  const first = list[0];
  const summary = first
    ? flagged.length
      ? `${book.count(flagged.length)} ${flagged.length === 1 ? 'ad shows' : 'ads show'} creative fatigue (CTR declining as the ad keeps running). The clearest case is ${book.name(first.name)} with CTR ${book.pct(first.current.ctr)} (${book.change(first.change.ctr)} vs previous).`
      : `No ad is flagged as fatigued. The largest CTR drop is ${book.name(first.name)}: ${book.change(first.change.ctr)} to ${book.pct(first.current.ctr)}.`
    : 'No ad has enough impressions to judge fatigue in this period.';
  return {
    summary,
    rows: list.map((a) => ({ label: `${book.name(a.name)} (${VIEW_LABEL[a.platform]})`, value: `CTR ${book.pct(a.current.ctr)}, ${book.change(a.change.ctr)} vs previous` })),
    evidence: [periodLine(c), `Tools: entityPerformance at ad level (${book.count(ads.length)} ads). IDs: ${list.map((a) => book.name(a.id)).join(', ') || 'none'}.`],
    recs: [
      ...(first ? [{ text: `Prepare a fresh creative for ${book.name(first.name)} and keep the old one paused rather than deleted.`, to: campaignLink(first.campaignId) }] : []),
      { text: 'Compare the weakest and strongest ads side by side.', to: '/compare' },
    ],
    limits: ['Fatigue is inferred from falling CTR over a longer run time, not observed directly. Audience and seasonality changes look similar.'],
  };
}

function topAdsCtr(c: Ctx): Body {
  const { book } = c;
  const ads = entitiesOf(c, 'ad')
    .filter((a) => a.current.ctr !== null && (a.current.impressions ?? 0) >= MIN_IMPRESSIONS_FOR_CTR)
    .sort((a, b) => (b.current.ctr ?? 0) - (a.current.ctr ?? 0) || a.id.localeCompare(b.id));
  const top = ads.slice(0, 5);
  const best = top[0];
  if (!best) return noRanking(c, 'No ad has enough impressions for a reliable CTR in this period.');
  return {
    summary: `${book.name(best.name)} has the highest CTR: ${book.pct(best.current.ctr)} on ${book.count(best.current.impressions)} impressions.`,
    rows: top.map((a, i) => ({ label: `#${book.count(i + 1)} ${book.name(a.name)} (${VIEW_LABEL[a.platform]})`, value: `${book.pct(a.current.ctr)} CTR, ${book.count(a.current.impressions)} impressions` })),
    evidence: [periodLine(c), `IDs: ${top.map((a) => book.name(a.id)).join(', ')}. Only ads with at least ${book.count(MIN_IMPRESSIONS_FOR_CTR)} impressions are ranked.`],
    recs: [
      { text: 'Compare the top ads to see what they have in common.', to: '/compare' },
      { text: `Check the campaign of ${book.name(best.name)} before scaling it.`, to: campaignLink(best.campaignId) },
    ],
    limits: ['CTR measures clicks per impression, not lead or sales quality. A high CTR can still mean an expensive lead.'],
  };
}

function budgetRealloc(c: Ctx): Body {
  const { book } = c;
  const campaigns = entitiesOf(c, 'campaign');
  const shift = budgetShift(campaigns, c.period.range);
  if (!shift) return noRanking(c, 'I cannot suggest a reallocation: there are fewer than two active campaigns with enough leads, or no budget to move.');
  const { from, to } = shift;
  return {
    summary: `Consider moving up to ${book.money(shift.shiftMinor)} per day (${book.pct(shift.shareOfSource, 'share', 0)} of the source budget, the maximum single change) from ${book.name(from.name)} (CPL ${book.money(from.current.cplMinor)}) to ${book.name(to.name)} (CPL ${book.money(to.current.cplMinor)}).`,
    rows: [
      { label: `Source: ${book.name(from.name)} daily budget (${shift.basis === 'configured_budget' ? 'configured' : 'average spend'})`, value: book.money(shift.fromBudgetMinor) },
      { label: 'Suggested move per day', value: book.money(shift.shiftMinor) },
      { label: `Target: ${book.name(to.name)} CPL`, value: book.money(to.current.cplMinor) },
      { label: `Source CPL`, value: book.money(from.current.cplMinor) },
      { label: 'Maximum single change', value: book.pct(MAX_BUDGET_SHIFT, 'max change', 0) },
    ],
    evidence: [periodLine(c), `IDs: ${book.name(from.id)} to ${book.name(to.id)}. Weakest = highest CPL, strongest = lowest CPL among active campaigns with at least ${book.count(MIN_LEADS_FOR_CPL)} leads (same platform preferred).`],
    recs: [
      { text: `Open ${book.name(from.name)} and use Change budget, which previews the change before anything is applied.`, to: campaignLink(from.id) },
      { text: `Review ${book.name(to.name)} afterwards and re-check CPL.`, to: campaignLink(to.id) },
    ],
    limits: ['Moving budget does not guarantee the target keeps its CPL; efficiency usually drops as spend grows. This is a suggestion, never applied automatically. Changes happen only in the simulated flow after confirmation.'],
  };
}

function leadTrend(c: Ctx): Body {
  const { book } = c;
  const prevR = previousRangeOf(c);
  const cur = leadsOverview_(c, c.period.range);
  const prev = prevR ? leadsOverview_(c, prevR) : null;
  const series = c.tools.run('metricSeries', { metric: 'leads', range: c.period.range, granularity: 'daily' }, () => metricSeries(c.ds, { metric: 'leads', range: c.period.range, granularity: 'daily' }), (r) => `${r.length} points`);
  const key = c.view === 'combined' ? 'total' : c.view;
  const points = series.filter((p) => p[key] !== null);
  const half = Math.floor(points.length / 2);
  const sum = (pts: typeof points) => pts.reduce((a, p) => a + (p[key] ?? 0), 0);
  const first = half > 0 ? sum(points.slice(0, half)) : null;
  const second = half > 0 ? sum(points.slice(points.length - half)) : null;
  const best = [...points].sort((a, b) => (b[key] ?? 0) - (a[key] ?? 0) || a.key.localeCompare(b.key))[0];
  const change = prev ? safeRatioChange(cur, prev) : null;
  const rows: KeyRow[] = [{ label: 'Leads in period', value: book.count(cur) }];
  if (prev !== null) rows.push({ label: 'Leads in previous period', value: book.count(prev) }, { label: 'Change', value: book.change(change) });
  if (first !== null && second !== null) rows.push({ label: 'First half of period', value: book.count(first) }, { label: 'Second half of period', value: book.count(second) });
  if (best) rows.push({ label: `Best day (${book.name(best.label)})`, value: book.count(best[key]) });
  return {
    summary: cur === null ? 'There is no lead data for this period.' : `${VIEW_LABEL[c.view]} produced ${book.count(cur)} leads in ${book.range(c.period.range)}${change !== null ? `, ${book.change(change)} versus the previous period` : ''}.`,
    rows,
    evidence: [periodLine(c), prevR ? `Comparison period: ${book.range(prevR)}.` : noPrev(c), `Tools: performanceTotals and metricSeries (daily leads), ${book.count(points.length)} days with data.`],
    recs: [{ text: 'Open the Leads page for channels and statuses.', to: '/leads' }, { text: 'Ask why CPL changed.', ask: 'Why did CPL rise?' }],
    limits: ['Counts are platform-reported leads from paid forms. Days without data are skipped, not counted as zero.'],
  };
}

function leadsOverview_(c: Ctx, range: DateRange): number | null {
  const t = totalsOf(c, c.view, range);
  return t.leads;
}

function salesBySource(c: Ctx): Body {
  const { book } = c;
  const s = c.tools.run('salesOverview', { range: c.period.range }, () => salesOverview(c.ds, { range: c.period.range }), (r) => `${r.partition.eligibleOrders} paid orders`);
  const parts = [...s.partition.parts].filter((p) => p.orders > 0).sort((a, b) => b.revenueMinor - a.revenueMinor || a.source.localeCompare(b.source));
  const top = parts[0];
  return {
    summary: top
      ? `${book.count(s.partition.eligibleOrders)} paid orders worth ${book.money(s.partition.eligibleRevenueMinor)} in ${book.range(c.period.range)}. The largest customer source is ${SOURCE_LABEL[top.source] ?? top.source} with ${book.money(top.revenueMinor)}.`
      : 'There are no paid orders in this period.',
    rows: [
      ...parts.map((p) => ({ label: SOURCE_LABEL[p.source] ?? p.source, value: `${book.money(p.revenueMinor)} (${book.count(p.orders)} orders)` })),
      { label: 'All paid orders', value: `${book.money(s.partition.eligibleRevenueMinor)} (${book.count(s.partition.eligibleOrders)} orders)` },
      { label: 'Selected sources subtotal (Meta + Google + Chatbot/AI; not an extra part)', value: book.money(s.partition.selected.revenueMinor) },
    ],
    evidence: [periodLine(c), 'Tool: salesOverview. Each paid order sits in exactly one source, so parts add up to the total. Sales are shared across platforms, so the platform filter does not apply.'],
    recs: [{ text: 'Open Sales for the full table and trend.', to: '/sales' }, { text: 'Ask how much of this is verified to an ad.', ask: 'What is the attributable ROAS?' }],
    limits: ['Source is the customer-reported label in the fictional CRM. It is not proof that an ad caused the sale. Revenue includes VAT.'],
  };
}

function attributableRoas(c: Ctx): Body {
  const { book } = c;
  const a = attribution(c);
  const roasLine = (label: string, v: number | null) => ({ label, value: book.multiple(v) });
  return {
    summary:
      a.roas.combined === null
        ? 'Combined attributable ROAS is not available (no spend data or no verified revenue basis).'
        : `Attributable ROAS is ${book.multiple(a.roas.combined)} combined (Meta ${book.multiple(a.roas.meta)}, Google ${book.multiple(a.roas.google)}). It counts only revenue with hard evidence linking the order to an ad.`,
    rows: [
      { label: 'Verified revenue, Meta', value: `${book.money(a.verified.meta.revenueMinor)} (${book.count(a.verified.meta.orders)} orders)` },
      { label: 'Verified revenue, Google', value: `${book.money(a.verified.google.revenueMinor)} (${book.count(a.verified.google.orders)} orders)` },
      { label: 'Spend, Meta', value: book.money(a.spend.metaMinor) },
      { label: 'Spend, Google', value: book.money(a.spend.googleMinor) },
      roasLine('ROAS, Meta', a.roas.meta),
      roasLine('ROAS, Google', a.roas.google),
      roasLine('ROAS, combined', a.roas.combined),
    ],
    evidence: [periodLine(c, 'combined'), 'Tool: attributionOverview. ROAS = verified revenue / spend, computed from sums.', a.spend.partial ? 'Spend is partial for this period (some days missing), so ROAS is based on days with data.' : 'Spend covers all days in the period.'],
    recs: [{ text: 'Open Attribution to see the evidence behind each order.', to: '/attribution' }, { text: 'Ask about orders that could not be linked.', ask: 'How many orders have an unknown source?' }],
    limits: ['Unlinked revenue is excluded, so ROAS understates true return. Similar dates or amounts never count as evidence. Revenue includes VAT.'],
  };
}

function attribution(c: Ctx) {
  return c.tools.run('attributionOverview', { range: c.period.range }, () => attributionOverview(c.ds, { range: c.period.range }), (r) => `paid=${r.paidOrders}, surplus=${r.surplusMinor}`);
}

function salesVat(c: Ctx): number {
  return c.tools.run('salesOverview', { range: c.period.range }, () => salesOverview(c.ds, { range: c.period.range }), (r) => `vat=${r.vatRatePercent}`).vatRatePercent;
}

function surplus(c: Ctx): Body {
  const { book } = c;
  const a = attribution(c);
  const vat = salesVat(c);
  return {
    summary:
      a.surplusMinor === null
        ? 'Advertising surplus is not available because total spend is missing for this period.'
        : `Advertising surplus is ${book.money(a.surplusMinor)}: ${book.money(a.selectedSourceRevenueMinor)} revenue from Meta, Google and Chatbot/AI sources minus ${book.money(a.spend.totalMinor)} Meta + Google spend. It is not profit.`,
    rows: [
      { label: 'Revenue from selected sources', value: book.money(a.selectedSourceRevenueMinor) },
      { label: 'Spend (Meta + Google)', value: book.money(a.spend.totalMinor) },
      { label: 'Advertising surplus', value: book.money(a.surplusMinor) },
      { label: 'VAT rate included in revenue', value: book.pct(vat / 100, 'vat', 0) },
    ],
    evidence: [periodLine(c, 'combined'), 'Tool: attributionOverview (selectedSourceRevenueMinor, spend.totalMinor, surplusMinor).'],
    recs: [{ text: 'Break the surplus down on the Attribution page.', to: '/attribution' }, { text: 'Ask for the sales split by source.', ask: 'Show sales by source' }],
    limits: ['Revenue includes VAT, spend excludes it, and staff, product and refund costs are absent. Treat the surplus as a rough indicator, never as profit.'],
  };
}

function refunds(c: Ctx): Body {
  const { book } = c;
  const s = c.tools.run('salesOverview', { range: c.period.range }, () => salesOverview(c.ds, { range: c.period.range }), (r) => `${r.statusCounts.refunded.orders} refunded`);
  const sc = s.statusCounts;
  const all = sc.paid.orders + sc.unpaid.orders + sc.cancelled.orders + sc.refunded.orders;
  const lost = sc.cancelled.orders + sc.refunded.orders;
  return {
    summary: all === 0 ? 'There are no orders in this period.' : `${book.count(sc.refunded.orders)} orders were refunded (${book.money(sc.refunded.revenueMinor)}) and ${book.count(sc.cancelled.orders)} were cancelled (${book.money(sc.cancelled.revenueMinor)}) out of ${book.count(all)} orders in ${book.range(c.period.range)}.`,
    rows: [
      { label: 'Paid', value: `${book.count(sc.paid.orders)} orders, ${book.money(sc.paid.revenueMinor)}` },
      { label: 'Unpaid', value: `${book.count(sc.unpaid.orders)} orders, ${book.money(sc.unpaid.revenueMinor)}` },
      { label: 'Cancelled', value: `${book.count(sc.cancelled.orders)} orders, ${book.money(sc.cancelled.revenueMinor)}` },
      { label: 'Refunded', value: `${book.count(sc.refunded.orders)} orders, ${book.money(sc.refunded.revenueMinor)}` },
      { label: 'Cancelled + refunded share of orders', value: all === 0 ? '–' : book.pct(lost / all, 'share', 1) },
    ],
    evidence: [periodLine(c), 'Tool: salesOverview (statusCounts). Only paid orders count toward revenue, ROAS and surplus; refunded and cancelled orders are shown separately.'],
    recs: [{ text: 'Open Sales to review individual orders.', to: '/sales' }],
    limits: ['Orders are placed in a period by order date. A refund issued later still appears under its order date.'],
  };
}

function unknownSource(c: Ctx): Body {
  const { book } = c;
  const a = attribution(c);
  const gaps = a.unknown.orders + a.conflict.orders + a.sourceOnly.orders;
  return {
    summary: `${book.count(a.unknown.orders)} paid orders (${book.money(a.unknown.revenueMinor)}) have no source at all and ${book.count(a.conflict.orders)} have conflicting evidence. ${book.count(a.sourceOnly.orders)} more carry only a customer-reported label. Together ${book.count(gaps)} of ${book.count(a.paidOrders)} paid orders cannot be tied to an ad.`,
    rows: [
      { label: 'Verified to an ad (Meta)', value: `${book.count(a.verified.meta.orders)} orders, ${book.money(a.verified.meta.revenueMinor)}` },
      { label: 'Verified to an ad (Google)', value: `${book.count(a.verified.google.orders)} orders, ${book.money(a.verified.google.revenueMinor)}` },
      { label: 'Label only (no evidence)', value: `${book.count(a.sourceOnly.orders)} orders, ${book.money(a.sourceOnly.revenueMinor)}` },
      { label: 'Unknown source', value: `${book.count(a.unknown.orders)} orders, ${book.money(a.unknown.revenueMinor)}` },
      { label: 'Conflicting evidence', value: `${book.count(a.conflict.orders)} orders, ${book.money(a.conflict.revenueMinor)}` },
    ],
    evidence: [periodLine(c, 'combined'), 'Tool: attributionOverview. Orders without a verifiable ID link stay unlinked; I never guess from similar dates or amounts.'],
    recs: [{ text: 'Open Attribution and filter by Unknown or Conflict to inspect the orders.', to: '/attribution' }, { text: 'Ask about Google labels without evidence.', ask: 'Why are some Google-labelled orders not attributed?' }],
    limits: ['Unlinked revenue is excluded from ROAS. Improving capture of lead IDs at checkout is the only fix; the numbers here are not adjusted.'],
  };
}

function googleLabel(c: Ctx): Body {
  const { book } = c;
  const a = attribution(c);
  const g = a.labelWithoutEvidence.google;
  const m = a.labelWithoutEvidence.meta;
  return {
    summary: `${book.count(g.orders)} paid orders (${book.money(g.revenueMinor)}) are labelled Google by the customer but have no evidence of a Google ad click or lead. They are reported as label-only, not as Google-attributed revenue.`,
    rows: [
      { label: 'Google label, no evidence', value: `${book.count(g.orders)} orders, ${book.money(g.revenueMinor)}` },
      { label: 'Meta label, no evidence', value: `${book.count(m.orders)} orders, ${book.money(m.revenueMinor)}` },
      { label: 'Verified Google revenue', value: `${book.money(a.verified.google.revenueMinor)} (${book.count(a.verified.google.orders)} orders)` },
    ],
    evidence: [periodLine(c, 'combined'), 'Tool: attributionOverview (labelWithoutEvidence). A label such as "Google" can come from organic search, brand searches or memory; only an ID-level link proves an ad.'],
    recs: [{ text: 'Open Attribution to inspect label-only orders.', to: '/attribution' }],
    limits: ['This is a deliberate rule of the demo: a self-reported source label is a hint, not attribution. Counting it would inflate Google ROAS.'],
  };
}

function dataQuality(c: Ctx): Body {
  const { book } = c;
  const status = c.tools.run('dataSourceStatus', {}, () => dataSourceStatus(c.ds), (r) => `${r.length} sources`);
  const t = totalsOf(c, 'combined', c.period.range);
  const inRange = status.flatMap((s) => s.issues.filter((i) => i.date >= c.period.range.start && i.date <= c.period.range.end));
  const rows: KeyRow[] = [
    { label: 'Days with data (Meta + Google)', value: `${book.count(t.completeDays)} of ${book.count(t.expectedDays)}` },
    ...status.map((s) => ({ label: `${s.name}: issues in period`, value: book.count(inRange.filter((i) => i.source === s.id).length) })),
  ];
  return {
    summary: inRange.length === 0 && t.missingDates.length === 0 ? `All sources have complete data in ${book.range(c.period.range)}.` : `${book.count(inRange.length)} source ${inRange.length === 1 ? 'issue' : 'issues'} and ${book.count(t.missingDates.length)} missing combined ${t.missingDates.length === 1 ? 'day' : 'days'} were found in ${book.range(c.period.range)}. Missing days are excluded from combined totals, not treated as zero.`,
    rows,
    evidence: [periodLine(c, 'combined'), ...inRange.slice(0, 6).map((i) => `${book.date(i.date)} - ${i.source}: ${i.status}. ${book.name(i.note)}`), coverage(c, t)],
    recs: [{ text: 'Open Data Sources for the full status list.', to: '/data-sources' }],
    limits: ['All sources are simulated in this demo. A missing day means no data was delivered, which is different from a day with zero spend.'],
  };
}

function monthOverMonthBody(c: Ctx): Body {
  const { book } = c;
  const mm = monthOverMonth(c.ds);
  if (!mm) return noRanking(c, 'The current month has no completed days yet.');
  const cur = totalsOf(c, c.view, mm.current);
  const prev = totalsOf(c, c.view, mm.previous);
  return {
    summary: `So far this month (${book.range(mm.current)}) ${VIEW_LABEL[c.view]} spent ${book.money(cur.spendMinor)} for ${book.count(cur.leads)} leads (CPL ${book.money(cur.cplMinor)}), compared with ${book.money(prev.spendMinor)} and ${book.count(prev.leads)} leads (CPL ${book.money(prev.cplMinor)}) over the same number of days last month.`,
    rows: [
      { label: 'Spend change', value: book.change(safeRatioChange(cur.spendMinor, prev.spendMinor)) },
      { label: 'Leads change', value: book.change(safeRatioChange(cur.leads, prev.leads)) },
      { label: 'CPL change', value: book.change(safeRatioChange(cur.cplMinor, prev.cplMinor)) },
      { label: 'CTR this month', value: book.pct(cur.ctr) },
      { label: 'CTR last month', value: book.pct(prev.ctr) },
    ],
    evidence: [`This month: ${book.range(mm.current)}. Compared with: ${book.range(mm.previous)} (same number of days). Platform: ${VIEW_LABEL[c.view]}.`, coverage(c, cur)],
    recs: [{ text: 'Use the Monthly view on Overview for the full monthly chart.', to: '/overview' }],
    limits: ['The current month is incomplete, so only the same number of days of the previous month is compared. Ratios come from sums of both periods.'],
  };
}

function forecast(c: Ctx): Body {
  const { book } = c;
  const prevR = previousRangeOf(c);
  const cur = totalsOf(c, c.view, c.period.range);
  const prev = prevR ? totalsOf(c, c.view, prevR) : null;
  return {
    summary: 'I cannot forecast. This demo has no predictive model, and projecting synthetic data would only look precise. I can show the recent trend and you can judge it.',
    rows: [
      { label: 'Spend in period', value: book.money(cur.spendMinor) },
      { label: 'Leads in period', value: book.count(cur.leads) },
      ...(prev ? [{ label: 'Spend in previous period', value: book.money(prev.spendMinor) }, { label: 'Leads in previous period', value: book.count(prev.leads) }] : []),
    ],
    evidence: [periodLine(c), prevR ? `Comparison period: ${book.range(prevR)}.` : noPrev(c)],
    recs: [
      { text: 'Look at the lead trend instead.', ask: 'How is lead volume trending?' },
      { text: 'Compare this month with last month.', ask: 'Compare this month with the previous month' },
      { text: 'Check which campaign is the most efficient.', ask: 'Which campaign has the best CPL?' },
    ],
    limits: ['No forecast, projection or target is produced. Past performance of synthetic data says nothing about future results.'],
  };
}

function findCampaign(c: Ctx) {
  return matchCampaign(c.q, c.ds);
}

function campaignSpecific(c: Ctx): Body {
  const { book } = c;
  const camp = findCampaign(c);
  if (!camp) return noRanking(c, 'I could not find a campaign with that name.');
  const rows = entitiesOf(c, 'campaign', camp.platform);
  const row = rows.find((r) => r.id === camp.id);
  const ads = c.tools.run('entityPerformance', { level: 'ad', view: camp.platform, campaignId: camp.id, range: c.period.range }, () => entityPerformance(c.ds, { level: 'ad', view: camp.platform, range: c.period.range, campaignId: camp.id }), (r) => `${r.length} ads`);
  if (!row) return noRanking(c, 'That campaign has no data in this period.');
  const cur = row.current;
  const best = [...ads].filter((a) => a.current.ctr !== null).sort((a, b) => (b.current.ctr ?? 0) - (a.current.ctr ?? 0) || a.id.localeCompare(b.id))[0];
  return {
    summary: `${book.name(row.name)} (${VIEW_LABEL[row.platform]}, ${row.status === 'ACTIVE' ? 'active' : 'paused'}) spent ${book.money(cur.spendMinor)} for ${book.count(cur.leads)} leads at ${book.money(cur.cplMinor)} CPL in ${book.range(c.period.range)}.`,
    rows: [
      { label: 'Spend', value: book.money(cur.spendMinor) },
      { label: 'Leads', value: book.count(cur.leads) },
      { label: 'CPL', value: book.money(cur.cplMinor) },
      { label: 'CTR', value: book.pct(cur.ctr) },
      { label: 'CPL change vs previous', value: book.change(row.change.cpl) },
      { label: 'Spend change vs previous', value: book.change(row.change.spend) },
      { label: 'Ads in campaign', value: book.count(ads.length) },
      ...(best ? [{ label: `Best CTR ad: ${book.name(best.name)}`, value: book.pct(best.current.ctr) }] : []),
    ],
    evidence: [periodLine(c, row.platform), `Entity ID: ${book.name(row.id)}. Tools: entityPerformance (campaign and ad level).`],
    recs: [{ text: `Open ${book.name(row.name)} for ad sets, ads and controls.`, to: campaignLink(row.id) }],
    limits: ['Metrics are platform-reported. Verified revenue is shown on the Attribution page, not guessed per campaign here.'],
  };
}

function compareAds(c: Ctx): Body {
  const { book } = c;
  const ads = entitiesOf(c, 'ad');
  const byLen = [...ads].sort((a, b) => b.name.length - a.name.length);
  const named: EntityPerformanceRow[] = [];
  let remaining = c.q;
  for (const a of byLen) {
    const n = a.name.toLowerCase();
    if (remaining.includes(n) && !named.some((x) => x.id === a.id)) {
      named.push(a);
      remaining = remaining.replace(n, ' ');
    }
  }
  let chosen = named.slice(0, 2);
  let note = 'Compared the two ads named in your question.';
  if (chosen.length < 2) {
    chosen = ads.filter((a) => (a.current.impressions ?? 0) >= MIN_IMPRESSIONS_FOR_CTR && a.current.ctr !== null).sort((a, b) => (b.current.ctr ?? 0) - (a.current.ctr ?? 0) || a.id.localeCompare(b.id)).slice(0, 2);
    note = 'You did not name two ads, so I compared the two ads with the highest CTR.';
  }
  const [a, b] = chosen;
  if (!a || !b) return noRanking(c, 'I need at least two ads with data to compare.');
  const line = (r: EntityPerformanceRow) => ({ ctr: book.pct(r.current.ctr), cpl: book.money(r.current.cplMinor), leads: book.count(r.current.leads), spend: book.money(r.current.spendMinor) });
  const A = line(a);
  const B = line(b);
  const better = (a.current.cplMinor ?? Infinity) <= (b.current.cplMinor ?? Infinity) ? a : b;
  return {
    summary: `${note} ${book.name(better.name)} has the lower CPL (${book.money(better.current.cplMinor)}).`,
    rows: [
      { label: `${book.name(a.name)} CTR`, value: A.ctr },
      { label: `${book.name(b.name)} CTR`, value: B.ctr },
      { label: `${book.name(a.name)} CPL`, value: A.cpl },
      { label: `${book.name(b.name)} CPL`, value: B.cpl },
      { label: `${book.name(a.name)} leads`, value: A.leads },
      { label: `${book.name(b.name)} leads`, value: B.leads },
      { label: `${book.name(a.name)} spend`, value: A.spend },
      { label: `${book.name(b.name)} spend`, value: B.spend },
    ],
    evidence: [periodLine(c), `Ad IDs: ${book.name(a.id)} and ${book.name(b.id)}. Tool: entityPerformance at ad level.`],
    recs: [{ text: 'Open Ad Comparison for the time series of both ads.', to: '/compare' }, { text: `Open the campaign of ${book.name(better.name)}.`, to: campaignLink(better.campaignId) }],
    limits: ['Ads in different campaigns face different audiences and budgets, so a head-to-head is indicative only.'],
  };
}

function howAttribution(c: Ctx): Body {
  const { book } = c;
  const a = attribution(c);
  return {
    summary: 'Attribution in this demo uses hard evidence only. An order counts for an ad when its ID chain (order, lead, platform lead ID, campaign) is verifiable. A customer-reported source label is a hint and stays "label only".',
    rows: [
      { label: 'Verified to an ad', value: book.count(a.verified.meta.orders + a.verified.google.orders) },
      { label: 'Label only', value: book.count(a.sourceOnly.orders) },
      { label: 'Unknown', value: book.count(a.unknown.orders) },
      { label: 'Conflict', value: book.count(a.conflict.orders) },
    ],
    evidence: [periodLine(c, 'combined'), 'Tool: attributionOverview. Counts are paid orders in the period. Similar dates, amounts or names are never used to link an order.'],
    recs: [{ text: 'Open Attribution to see each order and why it was classified.', to: '/attribution' }, { text: 'Ask about the ROAS this produces.', ask: 'What is the attributable ROAS?' }],
    limits: ['Platform-reported conversions (Meta Results) are a different measure and are not mixed with verified sales. Unlinked revenue is excluded from ROAS.'],
  };
}

export const HANDLERS: Record<Exclude<IntentId, 'unsupported'>, (c: Ctx) => Body> = {
  help,
  spend_summary: spendSummary,
  platform_compare: platformCompare,
  best_campaign_cpl: bestCampaign,
  worst_campaign: worstCampaign,
  cpl_rise: cplRise,
  creative_fatigue: creativeFatigue,
  top_ads_ctr: topAdsCtr,
  budget_realloc: budgetRealloc,
  lead_trend: leadTrend,
  sales_by_source: salesBySource,
  attributable_roas: attributableRoas,
  surplus,
  refunds,
  unknown_source: unknownSource,
  google_label: googleLabel,
  data_quality: dataQuality,
  month_over_month: monthOverMonthBody,
  forecast,
  campaign_specific: campaignSpecific,
  compare_ads: compareAds,
  how_attribution: howAttribution,
};

// Kept so unused helper imports stay referenced by the type checker when handlers change.
void [compareDates, leadsOverview, previousPeriod, rangeLength, resolveShowcaseRange];
export type { Rec };
