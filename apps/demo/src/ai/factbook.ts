// Fact registry for the demo assistant. Every number that appears in an answer is formatted
// through one of these helpers, which records it as a "fact" produced by a tool. The grounding
// check then verifies the final text against the registry. Pure TypeScript, no React.
import { change, count, date, dateRange, money, multiple, NO_DATA, pct } from '../lib/format';

export type FactKind = 'money' | 'pct' | 'change' | 'count' | 'multiple' | 'date' | 'period' | 'name' | 'input';

export interface FactRecord {
  label: string;
  display: string;
  /** Raw value behind the display string (minor units for money, fractions for ratios). */
  value: number | string | null;
  kind: FactKind;
  /** The tool call that produced it. */
  source: string;
}

const NUMBER_RE = /\d[\d,]*(?:\.\d+)?/g;

export function numericTokens(text: string): string[] {
  return [...text.matchAll(NUMBER_RE)].map((m) => normalizeToken(m[0]));
}

export function normalizeToken(raw: string): string {
  const cleaned = raw.replace(/,/g, '').replace(/[.]$/, '');
  const n = Number(cleaned);
  return Number.isFinite(n) ? String(n) : cleaned;
}

export class FactBook {
  readonly facts: FactRecord[] = [];
  source = 'router';

  private add(kind: FactKind, label: string, display: string, value: number | string | null): string {
    if (display !== NO_DATA) this.facts.push({ label, display, value, kind, source: this.source });
    return display;
  }

  money(minor: number | null | undefined, label = 'amount', opts: { whole?: boolean } = {}): string {
    return this.add('money', label, money(minor, opts), minor ?? null);
  }
  pct(fraction: number | null | undefined, label = 'rate', digits = 2): string {
    return this.add('pct', label, pct(fraction, digits), fraction ?? null);
  }
  change(fraction: number | null | undefined, label = 'change'): string {
    return this.add('change', label, change(fraction), fraction ?? null);
  }
  count(n: number | null | undefined, label = 'count'): string {
    return this.add('count', label, count(n), n ?? null);
  }
  multiple(x: number | null | undefined, label = 'ratio'): string {
    return this.add('multiple', label, multiple(x), x ?? null);
  }
  date(iso: string): string {
    return this.add('date', 'date', date(iso), iso);
  }
  range(r: { start: string; end: string } | null | undefined, label = 'period'): string {
    return this.add('date', label, dateRange(r), r ? `${r.start}..${r.end}` : null);
  }
  /** Entity name or other identifier that may contain digits (e.g. "Search 02"). */
  name(text: string): string {
    return this.add('name', 'name', text, text);
  }
  /** A phrase describing a tool INPUT such as a period label ("Last 30 days"). Not a result. */
  input(text: string): string {
    return this.add('input', 'input', text, text);
  }

  /** Numeric tokens that are legitimate to quote. */
  allowed(): Set<string> {
    const set = new Set<string>();
    for (const f of this.facts) for (const t of numericTokens(f.display)) set.add(t);
    return set;
  }
}

export interface GroundingResult {
  verified: number;
  total: number;
  ungrounded: string[];
  grounded: boolean;
}

/** Every number quoted in `text` must be a token of a registered fact. */
export function checkGrounding(text: string, book: FactBook): GroundingResult {
  const allowed = book.allowed();
  const tokens = numericTokens(text);
  const ungrounded = tokens.filter((t) => !allowed.has(t));
  return { verified: tokens.length - ungrounded.length, total: tokens.length, ungrounded, grounded: ungrounded.length === 0 };
}
