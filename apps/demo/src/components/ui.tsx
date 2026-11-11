// Shared UI primitives. API is stable; the dashboard/UI workstream owns the styling (ui.css).
import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { NO_DATA } from '../lib/format';
import './ui.css';

export function Card(props: { title?: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; id?: string }) {
  return (
    <section className={`card ${props.className ?? ''}`} id={props.id}>
      {(props.title || props.actions) && (
        <header className="card-head">
          <div>
            {props.title && <h3 className="card-title">{props.title}</h3>}
            {props.subtitle && <p className="card-sub">{props.subtitle}</p>}
          </div>
          {props.actions && <div className="card-actions">{props.actions}</div>}
        </header>
      )}
      {props.children}
    </section>
  );
}

export function PageHeader(props: { title: ReactNode; description?: ReactNode; actions?: ReactNode; badge?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        <h1 className="page-title">
          {props.title} {props.badge}
        </h1>
        {props.description && <p className="page-desc">{props.description}</p>}
      </div>
      {props.actions && <div className="page-actions">{props.actions}</div>}
    </div>
  );
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
export function Button({ variant = 'secondary', size, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' }) {
  return <button type="button" className={`btn btn-${variant} ${size === 'sm' ? 'btn-sm' : ''} ${className ?? ''}`} {...rest} />;
}

export type Tone = 'neutral' | 'meta' | 'google' | 'combined' | 'good' | 'bad' | 'warn' | 'info';
export function Badge(props: { tone?: Tone; children: ReactNode; title?: string }) {
  return (
    <span className={`badge badge-${props.tone ?? 'neutral'}`} title={props.title}>
      {props.children}
    </span>
  );
}

/** Renders a value or the "no data" dash with an explanatory tooltip. */
export function Value(props: { text: string; reason?: string }) {
  if (props.text === NO_DATA) {
    return (
      <span className="no-data" title={props.reason ?? 'No data for this period'}>
        {NO_DATA}
      </span>
    );
  }
  return <>{props.text}</>;
}

export function EmptyState(props: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <strong>{props.title}</strong>
      {props.children && <div>{props.children}</div>}
    </div>
  );
}

export function Segmented<T extends string>(props: { value: T; options: readonly { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="segmented" role="group" aria-label={props.label}>
      {props.options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === props.value} className={o.value === props.value ? 'on' : ''} onClick={() => props.onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

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
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className={`dialog ${props.wide ? 'dialog-wide' : ''}`} role="dialog" aria-modal="true" aria-label={props.title} ref={ref}>
        <header className="dialog-head">
          <h2>{props.title}</h2>
          <button type="button" className="icon-btn" aria-label="Close" onClick={props.onClose}>
            ×
          </button>
        </header>
        <div className="dialog-body">{props.children}</div>
        {props.footer && <footer className="dialog-foot">{props.footer}</footer>}
      </div>
    </div>
  );
}

/** Banner stating that an action is simulated. Required wording. */
export function SimulationNotice() {
  return <div className="sim-notice">Demo simulation — no real advertising account is affected.</div>;
}
