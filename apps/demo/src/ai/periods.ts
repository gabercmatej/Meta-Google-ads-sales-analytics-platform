import { addDays, rangeLength, resolveShowcaseRange, type DatePreset, type DateRange, type ShowcaseDataset } from '@sedem-ads/analytics-core';

export interface ResolvedPeriod {
  range: DateRange;
  label: string;
  /** True when the question named the period, false when the global selector was used. */
  explicit: boolean;
  preset: DatePreset | 'selected';
}

export const PRESET_PHRASE: Record<Exclude<DatePreset, 'custom'>, string> = {
  last7: 'Last 7 days',
  last14: 'Last 14 days',
  last30: 'Last 30 days',
  last90: 'Last 90 days',
  thisMonth: 'This month',
  previousMonth: 'Previous month',
  yearToDate: 'Year to date',
};

/** Period named inside the question, if any. */
export function detectPreset(q: string): DatePreset | null {
  if (/\b(last|past|previous)\s+(7|seven)\s+days\b|\blast week\b|\bpast week\b/.test(q)) return 'last7';
  if (/\b(last|past)\s+(14|fourteen)\s+days\b|\blast two weeks\b/.test(q)) return 'last14';
  if (/\b(last|past)\s+(90|ninety)\s+days\b|\blast quarter\b|\blast 3 months\b/.test(q)) return 'last90';
  if (/\b(last|past)\s+(30|thirty)\s+days\b/.test(q)) return 'last30';
  if (/\b(previous|last|prior)\s+month\b/.test(q)) return 'previousMonth';
  if (/\bthis month\b|\bcurrent month\b|\bmonth to date\b/.test(q)) return 'thisMonth';
  if (/\b(year to date|ytd|this year|so far this year)\b/.test(q)) return 'yearToDate';
  return null;
}

export function detectCustomRange(q: string): DateRange | null {
  const m = /(\d{4}-\d{2}-\d{2})\s*(?:to|until|through|-|–)\s*(\d{4}-\d{2}-\d{2})/.exec(q);
  return m && m[1] && m[2] ? { start: m[1], end: m[2] } : null;
}

export function resolvePeriod(ds: ShowcaseDataset, q: string, selected: DateRange | null, selectedLabel: string): ResolvedPeriod | null {
  const custom = detectCustomRange(q);
  if (custom) {
    const r = resolveShowcaseRange(ds, 'custom', custom);
    if (r) return { range: r, label: 'Custom range', explicit: true, preset: 'custom' };
  }
  const preset = detectPreset(q);
  if (preset) {
    const r = resolveShowcaseRange(ds, preset);
    if (r) return { range: r, label: preset === 'custom' ? 'Custom range' : PRESET_PHRASE[preset], explicit: true, preset };
  }
  if (selected) return { range: selected, label: selectedLabel, explicit: false, preset: 'selected' };
  const fallback = resolveShowcaseRange(ds, 'last30');
  return fallback ? { range: fallback, label: PRESET_PHRASE.last30, explicit: false, preset: 'last30' } : null;
}

/** The equal-length period immediately before `range`. */
export function previousRange(range: DateRange): DateRange {
  const len = rangeLength(range);
  return { start: addDays(range.start, -len), end: addDays(range.start, -1) };
}

/** Month-over-month: this month so far vs the same number of days of the previous month. */
export function monthOverMonth(ds: ShowcaseDataset): { current: DateRange; previous: DateRange } | null {
  const current = resolveShowcaseRange(ds, 'thisMonth');
  if (!current) return null;
  const lastDayPrevMonth = addDays(current.start, -1);
  const prevStart = `${lastDayPrevMonth.slice(0, 8)}01`;
  const len = rangeLength(current);
  const prevEndCandidate = addDays(prevStart, len - 1);
  const previous = { start: prevStart, end: prevEndCandidate > lastDayPrevMonth ? lastDayPrevMonth : prevEndCandidate };
  return { current, previous };
}
