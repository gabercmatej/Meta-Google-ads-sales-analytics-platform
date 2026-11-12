// Pure comparison logic for the Ad comparison page: which direction is "better" per metric,
// how a delta is judged, and a neutral, data-derived verdict. No React, no side effects.

import { DEFAULT_VOLUME_GUARD } from '@sedem-ads/analytics-core';

export type CmpMetric = 'spend' | 'impressions' | 'clicks' | 'leads' | 'ctr' | 'cpc' | 'cpm' | 'cpl' | 'orders' | 'revenue';

/** 'lower' = a lower value is better (costs); 'higher' = a higher value is better; 'neutral' = no judgement (volume/budget). */
export const BETTER_WHEN: Record<CmpMetric, 'lower' | 'higher' | 'neutral'> = {
  spend: 'neutral',
  impressions: 'neutral',
  clicks: 'higher',
  leads: 'higher',
  ctr: 'higher',
  cpc: 'lower',
  cpm: 'lower',
  cpl: 'lower',
  orders: 'higher',
  revenue: 'higher',
};

export type Verdict = 'better' | 'worse' | 'same' | 'unknown' | 'neutral';

/** Judge a change `value` against `reference` for a metric. Missing values are unknown, never zero. */
export function judge(metric: CmpMetric, value: number | null, reference: number | null): Verdict {
  if (value === null || reference === null) return 'unknown';
  const dir = BETTER_WHEN[metric];
  if (value === reference) return 'same';
  if (dir === 'neutral') return 'neutral';
  const higher = value > reference;
  return (dir === 'higher') === higher ? 'better' : 'worse';
}

/** Relative change (value - reference) / |reference|; null when not computable. */
export function relChange(value: number | null, reference: number | null): number | null {
  if (value === null || reference === null || reference === 0) return null;
  return (value - reference) / Math.abs(reference);
}

/** Id of the single best candidate; null when no candidate has a value or the best is tied. */
export function bestId(metric: CmpMetric, candidates: readonly { id: string; value: number | null }[]): string | null {
  const dir = BETTER_WHEN[metric];
  if (dir === 'neutral') return null;
  const valid = candidates.filter((c): c is { id: string; value: number } => c.value !== null);
  if (valid.length < 2) return null;
  const sorted = [...valid].sort((a, b) => (dir === 'lower' ? a.value - b.value : b.value - a.value));
  if (sorted[0]!.value === sorted[1]!.value) return null;
  return sorted[0]!.id;
}

export interface VerdictInput {
  id: string;
  label: string;
  spendMinor: number | null;
  impressions: number | null;
  clicks: number | null;
  leads: number | null;
  ctr: number | null;
  cplMinor: number | null;
  cpcMinor: number | null;
}

export interface VerdictResult {
  /** Winner on cost per lead among ads with enough leads; null when no honest call can be made. */
  winnerId: string | null;
  headline: string;
  reasons: string[];
  caveats: string[];
}

const eur = (minor: number) => `€${(minor / 100).toFixed(2)}`;
const pctText = (f: number) => `${Math.abs(f * 100).toFixed(1)}%`;

/** Neutral, data-derived verdict. It never recommends a change; it states which ad is cheaper per lead and why. */
export function buildVerdict(ads: readonly VerdictInput[]): VerdictResult {
  const caveats: string[] = [];
  const reasons: string[] = [];
  const eligible = ads.filter((a) => a.cplMinor !== null && (a.leads ?? 0) >= DEFAULT_VOLUME_GUARD.minLeads);
  const small = ads.filter((a) => !eligible.includes(a));
  for (const a of small) caveats.push(`${a.label} has fewer than ${DEFAULT_VOLUME_GUARD.minLeads} leads, so its CPL is too noisy to rank.`);
  if (eligible.length < 2) {
    return { winnerId: null, headline: 'No clear winner: not enough leads to compare cost per lead.', reasons, caveats };
  }
  const ranked = [...eligible].sort((a, b) => a.cplMinor! - b.cplMinor!);
  const best = ranked[0]!;
  const second = ranked[1]!;
  if (best.cplMinor === second.cplMinor) {
    return { winnerId: null, headline: 'No clear winner: the two cheapest ads have the same cost per lead.', reasons, caveats };
  }
  const gap = relChange(best.cplMinor, second.cplMinor)!;
  reasons.push(`${best.label} has the lowest CPL, ${eur(best.cplMinor!)} against ${eur(second.cplMinor!)} for ${second.label} (${pctText(gap)} lower).`);
  if (best.ctr !== null && second.ctr !== null && best.ctr !== second.ctr) {
    reasons.push(`CTR: ${(best.ctr * 100).toFixed(2)}% for ${best.label} against ${(second.ctr * 100).toFixed(2)}% for ${second.label} (${best.ctr > second.ctr ? 'higher' : 'lower'} for the cheaper ad).`);
  }
  if (best.cpcMinor !== null && second.cpcMinor !== null && best.cpcMinor !== second.cpcMinor) {
    reasons.push(`CPC: ${eur(best.cpcMinor)} against ${eur(second.cpcMinor)} (${best.cpcMinor < second.cpcMinor ? 'lower' : 'higher'} for the cheaper ad).`);
  }
  reasons.push(`Volume behind the call: ${best.leads} leads for ${best.label} and ${second.leads} for ${second.label}.`);
  if (gap > -0.1) caveats.push('The difference in CPL is under 10%, which is within normal day-to-day variation.');
  caveats.push('Based on the selected period only; it says nothing about future results.');
  return { winnerId: best.id, headline: `${best.label} is cheaper per lead in this period.`, reasons, caveats };
}
