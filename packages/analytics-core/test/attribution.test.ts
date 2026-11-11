// Independent reference implementation for the Sedem Ads showcase. Not production source.
import { describe, expect, it } from 'vitest';
import { type AttributableOrder, type Evidence, attributableRoas, classifyOrder, platformNamedByLabel, sourceFromAttribution } from '../src/index.js';

function o(id: string, amountMinor: number, evidence: Evidence[], status: AttributableOrder['status'] = 'paid'): AttributableOrder {
  return { id, status, orderedAt: '2025-03-05T10:00:00Z', amountMinor, source: 'unknown', evidence };
}

const leadMeta: Evidence = { kind: 'verified_lead_match', platform: 'meta', orderLeadId: 'L1', platformLeadId: 'L1', campaignId: 'meta-c1' };
const gclid: Evidence = { kind: 'click_id', platform: 'google', clickIdType: 'gclid', clickId: 'abc', campaignId: 'google-c1' };

describe('classifyOrder', () => {
  it('a verified lead match is hard evidence', () => {
    const r = classifyOrder(o('a', 100, [leadMeta]));
    expect(r.status).toBe('attributed_paid_ad');
    if (r.status === 'attributed_paid_ad') {
      expect(r.platform).toBe('meta');
      expect(r.campaignId).toBe('meta-c1');
    }
  });

  it('a lead id mismatch is rejected as evidence', () => {
    const r = classifyOrder(o('a', 100, [{ ...leadMeta, platformLeadId: 'L2' } as Evidence]));
    expect(r.status).toBe('unknown');
    expect(r.ignoredEvidence).toContain('verified_lead_match:id_mismatch');
  });

  it('an empty lead id never matches an empty lead id', () => {
    const r = classifyOrder(o('a', 100, [{ kind: 'verified_lead_match', platform: 'meta', orderLeadId: '', platformLeadId: '' }]));
    expect(r.status).toBe('unknown');
  });

  it('a click id counts only for its own platform: fbclid cannot prove Google', () => {
    const bad = classifyOrder(o('a', 100, [{ kind: 'click_id', platform: 'google', clickIdType: 'fbclid', clickId: 'x' }]));
    expect(bad.status).toBe('unknown');
    expect(classifyOrder(o('b', 100, [gclid])).status).toBe('attributed_paid_ad');
  });

  it('platform-reported conversions are never order-level proof', () => {
    const r = classifyOrder(o('a', 100, [{ kind: 'platform_reported', platform: 'meta', reportedConversions: 40 }]));
    expect(r.status).toBe('unknown');
    expect(r.ignoredEvidence).toContain('platform_reported');
  });

  it('a source label alone is classification only', () => {
    const r = classifyOrder(o('a', 100, [{ kind: 'source_label', label: 'Google' }]));
    expect(r.status).toBe('source_only');
  });

  it('with no evidence at all the order stays unknown', () => {
    expect(classifyOrder(o('a', 100, [])).status).toBe('unknown');
  });

  it('hard evidence for two platforms is a conflict and is never silently resolved', () => {
    const r = classifyOrder(o('a', 100, [leadMeta, gclid]));
    expect(r.status).toBe('conflict');
    if (r.status === 'conflict') expect(r.platforms).toEqual(['google', 'meta']);
  });

  it('flags a label that disagrees with the hard evidence, but keeps the hard evidence', () => {
    const r = classifyOrder(o('a', 100, [leadMeta, { kind: 'source_label', label: 'google' }]));
    expect(r.status).toBe('attributed_paid_ad');
    if (r.status === 'attributed_paid_ad') {
      expect(r.platform).toBe('meta');
      expect(r.labelDisagrees).toBe(true);
    }
  });

  it('campaign is null when evidence points at several campaigns', () => {
    const r = classifyOrder(o('a', 100, [leadMeta, { ...leadMeta, orderLeadId: 'L9', platformLeadId: 'L9', campaignId: 'meta-c2' } as Evidence]));
    expect(r.status).toBe('attributed_paid_ad');
    if (r.status === 'attributed_paid_ad') expect(r.campaignId).toBeNull();
  });

  it('labels are matched exactly, so a similar name does not name a platform', () => {
    expect(platformNamedByLabel(' Facebook ')).toBe('meta');
    expect(platformNamedByLabel('Google Ads')).toBe('google');
    expect(platformNamedByLabel('googly')).toBeNull();
  });
});

describe('sourceFromAttribution', () => {
  it('maps label-only Google to the google partition without making it paid-attributed', () => {
    const r = classifyOrder(o('a', 100, [{ kind: 'source_label', label: 'Google' }]));
    expect(sourceFromAttribution(r)).toBe('google');
    expect(r.status).not.toBe('attributed_paid_ad');
  });

  it('maps conflicts and unmapped labels honestly', () => {
    expect(sourceFromAttribution(classifyOrder(o('a', 1, [leadMeta, gclid])))).toBe('conflicting');
    expect(sourceFromAttribution(classifyOrder(o('a', 1, [{ kind: 'source_label', label: 'billboard' }])))).toBe('unknown');
    expect(sourceFromAttribution(classifyOrder(o('a', 1, [])))).toBe('unknown');
  });
});

describe('attributable ROAS', () => {
  const orders = [
    o('m1', 30000, [leadMeta]),
    o('g1', 20000, [gclid]),
    o('l1', 9000, [{ kind: 'source_label', label: 'Google' }]),
    o('u1', 700, []),
    o('c1', 5000, [leadMeta, gclid]),
    o('r1', 8000, [leadMeta], 'refunded'),
  ];
  const report = attributableRoas(orders, { meta: 10000, google: 20000 });
  const meta = report.platforms.find((p) => p.platform === 'meta')!;
  const google = report.platforms.find((p) => p.platform === 'google')!;

  it('counts only paid orders with hard evidence in the numerator', () => {
    expect(meta.attributedRevenueMinor).toBe(30000);
    expect(google.attributedRevenueMinor).toBe(20000);
  });

  it('is a ratio of sums', () => {
    expect(meta.roas).toBe(3);
    expect(google.roas).toBe(1);
  });

  it('keeps label-only, unknown and conflicting revenue out of ROAS and reports it separately', () => {
    expect(report.notAttributed.sourceOnly).toEqual({ orders: 1, revenueMinor: 9000 });
    expect(report.notAttributed.unknown).toEqual({ orders: 1, revenueMinor: 700 });
    expect(report.notAttributed.conflict).toEqual({ orders: 1, revenueMinor: 5000 });
  });

  it('refunded orders never count', () => {
    expect(meta.attributedOrders).toBe(1);
  });

  it('ROAS is null (not 0, not Infinity) when spend is missing or zero', () => {
    expect(attributableRoas(orders, { meta: null }).platforms[0]!.roas).toBeNull();
    expect(attributableRoas(orders, { meta: 0, google: 0 }).platforms.every((p) => p.roas === null)).toBe(true);
    expect(attributableRoas(orders, {}).platforms.every((p) => p.spendMinor === null)).toBe(true);
  });

  it('with no attributed revenue but real spend, ROAS is a true 0', () => {
    const r = attributableRoas([o('u', 100, [])], { meta: 1000, google: 1000 });
    expect(r.platforms[0]!.roas).toBe(0);
  });
});
