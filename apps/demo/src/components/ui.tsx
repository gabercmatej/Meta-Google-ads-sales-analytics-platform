// Shared UI primitives in the product's design language (Tailwind classes + the component
// classes in styles/globals.css). Pages compose these; they hold no data logic.
import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { NO_DATA } from '../lib/format';

/* Surfaces ----------------------------------------------------------------------------- */

/** Card. With `title` it renders the standard header (15px title, 12px grey subtitle, hairline). */
export function Card(props: { title?: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; id?: string; hover?: boolean }) {
  return (
    <section className={`card ${props.hover ? 'card-hover' : ''} ${props.className ?? ''}`} id={props.id}>
      {(props.title || props.actions) && <CardHeader title={props.title} sub={props.subtitle} right={props.actions} />}
      {props.children}
    </section>
  );
}

export function CardHeader({ title, sub, right }: { title: ReactNode; sub?: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 rounded-t-card border-b border-line px-4 py-3.5 sm:px-5">
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold leading-5 tracking-tight text-ink">{title}</h2>
        {sub && <p className="mt-0.5 text-xs leading-snug text-ink-3">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

/** Section heading above a group of cards or tables. */
export function Section({ title, description, action, children, className = '', id }: { title: ReactNode; description?: ReactNode; action?: ReactNode; children?: ReactNode; className?: string; id?: string }) {
  return (
    <section className={`min-w-0 ${className}`} id={id}>
      <div className="mb-3.5 flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold tracking-tight text-ink">{title}</h2>
          {description && <p className="mt-0.5 max-w-2xl text-xs text-ink-3">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function PageTitle({ title, sub, right, badge }: { title: ReactNode; sub?: ReactNode; right?: ReactNode; badge?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3 pb-1">
      <div className="min-w-0">
        <h1 className="flex flex-wrap items-center gap-2 text-[1.5rem] font-semibold leading-8 tracking-tight text-ink">
          {title}
          {badge}
        </h1>
        {sub && <p className="mt-1 max-w-3xl text-sm text-ink-3">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

/** Older name kept for existing pages. */
export function PageHeader(props: { title: ReactNode; description?: ReactNode; actions?: ReactNode; badge?: ReactNode }) {
  return <PageTitle title={props.title} sub={props.description} right={props.actions} badge={props.badge} />;
}

/* Buttons ------------------------------------------------------------------------------ */

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export function buttonClass(variant: ButtonVariant = 'secondary', size: 'md' | 'sm' = 'md'): string {
  return `btn btn-${variant}${size === 'sm' ? ' btn-sm' : ''}`;
}

export function Button({ variant = 'secondary', size, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: 'sm' | 'md' }) {
  return <button type="button" className={`${buttonClass(variant, size === 'sm' ? 'sm' : 'md')} ${className ?? ''}`} {...rest} />;
}

/* Badges and states -------------------------------------------------------------------- */

const TONES = {
  green: 'bg-positive-soft text-positive',
  gray: 'bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-200',
  amber: 'bg-warn-soft text-warn',
  red: 'bg-negative-soft text-negative',
  blue: 'bg-brand-soft text-brand-hover',
  violet: 'bg-section-boost-soft text-section-boost',
  teal: 'bg-section-pp-soft text-section-pp',
} as const;

export type Tone = keyof typeof TONES | 'neutral' | 'meta' | 'google' | 'combined' | 'good' | 'bad' | 'warn' | 'info';
const TONE_ALIAS: Record<string, keyof typeof TONES> = { neutral: 'gray', meta: 'blue', google: 'amber', combined: 'violet', good: 'green', bad: 'red', warn: 'amber', info: 'blue' };

export function Badge({ tone = 'gray', children, title }: { tone?: Tone; children: ReactNode; title?: string }) {
  const key = (tone in TONES ? tone : TONE_ALIAS[tone]) as keyof typeof TONES;
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-2xs font-semibold leading-4 ${TONES[key]}`} title={title}>
      {children}
    </span>
  );
}

/** Campaign / ad delivery status pill with a dot (Active, Paused, Ended, Draft…). */
export function StatusPill({ status }: { status: string }) {
  const s = status.toLowerCase();
  const map: Record<string, { cls: string; dot: string; label: string }> = {
    active: { cls: 'bg-positive-soft text-positive', dot: 'bg-positive', label: 'Active' },
    enabled: { cls: 'bg-positive-soft text-positive', dot: 'bg-positive', label: 'Active' },
    paused: { cls: 'bg-slate-100 text-slate-600', dot: 'bg-slate-400', label: 'Paused' },
    ended: { cls: 'bg-slate-100 text-slate-500', dot: 'bg-slate-300', label: 'Ended' },
    completed: { cls: 'bg-slate-100 text-slate-500', dot: 'bg-slate-300', label: 'Ended' },
    removed: { cls: 'bg-slate-100 text-slate-500', dot: 'bg-slate-300', label: 'Removed' },
    draft: { cls: 'bg-warn-soft text-warn', dot: 'bg-amber-500', label: 'Draft' },
    learning: { cls: 'bg-brand-soft text-brand-hover', dot: 'bg-brand', label: 'Learning' },
    error: { cls: 'bg-negative-soft text-negative', dot: 'bg-negative', label: 'Error' },
  };
  const m = map[s] ?? { cls: 'bg-slate-100 text-slate-600', dot: 'bg-slate-400', label: status };
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-2xs font-semibold leading-4 ${m.cls}`}>
      <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${m.dot}`} />
      {m.label}
    </span>
  );
}

const DQ = {
  ok: { cls: 'bg-positive', text: 'complete data' },
  warn: { cls: 'bg-amber-500', text: 'partial data' },
  bad: { cls: 'bg-negative', text: 'error or missing' },
  none: { cls: 'bg-slate-300', text: 'no data' },
} as const;

export function DataQualityDot({ state, label }: { state: keyof typeof DQ; label?: string }) {
  const d = DQ[state];
  return (
    <span className="inline-flex items-center gap-1.5 align-middle" title={label ?? d.text}>
      <span className={`h-1.5 w-1.5 rounded-full ${d.cls}`} aria-hidden />
      <span className="sr-only">{label ?? d.text}</span>
    </span>
  );
}

export function Skeleton({ className = 'h-4 w-full' }: { className?: string }) {
  return <div aria-hidden className={`skeleton ${className}`} />;
}

/** Click-to-open definition ("i"), works without hover. */
export function InfoTip({ title, text }: { title?: string; text: ReactNode }) {
  return (
    <details className="infotip relative ml-1 inline-block align-middle normal-case tracking-normal">
      <summary
        aria-label={title ? `Definition: ${title}` : 'Definition'}
        className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-slate-300 text-[10px] font-semibold leading-none text-slate-500 hover:border-brand hover:text-brand"
      >
        i
      </summary>
      <div className="fixed inset-x-4 z-30 mt-1.5 rounded-lg bg-white p-3 text-left text-xs font-normal leading-relaxed text-slate-700 shadow-pop sm:absolute sm:inset-x-auto sm:left-1/2 sm:w-72 sm:-translate-x-1/2">
        {title && <p className="font-semibold text-slate-900">{title}</p>}
        <div className={title ? 'mt-1' : ''}>{text}</div>
      </div>
    </details>
  );
}

/* Metrics ------------------------------------------------------------------------------ */

export type GoodWhen = 'up' | 'down' | 'neutral';
const pctFmt = new Intl.NumberFormat('en-IE', { maximumFractionDigits: 1, minimumFractionDigits: 0 });

/** Change vs the comparison period. pct is a signed percentage (12.4 = +12.4%); null = no comparison. */
export function DeltaBadge({ pct, goodWhen = 'neutral' }: { pct: number | null | undefined; goodWhen?: GoodWhen }) {
  if (pct === null || pct === undefined || !Number.isFinite(pct)) {
    return (
      <span className="text-xs text-slate-500" title="No reliable figure for the previous period.">
        No comparison
      </span>
    );
  }
  const dir = pct > 0.05 ? 'up' : pct < -0.05 ? 'down' : 'flat';
  const good = goodWhen === 'neutral' || dir === 'flat' ? null : dir === goodWhen;
  const tone = good === null ? 'bg-slate-100 text-slate-700' : good ? 'bg-positive-soft text-positive' : 'bg-negative-soft text-negative';
  const arrow = dir === 'up' ? '▲' : dir === 'down' ? '▼' : '▬';
  const sign = dir === 'up' ? '+' : dir === 'down' ? '−' : '';
  const word = dir === 'flat' ? 'no change' : dir === 'up' ? 'up' : 'down';
  const verdict = good === null ? '' : good ? ', favourable' : ', unfavourable';
  return (
    <span className={`tabular inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-semibold ${tone}`} title={`${word}${verdict}`}>
      <span aria-hidden className="text-[9px] leading-none">
        {arrow}
      </span>
      {sign}
      {pctFmt.format(Math.abs(pct))}%<span className="sr-only"> {word}{verdict}</span>
    </span>
  );
}

const SERIES_BG = {
  spend: 'bg-spend',
  'meta-leads': 'bg-meta-leads',
  'excel-leads': 'bg-excel-leads',
  'operator-sales': 'bg-operator-sales',
  'paid-sales': 'bg-paid-sales',
  'meta-value': 'bg-meta-value',
} as const;

export function KpiCard({
  label,
  value,
  sub,
  delta,
  comparison,
  sparkline,
  size = 'secondary',
  state = 'ok',
  reason,
  note,
  series,
}: {
  label: string;
  value?: ReactNode;
  sub?: ReactNode;
  delta?: { pct: number | null; goodWhen?: GoodWhen };
  comparison?: string;
  sparkline?: ReactNode;
  size?: 'primary' | 'secondary';
  state?: 'ok' | 'no_data' | 'no_calc';
  reason?: ReactNode;
  note?: ReactNode;
  series?: keyof typeof SERIES_BG;
}) {
  const primary = size === 'primary';
  const missing = state !== 'ok';
  return (
    <div className={`card ${primary ? 'px-4 py-4 sm:px-5' : 'px-4 py-3.5'}`}>
      <div className="flex items-center text-xs font-medium text-ink-3">
        {series && <span aria-hidden className={`mr-1.5 h-2.5 w-2.5 shrink-0 rounded-[3px] ${SERIES_BG[series]}`} />}
        <span className="min-w-0 truncate">{label}</span>
        {note && <InfoTip title={label} text={note} />}
      </div>
      <div className="mt-2 flex items-end justify-between gap-2">
        <div className="min-w-0">
          {missing ? (
            <div className={`tabular font-bold leading-none text-slate-300 ${primary ? 'text-2xl sm:text-3xl' : 'text-xl'}`} aria-label={state === 'no_calc' ? 'not calculated' : 'no data'}>
              —
            </div>
          ) : (
            <div className={`kpi-value truncate ${primary ? 'kpi-value-lg' : ''}`}>{value}</div>
          )}
        </div>
        {!missing && sparkline && <div className="h-8 w-16 shrink-0 sm:w-20">{sparkline}</div>}
      </div>
      {missing ? (
        <p className="mt-1.5 text-xs text-slate-600">{reason ?? (state === 'no_calc' ? 'Not calculated' : 'No data')}</p>
      ) : (
        <>
          {delta && (
            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
              <DeltaBadge pct={delta.pct} goodWhen={delta.goodWhen} />
              {comparison && delta.pct !== null && <span className="text-slate-500">{comparison}</span>}
            </div>
          )}
          {sub && <div className="mt-1.5 text-xs leading-snug text-slate-600">{sub}</div>}
        </>
      )}
    </div>
  );
}

export function StatList({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <dl className={`divide-y divide-line ${className}`}>{children}</dl>;
}

/** Label–value row. value null renders a grey dash (no data), never 0. */
export function StatRow({ label, value, hint, marker, strong }: { label: ReactNode; value: ReactNode; hint?: ReactNode; marker?: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2">
      <dt className="flex min-w-0 items-center gap-1.5 text-xs text-ink-3">
        {marker && <span aria-hidden className="h-2 w-2 shrink-0 rounded-[2px]" style={{ background: marker }} />}
        <span className="min-w-0">{label}</span>
        {hint && <span className="text-slate-500">{hint}</span>}
      </dt>
      <dd className={`tabular shrink-0 text-right text-sm ${strong ? 'font-semibold text-slate-900' : 'text-slate-800'}`}>
        {value === null || value === undefined ? <span className="text-slate-300">—</span> : value}
      </dd>
    </div>
  );
}

/* In-page navigation ------------------------------------------------------------------- */

const segCls = (active: boolean) =>
  `whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
    active ? 'bg-white text-ink shadow-[0_1px_2px_rgb(16_24_40/0.1),0_0_0_1px_rgb(16_24_40/0.04)]' : 'text-ink-3 hover:text-ink'
  }`;

/** Segmented switch (e.g. Daily / Monthly, Cards / Table). */
export function Segmented<T extends string>(props: { value: T; options: readonly { value: T; label: ReactNode }[]; onChange: (v: T) => void; label: string; size?: 'sm' | 'md' }) {
  return (
    <div role="group" aria-label={props.label} className="no-scrollbar inline-flex max-w-full overflow-x-auto rounded-lg bg-slate-100 p-0.5 ring-1 ring-inset ring-slate-200/70">
      {props.options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={o.value === props.value}
          className={`${segCls(o.value === props.value)} ${props.size === 'sm' ? '!px-2.5 !py-1' : ''}`}
          onClick={() => props.onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Underlined tabs. */
export function Tabs<T extends string>(props: { value: T; options: readonly { value: T; label: ReactNode }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="tablist" aria-label={props.label} className="no-scrollbar -mb-px flex gap-5 overflow-x-auto border-b border-slate-200">
      {props.options.map((o) => {
        const on = o.value === props.value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => props.onChange(o.value)}
            className={`whitespace-nowrap border-b-2 pb-2 pt-1 text-sm ${on ? 'border-brand font-semibold text-ink' : 'border-transparent font-medium text-ink-3 hover:border-slate-300 hover:text-ink'}`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Removable filter chip / toggle chip. */
export function Chip({ active, onClick, children, title }: { active?: boolean; onClick?: () => void; children: ReactNode; title?: string }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      title={title}
      onClick={onClick}
      className={`inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 text-xs font-medium transition-colors ${
        active ? 'border-brand/40 bg-brand-soft text-brand' : 'border-line-strong bg-white text-ink-2 hover:border-slate-400'
      }`}
    >
      {children}
    </button>
  );
}

export const inputCls =
  'h-8 min-w-0 rounded-lg border border-line-strong bg-white px-2.5 text-sm text-ink-2 outline-none transition-colors hover:border-slate-400 focus:border-brand focus:ring-2 focus:ring-brand/15';

/* Shares ------------------------------------------------------------------------------- */

export function ProgressBar({ value, max = 100, color = 'var(--color-brand)', label }: { value: number; max?: number; color?: string; label?: string }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

export function ShareBar({ parts, label }: { parts: { label: string; value: number; color: string }[]; label?: string }) {
  const total = parts.reduce((a, p) => a + Math.max(0, p.value), 0);
  return (
    <div role="img" aria-label={label ?? parts.map((p) => `${p.label} ${p.value}`).join(', ')} className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full bg-slate-100">
      {total > 0 &&
        parts
          .filter((p) => p.value > 0)
          .map((p) => <div key={p.label} title={p.label} style={{ width: `${(p.value / total) * 100}%`, background: p.color }} className="h-full first:rounded-l-full last:rounded-r-full" />)}
    </div>
  );
}

/* Messages ----------------------------------------------------------------------------- */

const NOTICE = {
  amber: { box: 'border-amber-200/80 bg-warn-soft/70', icon: 'text-amber-700', title: 'text-amber-950', body: 'text-amber-950/90', word: 'Warning', path: 'M12 8v5M12 16.5v.01M10.3 4.2 2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0z' },
  red: { box: 'border-red-200/80 bg-negative-soft/70', icon: 'text-negative', title: 'text-red-950', body: 'text-red-950/90', word: 'Error', path: 'M12 8v5M12 16.5v.01M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z' },
  blue: { box: 'border-blue-200/70 bg-brand-soft/70', icon: 'text-brand', title: 'text-blue-950', body: 'text-blue-950/90', word: 'Information', path: 'M12 11v5M12 7.5v.01M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z' },
  gray: { box: 'border-line bg-slate-50', icon: 'text-slate-500', title: 'text-ink', body: 'text-ink-2', word: 'Note', path: 'M12 11v5M12 7.5v.01M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z' },
  green: { box: 'border-green-200/80 bg-positive-soft/70', icon: 'text-positive', title: 'text-green-950', body: 'text-green-950/90', word: 'Success', path: 'M8 12.5l2.7 2.7L16 9.5M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z' },
} as const;
const NOTICE_ALIAS = { info: 'blue', warn: 'amber', error: 'red', success: 'green' } as const;

export function Notice({ tone = 'amber', title, children }: { tone?: keyof typeof NOTICE | keyof typeof NOTICE_ALIAS; title?: ReactNode; children: ReactNode }) {
  const key: keyof typeof NOTICE = tone in NOTICE_ALIAS ? NOTICE_ALIAS[tone as keyof typeof NOTICE_ALIAS] : (tone as keyof typeof NOTICE);
  const n = NOTICE[key];
  return (
    <div className={`flex items-start gap-3 rounded-xl border px-3.5 py-3 text-sm leading-snug ${n.box}`}>
      <svg aria-hidden viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={`mt-px shrink-0 ${n.icon}`}>
        <path d={n.path} />
      </svg>
      <div className={`min-w-0 flex-1 ${n.body}`}>
        <span className="sr-only">{n.word}: </span>
        {title && <p className={`mb-0.5 font-semibold ${n.title}`}>{title}</p>}
        {children}
      </div>
    </div>
  );
}

/** Renders a value or the "no data" dash with an explanatory tooltip. */
export function Value(props: { text: string; reason?: string }) {
  if (props.text === NO_DATA) {
    return (
      <span className="text-slate-400" title={props.reason ?? 'No data for this period'}>
        {NO_DATA}
      </span>
    );
  }
  return <>{props.text}</>;
}

export function EmptyState({ title, children, action, icon }: { title: string; children?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="rounded-card border border-dashed border-line-strong bg-slate-50/60 px-6 py-10 text-center">
      <div aria-hidden className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-white text-ink-3 shadow-card ring-1 ring-line">
        {icon ?? (
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 20V4M4 20h16M8 16v-5M12 16V8M16 16v-3" />
          </svg>
        )}
      </div>
      <p className="text-sm font-semibold text-ink">{title}</p>
      {children && <div className="mx-auto mt-1.5 max-w-md text-xs leading-relaxed text-slate-600">{children}</div>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

/* Overlays ----------------------------------------------------------------------------- */

/** Accessible modal dialog. Escape and the backdrop close it. */
export function Dialog(props: { open: boolean; title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!props.open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && props.onClose();
    window.addEventListener('keydown', onKey);
    ref.current?.querySelector<HTMLElement>('input,select,textarea,button')?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [props.open, props.onClose]);
  if (!props.open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 sm:items-center sm:p-6" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div
        className={`flex max-h-[92vh] w-full flex-col rounded-t-2xl bg-white shadow-pop sm:rounded-2xl ${props.wide ? 'sm:max-w-5xl' : 'sm:max-w-lg'}`}
        role="dialog"
        aria-modal="true"
        aria-label={props.title}
        ref={ref}
      >
        <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
          <h2 className="text-[15px] font-semibold tracking-tight text-ink">{props.title}</h2>
          <button type="button" className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100" aria-label="Close" onClick={props.onClose}>
            <svg aria-hidden viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{props.children}</div>
        {props.footer && <footer className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3">{props.footer}</footer>}
      </div>
    </div>
  );
}

/** Banner stating that an action is simulated. Required wording. */
export function SimulationNotice() {
  return (
    <Notice tone="amber" title="Demo simulation">
      No real advertising account is affected.
    </Notice>
  );
}
