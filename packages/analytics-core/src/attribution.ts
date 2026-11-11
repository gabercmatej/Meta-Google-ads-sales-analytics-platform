// Independent reference implementation for the Sedem Ads showcase. Not production source.
//
// Evidence-based attribution. An order is attributed to a paid ad only when there is HARD,
// verifiable evidence (a verified lead-id match or a stored click id). A self-reported source
// label ("Google") is a classification, not proof. There is no fuzzy matching of any kind:
// similar dates, amounts or customer names never create an attribution.

import { safeRatio } from './metrics.js';
import type { Order } from './sources.js';

export type AdPlatform = 'meta' | 'google';

export type Evidence =
  /** Order-side lead id equals the platform-side lead id. A mismatch is rejected as evidence. */
  | { kind: 'verified_lead_match'; platform: AdPlatform; orderLeadId: string; platformLeadId: string; campaignId?: string }
  /** A click id stored on the order. gclid is valid only for google, fbclid only for meta. */
  | { kind: 'click_id'; platform: AdPlatform; clickIdType: 'gclid' | 'fbclid'; clickId: string; campaignId?: string }
  /** Conversion count reported by the platform. Aggregate, never order-level proof. */
  | { kind: 'platform_reported'; platform: AdPlatform; reportedConversions: number }
  /** What the customer or operator said. Classification only. */
  | { kind: 'source_label'; label: string };

export type AttributableOrder = Order & { evidence: readonly Evidence[] };

interface ResultBase {
  orderId: string;
  amountMinor: number;
  /** Evidence kinds that were seen but cannot prove attribution (platform_reported, invalid ids). */
  ignoredEvidence: string[];
}

export type AttributionResult =
  | (ResultBase & {
      status: 'attributed_paid_ad';
      platform: AdPlatform;
      /** null when the evidence names the platform but no single campaign. */
      campaignId: string | null;
      evidence: Evidence[];
      /** A source label named a different platform than the hard evidence. Flagged, not resolved. */
      labelDisagrees: boolean;
    })
  | (ResultBase & { status: 'source_only'; label: string })
  | (ResultBase & { status: 'unknown' })
  | (ResultBase & { status: 'conflict'; platforms: AdPlatform[] });

function isHard(e: Evidence): e is Extract<Evidence, { kind: 'verified_lead_match' | 'click_id' }> {
  return e.kind === 'verified_lead_match' || e.kind === 'click_id';
}

/** Label -> platform it names, if any. Used only to flag disagreement and for classification. */
export function platformNamedByLabel(label: string): AdPlatform | null {
  const l = label.trim().toLowerCase();
  if (/^(google|adwords|google ads)$/.test(l)) return 'google';
  if (/^(meta|facebook|fb|instagram|ig)$/.test(l)) return 'meta';
  return null;
}

export function classifyOrder(order: AttributableOrder): AttributionResult {
  const base: ResultBase = { orderId: order.id, amountMinor: order.amountMinor, ignoredEvidence: [] };
  const hard: Extract<Evidence, { kind: 'verified_lead_match' | 'click_id' }>[] = [];
  let label: string | null = null;

  for (const e of order.evidence) {
    if (e.kind === 'platform_reported') {
      base.ignoredEvidence.push('platform_reported');
    } else if (e.kind === 'source_label') {
      label ??= e.label;
    } else if (e.kind === 'verified_lead_match') {
      if (e.orderLeadId !== '' && e.orderLeadId === e.platformLeadId) hard.push(e);
      else base.ignoredEvidence.push('verified_lead_match:id_mismatch');
    } else {
      const expected = e.platform === 'google' ? 'gclid' : 'fbclid';
      if (e.clickId !== '' && e.clickIdType === expected) hard.push(e);
      else base.ignoredEvidence.push('click_id:platform_mismatch');
    }
  }

  const platforms = [...new Set(hard.map((e) => e.platform))].sort() as AdPlatform[];
  if (platforms.length >= 2) return { ...base, status: 'conflict', platforms };
  if (platforms.length === 1) {
    const platform = platforms[0]!;
    const campaigns = new Set(hard.map((e) => e.campaignId).filter((c): c is string => !!c));
    const labelPlatform = label === null ? null : platformNamedByLabel(label);
    return {
      ...base,
      status: 'attributed_paid_ad',
      platform,
      campaignId: campaigns.size === 1 ? [...campaigns][0]! : null,
      evidence: hard,
      labelDisagrees: labelPlatform !== null && labelPlatform !== platform,
    };
  }
  if (label !== null) return { ...base, status: 'source_only', label };
  return { ...base, status: 'unknown' };
}

export const DEFAULT_LABEL_MAP: Readonly<Record<string, string>> = {
  google: 'google',
  adwords: 'google',
  meta: 'meta',
  facebook: 'meta',
  fb: 'meta',
  instagram: 'meta',
  ig: 'meta',
  chatbot: 'chatbot_ai',
  'ai assistant': 'chatbot_ai',
  partner: 'partner_portal',
  'partner portal': 'partner_portal',
  referral: 'other_verified',
  direct: 'other_verified',
};

/**
 * Map an attribution result to a sales-source partition key. This is classification: a
 * label-only "Google" order is partitioned under `google` but is NOT paid-Google attributed and
 * therefore does not enter attributable ROAS.
 */
export function sourceFromAttribution(
  result: AttributionResult,
  labelMap: Readonly<Record<string, string>> = DEFAULT_LABEL_MAP,
): string {
  switch (result.status) {
    case 'attributed_paid_ad':
      return result.platform;
    case 'conflict':
      return 'conflicting';
    case 'source_only':
      return labelMap[result.label.trim().toLowerCase()] ?? 'unknown';
    case 'unknown':
      return 'unknown';
  }
}

export interface PlatformRoas {
  platform: AdPlatform;
  attributedOrders: number;
  attributedRevenueMinor: number;
  spendMinor: number | null;
  /** attributed revenue / spend. Null when spend is missing or 0. */
  roas: number | null;
}

export interface AttributableRoasReport {
  platforms: PlatformRoas[];
  /** Paid revenue that is deliberately NOT in any ROAS numerator. */
  notAttributed: {
    sourceOnly: { orders: number; revenueMinor: number };
    unknown: { orders: number; revenueMinor: number };
    conflict: { orders: number; revenueMinor: number };
  };
}

/**
 * Attributable ROAS per platform = revenue of paid orders with hard evidence for that platform
 * divided by that platform's spend. It is a ratio of sums. Only paid orders count. Conflicts,
 * label-only orders and unknowns are reported separately and never guessed into a platform.
 */
export function attributableRoas(
  orders: readonly AttributableOrder[],
  spendMinor: Partial<Record<AdPlatform, number | null>>,
): AttributableRoasReport {
  const acc: Record<AdPlatform, { orders: number; revenue: number }> = {
    meta: { orders: 0, revenue: 0 },
    google: { orders: 0, revenue: 0 },
  };
  const rest = {
    sourceOnly: { orders: 0, revenueMinor: 0 },
    unknown: { orders: 0, revenueMinor: 0 },
    conflict: { orders: 0, revenueMinor: 0 },
  };
  for (const o of orders) {
    if (o.status !== 'paid') continue;
    const r = classifyOrder(o);
    if (r.status === 'attributed_paid_ad') {
      acc[r.platform].orders += 1;
      acc[r.platform].revenue += r.amountMinor;
    } else {
      const bucket = r.status === 'source_only' ? rest.sourceOnly : r.status === 'unknown' ? rest.unknown : rest.conflict;
      bucket.orders += 1;
      bucket.revenueMinor += r.amountMinor;
    }
  }
  const platforms = (['meta', 'google'] as const).map((platform): PlatformRoas => {
    const spend = spendMinor[platform] ?? null;
    return {
      platform,
      attributedOrders: acc[platform].orders,
      attributedRevenueMinor: acc[platform].revenue,
      spendMinor: spend,
      roas: safeRatio(acc[platform].revenue, spend),
    };
  });
  return { platforms, notAttributed: rest };
}
