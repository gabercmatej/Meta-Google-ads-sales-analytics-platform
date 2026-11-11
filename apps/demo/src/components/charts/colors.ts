// Series colours and labels shared by every chart, table and legend.
// Markers differ in shape so series stay distinguishable in grayscale print.

export type MarkerShape = 'circle' | 'square' | 'triangle' | 'diamond';

export const COLOR = {
  meta: '#0866ff',
  google: '#f59e0b',
  combined: '#4f46e5',
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
  meta: '#0866ff',
  google: '#f59e0b',
  chatbot_ai: '#8b5cf6',
  partner_portal: '#14b8a6',
  other_verified: '#64748b',
  unknown: '#cbd5e1',
  conflicting: '#ef4444',
};

/** Palette for comparing individual ads (up to 4), independent of platform colours. */
export const AD_COLORS = ['#4f46e5', '#0d9488', '#db2777', '#ca8a04'] as const;

export function sourceLabel(key: string): string {
  return SOURCE_LABEL[key] ?? key;
}

export function sourceColor(key: string): string {
  return SOURCE_COLOR[key] ?? '#94a3b8';
}
