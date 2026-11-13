// Independent reference implementation for the Sedem Ads showcase. Not production source.
//
// Data contract for the interactive showcase demo. A ShowcaseDataset is a SUPERSET of
// SyntheticDataset, so every existing assistant tool runs on it unchanged. Everything here is
// generated from a seed for a FICTIONAL company; no record describes a real person or business.

import type { AttributionResult } from '../attribution.js';
import type { AuditCheck } from '../audit.js';
import type { DateRange, ISODate } from '../dates.js';
import type { SourcePartition } from '../sources.js';
import type { DayStatus, Platform } from '../spend.js';
import type {
  AdDailyRow,
  SyntheticAd,
  SyntheticAdGroup,
  SyntheticCampaign,
  SyntheticDataset,
  SyntheticOrder,
} from '../synthetic/generate.js';

/** Fixed demo clock: 2026-11-11 11:00 in Europe/Ljubljana. Today is a partial (incomplete) day. */
export const SHOWCASE_REFERENCE_NOW = '2026-11-11T10:00:00.000Z';
export const SHOWCASE_REFERENCE_DATE: ISODate = '2026-11-11';
/** First day of generated history (24+ months before the reference date, so "Last 365 days" and "This year" have full comparison periods). */
export const SHOWCASE_HISTORY_START: ISODate = '2024-11-01';
export const SHOWCASE_SEED = 20261111;

export type PlatformView = 'combined' | Platform;
/** Chart buckets: calendar days, ISO weeks (Monday to Sunday) or calendar months. */
export type Granularity = 'daily' | 'weekly' | 'monthly';
export type ShowcaseEntityStatus = 'ACTIVE' | 'PAUSED';
export type EntityLevel = 'campaign' | 'ad_group' | 'ad';
export type GoogleChannel = 'SEARCH' | 'DISPLAY' | 'PERFORMANCE_MAX';
export type MetaObjective = 'LEADS' | 'TRAFFIC' | 'SALES' | 'AWARENESS';
export type PerformanceTier = 'strong' | 'average' | 'weak';

export interface ShowcaseCampaign extends SyntheticCampaign {
  status: ShowcaseEntityStatus;
  /** Meta only (null for Google). */
  objective: MetaObjective | null;
  /** Google only (null for Meta). */
  channelType: GoogleChannel | null;
  /** Campaign-level daily budget, or null when the budget lives on the ad set / ad group. */
  dailyBudgetMinor: number | null;
  budgetLevel: 'campaign' | 'ad_group';
  startDate: ISODate;
  tier: PerformanceTier;
}

/** Meta ad set or Google ad group (PMax: asset group). */
export interface ShowcaseAdGroup extends SyntheticAdGroup {
  status: ShowcaseEntityStatus;
  dailyBudgetMinor: number | null;
  /** Short fictional targeting description, e.g. "Adults 30-55, Slovenia, interests: small business". */
  targeting: string;
}

export type CreativeFormat =
  | 'single_image'
  | 'carousel'
  | 'video'
  | 'responsive_search'
  | 'responsive_display'
  | 'pmax_asset_group';

export type CreativeTheme =
  | 'consultation'
  | 'documents'
  | 'family'
  | 'business'
  | 'chat'
  | 'brand'
  | 'deadline'
  | 'property';

/**
 * Parameters for an ORIGINAL vector illustration drawn by the demo (no stock or third-party
 * images). Colours are hex strings.
 */
export interface CreativeVisual {
  theme: CreativeTheme;
  background: string;
  accent: string;
  /** Large text on the image. */
  title: string;
  subtitle: string;
}

export interface ShowcaseCreative {
  id: string;
  platform: Platform;
  format: CreativeFormat;
  headline: string;
  /** Google responsive formats: all headline variants (headline is the first). */
  headlines: string[];
  primaryText: string;
  descriptions: string[];
  callToAction: string;
  /** Always under example.com. */
  finalUrl: string;
  /** null for text-only Search ads. */
  visual: CreativeVisual | null;
}

export interface ShowcaseAd extends SyntheticAd {
  status: ShowcaseEntityStatus;
  creativeId: string;
}

export type DataSourceId = 'meta' | 'google' | 'crm' | 'payments' | 'leads';
export type SourceDayStatus = 'ok' | 'missing' | 'source_error' | 'partial';

/** Explicit per-source day status. Days not listed are 'ok'. */
export interface SourceDay {
  source: DataSourceId;
  date: ISODate;
  status: Exclude<SourceDayStatus, 'ok'>;
  note: string;
}

export type LeadChannel = 'meta_lead_form' | 'google_lead_form' | 'website_form' | 'chatbot_ai' | 'partner_portal' | 'phone';
export type LeadStatus = 'new' | 'contacted' | 'qualified' | 'converted' | 'lost';

export interface ShowcaseLead {
  id: string;
  /** UTC instant. */
  createdAt: string;
  /** Paid platform that produced the lead, or null for non-ad channels. */
  platform: Platform | null;
  campaignId: string | null;
  adGroupId: string | null;
  adId: string | null;
  channel: LeadChannel;
  status: LeadStatus;
  customerId: string | null;
  /** Platform-side lead id (paid lead forms only), used for verified matching. */
  platformLeadId: string | null;
}

/** Customer-source classification keys (match DEFAULT_SOURCES in sources.ts). */
export type CustomerSourceKey = 'meta' | 'google' | 'chatbot_ai' | 'partner_portal' | 'other_verified' | 'unknown';

export interface ShowcaseCustomer {
  id: string;
  /** Fictional, e.g. "Customer #0042". Never a realistic personal name. */
  displayName: string;
  firstSeenAt: string;
  /** Raw label as recorded in the fictional CRM ("Facebook", "Google", "Chatbot", "", ...). */
  sourceLabel: string;
  /** Classification of the label. NOT proof of paid-ad attribution. */
  source: CustomerSourceKey;
}

export interface ShowcaseOrder extends SyntheticOrder {
  customerId: string;
  /** Fictional service name, e.g. "Contract review". */
  product: string;
  leadId: string | null;
  refundedAt: string | null;
  cancelledAt: string | null;
}

export interface ShowcaseDataset extends SyntheticDataset {
  kind: 'showcase';
  referenceNow: string;
  referenceDate: ISODate;
  vatRatePercent: number;
  campaigns: ShowcaseCampaign[];
  adGroups: ShowcaseAdGroup[];
  ads: ShowcaseAd[];
  creatives: ShowcaseCreative[];
  /** Same row shape as SyntheticDataset.daily. Rows are ABSENT for missing/source_error platform-days. */
  daily: AdDailyRow[];
  sourceDays: SourceDay[];
  leads: ShowcaseLead[];
  customers: ShowcaseCustomer[];
  orders: ShowcaseOrder[];
  /** Entity ids and dates of the deliberately planted demo cases (documented in generate.ts). */
  planted?: ShowcasePlanted;
}

export interface ShowcasePlanted {
  underperformingCampaignId: string;
  fatiguedAdId: string;
  /** Null unless generated with `plantedGaps: true`. */
  googleMissingDate: ISODate | null;
  /** Null unless generated with `plantedGaps: true`. */
  metaSourceErrorDate: ISODate | null;
  partialDate: ISODate;
  labelOnlyGoogleOrderId: string;
  conflictOrderId: string;
  crossMonthPaidLaterOrderId: string;
  refundedOrderId: string;
  cancelledOrderId: string;
  unpaidOrderId: string;
  paidLaterOrderId: string;
}

// ---------------------------------------------------------------------------------------------
// query results

/** Money values are integer EUR cents. Ratios (ctr) are fractions. null = no data, never 0. */
export interface PerformanceTotals {
  spendMinor: number | null;
  impressions: number | null;
  clicks: number | null;
  leads: number | null;
  platformConversions: number | null;
  ctr: number | null;
  cpcMinor: number | null;
  cplMinor: number | null;
  cpmMinor: number | null;
  /** Days that have data for the view (combined: both platforms). */
  completeDays: number;
  expectedDays: number;
  missingDates: ISODate[];
  partial: boolean;
}

export type SeriesMetric = 'spend' | 'impressions' | 'clicks' | 'leads' | 'ctr' | 'cpc' | 'cpl' | 'cpm';

export interface PlatformSeriesPoint {
  /** ISO date (daily), ISO week 'YYYY-Www' (weekly, Monday to Sunday) or 'YYYY-MM' (monthly, calendar months). */
  key: string;
  /** Short display label, e.g. "3 Nov", "3–9 Nov" or "Nov 2026". */
  label: string;
  meta: number | null;
  google: number | null;
  /** Combined value: null unless both platforms have data for the point. Ratios from sums. */
  total: number | null;
  /** Weekly/monthly: some days missing, or the bucket is not finished; weekly also when the range cuts the week. */
  incomplete: boolean;
  /** Daily only. */
  dayStatus?: DayStatus;
}

export interface EntityMetrics {
  spendMinor: number | null;
  impressions: number | null;
  clicks: number | null;
  leads: number | null;
  ctr: number | null;
  cpcMinor: number | null;
  cplMinor: number | null;
  cpmMinor: number | null;
  /** Paid orders with hard evidence for this entity (campaign-level evidence for ad groups/ads). */
  verifiedOrders: number;
  verifiedRevenueMinor: number;
  roas: number | null;
}

export interface EntityPerformanceRow {
  id: string;
  level: EntityLevel;
  platform: Platform;
  name: string;
  status: ShowcaseEntityStatus;
  campaignId: string;
  adGroupId: string | null;
  channelType: GoogleChannel | null;
  objective: MetaObjective | null;
  dailyBudgetMinor: number | null;
  tier: PerformanceTier | null;
  fatigued: boolean;
  creativeId: string | null;
  current: EntityMetrics;
  previous: EntityMetrics;
  /** Relative change current vs previous ((cur - prev) / prev); null when not computable. */
  change: { spend: number | null; ctr: number | null; cpc: number | null; cpl: number | null; leads: number | null };
}

export interface AdSeriesPoint {
  key: string;
  label: string;
  incomplete: boolean;
  /** adId -> value (null = no data). */
  values: Record<string, number | null>;
}

export interface SalesStatusCounts {
  paid: { orders: number; revenueMinor: number };
  unpaid: { orders: number; revenueMinor: number };
  cancelled: { orders: number; revenueMinor: number };
  refunded: { orders: number; revenueMinor: number };
}

export interface SalesOverview {
  range: DateRange;
  basis: 'order' | 'payment';
  /** All paid sales, partitioned by customer source (parts reconcile to eligible totals). */
  partition: SourcePartition;
  statusCounts: SalesStatusCounts;
  averageOrderMinor: number | null;
  vatRatePercent: number;
}

export interface SalesSeriesPoint {
  key: string;
  label: string;
  incomplete: boolean;
  /** source key -> paid revenue in minor units. */
  bySource: Record<string, number>;
  /** source key -> paid order count. */
  ordersBySource: Record<string, number>;
  totalMinor: number;
  orders: number;
}

export interface AttributionOverview {
  range: DateRange;
  /** All paid sales in the period (same as SalesOverview partition eligible total). */
  paidOrders: number;
  paidRevenueMinor: number;
  /** Source-classified (customer source) subtotal for meta+google+chatbot_ai. */
  selectedSourceRevenueMinor: number;
  /** Verified ad-attributed revenue (hard evidence only). */
  verified: Record<Platform, { orders: number; revenueMinor: number }>;
  sourceOnly: { orders: number; revenueMinor: number };
  unknown: { orders: number; revenueMinor: number };
  conflict: { orders: number; revenueMinor: number };
  spend: { metaMinor: number | null; googleMinor: number | null; totalMinor: number | null; partial: boolean };
  roas: { meta: number | null; google: number | null; combined: number | null };
  /** selectedSourceRevenue - total spend. Not profit (revenue incl. VAT, spend excl. VAT). */
  surplusMinor: number | null;
  /** Orders labelled with a paid platform by the customer but WITHOUT hard evidence. */
  labelWithoutEvidence: Record<Platform, { orders: number; revenueMinor: number }>;
}

export interface OrderAttributionRow {
  order: ShowcaseOrder;
  customer: ShowcaseCustomer;
  attribution: AttributionResult;
}

export interface LeadsOverview {
  range: DateRange;
  total: number;
  byChannel: Record<LeadChannel, number>;
  byStatus: Record<LeadStatus, number>;
  byPlatform: { meta: number; google: number; none: number };
  converted: number;
  conversionRate: number | null;
}

export interface LeadsSeriesPoint {
  key: string;
  label: string;
  incomplete: boolean;
  byChannel: Record<LeadChannel, number>;
  total: number;
}

export interface DataSourceStatus {
  id: DataSourceId;
  name: string;
  description: string;
  /** Always 'simulated' in the public demo. */
  mode: 'simulated';
  lastSyncAt: string;
  coverage: DateRange;
  issues: SourceDay[];
  recordCount: number;
}

export interface ShowcaseReport {
  checks: AuditCheck[];
}
