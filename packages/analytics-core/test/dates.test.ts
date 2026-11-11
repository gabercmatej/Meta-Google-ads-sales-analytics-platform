// Independent reference implementation for the Sedem Ads showcase. Not production source.
import { describe, expect, it } from 'vitest';
import { addDays, calendarDateInZone, compareDates, diffDays, enumerateDays, inRange, isCompletedDay, isValidISODate, monthEnd, monthKeysInRange, monthSlice, previousPeriod, rangeLength, resolvePreset } from '../src/index.js';

const TZ = 'Europe/Ljubljana';

describe('calendar dates', () => {
  it('validates real calendar days only', () => {
    expect(isValidISODate('2024-02-29')).toBe(true);
    expect(isValidISODate('2025-02-29')).toBe(false);
    expect(isValidISODate('2025-13-01')).toBe(false);
    expect(isValidISODate('2025-1-1')).toBe(false);
  });

  it('adds days across month, year and leap boundaries', () => {
    expect(addDays('2025-12-31', 1)).toBe('2026-01-01');
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDays('2025-03-01', -1)).toBe('2025-02-28');
    expect(diffDays('2025-01-01', '2025-12-31')).toBe(364);
  });

  it('is DST-safe: spring-forward and fall-back weeks keep whole days', () => {
    expect(addDays('2025-03-29', 3)).toBe('2025-04-01');
    expect(addDays('2025-10-25', 2)).toBe('2025-10-27');
    expect(enumerateDays({ start: '2025-03-28', end: '2025-04-01' })).toHaveLength(5);
    expect(enumerateDays({ start: '2025-10-24', end: '2025-10-28' })).toHaveLength(5);
  });

  it('enumerates inclusively and rejects reversed ranges', () => {
    expect(enumerateDays({ start: '2025-01-30', end: '2025-02-02' })).toEqual(['2025-01-30', '2025-01-31', '2025-02-01', '2025-02-02']);
    expect(rangeLength({ start: '2025-01-01', end: '2025-01-01' })).toBe(1);
    expect(() => enumerateDays({ start: '2025-02-01', end: '2025-01-01' })).toThrow();
  });

  it('compares and tests membership', () => {
    expect(compareDates('2025-01-01', '2025-01-02')).toBeLessThan(0);
    expect(inRange('2025-01-31', { start: '2025-01-01', end: '2025-01-31' })).toBe(true);
    expect(inRange('2025-02-01', { start: '2025-01-01', end: '2025-01-31' })).toBe(false);
  });
});

describe('time zone mapping', () => {
  it('maps a UTC instant to the account calendar day', () => {
    expect(calendarDateInZone('2025-12-31T23:30:00Z', TZ)).toBe('2026-01-01');
    expect(calendarDateInZone('2025-12-31T23:30:00Z', 'UTC')).toBe('2025-12-31');
    expect(calendarDateInZone('2025-12-31T23:30:00Z', 'America/Los_Angeles')).toBe('2025-12-31');
  });

  it('handles the DST offset: 22:30 UTC is the next day in summer, the same day in winter', () => {
    expect(calendarDateInZone('2025-07-01T22:30:00Z', TZ)).toBe('2025-07-02');
    expect(calendarDateInZone('2025-01-01T22:30:00Z', TZ)).toBe('2025-01-01');
    expect(calendarDateInZone('2025-01-01T23:00:00Z', TZ)).toBe('2025-01-02');
  });

  it('rejects an invalid instant', () => {
    expect(() => calendarDateInZone('not a date', TZ)).toThrow(RangeError);
  });

  it('judges completed days in the account zone, not in UTC', () => {
    // 22:30 UTC on the 15th is 00:30 on the 16th in Ljubljana during summer.
    const now = '2025-06-15T22:30:00Z';
    expect(isCompletedDay('2025-06-15', now, TZ)).toBe(true);
    expect(isCompletedDay('2025-06-16', now, TZ)).toBe(false);
    expect(isCompletedDay('2025-06-15', now, 'UTC')).toBe(false);
  });
});

describe('presets (completed days only)', () => {
  const now = '2025-06-15T10:00:00Z';

  it('last7 ends yesterday and has 7 days', () => {
    const r = resolvePreset('last7', { now, timeZone: TZ })!;
    expect(r).toEqual({ start: '2025-06-08', end: '2025-06-14' });
    expect(rangeLength(r)).toBe(7);
  });

  it('includes today only when asked', () => {
    expect(resolvePreset('last7', { now, timeZone: TZ, completedDaysOnly: false })!.end).toBe('2025-06-15');
  });

  it('thisMonth is empty on the 1st with completed days only', () => {
    expect(resolvePreset('thisMonth', { now: '2025-06-01T10:00:00Z', timeZone: TZ })).toBeNull();
    expect(resolvePreset('thisMonth', { now, timeZone: TZ })).toEqual({ start: '2025-06-01', end: '2025-06-14' });
  });

  it('previousMonth is the full previous calendar month, also across a year boundary', () => {
    expect(resolvePreset('previousMonth', { now, timeZone: TZ })).toEqual({ start: '2025-05-01', end: '2025-05-31' });
    expect(resolvePreset('previousMonth', { now: '2026-01-10T10:00:00Z', timeZone: TZ })).toEqual({ start: '2025-12-01', end: '2025-12-31' });
  });

  it('yearToDate starts on 1 January', () => {
    expect(resolvePreset('yearToDate', { now, timeZone: TZ })).toEqual({ start: '2025-01-01', end: '2025-06-14' });
  });

  it('custom ranges are clipped to the last completed day and need a range', () => {
    expect(resolvePreset('custom', { now, timeZone: TZ, custom: { start: '2025-06-10', end: '2025-06-30' } })).toEqual({ start: '2025-06-10', end: '2025-06-14' });
    expect(() => resolvePreset('custom', { now, timeZone: TZ })).toThrow(TypeError);
    expect(resolvePreset('custom', { now, timeZone: TZ, custom: { start: '2025-06-20', end: '2025-06-30' } })).toBeNull();
  });

  it('the previous period has the same length and ends the day before', () => {
    expect(previousPeriod({ start: '2025-06-08', end: '2025-06-14' })).toEqual({ start: '2025-06-01', end: '2025-06-07' });
  });
});

describe('months', () => {
  it('lists month keys and slices a range per month', () => {
    const r = { start: '2025-01-20', end: '2025-03-05' };
    expect(monthKeysInRange(r)).toEqual(['2025-01', '2025-02', '2025-03']);
    expect(monthSlice('2025-01', r)).toEqual({ start: '2025-01-20', end: '2025-01-31' });
    expect(monthSlice('2025-02', r)).toEqual({ start: '2025-02-01', end: '2025-02-28' });
    expect(monthSlice('2025-04', r)).toBeNull();
    expect(monthEnd('2024-02')).toBe('2024-02-29');
  });
});
