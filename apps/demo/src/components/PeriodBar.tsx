// Period selector card shown at the top of data pages, as in the product. Optional secondary filters go in `children`.
import { useEffect, useState, type ReactNode } from 'react';
import { HISTORY_START, LAST_COMPLETE_DAY, PERIOD_BAR, useAppState } from '../state/AppState';
import { date } from '../lib/format';
import { inputCls } from './ui';

const seg = (active: boolean) =>
  `whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
    active ? 'bg-white text-ink shadow-[0_1px_2px_rgb(16_24_40/0.1),0_0_0_1px_rgb(16_24_40/0.04)]' : 'text-ink-3 hover:text-ink'
  }`;

export function PeriodBar({ children, right }: { children?: ReactNode; right?: ReactNode }) {
  const { period, setPeriod, range } = useAppState();
  const [custom, setCustom] = useState(period.custom ?? range ?? { start: HISTORY_START, end: LAST_COMPLETE_DAY });
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (period.preset !== 'custom' && range) setCustom(range);
  }, [period.preset, range]);
  const isCustom = period.preset === 'custom';
  const valid = custom.start && custom.end && custom.start <= custom.end && custom.start >= HISTORY_START && custom.end <= LAST_COMPLETE_DAY;

  return (
    <div className="card px-3 py-2.5" data-testid="period-bar">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div role="group" aria-label="Period" className="no-scrollbar inline-flex max-w-full gap-0.5 overflow-x-auto rounded-lg bg-slate-100 p-0.5 ring-1 ring-inset ring-slate-200/70">
          {PERIOD_BAR.map((p) => (
            <button key={p.key} type="button" aria-pressed={period.preset === p.key} className={seg(period.preset === p.key)} onClick={() => setPeriod({ preset: p.key, custom: null })}>
              {p.label}
            </button>
          ))}
          <button type="button" aria-pressed={isCustom} className={seg(isCustom)} onClick={() => setPeriod({ preset: 'custom', custom })}>
            Custom
          </button>
        </div>
        <span className="text-xs tabular-nums text-ink-3" data-testid="filter-range">
          {range ? (range.start === range.end ? date(range.start, { year: true }) : `${date(range.start, { year: true })} – ${date(range.end, { year: true })}`) : 'No completed days'}
        </span>
        {isCustom && (
          <div className="flex min-w-0 flex-wrap items-center gap-1">
            <input type="date" aria-label="From date" className={inputCls} min={HISTORY_START} max={LAST_COMPLETE_DAY} value={custom.start} onChange={(e) => setCustom((c) => ({ ...c, start: e.target.value }))} />
            <span className="text-slate-400">–</span>
            <input type="date" aria-label="To date" className={inputCls} min={HISTORY_START} max={LAST_COMPLETE_DAY} value={custom.end} onChange={(e) => setCustom((c) => ({ ...c, end: e.target.value }))} />
            <button type="button" className="btn btn-primary btn-sm h-8" disabled={!valid} onClick={() => valid && setPeriod({ preset: 'custom', custom })}>
              Apply
            </button>
          </div>
        )}
        {children && (
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line-strong px-2.5 text-xs font-semibold text-ink-2 hover:border-slate-400 lg:hidden"
          >
            Filters
          </button>
        )}
        {right && <div className="ml-auto flex items-center gap-2">{right}</div>}
      </div>
      {children && <div className={`${open ? 'grid' : 'hidden'} mt-2 grid-cols-2 gap-2 border-t border-line pt-2.5 lg:flex lg:flex-wrap lg:items-center`}>{children}</div>}
    </div>
  );
}
