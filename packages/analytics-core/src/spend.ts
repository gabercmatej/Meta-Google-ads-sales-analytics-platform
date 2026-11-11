// Independent reference implementation for the Sedem Ads showcase. Not production source.
//
// One canonical spend path. Card, chart, monthly table and PDF all read from the same
// per-day structure, so they cannot disagree. Total spend = meta + google ONLY on days where
// both platforms have data; any other day is "no data" for the total, never a silent partial sum.

import { type DateRange, type ISODate, enumerateDays, inRange, monthKey, monthKeysInRange, monthSlice } from './dates.js';

export type Platform = 'meta' | 'google';

/** One platform-day. `spendMinor: null` means the platform returned nothing usable (error, gap). */
export interface PlatformSpendDay {
  date: ISODate;
  spendMinor: number | null;
}

export type DayStatus = 'complete' | 'missing_meta' | 'missing_google' | 'missing_both';

export interface CanonicalSpendDay {
  date: ISODate;
  metaMinor: number | null;
  googleMinor: number | null;
  /** meta + google, or null unless both are present. */
  totalMinor: number | null;
  status: DayStatus;
}

export interface CanonicalSpend {
  range: DateRange;
  days: CanonicalSpendDay[];
  /** Sum over COMPLETE days only, so metaMinor + googleMinor === totalMinor always holds. */
  metaMinor: number | null;
  googleMinor: number | null;
  totalMinor: number | null;
  completeDays: number;
  expectedDays: number;
  missingDates: ISODate[];
  /** True when at least one day is missing: the total covers only completeDays. */
  partial: boolean;
}

function indexPlatform(rows: readonly PlatformSpendDay[], range: DateRange, platform: Platform): Map<ISODate, number | null> {
  const map = new Map<ISODate, number | null>();
  for (const r of rows) {
    if (!inRange(r.date, range)) continue;
    if (map.has(r.date)) throw new Error(`Duplicate ${platform} spend row for ${r.date}`);
    if (r.spendMinor !== null && (!Number.isSafeInteger(r.spendMinor) || r.spendMinor < 0)) {
      throw new RangeError(`${platform} spend on ${r.date} must be a non-negative integer of minor units or null`);
    }
    map.set(r.date, r.spendMinor);
  }
  return map;
}

export function buildCanonicalSpend(input: {
  range: DateRange;
  meta: readonly PlatformSpendDay[];
  google: readonly PlatformSpendDay[];
}): CanonicalSpend {
  const { range } = input;
  const metaIdx = indexPlatform(input.meta, range, 'meta');
  const googleIdx = indexPlatform(input.google, range, 'google');
  const days: CanonicalSpendDay[] = [];
  const missingDates: ISODate[] = [];
  let meta = 0;
  let google = 0;
  let complete = 0;
  for (const date of enumerateDays(range)) {
    const m = metaIdx.get(date) ?? null;
    const g = googleIdx.get(date) ?? null;
    let status: DayStatus = 'complete';
    if (m === null && g === null) status = 'missing_both';
    else if (m === null) status = 'missing_meta';
    else if (g === null) status = 'missing_google';
    const total = m !== null && g !== null ? m + g : null;
    if (total !== null) {
      meta += m as number;
      google += g as number;
      complete += 1;
    } else {
      missingDates.push(date);
    }
    days.push({ date, metaMinor: m, googleMinor: g, totalMinor: total, status });
  }
  return {
    range,
    days,
    metaMinor: complete === 0 ? null : meta,
    googleMinor: complete === 0 ? null : google,
    totalMinor: complete === 0 ? null : meta + google,
    completeDays: complete,
    expectedDays: days.length,
    missingDates,
    partial: complete !== days.length,
  };
}

/** Single-platform spend with its own coverage (not tied to the other platform's gaps). */
export function platformSpend(
  rows: readonly PlatformSpendDay[],
  range: DateRange,
  platform: Platform,
): { totalMinor: number | null; presentDays: number; expectedDays: number; partial: boolean } {
  const idx = indexPlatform(rows, range, platform);
  let sum = 0;
  let present = 0;
  const days = enumerateDays(range);
  for (const d of days) {
    const v = idx.get(d) ?? null;
    if (v !== null) {
      sum += v;
      present += 1;
    }
  }
  return {
    totalMinor: present === 0 ? null : sum,
    presentDays: present,
    expectedDays: days.length,
    partial: present !== days.length,
  };
}

export interface ChartPoint {
  date: ISODate;
  valueMinor: number | null;
}

/** Daily chart series: null gaps for days without a complete total. */
export function spendChartSeries(spend: CanonicalSpend): ChartPoint[] {
  return spend.days.map((d) => ({ date: d.date, valueMinor: d.totalMinor }));
}

export interface MonthlySpendRow {
  month: string;
  metaMinor: number | null;
  googleMinor: number | null;
  totalMinor: number | null;
  completeDays: number;
  expectedDays: number;
  partial: boolean;
}

export function monthlySpendTable(spend: CanonicalSpend): MonthlySpendRow[] {
  const rows: MonthlySpendRow[] = [];
  for (const month of monthKeysInRange(spend.range)) {
    const slice = monthSlice(month, spend.range);
    if (!slice) continue;
    const days = spend.days.filter((d) => monthKey(d.date) === month);
    const complete = days.filter((d) => d.totalMinor !== null);
    const meta = complete.reduce((a, d) => a + (d.metaMinor as number), 0);
    const google = complete.reduce((a, d) => a + (d.googleMinor as number), 0);
    rows.push({
      month,
      metaMinor: complete.length === 0 ? null : meta,
      googleMinor: complete.length === 0 ? null : google,
      totalMinor: complete.length === 0 ? null : meta + google,
      completeDays: complete.length,
      expectedDays: days.length,
      partial: complete.length !== days.length,
    });
  }
  return rows;
}

export interface SpendReconciliation {
  status: 'PASS' | 'FAIL';
  cardMinor: number | null;
  chartMinor: number | null;
  monthlyMinor: number | null;
  pdfMinor?: number | null;
  /** Signed differences in cents against the card (null when either side is null). */
  diffs: { chart: number | null; monthly: number | null; pdf?: number | null };
  /** Names of the surfaces that do not match the card. */
  mismatches: string[];
}

function sumNullable(values: readonly (number | null)[]): number | null {
  let any = false;
  let s = 0;
  for (const v of values) {
    if (v !== null) {
      any = true;
      s += v;
    }
  }
  return any ? s : null;
}

/**
 * The "card = chart = monthly = PDF" rule. Compares the headline number against the sum of the
 * chart points, the sum of the monthly rows and (optionally) the PDF figure, to the cent.
 */
export function reconcileSpend(input: {
  cardMinor: number | null;
  chartSeries: readonly ChartPoint[];
  monthlyTable: readonly Pick<MonthlySpendRow, 'totalMinor'>[];
  pdfMinor?: number | null;
}): SpendReconciliation {
  const chart = sumNullable(input.chartSeries.map((p) => p.valueMinor));
  const monthly = sumNullable(input.monthlyTable.map((r) => r.totalMinor));
  const card = input.cardMinor;
  const diff = (other: number | null): number | null => (card === null || other === null ? null : other - card);
  const matches = (other: number | null): boolean => (card === null || other === null ? card === other : other === card);
  const mismatches: string[] = [];
  if (!matches(chart)) mismatches.push('chart');
  if (!matches(monthly)) mismatches.push('monthly');
  const result: SpendReconciliation = {
    status: 'PASS',
    cardMinor: card,
    chartMinor: chart,
    monthlyMinor: monthly,
    diffs: { chart: diff(chart), monthly: diff(monthly) },
    mismatches,
  };
  if ('pdfMinor' in input) {
    const pdf = input.pdfMinor ?? null;
    result.pdfMinor = pdf;
    result.diffs.pdf = diff(pdf);
    if (!matches(pdf)) mismatches.push('pdf');
  }
  result.status = mismatches.length === 0 ? 'PASS' : 'FAIL';
  return result;
}

/** Alias for `reconcileSpend`. */
export const reconcile = reconcileSpend;
