// Independent reference implementation for the Sedem Ads showcase. Not production source.
//
// Money is stored as an integer number of minor units (cents). Decimal strings are parsed
// without ever passing through a binary float, so 0.1 + 0.2 style drift cannot occur.

/** Integer minor units (cents). Branded so plain floats cannot be passed by accident. */
export type Money = number & { readonly __brand: 'MinorUnits' };

/** Wrap an integer number of minor units. Throws on fractions, NaN, Infinity or unsafe integers. */
export function toMoney(minor: number): Money {
  if (!Number.isSafeInteger(minor)) {
    throw new RangeError(`Money must be a safe integer number of minor units, got ${minor}`);
  }
  return (minor === 0 ? 0 : minor) as Money; // normalise -0
}

/**
 * Parse a plain decimal string ("1029.10", "-5", "0.5") into minor units.
 * At most two fractional digits; no thousands separators, no exponent, no float arithmetic.
 */
export function parseMoney(input: string): Money {
  const m = /^(-)?(\d+)(?:\.(\d{1,2}))?$/.exec(input.trim());
  if (!m) throw new SyntaxError(`Invalid decimal money string: "${input}"`);
  const whole = Number(m[2]);
  const frac = Number((m[3] ?? '').padEnd(2, '0'));
  const minor = whole * 100 + frac;
  return toMoney(m[1] ? -minor : minor);
}

export function addMoney(a: Money, b: Money): Money {
  return toMoney(a + b);
}

export function subMoney(a: Money, b: Money): Money {
  return toMoney(a - b);
}

export function sumMoney(values: readonly Money[]): Money {
  let total = 0;
  for (const v of values) total += v;
  return toMoney(total);
}

/** Exact decimal string with two fraction digits ("1029.10"), built from integers only. */
export function moneyToDecimalString(minor: Money | number): string {
  const n = toMoney(minor as number);
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  const whole = Math.floor(abs / 100);
  const frac = String(abs % 100).padStart(2, '0');
  return `${sign}${whole}.${frac}`;
}

/**
 * Locale formatting for display only. The exact decimal string is handed to Intl, so no float
 * rounding is involved. Assumes a currency with two minor digits (EUR, USD, ...).
 */
export function formatMoney(minor: Money | number, currency = 'EUR', locale = 'en-IE'): string {
  const decimal = moneyToDecimalString(minor);
  const fmt = new Intl.NumberFormat(locale, { style: 'currency', currency });
  return fmt.format(decimal as unknown as number);
}

/**
 * Ratio of two money amounts (e.g. revenue / spend). Returns null when either side is
 * missing or the denominator is not strictly positive: "no data" is never 0 or Infinity.
 */
export function moneyRatio(
  numerator: Money | number | null | undefined,
  denominator: Money | number | null | undefined,
): number | null {
  if (numerator == null || denominator == null) return null;
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator)) return null;
  if (denominator <= 0) return null;
  return numerator / denominator;
}

/** Divide money by a count and return minor units per unit (not rounded). Null on bad input. */
export function moneyPerUnit(
  amount: Money | number | null | undefined,
  units: number | null | undefined,
): number | null {
  return moneyRatio(amount, units);
}

/** Round half up (ties go toward +infinity) to integer minor units. */
export function roundToMoney(minorFractional: number): Money {
  return toMoney(Math.floor(minorFractional + 0.5));
}

/**
 * Estimate the net amount from a gross amount for a percentage VAT rate, rounded half-up to
 * the cent per call (so per-order rounding sums to the reported total).
 */
export function estimateNetOfVat(gross: Money | number, ratePercent: number): Money {
  if (!Number.isFinite(ratePercent) || ratePercent < 0) {
    throw new RangeError('VAT rate must be a non-negative finite percentage');
  }
  return roundToMoney((gross * 100) / (100 + ratePercent));
}
