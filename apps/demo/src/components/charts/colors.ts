// Series colours and labels shared by every chart, table and legend.
// One token per metric/platform so a metric keeps its colour on every page (card, sparkline, dialog, PDF).
// Markers differ in shape so series stay distinguishable in grayscale print.

export type MarkerShape = 'circle' | 'square' | 'triangle' | 'diamond';

/** Platform and role colours. */
export const COLOR = {
  meta: '#0866ff',
  google: '#ea8600',
  combined: '#0f172a',
  subtotal: '#5b21b6',
  chatbot: '#be185d',
  neutral: '#64748b',
  previous: '#94a3b8',
  good: '#15803d',
  bad: '#dc2626',
} as const;

/** Metric colours (KPI accents, sparklines and single-metric charts). */
export const METRIC_COLOR = {
  spend: '#0b5fa5',
  leads: '#0e9fb5',
  cpl: '#063258',
  paidOrders: '#2f9e5b',
  linkedValue: '#15703d',
  roas: '#ea580c',
  costPerCustomer: '#374151',
  aov: '#d1458b',
  orders: '#166534',
  revenue: '#15803d',
  surplus: '#5b21b6',
  operatorSales: '#c96f10',
  excelLeads: '#8e5ad8',
} as const;

/** Google workspace metric colours. */
export const GOOGLE_METRIC_COLOR = {
  spend: '#1e3a8a',
  clicks: '#0f766e',
  impressions: '#64748b',
  cpc: '#7c3aed',
  ctr: '#0891b2',
  conversions: '#16a34a',
  costPerConversion: '#d97706',
  paidSales: '#166534',
  roas: '#ea580c',
  costPerCustomer: '#374151',
} as const;

/** Lead platform split. */
export const LEAD_PLATFORM_COLOR = { facebook: '#6b7a90', instagram: '#d98c2b' } as const;

/** Google daily spend bars: highest / lowest day and the average line. */
export const SPEND_BAR = { max: '#0b1d5c', min: '#7ea0e6', avg: '#9a3412' } as const;

/** Campaigns, ad sets and ads compared side by side. */
export const CAMPAIGN_COLORS = ['#2563eb', '#c026d3', '#0e7490', '#b45309', '#9333ea', '#be123c', '#4d7c0f', '#475569', '#0369a1', '#a16207', '#6d28d9', '#15803d'] as const;

export const campaignColor = (i: number): string => CAMPAIGN_COLORS[((i % CAMPAIGN_COLORS.length) + CAMPAIGN_COLORS.length) % CAMPAIGN_COLORS.length]!;

export const SHAPES: readonly MarkerShape[] = ['circle', 'square', 'triangle', 'diamond'];

export const SOURCE_KEYS = ['meta', 'google', 'chatbot_ai', 'partner_portal', 'other_verified', 'unknown', 'conflicting'] as const;

export const SOURCE_LABEL: Record<string, string> = {
  meta: 'Meta',
  google: 'Google',
  chatbot_ai: 'Chatbot / AI',
  partner_portal: 'Partner portal',
  other_verified: 'Other (verified)',
  unknown: 'Unknown',
  conflicting: 'Conflicting evidence',
};

export const SOURCE_COLOR: Record<string, string> = {
  meta: COLOR.meta,
  google: COLOR.google,
  chatbot_ai: COLOR.chatbot,
  partner_portal: '#0f766e',
  other_verified: '#65a30d',
  unknown: '#94a3b8',
  conflicting: '#a78bfa',
};

/** Palette for comparing individual ads (up to 4), independent of platform colours. */
export const AD_COLORS = [CAMPAIGN_COLORS[0], CAMPAIGN_COLORS[1], CAMPAIGN_COLORS[2], CAMPAIGN_COLORS[3]] as const;

export function sourceLabel(key: string): string {
  return SOURCE_LABEL[key] ?? key;
}

export function sourceColor(key: string): string {
  return SOURCE_COLOR[key] ?? '#94a3b8';
}

/** Colour of a metric on a platform's page; metrics without a Meta token (clicks, CTR, …) share the Google one. */
export function metricColor(platform: 'meta' | 'google' | 'combined', metric: string): string {
  const g = (GOOGLE_METRIC_COLOR as Record<string, string>)[metric];
  const m = (METRIC_COLOR as Record<string, string>)[metric];
  return (platform === 'google' ? (g ?? m) : (m ?? g)) ?? COLOR[platform];
}
