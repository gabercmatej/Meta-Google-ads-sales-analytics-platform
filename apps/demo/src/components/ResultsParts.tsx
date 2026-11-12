// Small building blocks shared by the Sales, Leads and Attribution pages.
import { useId, useState, type ReactNode } from 'react';

export const th = 'whitespace-nowrap px-4 py-2.5 text-left text-xs font-medium text-ink-3';
export const thr = `${th} !text-right`;
export const td = 'whitespace-nowrap border-t border-line px-4 py-2.5 text-[13px] text-ink-2';
export const tdr = `${td} tabular text-right`;
export const tdw = 'border-t border-line px-4 py-2.5 text-[13px] text-ink-2';

/** Coloured square + label, as in the legend pills of the product's charts. */
export function Pill({ color, children }: { color: string; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-line-strong bg-white px-2.5 py-1 text-xs font-medium text-ink-2">
      <span aria-hidden className="h-2.5 w-2.5 rounded-[3px]" style={{ background: color }} />
      {children}
    </span>
  );
}

/** Collapsible block (native details/summary behaviour with state so it is testable). */
export function Collapsible({ title, children, defaultOpen = false, hint }: { title: ReactNode; children: ReactNode; defaultOpen?: boolean; hint?: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <section className="card min-w-0">
      <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)} className="flex w-full items-center justify-between gap-3 rounded-card px-4 py-3.5 text-left sm:px-5">
        <span className="min-w-0">
          <span className="block text-[15px] font-semibold text-ink">{title}</span>
          {hint && <span className="mt-0.5 block text-xs text-ink-3">{hint}</span>}
        </span>
        <svg aria-hidden viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}>
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div id={id} className="border-t border-line">
          {children}
        </div>
      )}
    </section>
  );
}

/** Neutral gray info line with an (i) icon. Never yellow. */
export function InfoLine({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-snug text-ink-3">
      <svg aria-hidden viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="mt-px shrink-0 text-slate-400">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v5M12 8h.01" />
      </svg>
      <span className="min-w-0">{children}</span>
    </p>
  );
}

export function CardTable({ children }: { children: ReactNode }) {
  return <div className="overflow-x-auto">{children}</div>;
}
