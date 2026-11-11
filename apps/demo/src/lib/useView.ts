import { useMemo } from 'react';
import { addDays, compareDates, previousPeriod, rangeLength, type DateRange } from '@sedem-ads/analytics-core';
import { HISTORY_START, useAppState } from '../state/AppState';
import { getDataset } from './data';

/** Previous equal-length window, or null when it would start before the available history. */
export function usablePreviousRange(range: DateRange): DateRange | null {
  const prev = previousPeriod(range);
  return compareDates(prev.start, HISTORY_START) < 0 ? null : prev;
}

export function useView() {
  const s = useAppState();
  const ds = useMemo(() => getDataset(), []);
  return { ds, ...s };
}

export function describeRange(range: DateRange): string {
  return `${rangeLength(range)} days`;
}

export { addDays };
