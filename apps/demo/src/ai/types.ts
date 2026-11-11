import type { DateRange, PlatformView, ShowcaseDataset } from '@sedem-ads/analytics-core';
import type { FactBook, FactRecord, GroundingResult } from './factbook';
import type { ResolvedPeriod } from './periods';

export type IntentId =
  | 'help'
  | 'spend_summary'
  | 'platform_compare'
  | 'best_campaign_cpl'
  | 'worst_campaign'
  | 'cpl_rise'
  | 'creative_fatigue'
  | 'top_ads_ctr'
  | 'budget_realloc'
  | 'lead_trend'
  | 'sales_by_source'
  | 'attributable_roas'
  | 'surplus'
  | 'refunds'
  | 'unknown_source'
  | 'google_label'
  | 'data_quality'
  | 'month_over_month'
  | 'forecast'
  | 'campaign_specific'
  | 'compare_ads'
  | 'how_attribution'
  | 'unsupported';

export interface ToolCall {
  tool: string;
  args: string;
  result: string;
}

export interface KeyRow {
  label: string;
  value: string;
}

export interface Rec {
  text: string;
  /** In-app route (campaign, compare, attribution...). */
  to?: string;
  /** Follow-up question for the assistant. */
  ask?: string;
}

export interface Body {
  summary: string;
  rows: KeyRow[];
  evidence: string[];
  recs: Rec[];
  limits: string[];
}

export interface Ctx {
  ds: ShowcaseDataset;
  view: PlatformView;
  period: ResolvedPeriod;
  /** Lower-cased, trimmed question. */
  q: string;
  raw: string;
  book: FactBook;
  tools: import('./tools').Tracer;
}

export interface AssistantContext {
  /** Platform selected in the global filter. */
  platform: PlatformView;
  /** Period selected in the global filter (resolved range or null) and its label. */
  range: DateRange | null;
  periodLabel: string;
}

export interface AssistantTrace {
  intent: IntentId;
  matchedBy: string;
  period: { label: string; range: string; explicit: boolean };
  platform: PlatformView;
  tools: ToolCall[];
  facts: FactRecord[];
  grounding: GroundingResult;
}

export interface AssistantAnswer {
  question: string;
  intent: IntentId;
  intentLabel: string;
  unsupported: boolean;
  sections: Body;
  alternatives: string[];
  trace: AssistantTrace;
  /** Plain-text rendering used for copy and for the grounding check. */
  text: string;
}
