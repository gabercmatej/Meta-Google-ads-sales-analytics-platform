// Independent reference implementation for the Sedem Ads showcase. Not production source.
import { describe, expect, it } from 'vitest';
import { addMoney, estimateNetOfVat, formatMoney, moneyRatio, moneyToDecimalString, parseMoney, roundToMoney, sumMoney, toMoney } from '../src/index.js';

describe('money', () => {
  it('parses decimal strings exactly, without float error', () => {
    expect(parseMoney('0.10')).toBe(10);
    expect(parseMoney('0.1')).toBe(10);
    expect(parseMoney('19.99')).toBe(1999);
    expect(parseMoney('1234567.89')).toBe(123456789);
    expect(parseMoney('-5.05')).toBe(-505);
  });

  it('rejects malformed or over-precise input instead of guessing', () => {
    for (const bad of ['', 'abc', '1.234', '1,50', '1e3', '--1', '1.']) {
      expect(() => parseMoney(bad)).toThrow(SyntaxError);
    }
  });

  it('refuses non-integer or unsafe minor units', () => {
    expect(() => toMoney(10.5)).toThrow(RangeError);
    expect(() => toMoney(Number.NaN)).toThrow(RangeError);
    expect(() => toMoney(Number.MAX_SAFE_INTEGER + 2)).toThrow(RangeError);
  });

  it('sums many small amounts without drifting (0.1 + 0.2 problem)', () => {
    const ten = toMoney(10);
    const total = sumMoney(Array.from({ length: 1000 }, () => ten));
    expect(total).toBe(10000);
    expect(addMoney(parseMoney('0.10'), parseMoney('0.20'))).toBe(30);
  });

  it('normalises negative zero', () => {
    expect(Object.is(toMoney(-0), 0)).toBe(true);
  });

  it('renders decimal strings and EUR text from minor units', () => {
    expect(moneyToDecimalString(5)).toBe('0.05');
    expect(moneyToDecimalString(-1250)).toBe('-12.50');
    expect(formatMoney(123456)).toContain('1,234.56');
    expect(formatMoney(123456)).toContain('€');
  });

  it('returns null, never Infinity or NaN, for a missing or zero denominator', () => {
    expect(moneyRatio(100, 0)).toBeNull();
    expect(moneyRatio(100, null)).toBeNull();
    expect(moneyRatio(null, 5)).toBeNull();
    expect(moneyRatio(100, 4)).toBe(25);
  });

  it('rounds half up to whole minor units and derives net of VAT', () => {
    expect(roundToMoney(2.5)).toBe(3);
    expect(roundToMoney(2.49)).toBe(2);
    expect(estimateNetOfVat(12200, 22)).toBe(10000);
    expect(() => estimateNetOfVat(100, -1)).toThrow(RangeError);
  });
});
