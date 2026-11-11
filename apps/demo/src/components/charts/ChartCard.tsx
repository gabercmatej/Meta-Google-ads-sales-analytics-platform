import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Button, Dialog, Segmented } from '../ui';
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
  /** Period total shown in the header, e.g. "€12,345.00". */
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

/** Card with title, period total, global Daily/Monthly toggle, Expand dialog and Export / Print. */
export function ChartCard(props: ChartCardProps) {
  const { granularity, setGranularity, range, platform } = useAppState();
  const [expanded, setExpanded] = useState(false);
  const [printing, setPrinting] = useState(false);
  const close = useCallback(() => setExpanded(false), []);

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

  return (
    <section className={`card chart-card ${props.className ?? ''}`}>
      <header className="card-head chart-head">
        <div className="chart-head-main">
          <h3 className="card-title">{props.title}</h3>
          {props.subtitle && <p className="card-sub">{props.subtitle}</p>}
          {props.total !== undefined && (
            <p className="chart-total">
              <span className="chart-total-label">{props.totalLabel ?? 'Period total'}</span> <strong className="num">{props.total}</strong>
            </p>
          )}
        </div>
        <div className="chart-tools">
          {!props.hideGranularity && <Segmented label={`${props.title} granularity`} value={granularity} options={GRANULARITY} onChange={setGranularity} />}
          <Button size="sm" onClick={() => setExpanded(true)} aria-label={`Expand ${props.title}`}>
            Expand
          </Button>
          <Button size="sm" onClick={() => setPrinting(true)} aria-label={`Export or print ${props.title}`}>
            Export / Print
          </Button>
        </div>
      </header>
      {props.render({ expanded: false, print: false, height: 280 })}
      {props.note && <div className="chart-note">{props.note}</div>}

      <Dialog open={expanded} onClose={close} title={props.title} wide>
        {props.total !== undefined && (
          <p className="chart-total">
            <span className="chart-total-label">{props.totalLabel ?? 'Period total'}</span> <strong className="num">{props.total}</strong>
          </p>
        )}
        {props.render({ expanded: true, print: false, height: 420 })}
        {props.note && <div className="chart-note">{props.note}</div>}
      </Dialog>

      {printing &&
        createPortal(
          <div className="print-sheet" aria-hidden="true">
            <h2>{props.title}</h2>
            <p>
              {PLATFORM_LABELS[platform]} · {dateRange(range)} · {granularity === 'daily' ? 'Daily' : 'Monthly'} · Demo data, not real business results
            </p>
            {props.total !== undefined && (
              <p>
                {props.totalLabel ?? 'Period total'}: <strong>{props.total}</strong>
              </p>
            )}
            {props.render({ expanded: true, print: true, height: 420, fixedWidth: 1000 })}
            {props.note && <div className="chart-note">{props.note}</div>}
          </div>,
          document.body,
        )}
    </section>
  );
}
