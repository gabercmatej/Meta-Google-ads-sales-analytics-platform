import type { ReactNode } from 'react';
import type { PerformanceTotals } from '@sedem-ads/analytics-core';
import { date, dateRange } from '../lib/format';

export function Notice(props: { tone?: 'info' | 'warn' | 'bad'; children: ReactNode }) {
  return (
    <div className={`notice ${props.tone === 'warn' ? 'warn' : props.tone === 'bad' ? 'bad' : ''}`} role="note">
      <span>{props.children}</span>
    </div>
  );
}

/** Partial-period and missing-day notes derived from performanceTotals. */
export function CoverageNotes({ totals, range }: { totals: PerformanceTotals | null; range: { start: string; end: string } | null }) {
  if (!totals || !range) return null;
  const notes: ReactNode[] = [];
  if (totals.partial) {
    const missing = totals.missingDates;
    const shown = missing.slice(0, 6).map((d) => date(d)).join(', ');
    notes.push(
      <Notice key="p" tone="warn">
        <strong>Partial data.</strong> {totals.completeDays} of {totals.expectedDays} days in {dateRange(range)} have data for this view
        {missing.length > 0 && <> (missing: {shown}{missing.length > 6 ? ` and ${missing.length - 6} more` : ''})</>}. A missing day is shown as "no data", never as zero.
      </Notice>,
    );
  }
  if (notes.length === 0) return null;
  return <div className="notice-list">{notes}</div>;
}
