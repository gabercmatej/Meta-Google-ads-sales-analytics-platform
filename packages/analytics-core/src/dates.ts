// Independent reference implementation for the Sedem Ads showcase. Not production source.
//
// Calendar-date arithmetic for advertising days. A "date" is a plain 'YYYY-MM-DD' string that
// means a calendar day in an account's IANA time zone. Events are stored as UTC instants and
// mapped to a calendar day with Intl only; no dependency, no mixing of zones.

export type ISODate = string;

export interface DateRange {
  /** Inclusive first day. */
  start: ISODate;
  /** Inclusive last day. */
  end: ISODate;
}

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isValidISODate(value: string): boolean {
  const m = ISO_RE.exec(value);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const t = new Date(Date.UTC(y, mo - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d;
}

function assertDate(value: string): void {
  if (!isValidISODate(value)) throw new RangeError(`Invalid ISO calendar date: "${value}"`);
}

function toUtcMs(date: ISODate): number {
  assertDate(date);
  const m = ISO_RE.exec(date)!;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function fromUtcMs(ms: number): ISODate {
  const d = new Date(ms);
  const y = String(d.getUTCFullYear()).padStart(4, '0');
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
  const da = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${mo}-${da}`;
}

const DAY_MS = 86_400_000;

/** Calendar day of a UTC instant in the given IANA time zone. */
export function calendarDateInZone(instant: Date | number | string, timeZone: string): ISODate {
  const d = instant instanceof Date ? instant : new Date(instant);
  if (Number.isNaN(d.getTime())) throw new RangeError('Invalid instant');
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function addDays(date: ISODate, days: number): ISODate {
  return fromUtcMs(toUtcMs(date) + days * DAY_MS);
}

/** Whole calendar days from a to b (b - a). Not affected by DST, because dates carry no clock time. */
export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((toUtcMs(b) - toUtcMs(a)) / DAY_MS);
}

export function compareDates(a: ISODate, b: ISODate): number {
  return toUtcMs(a) - toUtcMs(b);
}

export function rangeLength(range: DateRange): number {
  return diffDays(range.start, range.end) + 1;
}

export function assertRange(range: DateRange): void {
  assertDate(range.start);
  assertDate(range.end);
  if (compareDates(range.start, range.end) > 0) {
    throw new RangeError(`Range start ${range.start} is after end ${range.end}`);
  }
}

export function inRange(date: ISODate, range: DateRange): boolean {
  return compareDates(date, range.start) >= 0 && compareDates(date, range.end) <= 0;
}

/** Every day in an inclusive range, in order. */
export function enumerateDays(range: DateRange): ISODate[] {
  assertRange(range);
  const out: ISODate[] = [];
  const n = rangeLength(range);
  for (let i = 0; i < n; i++) out.push(addDays(range.start, i));
  return out;
}

/** 'YYYY-MM' of a date. */
export function monthKey(date: ISODate): string {
  assertDate(date);
  return date.slice(0, 7);
}

export function monthStart(key: string): ISODate {
  return `${key}-01`;
}

export function monthEnd(key: string): ISODate {
  const first = monthStart(key);
  assertDate(first);
  const m = ISO_RE.exec(first)!;
  const last = new Date(Date.UTC(Number(m[1]), Number(m[2]), 0)).getUTCDate();
  return `${key}-${String(last).padStart(2, '0')}`;
}

/** Month keys touched by a range, in order. */
export function monthKeysInRange(range: DateRange): string[] {
  const keys: string[] = [];
  for (const d of enumerateDays(range)) {
    const k = monthKey(d);
    if (keys[keys.length - 1] !== k) keys.push(k);
  }
  return keys;
}

/** The part of a month that falls inside the range (inclusive), or null. */
export function monthSlice(key: string, range: DateRange): DateRange | null {
  const start = compareDates(monthStart(key), range.start) > 0 ? monthStart(key) : range.start;
  const end = compareDates(monthEnd(key), range.end) < 0 ? monthEnd(key) : range.end;
  return compareDates(start, end) > 0 ? null : { start, end };
}

/** Equal-length window immediately before `range`. */
export function previousPeriod(range: DateRange): DateRange {
  const n = rangeLength(range);
  return { start: addDays(range.start, -n), end: addDays(range.start, -1) };
}

export type DatePreset =
  | 'last7'
  | 'last14'
  | 'last30'
  | 'last90'
  | 'thisMonth'
  | 'previousMonth'
  | 'yearToDate'
  | 'custom';

export interface ResolveOptions {
  /** The "current" instant. Required so tests and reports are reproducible. */
  now: Date | number | string;
  timeZone: string;
  /**
   * Exclude today (in the account time zone). Today's numbers are still accumulating, so
   * a completed-days window ends yesterday. Default true.
   */
  completedDaysOnly?: boolean;
  /** Required for 'custom'. */
  custom?: DateRange;
}

const ROLLING: Partial<Record<DatePreset, number>> = { last7: 7, last14: 14, last30: 30, last90: 90 };

/**
 * Resolve a preset to an inclusive range in the account time zone. Returns null when the
 * window is empty (e.g. thisMonth on the 1st with completedDaysOnly).
 */
export function resolvePreset(preset: DatePreset, options: ResolveOptions): DateRange | null {
  const completed = options.completedDaysOnly ?? true;
  const today = calendarDateInZone(options.now, options.timeZone);
  const lastDay = completed ? addDays(today, -1) : today;

  let range: DateRange;
  const rolling = ROLLING[preset];
  if (rolling !== undefined) {
    range = { start: addDays(lastDay, -(rolling - 1)), end: lastDay };
  } else if (preset === 'thisMonth') {
    range = { start: monthStart(monthKey(today)), end: lastDay };
  } else if (preset === 'yearToDate') {
    range = { start: `${today.slice(0, 4)}-01-01`, end: lastDay };
  } else if (preset === 'previousMonth') {
    const prev = monthKey(addDays(monthStart(monthKey(today)), -1));
    range = { start: monthStart(prev), end: monthEnd(prev) };
  } else {
    if (!options.custom) throw new TypeError("Preset 'custom' requires options.custom");
    assertRange(options.custom);
    const end = compareDates(options.custom.end, lastDay) > 0 ? lastDay : options.custom.end;
    range = { start: options.custom.start, end };
  }
  return compareDates(range.start, range.end) > 0 ? null : range;
}

/** True if the whole calendar day has elapsed in the time zone at `now`. */
export function isCompletedDay(date: ISODate, now: Date | number | string, timeZone: string): boolean {
  return compareDates(date, calendarDateInZone(now, timeZone)) < 0;
}
