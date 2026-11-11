// Independent reference implementation for the Sedem Ads showcase. Not production source.
//
// Daily rows -> monthly buckets with coverage tracking. A day with no row, or a metric that is
// null on a day, is MISSING (not zero). Months with missing days are "partial"; ratio metrics
// of partial months are null unless the caller opts in.

import {
  type DateRange,
  type ISODate,
  addDays,
  assertRange,
  enumerateDays,
  inRange,
  monthKey,
  monthKeysInRange,
  monthSlice,
  rangeLength,
} from './dates.js';
import { safeRatio } from './metrics.js';

export type DailyRow = { date: ISODate } & { [metric: string]: number | string | null | undefined };

export interface MetricCoverage {
  expected: number;
  present: number;
}

export interface MonthBucket {
  /** 'YYYY-MM'. */
  month: string;
  /** The slice of the month inside the requested range. */
  range: DateRange;
  expectedDays: number;
  /** Days that have a row at all. */
  presentDays: number;
  missingDates: ISODate[];
  /** True when every tracked metric has a value on every expected day. */
  complete: boolean;
  /** Sum of the values that are present; null when the metric has no value on any day. */
  totals: Record<string, number | null>;
  coverage: Record<string, MetricCoverage>;
}

function finiteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** Index rows by date inside the range. Duplicate dates throw: they would double count. */
function indexRows(rows: readonly DailyRow[], range: DateRange): Map<ISODate, DailyRow> {
  assertRange(range);
  const map = new Map<ISODate, DailyRow>();
  for (const row of rows) {
    if (!inRange(row.date, range)) continue;
    if (map.has(row.date)) throw new Error(`Duplicate daily row for ${row.date}`);
    map.set(row.date, row);
  }
  return map;
}

export function aggregateMonthly(
  rows: readonly DailyRow[],
  range: DateRange,
  metrics: readonly string[],
): MonthBucket[] {
  const byDate = indexRows(rows, range);
  const buckets: MonthBucket[] = [];
  for (const month of monthKeysInRange(range)) {
    const slice = monthSlice(month, range);
    if (!slice) continue;
    const days = enumerateDays(slice);
    const missingDates: ISODate[] = [];
    let presentDays = 0;
    const totals: Record<string, number | null> = {};
    const coverage: Record<string, MetricCoverage> = {};
    for (const m of metrics) {
      totals[m] = null;
      coverage[m] = { expected: days.length, present: 0 };
    }
    for (const day of days) {
      const row = byDate.get(day);
      if (!row) {
        missingDates.push(day);
        continue;
      }
      presentDays += 1;
      for (const m of metrics) {
        const v = row[m];
        if (finiteNumber(v)) {
          totals[m] = (totals[m] ?? 0) + v;
          coverage[m]!.present += 1;
        }
      }
    }
    const complete = metrics.every((m) => coverage[m]!.present === coverage[m]!.expected);
    buckets.push({
      month,
      range: slice,
      expectedDays: days.length,
      presentDays,
      missingDates,
      complete,
      totals,
      coverage,
    });
  }
  return buckets;
}

/**
 * Ratio metric of one month: ratio of the monthly sums. Null for partial months unless
 * `allowPartial` is set, because a numerator and denominator with different day coverage
 * give a number that looks precise but is not.
 */
export function monthlyRatio(
  bucket: MonthBucket,
  numerator: string,
  denominator: string,
  options: { allowPartial?: boolean } = {},
): number | null {
  if (!bucket.complete && !options.allowPartial) return null;
  return safeRatio(bucket.totals[numerator], bucket.totals[denominator]);
}

export interface SeriesPoint {
  /** A date for daily points, a 'YYYY-MM' key for monthly points. */
  key: string;
  /** null = gap (no data). Never silently 0. */
  value: number | null;
  /** Monthly points only: at least one day in the month had no value. */
  partial?: boolean;
  /** Monthly points only: days with a value / days expected. */
  coverage?: MetricCoverage;
}

/** One point per calendar day in the range; days without a value are null gaps. */
export function seriesWithGaps(rows: readonly DailyRow[], range: DateRange, metric: string): SeriesPoint[] {
  const byDate = indexRows(rows, range);
  return enumerateDays(range).map((day) => {
    const v = byDate.get(day)?.[metric];
    return { key: day, value: finiteNumber(v) ? v : null };
  });
}

/**
 * Daily/Monthly grouping for chart series. Monthly points sum the days that have a value; a
 * month with no value on any day stays a null gap, and a month with some missing days is
 * flagged `partial` so the chart can style it instead of pretending it is complete.
 */
export function groupSeries(daily: readonly SeriesPoint[], grouping: 'daily' | 'monthly'): SeriesPoint[] {
  if (grouping === 'daily') return daily.map((p) => ({ ...p }));
  const order: string[] = [];
  const acc = new Map<string, { sum: number; present: number; expected: number }>();
  for (const p of daily) {
    const key = monthKey(p.key);
    let a = acc.get(key);
    if (!a) {
      a = { sum: 0, present: 0, expected: 0 };
      acc.set(key, a);
      order.push(key);
    }
    a.expected += 1;
    if (p.value !== null) {
      a.sum += p.value;
      a.present += 1;
    }
  }
  return order.map((key) => {
    const a = acc.get(key)!;
    return {
      key,
      value: a.present === 0 ? null : a.sum,
      partial: a.present < a.expected,
      coverage: { expected: a.expected, present: a.present },
    };
  });
}

/**
 * Ratio series (e.g. CTR) built from ratio-of-sums. Daily points are the daily ratio (null on
 * a zero or missing denominator). Monthly points are sum(num)/sum(den) and are null for
 * partial months unless allowPartial is set.
 */
export function ratioSeries(
  rows: readonly DailyRow[],
  range: DateRange,
  numerator: string,
  denominator: string,
  grouping: 'daily' | 'monthly',
  options: { allowPartial?: boolean } = {},
): SeriesPoint[] {
  if (grouping === 'daily') {
    const num = seriesWithGaps(rows, range, numerator);
    const den = seriesWithGaps(rows, range, denominator);
    return num.map((p, i) => ({ key: p.key, value: safeRatio(p.value, den[i]!.value) }));
  }
  return aggregateMonthly(rows, range, [numerator, denominator]).map((b) => ({
    key: b.month,
    value: monthlyRatio(b, numerator, denominator, options),
    partial: !b.complete,
    coverage: {
      expected: b.expectedDays,
      present: Math.min(b.coverage[numerator]!.present, b.coverage[denominator]!.present),
    },
  }));
}

/** Convenience: expected number of days in a range. */
export function expectedDays(range: DateRange): number {
  return rangeLength(range);
}

/** Last `n` days ending at `end` (inclusive). */
export function trailingRange(end: ISODate, n: number): DateRange {
  return { start: addDays(end, -(n - 1)), end };
}
