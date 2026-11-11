// Independent reference implementation for the Sedem Ads showcase. Not production source.
//
// Seeded synthetic data for a FICTIONAL company. Every number here comes from a pseudo-random
// generator and describes no real business. The dataset is internally consistent (campaign ->
// ad group -> ad -> daily rows -> leads -> orders) so analytics code can be exercised end to end.

import { type DateRange, type ISODate, addDays, enumerateDays, monthKey } from '../dates.js';
import { type AttributableOrder, type Evidence, classifyOrder, sourceFromAttribution } from '../attribution.js';
import type { OrderStatus } from '../sources.js';
import type { Platform } from '../spend.js';

export const SYNTHETIC_LABEL = 'DEMO DATA — NOT REAL BUSINESS RESULTS' as const;

/** Small deterministic PRNG (mulberry32). Returns floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface SyntheticCampaign {
  id: string;
  platform: Platform;
  name: string;
  /** The deliberately weak campaign, so "worst performer" questions have a real answer. */
  underperforming: boolean;
}

/** Meta ad set or Google ad group. */
export interface SyntheticAdGroup {
  id: string;
  campaignId: string;
  platform: Platform;
  name: string;
}

export interface SyntheticAd {
  id: string;
  adGroupId: string;
  campaignId: string;
  platform: Platform;
  name: string;
  launchDate: ISODate;
  /** Creative fatigue: performance decays the longer the ad runs. */
  fatigued: boolean;
}

export interface AdDailyRow {
  date: ISODate;
  adId: string;
  adGroupId: string;
  campaignId: string;
  platform: Platform;
  spendMinor: number;
  impressions: number;
  clicks: number;
  leads: number;
  /** What the platform reports as conversions. NOT verified orders. */
  platformConversions: number;
}

export type SyntheticOrder = AttributableOrder;

export interface SyntheticDataset {
  synthetic: true;
  label: typeof SYNTHETIC_LABEL;
  seed: number;
  company: string;
  currency: 'EUR';
  timeZone: string;
  range: DateRange;
  accounts: Record<Platform, string>;
  campaigns: SyntheticCampaign[];
  adGroups: SyntheticAdGroup[];
  ads: SyntheticAd[];
  daily: AdDailyRow[];
  orders: SyntheticOrder[];
}

export interface GenerateOptions {
  seed?: number;
  start?: ISODate;
  end?: ISODate;
  company?: string;
  timeZone?: string;
}

interface CampaignSpec {
  id: string;
  platform: Platform;
  name: string;
  baseSpendMinor: number;
  cpmMinor: number;
  ctr: number;
  leadRate: number;
  orderRate: number;
  hardEvidenceRate: number;
  underperforming: boolean;
}

const CAMPAIGNS: CampaignSpec[] = [
  { id: 'meta-c1', platform: 'meta', name: 'Meta | Prospecting - Consultations', baseSpendMinor: 5500, cpmMinor: 900, ctr: 0.016, leadRate: 0.09, orderRate: 0.3, hardEvidenceRate: 0.65, underperforming: false },
  { id: 'meta-c2', platform: 'meta', name: 'Meta | Retargeting - Site Visitors', baseSpendMinor: 2200, cpmMinor: 1300, ctr: 0.022, leadRate: 0.12, orderRate: 0.38, hardEvidenceRate: 0.65, underperforming: false },
  { id: 'meta-c3', platform: 'meta', name: 'Meta | Broad Reach - Underperformer', baseSpendMinor: 3500, cpmMinor: 700, ctr: 0.006, leadRate: 0.03, orderRate: 0.08, hardEvidenceRate: 0.65, underperforming: true },
  { id: 'google-c1', platform: 'google', name: 'Google | Search - Core Services', baseSpendMinor: 4500, cpmMinor: 2800, ctr: 0.05, leadRate: 0.1, orderRate: 0.32, hardEvidenceRate: 0.5, underperforming: false },
  { id: 'google-c2', platform: 'google', name: 'Google | Search - Brand Terms', baseSpendMinor: 1500, cpmMinor: 2000, ctr: 0.09, leadRate: 0.14, orderRate: 0.42, hardEvidenceRate: 0.5, underperforming: false },
];

/** Index by month (0 = January). Mild summer dip, strong autumn. */
const SEASONALITY = [0.9, 0.95, 1.0, 1.0, 0.95, 0.85, 0.8, 0.75, 1.05, 1.15, 1.2, 1.0];
/** Index by UTC weekday (0 = Sunday). */
const WEEKDAY = [0.65, 1.1, 1.1, 1.05, 1.05, 0.95, 0.7];
const AMOUNTS_MINOR = [4900, 7900, 12900, 24900, 34900];
const AMOUNT_WEIGHTS = [0.3, 0.3, 0.2, 0.15, 0.05];

export function generateDataset(options: GenerateOptions = {}): SyntheticDataset {
  const seed = options.seed ?? 42;
  const range: DateRange = { start: options.start ?? '2025-01-01', end: options.end ?? '2025-12-31' };
  const rng = mulberry32(seed);
  const days = enumerateDays(range);

  const stochastic = (x: number): number => Math.floor(x + rng());
  const noise = (spread: number): number => 1 - spread + 2 * spread * rng();
  const poisson = (lambda: number): number => {
    const limit = Math.exp(-lambda);
    let k = 0;
    let p = 1;
    do {
      k += 1;
      p *= rng();
    } while (p > limit);
    return k - 1;
  };
  const weighted = <T>(items: readonly T[], weights: readonly number[]): T => {
    let r = rng();
    for (let i = 0; i < items.length; i++) {
      r -= weights[i]!;
      if (r < 0) return items[i]!;
    }
    return items[items.length - 1]!;
  };

  const campaigns: SyntheticCampaign[] = [];
  const adGroups: SyntheticAdGroup[] = [];
  const ads: SyntheticAd[] = [];
  const adSpecs = new Map<string, { spec: CampaignSpec; share: number }>();

  for (const spec of CAMPAIGNS) {
    campaigns.push({ id: spec.id, platform: spec.platform, name: spec.name, underperforming: spec.underperforming });
    const groupShares = [0.6, 0.4];
    for (let g = 0; g < 2; g++) {
      const groupId = `${spec.id}-g${g + 1}`;
      adGroups.push({
        id: groupId,
        campaignId: spec.id,
        platform: spec.platform,
        name: `${spec.platform === 'meta' ? 'Ad set' : 'Ad group'} ${g + 1}`,
      });
      const adShares = [0.55, 0.45];
      for (let a = 0; a < 2; a++) {
        const adId = `${groupId}-a${a + 1}`;
        // One fatigued ad per first campaign of each platform; one replacement creative launches mid-year.
        const fatigued = (spec.id === 'meta-c1' || spec.id === 'google-c1') && g === 0 && a === 0;
        const replacement = (spec.id === 'meta-c1' || spec.id === 'google-c1') && g === 0 && a === 1;
        const launchDate = replacement ? maxDate(range.start, addDays(range.start, 90)) : range.start;
        ads.push({
          id: adId,
          adGroupId: groupId,
          campaignId: spec.id,
          platform: spec.platform,
          name: `Creative ${String.fromCharCode(65 + g * 2 + a)}`,
          launchDate,
          fatigued,
        });
        adSpecs.set(adId, { spec, share: groupShares[g]! * adShares[a]! });
      }
    }
  }

  const daily: AdDailyRow[] = [];
  for (const day of days) {
    const month = Number(day.slice(5, 7)) - 1;
    const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
    for (const ad of ads) {
      if (day < ad.launchDate) continue;
      const { spec, share } = adSpecs.get(ad.id)!;
      const age = daysSince(ad.launchDate, day);
      const fatigue = ad.fatigued ? Math.max(0.4, 1 - Math.max(0, age - 60) * 0.006) : 1;
      const spendMinor = Math.round(spec.baseSpendMinor * share * SEASONALITY[month]! * WEEKDAY[weekday]! * noise(0.1));
      const impressions = Math.round((spendMinor / (spec.cpmMinor * noise(0.05))) * 1000);
      const clicks = Math.min(impressions, stochastic(impressions * spec.ctr * fatigue * noise(0.1)));
      const leads = Math.min(clicks, stochastic(clicks * spec.leadRate * noise(0.15)));
      const platformConversions = stochastic(leads * 1.35 + clicks * 0.004);
      daily.push({
        date: day,
        adId: ad.id,
        adGroupId: ad.adGroupId,
        campaignId: ad.campaignId,
        platform: ad.platform,
        spendMinor,
        impressions,
        clicks,
        leads,
        platformConversions,
      });
    }
  }

  // Orders. Each is first built from evidence, then classified by the library itself so the
  // stored `source` always agrees with what the attribution rules would say.
  interface Draft {
    orderedAt: string;
    status: OrderStatus;
    paidAt: string | null;
    amountMinor: number;
    evidence: Evidence[];
    tie: number;
  }
  const drafts: Draft[] = [];
  let tie = 0;
  let leadSeq = 0;
  const instant = (date: ISODate): string => {
    const hour = 6 + Math.floor(rng() * 15);
    const minute = Math.floor(rng() * 60);
    return `${date}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00.000Z`;
  };
  const makeDraft = (date: ISODate, evidence: Evidence[]): void => {
    const status = weighted<OrderStatus>(['paid', 'unpaid', 'cancelled', 'refunded'], [0.72, 0.13, 0.07, 0.08]);
    const paid = status === 'paid' || status === 'refunded';
    drafts.push({
      orderedAt: instant(date),
      status,
      paidAt: paid ? instant(addDays(date, Math.floor(rng() * 3))) : null,
      amountMinor: weighted(AMOUNTS_MINOR, AMOUNT_WEIGHTS),
      evidence,
      tie: tie++,
    });
  };

  for (const row of daily) {
    const spec = adSpecs.get(row.adId)!.spec;
    for (let i = 0; i < row.leads; i++) {
      leadSeq += 1;
      if (rng() >= spec.orderRate) continue;
      const date = addDays(row.date, Math.floor(rng() * 10));
      if (date > range.end) continue;
      const evidence: Evidence[] = [];
      if (rng() < spec.hardEvidenceRate) {
        if (row.platform === 'meta') {
          const id = `synthetic-lead-${leadSeq}`;
          evidence.push({ kind: 'verified_lead_match', platform: 'meta', orderLeadId: id, platformLeadId: id, campaignId: row.campaignId });
        } else {
          evidence.push({ kind: 'click_id', platform: 'google', clickIdType: 'gclid', clickId: `synthetic-gclid-${leadSeq}`, campaignId: row.campaignId });
        }
        if (rng() < 0.015) {
          // Rare data-quality case: hard evidence from the OTHER platform too. Stays a conflict.
          evidence.push(
            row.platform === 'meta'
              ? { kind: 'click_id', platform: 'google', clickIdType: 'gclid', clickId: `synthetic-gclid-x${leadSeq}` }
              : { kind: 'click_id', platform: 'meta', clickIdType: 'fbclid', clickId: `synthetic-fbclid-x${leadSeq}` },
          );
        }
      } else if (rng() < 0.5) {
        evidence.push({ kind: 'source_label', label: row.platform === 'meta' ? 'Facebook' : 'Google' });
      }
      makeDraft(date, evidence);
    }
  }

  const organic: { lambda: number; label: string | null }[] = [
    { lambda: 2.0, label: 'Chatbot' },
    { lambda: 1.5, label: 'Partner portal' },
    { lambda: 1.0, label: 'Referral' },
    { lambda: 2.0, label: null },
    { lambda: 0.6, label: 'Google' }, // label only: classified, never paid-Google attributed
    { lambda: 0.8, label: 'Facebook' }, // label only
  ];
  for (const day of days) {
    const month = Number(day.slice(5, 7)) - 1;
    const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
    for (const o of organic) {
      const n = poisson(o.lambda * SEASONALITY[month]! * WEEKDAY[weekday]!);
      for (let i = 0; i < n; i++) makeDraft(day, o.label ? [{ kind: 'source_label', label: o.label }] : []);
    }
  }

  drafts.sort((a, b) => (a.orderedAt < b.orderedAt ? -1 : a.orderedAt > b.orderedAt ? 1 : a.tie - b.tie));
  const orders: SyntheticOrder[] = drafts.map((d, i) => {
    const base: SyntheticOrder = {
      id: `order-${String(i + 1).padStart(6, '0')}`,
      status: d.status,
      orderedAt: d.orderedAt,
      paidAt: d.paidAt,
      amountMinor: d.amountMinor,
      source: 'unknown',
      evidence: d.evidence,
    };
    return { ...base, source: sourceFromAttribution(classifyOrder(base)) };
  });

  return {
    synthetic: true,
    label: SYNTHETIC_LABEL,
    seed,
    company: options.company ?? 'Northwind Legal Online (fictional)',
    currency: 'EUR',
    timeZone: options.timeZone ?? 'Europe/Ljubljana',
    range,
    accounts: { meta: 'meta-demo-account', google: 'google-demo-account' },
    campaigns,
    adGroups,
    ads,
    daily,
    orders,
  };
}

function daysSince(from: ISODate, to: ISODate): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

function maxDate(a: ISODate, b: ISODate): ISODate {
  return a > b ? a : b;
}

/** Month keys covered by the dataset (convenience for examples and tests). */
export function datasetMonths(ds: SyntheticDataset): string[] {
  const keys: string[] = [];
  for (const d of enumerateDays(ds.range)) {
    const k = monthKey(d);
    if (keys[keys.length - 1] !== k) keys.push(k);
  }
  return keys;
}
