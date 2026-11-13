// Independent reference implementation for the Sedem Ads showcase. Not production source.
//
// Seeded generator for the interactive demo's FICTIONAL company ("Northwind Advisory").
// Deterministic: the same seed always yields a deep-equal dataset. Only mulberry32 is used (no
// unseeded randomness, no clock reads). Money is integer EUR cents. Dates are calendar days in
// Europe/Ljubljana; instants are UTC. History: 2024-11-01 .. 2026-11-11 (reference date).
//
// PLANTED CASES (exact ids/dates are also exported in `dataset.planted` and asserted in tests):
//  1. Underperforming campaign `meta-c3` ("Lookalike Test | Broad"): its lead rate decays over the
//     last 60 days, so cost per lead rises in the last 30 days vs the previous 30 (clearly the steepest rise, ~ +40%).
//  2. Fatigued Meta ad `meta-c1-g1-a1`: CTR declines over the 35 days before the reference date
//     (~ -23% last 30 days vs previous 30). `fatigued` flag rule: see entityPerformance.
//  2b. Mildly declining Google ad `google-c1-g1-a1` (CTR about -14%, not fatigued): falling-CTR case.
//  3. (opt-in `plantedGaps`) Google gap: 2026-10-03 has SourceDay 'missing' and NO Google rows.
//  4. (opt-in `plantedGaps`) Meta gap: 2026-10-19 has SourceDay 'source_error' and NO Meta rows.
//  5. Partial final day 2026-11-11 (reference date): 'partial' for meta, google, crm, payments and
//     leads. Rows exist (about 45% volume) but are flagged; completed-days presets exclude it.
//  6. Label-only order: customer label "Google", no verified evidence -> source_only, flagged
//     (ORD id in `planted.labelOnlyGoogleOrderId`, ordered 2026-10-27T09:12Z).
//  7. Refunded, cancelled and unpaid orders; orders paid later than ordered, including one paid
//     in the next month (ordered 2026-09-30T20:30Z, paid 2026-10-01T08:15Z).
//  8. VAT 22%: order amounts are gross (VAT included) while ad spend is net. "Advertising
//     surplus" (selected-source revenue - ad spend) is NOT profit.
//  9. Unknown-source customers (empty label) and a conflicting-evidence order (verified Meta lead
//     match plus a gclid, ordered 2026-10-22T10:05Z).

import { type ISODate, enumerateDays } from '../dates.js';
import { SYNTHETIC_LABEL, mulberry32, type AdDailyRow } from '../synthetic/generate.js';
import { buildCrm } from './crm.js';
import { makeRand } from './rng.js';
import { FATIGUED_AD_ID, buildStructure } from './structure.js';
import {
  SHOWCASE_HISTORY_START,
  SHOWCASE_REFERENCE_DATE,
  SHOWCASE_REFERENCE_NOW,
  SHOWCASE_SEED,
  type ShowcaseDataset,
  type SourceDay,
} from './types.js';

export interface ShowcaseOptions {
  seed?: number;
  /**
   * Opt in to the planted source gaps (Google 'missing' on 2026-10-03, Meta 'source_error' on
   * 2026-10-19, rows removed). Default false: every completed day has full rows for every source.
   */
  plantedGaps?: boolean;
}

export const SHOWCASE_GOOGLE_MISSING_DATE: ISODate = '2026-10-03';
export const SHOWCASE_META_ERROR_DATE: ISODate = '2026-10-19';
export const SHOWCASE_VAT_RATE_PERCENT = 22;

/** A second, milder CTR decline (below the fatigue rule) so the falling-CTR recommendation has a real case. */
const MILD_DECLINE_AD_ID = 'google-c1-g1-a1';

const SEASON = [1.2, 1.05, 1.0, 0.95, 0.95, 0.9, 0.85, 0.85, 1.2, 1.05, 1.0, 0.75];
// Index = UTC weekday (0 = Sunday). Meta is flat with slightly higher weekends; Search is strongly
// weekday-driven; Display / PMax sit in between.
const WEEKDAY_META = [1.06, 0.98, 0.97, 0.97, 0.98, 1.0, 1.06];
const WEEKDAY_SEARCH = [0.55, 1.15, 1.15, 1.1, 1.1, 0.95, 0.6];
const WEEKDAY_MID = [0.8, 1.08, 1.08, 1.04, 1.04, 0.97, 0.85];
const weekdayProfile = (spec: { platform: string; channelType: string | null }): readonly number[] =>
  spec.platform === 'meta' ? WEEKDAY_META : spec.channelType === 'SEARCH' ? WEEKDAY_SEARCH : WEEKDAY_MID;
/** AR(1) coefficient of the day-to-day spend wander. */
const AR_COEF = 0.7;
/** Campaigns that get one deliberate pause (3-8 days with no rows at all). Never planted-case campaigns. */
const PAUSED_CAMPAIGNS = ['meta-c4', 'meta-c5', 'google-c2', 'google-c3'];
/** Budget steps / promo bursts / pauses are kept this many days away from the reference date (planted trends stay clean). */
const SCHEDULE_QUIET_DAYS = 80;
const PARTIAL_VOLUME = 0.45;

const clip01 = (x: number): number => Math.min(1, Math.max(0, x));
const dayNumber = (date: ISODate): number => Math.round(Date.parse(`${date}T00:00:00Z`) / 86_400_000);

export function generateShowcaseDataset(options: ShowcaseOptions = {}): ShowcaseDataset {
  const seed = options.seed ?? SHOWCASE_SEED;
  const rowRand = makeRand(mulberry32(seed));
  const structRand = mulberry32((seed ^ 0x5bd1e995) >>> 0);
  const crmRand = makeRand(mulberry32((seed ^ 0x9e3779b1) >>> 0));
  const structure = buildStructure(structRand);
  const ref = SHOWCASE_REFERENCE_DATE;
  const refNum = dayNumber(ref);
  const days = enumerateDays({ start: SHOWCASE_HISTORY_START, end: ref });

  // ---- true daily rows -----------------------------------------------------------------
  const adsByCampaign = new Map<string, { ad: (typeof structure.ads)[number]; rt: NonNullable<ReturnType<typeof structure.runtime.get>> }[]>();
  for (const ad of structure.ads) {
    const list = adsByCampaign.get(ad.campaignId) ?? [];
    list.push({ ad, rt: structure.runtime.get(ad.id)! });
    adsByCampaign.set(ad.campaignId, list);
  }
  // ---- per-campaign schedule (all from a dedicated seeded stream) -------------------------
  const schedRand = makeRand(mulberry32((seed ^ 0xa5a5a5a5) >>> 0));
  const histStart = dayNumber(SHOWCASE_HISTORY_START);
  const histSpan = refNum - histStart;
  interface Schedule {
    steps: { at: number; factor: number }[];
    bursts: { from: number; to: number; factor: number }[];
    pause: { from: number; to: number } | null;
    trend: number;
    phase: number;
    ar: number;
  }
  const FACTORS = [1.2, 0.85, 1.15, 0.9, 1.25, 0.8];
  const schedules = new Map<string, Schedule>();
  for (const spec of structure.specs) {
    const lo = Math.max(histStart, dayNumber(spec.start)) + 45;
    const endNum = spec.end === null ? refNum : Math.min(refNum, dayNumber(spec.end));
    const hi = endNum - SCHEDULE_QUIET_DAYS;
    const free = hi > lo;
    const steps: Schedule['steps'] = [];
    const bursts: Schedule['bursts'] = [];
    let pause: Schedule['pause'] = null;
    if (free) {
      const nSteps = spec.id === 'meta-c3' ? 1 : schedRand.int(2, 3);
      for (let i = 0; i < nSteps; i++) steps.push({ at: schedRand.int(lo, hi), factor: schedRand.weighted(FACTORS, [1, 1, 1, 1, 1, 1]) });
      steps.sort((a, b) => a.at - b.at);
      if (spec.leadRate > 0) {
        for (let i = 0; i < 2; i++) {
          const from = schedRand.int(lo, hi);
          bursts.push({ from, to: from + schedRand.int(3, 6), factor: 1.35 + 0.4 * schedRand.next() });
        }
      }
      if (PAUSED_CAMPAIGNS.includes(spec.id)) {
        const from = schedRand.int(lo, hi - 9);
        pause = { from, to: from + schedRand.int(3, 8) - 1 };
      }
    }
    const trend = spec.platform === 'meta' ? (spec.id === 'meta-c3' ? 0.05 : 0.15 + 0.2 * schedRand.next()) : -0.03 + 0.09 * schedRand.next();
    schedules.set(spec.id, { steps, bursts, pause, trend, phase: schedRand.next() * Math.PI * 2, ar: 0 });
  }
  const calendarFactor = (date: ISODate): number => {
    const md = date.slice(5);
    if (md === '12-24' || md === '12-25' || md === '12-26') return 0.55;
    if (md === '12-23' || (md > '12-26' && md <= '12-31') || md === '01-01' || md === '01-02') return md === '01-01' ? 0.6 : 0.72;
    if (md >= '08-01' && md <= '08-25') return 0.9;
    return 1;
  };

  const trueRows: AdDailyRow[] = [];
  for (const date of days) {
    const month = Number(date.slice(5, 7)) - 1;
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
    const volume = date === ref ? PARTIAL_VOLUME : 1;
    const dn = dayNumber(date);
    for (const spec of structure.specs) {
      if (date < spec.start || (spec.end !== null && date > spec.end)) continue;
      const sch = schedules.get(spec.id)!;
      // AR(1) state advances on every active day (also paused days), so lines wander instead of zig-zagging.
      sch.ar = AR_COEF * sch.ar + (rowRand.next() * 2 - 1) * 0.12;
      if (sch.pause && dn >= sch.pause.from && dn <= sch.pause.to) continue;
      let budget = 1;
      for (const st of sch.steps) if (dn >= st.at) budget *= st.factor;
      const tFrac = (dn - histStart) / histSpan;
      budget *= (1 + sch.trend * (tFrac - 0.5)) * (1 + 0.06 * Math.sin((dn / 150) * Math.PI * 2 + sch.phase));
      let burst = 1;
      for (const b of sch.bursts) if (dn >= b.from && dn <= b.to) burst = b.factor;
      const age = dn - dayNumber(spec.start);
      const ramp = age >= 10 ? 1 : 0.6 + 0.04 * age;
      const season = 1 + 0.6 * (SEASON[month]! - 1);
      const campaignSpend =
        spec.base * budget * burst * ramp * season * calendarFactor(date) * weekdayProfile(spec)[weekday]! * Math.exp(sch.ar) * rowRand.noise(0.04) * volume;
      const cpcDrift = Math.pow(Math.min(1.5, Math.max(0.6, budget)), 0.2);
      const active = (adsByCampaign.get(spec.id) ?? []).filter(({ rt }) => date >= rt.startDate && (rt.endDate === null || date <= rt.endDate));
      const totalWeight = active.reduce((s, { rt }) => s + rt.weight * rt.quality, 0);
      if (totalWeight === 0) continue;
      const leadSeason = Math.sqrt(SEASON[month]!);
      for (const { ad, rt } of active) {
        const share = (rt.weight * rt.quality) / totalWeight;
        const spendMinor = Math.round(campaignSpend * share);
        let ctrNow = spec.ctr * rt.quality * rowRand.noise(0.08);
        let cpcNow = spec.cpcMinor * cpcDrift * rowRand.noise(0.07);
        let leadRate = spec.leadRate * leadSeason * rowRand.noise(0.12);
        if (rt.fatigued) {
          const t = clip01((dn - (refNum - 35)) / 35);
          ctrNow *= 1 - 0.42 * t;
          cpcNow *= 1 + 0.12 * t;
        }
        if (ad.id === MILD_DECLINE_AD_ID) {
          const t = clip01((dn - (refNum - 30)) / 30);
          ctrNow *= 1 - 0.3 * t;
        }
        if (spec.rampDownLeads) {
          const t = clip01((dn - (refNum - 60)) / 60);
          leadRate *= 1 - 0.7 * t;
        }
        // cpm (cents per 1000 impressions) = cpc * ctr * 1000, so clicks ~ spend / cpc.
        const cpm = cpcNow * ctrNow * 1000;
        const impressions = Math.round((spendMinor / cpm) * 1000);
        const clicks = Math.min(impressions, rowRand.stochastic(impressions * ctrNow));
        const leads = spec.leadRate > 0 ? Math.min(clicks, rowRand.stochastic(clicks * leadRate)) : 0;
        let conversions: number;
        if (spec.id === 'meta-c5') conversions = rowRand.stochastic(clicks * 0.03);
        else if (spec.leadRate > 0) conversions = rowRand.stochastic(leads * 1.1 + clicks * 0.002);
        else conversions = rowRand.stochastic(clicks * 0.004);
        trueRows.push({
          date,
          adId: ad.id,
          adGroupId: ad.adGroupId,
          campaignId: ad.campaignId,
          platform: spec.platform,
          spendMinor,
          impressions,
          clicks,
          leads,
          platformConversions: conversions,
        });
      }
    }
  }

  // ---- source gaps ---------------------------------------------------------------------
  const gaps = options.plantedGaps === true;
  const gapDays: SourceDay[] = !gaps ? [] : [
    { source: 'google', date: SHOWCASE_GOOGLE_MISSING_DATE, status: 'missing', note: 'Simulated outage: the Google Ads export for this day is missing. No rows were imported.' },
    { source: 'meta', date: SHOWCASE_META_ERROR_DATE, status: 'source_error', note: 'Simulated API error: the Meta Ads request for this day failed. No rows were imported.' },
  ];
  const sourceDays: SourceDay[] = [
    ...gapDays,
    ...(['meta', 'google', 'crm', 'payments', 'leads'] as const).map((source): SourceDay => ({
      source,
      date: ref,
      status: 'partial',
      note: 'Today is still accumulating. Present but flagged; completed-day presets exclude it.',
    })),
  ];
  const daily = !gaps ? trueRows : trueRows.filter(
    (r) => !(r.platform === 'google' && r.date === SHOWCASE_GOOGLE_MISSING_DATE) && !(r.platform === 'meta' && r.date === SHOWCASE_META_ERROR_DATE),
  );

  // ---- CRM (derived from the true rows: leads exist even when the platform export is missing) ----
  const crm = buildCrm({
    rand: crmRand,
    rows: trueRows,
    ads: structure.ads,
    specs: structure.specs,
    startDate: SHOWCASE_HISTORY_START,
    referenceDate: ref,
    referenceNow: SHOWCASE_REFERENCE_NOW,
    timeZone: 'Europe/Ljubljana',
  });

  return {
    synthetic: true,
    label: SYNTHETIC_LABEL,
    seed,
    company: 'Northwind Advisory (fictional)',
    currency: 'EUR',
    timeZone: 'Europe/Ljubljana',
    range: { start: SHOWCASE_HISTORY_START, end: ref },
    accounts: { meta: 'meta-demo-account', google: 'google-demo-account' },
    kind: 'showcase',
    referenceNow: SHOWCASE_REFERENCE_NOW,
    referenceDate: ref,
    vatRatePercent: SHOWCASE_VAT_RATE_PERCENT,
    campaigns: structure.campaigns,
    adGroups: structure.adGroups,
    ads: structure.ads,
    creatives: structure.creatives,
    daily,
    sourceDays,
    leads: crm.leads,
    customers: crm.customers,
    orders: crm.orders,
    planted: {
      underperformingCampaignId: 'meta-c3',
      fatiguedAdId: FATIGUED_AD_ID,
      googleMissingDate: gaps ? SHOWCASE_GOOGLE_MISSING_DATE : null,
      metaSourceErrorDate: gaps ? SHOWCASE_META_ERROR_DATE : null,
      partialDate: ref,
      ...crm.planted,
    },
  };
}

