// Series colours and labels shared by every chart, table and legend.
// Markers differ in shape so series stay distinguishable in grayscale print.

export type MarkerShape = 'circle' | 'square' | 'triangle' | 'diamond';

export const COLOR = {
  meta: '#2563eb',
  google: '#ea8a1a',
  combined: '#1f2937',
  subtotal: '#6d28d9',
  chatbot: '#db2777',
  neutral: '#64748b',
  good: '#059669',
  bad: '#dc2626',
} as const;

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
  meta: '#2563eb',
  google: '#ea8a1a',
  chatbot_ai: '#db2777',
  partner_portal: '#14b8a6',
  other_verified: '#64748b',
  unknown: '#cbd5e1',
  conflicting: '#ef4444',
};

/** Palette for comparing individual ads (up to 4), independent of platform colours. */
export const AD_COLORS = ['#2563eb', '#ea8a1a', '#059669', '#7c3aed'] as const;

export function sourceLabel(key: string): string {
  return SOURCE_LABEL[key] ?? key;
}

export function sourceColor(key: string): string {
  return SOURCE_COLOR[key] ?? '#94a3b8';
}
