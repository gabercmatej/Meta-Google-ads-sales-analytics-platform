// Independent reference implementation for the Sedem Ads showcase. Not production source.
//
// Rule: every metric returns `number | null`. `null` means "no data" (missing input or a
// denominator that is not strictly positive). It is never 0 and never Infinity.
// Monetary inputs are integer minor units; monetary outputs (cpc, cpm, cpl, costPerResult)
// are minor units per unit, unrounded.

type Num = number | null | undefined;

function ok(n: Num): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

/** Safe division: null unless both are finite and the denominator is > 0. */
export function safeRatio(numerator: Num, denominator: Num): number | null {
  if (!ok(numerator) || !ok(denominator)) return null;
  if (denominator <= 0) return null;
  return numerator / denominator;
}

/** Click-through rate as a fraction (0.025 = 2.5 %). */
export function ctr(clicks: Num, impressions: Num): number | null {
  return safeRatio(clicks, impressions);
}

/** Cost per click, minor units per click. */
export function cpc(spendMinor: Num, clicks: Num): number | null {
  return safeRatio(spendMinor, clicks);
}

/** Cost per mille impressions, minor units per 1000 impressions. */
export function cpm(spendMinor: Num, impressions: Num): number | null {
  const r = safeRatio(spendMinor, impressions);
  return r === null ? null : r * 1000;
}

/** Cost per lead, minor units per lead. */
export function cpl(spendMinor: Num, leads: Num): number | null {
  return safeRatio(spendMinor, leads);
}

/**
 * Cost per result. "Result" is deliberately generic: callers must pass ONE result type
 * (leads OR purchases OR link clicks), never a mixed sum.
 */
export function costPerResult(spendMinor: Num, results: Num): number | null {
  return safeRatio(spendMinor, results);
}

/** Conversion rate as a fraction, e.g. leads / clicks. */
export function conversionRate(conversions: Num, visits: Num): number | null {
  return safeRatio(conversions, visits);
}

/** Return on ad spend: revenue / spend (both minor units). Null when spend is 0 or missing. */
export function roas(revenueMinor: Num, spendMinor: Num): number | null {
  return safeRatio(revenueMinor, spendMinor);
}

export interface RatioRow {
  numerator: Num;
  denominator: Num;
}

export interface AggregateRatioOptions {
  /**
   * strict (default): one row with a missing numerator or denominator makes the whole
   * aggregate null, because a partial aggregate would silently misstate the ratio.
   * lenient: rows with missing values are skipped.
   */
  mode?: 'strict' | 'lenient';
}

/**
 * Ratio of sums: sum(numerators) / sum(denominators). This is the only correct way to roll a
 * ratio metric up over days, ads or campaigns. Averaging per-row ratios over-weights tiny rows.
 */
export function aggregateRatio(rows: readonly RatioRow[], options: AggregateRatioOptions = {}): number | null {
  const mode = options.mode ?? 'strict';
  let num = 0;
  let den = 0;
  let used = 0;
  for (const row of rows) {
    if (!ok(row.numerator) || !ok(row.denominator)) {
      if (mode === 'strict') return null;
      continue;
    }
    num += row.numerator;
    den += row.denominator;
    used += 1;
  }
  if (used === 0) return null;
  return safeRatio(num, den);
}

/** The WRONG way, kept only so tests and docs can demonstrate the difference. Skips null rows. */
export function meanOfRatios(rows: readonly RatioRow[]): number | null {
  const ratios: number[] = [];
  for (const r of rows) {
    const v = safeRatio(r.numerator, r.denominator);
    if (v !== null) ratios.push(v);
  }
  if (ratios.length === 0) return null;
  return ratios.reduce((a, b) => a + b, 0) / ratios.length;
}

export type NoDataReason = 'missing' | 'source_unavailable' | 'zero_denominator' | 'partial_coverage';

/**
 * Tri-state metric value. A true zero ("we measured, it was 0"), missing data, and an
 * unreachable source are three different facts and must render differently.
 */
export type MetricValue =
  | { kind: 'value'; value: number }
  | { kind: 'zero' }
  | { kind: 'no-data'; reason: NoDataReason };

export interface MetricValueOptions {
  /** The upstream source could not be reached (API error). Never rendered as 0. */
  sourceUnavailable?: boolean;
  /** Reason to attach when `raw` is null and the source is reachable. */
  nullReason?: Exclude<NoDataReason, 'source_unavailable'>;
}

export function toMetricValue(raw: Num, options: MetricValueOptions = {}): MetricValue {
  if (options.sourceUnavailable) return { kind: 'no-data', reason: 'source_unavailable' };
  if (!ok(raw)) return { kind: 'no-data', reason: options.nullReason ?? 'missing' };
  if (raw === 0) return { kind: 'zero' };
  return { kind: 'value', value: raw };
}

/** Text for a metric: a true zero shows "0", missing data shows an explicit label. */
export function describeMetric(mv: MetricValue, format: (n: number) => string = String): string {
  switch (mv.kind) {
    case 'value':
      return format(mv.value);
    case 'zero':
      return format(0);
    case 'no-data':
      return mv.reason === 'source_unavailable' ? 'source unavailable' : 'no data';
  }
}
