import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Dialog } from '../ui';
import { useAppState, PLATFORM_LABELS } from '../../state/AppState';
import { dateRange } from '../../lib/format';
import type { Granularity } from '@sedem-ads/analytics-core';

export interface ChartRenderOptions {
  expanded: boolean;
  print: boolean;
  height: number;
  fixedWidth?: number;
}

export interface ChartCardProps {
  title: string;
  subtitle?: ReactNode;
  /** Period total shown next to the title, e.g. "€12,345.00". */
  total?: ReactNode;
  totalLabel?: string;
  /** Render the chart for the requested size. */
  render: (o: ChartRenderOptions) => ReactNode;
  /** Hide the Daily/Monthly toggle for charts that do not depend on granularity. */
  hideGranularity?: boolean;
  /** Footnote under the chart (partial/missing-day notes, definitions). */
  note?: ReactNode;
  className?: string;
}

const GRANULARITY: readonly { value: Granularity; label: string }[] = [
  { value: 'daily', label: 'Daily' },
  { value: 'monthly', label: 'Monthly' },
];

const iconBtn = 'inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-ink';
const seg = (on: boolean) =>
  `whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-semibold transition-colors ${on ? 'bg-white text-ink shadow-[0_1px_2px_rgb(16_24_40/0.1),0_0_0_1px_rgb(16_24_40/0.04)]' : 'text-ink-3 hover:text-ink'}`;

function Glyph({ d }: { d: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

function GranularityToggle({ className = '' }: { className?: string }) {
  const { granularity, setGranularity } = useAppState();
  return (
    <div role="group" aria-label="Show chart by day or month" className={`inline-flex shrink-0 gap-0.5 rounded-lg bg-slate-100 p-0.5 ring-1 ring-inset ring-slate-200/70 ${className}`} data-testid="granularity-toggle">
      {GRANULARITY.map((g) => (
        <button key={g.value} type="button" aria-pressed={granularity === g.value} className={seg(granularity === g.value)} onClick={() => setGranularity(g.value)}>
          {g.label}
        </button>
      ))}
    </div>
  );
}

/** Chart card as in the product: title + period total, period line, Daily/Monthly, zoom and print icons. */
export function ChartCard(props: ChartCardProps) {
  const { granularity, range, platform } = useAppState();
  const [expanded, setExpanded] = useState(false);
  const [printing, setPrinting] = useState(false);
  const close = useCallback(() => setExpanded(false), []);
  const period = dateRange(range);

  useEffect(() => {
    if (!printing) return;
    const done = () => {
      document.body.classList.remove('printing-chart');
      setPrinting(false);
    };
    window.addEventListener('afterprint', done);
    const t = window.setTimeout(() => {
      document.body.classList.add('printing-chart');
      try {
        window.print();
      } finally {
        // Some browsers return from print() before afterprint fires; either path cleans up once.
        window.setTimeout(done, 0);
      }
    }, 60);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('afterprint', done);
      document.body.classList.remove('printing-chart');
    };
  }, [printing]);

  const headline =
    props.total !== undefined ? (
      <span className="tabular text-xs font-medium text-ink-2" data-testid="chart-headline">
        {props.totalLabel ? `${props.totalLabel}: ` : ''}
        <span className="font-semibold text-ink">{props.total}</span>
      </span>
    ) : null;
  const note = props.note ? <div className="mt-3 text-xs leading-snug text-ink-3">{props.note}</div> : null;

  return (
    <figure className={`card chart-card m-0 flex min-w-0 flex-col ${props.className ?? ''}`}>
      <div className="chart-pad flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5 px-4 pb-1 pt-4 sm:px-5">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <h3 className="text-[15px] font-semibold leading-5 tracking-tight text-ink">{props.title}</h3>
            {headline}
          </div>
          <div className="mt-0.5 text-xs leading-snug text-ink-3">
            {period}
            {props.subtitle ? <> · {props.subtitle}</> : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-0.5" data-print-hide>
          {!props.hideGranularity && <GranularityToggle className="mr-1" />}
          <button type="button" className={iconBtn} onClick={() => setExpanded(true)} aria-label={`Expand chart: ${props.title}`} title="Expand">
            <Glyph d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7" />
          </button>
          <button type="button" className={iconBtn} onClick={() => setPrinting(true)} aria-label={`Print chart: ${props.title}`} title="Print / save as PDF">
            <Glyph d="M7 9V4h10v5M7 17H5v-6h14v6h-2M7 14h10v6H7z" />
          </button>
        </div>
      </div>
      <div className="chart-pad min-w-0 flex-1 px-4 pb-4 pt-3 sm:px-5">
        {props.render({ expanded: false, print: false, height: 280 })}
        {note}
      </div>

      <Dialog
        open={expanded}
        onClose={close}
        wide
        title={props.title}
      >
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs text-ink-3">
            {headline}
            {headline ? ' · ' : ''}
            {period}
            {props.subtitle ? <> · {props.subtitle}</> : null}
          </div>
          <div className="flex items-center gap-1">
            {!props.hideGranularity && <GranularityToggle />}
            <button type="button" className={iconBtn} onClick={() => setPrinting(true)} aria-label={`Print chart: ${props.title}`} title="Print / save as PDF">
              <Glyph d="M7 9V4h10v5M7 17H5v-6h14v6h-2M7 14h10v6H7z" />
            </button>
          </div>
        </div>
        {expanded && props.render({ expanded: true, print: false, height: 420 })}
        {note}
      </Dialog>

      {printing &&
        createPortal(
          <div className="print-sheet" aria-hidden="true">
            <h2 className="text-xl font-semibold text-black">{props.title}</h2>
            <p className="mt-1 text-sm text-black">
              {PLATFORM_LABELS[platform]} · {period} · {granularity === 'daily' ? 'Daily' : 'Monthly'} · Demo data, not real business results
            </p>
            {props.total !== undefined && (
              <p className="mt-1 text-sm text-black">
                {props.totalLabel ?? 'Period total'}: <strong>{props.total}</strong>
              </p>
            )}
            <div className="mt-4">{props.render({ expanded: true, print: true, height: 420, fixedWidth: 1000 })}</div>
            {note}
          </div>,
          document.body,
        )}
    </figure>
  );
}
