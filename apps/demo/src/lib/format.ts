// Display formatting. en-IE locale, EUR. null always renders as "–" (no data), never 0.

import { weekLabel } from '@sedem-ads/analytics-core';

const LOCALE = 'en-IE';
export const NO_DATA = '–';

const eur = new Intl.NumberFormat(LOCALE, { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const eur0 = new Intl.NumberFormat(LOCALE, { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0 });
const int = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 });
const compact = new Intl.NumberFormat(LOCALE, { notation: 'compact', maximumFractionDigits: 1 });

function missing(n: number | null | undefined): n is null | undefined {
  return n === null || n === undefined || !Number.isFinite(n);
}

export function money(minor: number | null | undefined, opts: { whole?: boolean } = {}): string {
  if (missing(minor)) return NO_DATA;
  return (opts.whole ? eur0 : eur).format(minor / 100);
}

/** Compact EUR for chart axes: €12.4K. */
export function moneyAxis(minor: number | null | undefined): string {
  if (missing(minor)) return '';
  return `€${compact.format(minor / 100)}`;
}

export function count(n: number | null | undefined): string {
  if (missing(n)) return NO_DATA;
  return int.format(n);
}

export function countAxis(n: number | null | undefined): string {
  if (missing(n)) return '';
  return compact.format(n);
}

/** Fraction -> percent, e.g. 0.0123 -> "1.23%". */
export function pct(fraction: number | null | undefined, digits = 2): string {
  if (missing(fraction)) return NO_DATA;
  return `${(fraction * 100).toFixed(digits)}%`;
}

/** Signed relative change, e.g. 0.125 -> "+12.5%". */
export function change(fraction: number | null | undefined, digits = 1): string {
  if (missing(fraction)) return NO_DATA;
  return `${fraction > 0 ? '+' : ''}${(fraction * 100).toFixed(digits)}%`;
}

/** ROAS-style multiple, e.g. 3.456 -> "3.46×". */
export function multiple(x: number | null | undefined, digits = 2): string {
  if (missing(x)) return NO_DATA;
  return `${x.toFixed(digits)}×`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-11-03" -> "3 Nov 2026"; "2026-11" -> "Nov 2026". */
export function date(iso: string | null | undefined, opts: { year?: boolean } = {}): string {
  if (!iso) return NO_DATA;
  const [y, m, d] = iso.slice(0, 10).split('-');
  const mon = MONTHS[Number(m) - 1] ?? m;
  if (d === undefined) return `${mon} ${y}`;
  return opts.year === false ? `${Number(d)} ${mon}` : `${Number(d)} ${mon} ${y}`;
}

export function dateRange(r: { start: string; end: string } | null | undefined): string {
  if (!r) return NO_DATA;
  return `${date(r.start)} – ${date(r.end)}`;
}

/** UTC instant -> "11 Nov 2026, 11:00" in the account time zone. */
export function dateTime(isoInstant: string | null | undefined, timeZone = 'Europe/Ljubljana'): string {
  if (!isoInstant) return NO_DATA;
  const f = new Intl.DateTimeFormat(LOCALE, { timeZone, day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
  return f.format(new Date(isoInstant));
}

/** Gross (VAT-inclusive) minor units -> net of VAT. */
export function netOfVat(grossMinor: number | null | undefined, vatRatePercent: number): number | null {
  if (missing(grossMinor)) return null;
  return Math.round(grossMinor / (1 + vatRatePercent / 100));
}

/** "2026-11" -> "Nov 2026", "2026-W45" -> "2–8 Nov", "2026-11-03" -> "3 Nov". Used for chart/table labels. */
export function periodLabel(key: string): string {
  if (/^\d{4}-W\d{2}$/.test(key)) return weekLabel(key);
  return key.length === 7 ? date(key) : date(key, { year: false });
}

/** Sum that stays null when every input is null (missing is not zero). */
export function sumOrNull(values: ReadonlyArray<number | null | undefined>): number | null {
  let total = 0;
  let any = false;
  for (const v of values) {
    if (v === null || v === undefined || !Number.isFinite(v)) continue;
    total += v;
    any = true;
  }
  return any ? total : null;
}

/** Fraction of 0..1 as a whole-percent share, e.g. 0.256 -> "26%". */
export function share(part: number, total: number): string {
  return total > 0 ? `${Math.round((part / total) * 100)}%` : NO_DATA;
}
