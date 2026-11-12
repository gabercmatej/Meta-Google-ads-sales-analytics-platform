import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import type { ChartOptions } from './ChartHost';

export interface ChartDialogProps {
  title: string;
  headline: ReactNode;
  periodLine: ReactNode;
  /** Daily/Monthly control, rendered by the card so it shares state with the page. */
  granularity: ReactNode;
  metrics?: { options: readonly { value: string; label: string }[]; value: string; onChange: (v: string) => void };
  options: ChartOptions;
  onOptions: (o: ChartOptions) => void;
  /** Lines can be drawn as bars only when every series is a plain line. */
  canUseBars: boolean;
  showTable: boolean;
  onShowTable: (v: boolean) => void;
  chart: ReactNode;
  table: ReactNode;
  how: string;
  note?: ReactNode;
  bodyRef: RefObject<HTMLDivElement | null>;
  busy: boolean;
  status: string | null;
  onPrint: () => void;
  onPdf: () => void;
  onClose: () => void;
}

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
const btn = 'inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold transition-colors';

/** Expanded chart: larger plot, controls, calculation note and values table. Esc closes, Tab stays inside. */
export function ChartDialog(p: ChartDialogProps) {
  const root = useRef<HTMLDivElement>(null);
  const [customize, setCustomize] = useState(false);
  const { onClose } = p;

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    root.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    return () => opener?.focus?.();
  }, []);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'Tab' || !root.current) return;
    const items = [...root.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null || el === document.activeElement);
    if (items.length === 0) return;
    const first = items[0]!;
    const last = items[items.length - 1]!;
    if (e.shiftKey && (document.activeElement === first || !root.current.contains(document.activeElement))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const check = (label: string, on: boolean, set: (v: boolean) => void, disabled = false) => (
    <label className={`flex items-center gap-2 text-sm ${disabled ? 'opacity-50' : ''}`}>
      <input type="checkbox" className="h-4 w-4 rounded border-line-strong" checked={on} disabled={disabled} onChange={(e) => set(e.target.checked)} />
      {label}
    </label>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 sm:items-center sm:p-5" onMouseDown={(e) => e.target === e.currentTarget && onClose()} data-print-hide>
      <div ref={root} role="dialog" aria-modal="true" aria-label={p.title} onKeyDown={onKeyDown} className="flex max-h-[94vh] w-full flex-col rounded-t-2xl bg-white shadow-pop sm:max-w-6xl sm:rounded-2xl">
        <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-3.5">
          <div className="min-w-0">
            <h2 className="flex flex-wrap items-baseline gap-x-2 text-[16px] font-semibold tracking-tight text-ink">
              {p.title}
              {p.headline}
            </h2>
            <div className="mt-0.5 text-xs text-ink-3">{p.periodLine}</div>
          </div>
          <button type="button" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100" aria-label="Close" onClick={onClose}>
            <svg aria-hidden viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </header>

        <div ref={p.bodyRef} className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {p.granularity}
            {p.metrics && (
              <label className="flex items-center gap-1.5 text-xs text-ink-3">
                Metric
                <select
                  className="h-8 rounded-lg border border-line bg-white px-2 text-sm text-ink"
                  value={p.metrics.value}
                  onChange={(e) => p.metrics!.onChange(e.target.value)}
                  data-autofocus
                >
                  {p.metrics.options.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <button type="button" className={`${btn} ml-auto border border-line text-ink-2 hover:bg-slate-50`} aria-expanded={customize} onClick={() => setCustomize((v) => !v)}>
              Customize
            </button>
          </div>
          {customize && (
            <div className="mb-3 flex flex-wrap gap-x-6 gap-y-2 rounded-lg border border-line bg-slate-50 px-4 py-3" role="group" aria-label="Customize chart">
              {check('Grid lines', p.options.grid, (v) => p.onOptions({ ...p.options, grid: v }))}
              {check('Values table', p.showTable, p.onShowTable)}
              {check('Draw lines as bars', p.options.bars && p.canUseBars, (v) => p.onOptions({ ...p.options, bars: v }), !p.canUseBars)}
            </div>
          )}

          {p.chart}
          {p.note && <div className="mt-3 text-xs leading-snug text-ink-3">{p.note}</div>}

          <section className="mt-5" aria-labelledby="chart-how">
            <h3 id="chart-how" className="text-sm font-semibold text-ink">
              How it is calculated
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-ink-2">{p.how}</p>
          </section>

          {p.showTable && (
            <section className="mt-5" aria-label="Values">
              <h3 className="mb-1 text-sm font-semibold text-ink">Values</h3>
              <div className="max-h-72 overflow-auto rounded-lg border border-line">{p.table}</div>
            </section>
          )}
        </div>

        <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-3">
          {p.status && (
            <span className="mr-auto text-xs text-ink-3" role="status">
              {p.status}
            </span>
          )}
          <button type="button" className={`${btn} border border-line text-ink hover:bg-slate-50`} onClick={p.onPrint}>
            Print
          </button>
          <button type="button" className={`${btn} border border-line text-ink hover:bg-slate-50 disabled:opacity-60`} onClick={p.onPdf} disabled={p.busy}>
            {p.busy ? 'Preparing PDF…' : 'Save PDF'}
          </button>
          <button type="button" className={`${btn} bg-slate-900 text-white hover:bg-slate-800`} onClick={onClose}>
            Close
          </button>
        </footer>
      </div>
    </div>
  );
}
