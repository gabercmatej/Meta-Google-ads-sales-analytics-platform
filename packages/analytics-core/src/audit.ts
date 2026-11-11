// Independent reference implementation for the Sedem Ads showcase. Not production source.
//
// Audit model: a check is PASS, PARTIAL, FAIL or UNKNOWN. PARTIAL always carries a category that
// says WHY it is not a pass; FAIL is reserved for genuine defects.

export type AuditStatus = 'PASS' | 'PARTIAL' | 'FAIL' | 'UNKNOWN';

export type PartialCategory = 'intentional_basis_difference' | 'source_limitation' | 'missing_evidence';

export interface AuditCheck {
  id: string;
  title: string;
  status: AuditStatus;
  /** Required for PARTIAL, forbidden otherwise. */
  category?: PartialCategory;
  detail?: string;
  expected?: number | string | null;
  actual?: number | string | null;
}

export function makeCheck(check: AuditCheck): AuditCheck {
  if (check.status === 'PARTIAL' && !check.category) {
    throw new Error(`Check "${check.id}": PARTIAL requires a category`);
  }
  if (check.status !== 'PARTIAL' && check.category) {
    throw new Error(`Check "${check.id}": category is only valid for PARTIAL`);
  }
  return { ...check };
}

export interface AuditSummary {
  total: number;
  counts: Record<AuditStatus, number>;
  partialByCategory: Record<PartialCategory, number>;
  /** Worst status wins: FAIL > PARTIAL > UNKNOWN > PASS. An empty audit is UNKNOWN. */
  overall: AuditStatus;
}

export function summarize(checks: readonly AuditCheck[]): AuditSummary {
  const counts: Record<AuditStatus, number> = { PASS: 0, PARTIAL: 0, FAIL: 0, UNKNOWN: 0 };
  const partialByCategory: Record<PartialCategory, number> = {
    intentional_basis_difference: 0,
    source_limitation: 0,
    missing_evidence: 0,
  };
  for (const c of checks) {
    counts[c.status] += 1;
    if (c.status === 'PARTIAL' && c.category) partialByCategory[c.category] += 1;
  }
  let overall: AuditStatus = 'PASS';
  if (checks.length === 0) overall = 'UNKNOWN';
  else if (counts.FAIL > 0) overall = 'FAIL';
  else if (counts.PARTIAL > 0) overall = 'PARTIAL';
  else if (counts.UNKNOWN > 0) overall = 'UNKNOWN';
  return { total: checks.length, counts, partialByCategory, overall };
}

export interface CompareOptions {
  /** Allowed absolute difference in minor units. Default 0 (exact). */
  toleranceMinor?: number;
  /**
   * If the two sources legitimately differ by definition (e.g. gross vs net of VAT) and the
   * difference exceeds the tolerance, report PARTIAL with this category instead of FAIL.
   */
  explainedBy?: PartialCategory;
  detail?: string;
}

/**
 * Compare two sources of the same quantity. A null side means a source had no data, which is
 * UNKNOWN: it is not a pass and it is not a defect.
 */
export function compareSources(
  id: string,
  title: string,
  a: number | null,
  b: number | null,
  options: CompareOptions = {},
): AuditCheck {
  const tol = options.toleranceMinor ?? 0;
  if (a === null || b === null) {
    return makeCheck({ id, title, status: 'UNKNOWN', expected: a, actual: b, detail: options.detail ?? 'a source had no data' });
  }
  const diff = Math.abs(a - b);
  if (diff <= tol) {
    return makeCheck({ id, title, status: 'PASS', expected: a, actual: b, detail: options.detail });
  }
  const detail = `${options.detail ? options.detail + '; ' : ''}difference ${diff} minor units exceeds tolerance ${tol}`;
  if (options.explainedBy) {
    return makeCheck({ id, title, status: 'PARTIAL', category: options.explainedBy, expected: a, actual: b, detail });
  }
  return makeCheck({ id, title, status: 'FAIL', expected: a, actual: b, detail });
}
