import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useAppState, PLATFORM_LABELS } from '../../state/AppState';
import { dateRange } from '../../lib/format';
import { saveChartPdf } from '../../lib/chartPdf';
import type { Granularity } from '@sedem-ads/analytics-core';
import { ChartHostProvider, ChartRoleScope, useChartHost, type ChartModel, type ChartOptions } from './ChartHost';
import { ChartDialog } from './ChartDialog';
import { DEFAULT_HOW_CALCULATED, ValuesTable, valueRows } from './ChartValues';

export interface ChartRenderOptions {
  expanded: boolean;
  print: boolean;
  height: number;
  fixedWidth?: number;
  /** Selected metric when the card offers several (see `metrics`). */
  metric?: string;
  /** Daily or monthly buckets for this rendering. */
  granularity: Granularity;
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
  /** Metrics offered in the expanded view; the first one is the card's own metric. */
  metrics?: readonly { value: string; label: string }[];
  /** Plain-text explanation shown under "How it is calculated". */
  howCalculated?: string;
  /** Scope line after the period; defaults to the selected platform. */
  scope?: string;
  /**
   * "spark": no card chrome; `trigger` (a KPI sparkline) is rendered as one button that opens the same
   * dialog. The dialog then has its own Daily/Monthly switch (the sparkline itself stays daily).
   */
  variant?: 'card' | 'spark';
  trigger?: ReactNode;
  /** Monthly view unavailable (e.g. a ratio without numerator/denominator); shown instead of the toggle. */
  monthlyUnavailable?: string;
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

function GranularityToggle({ className = '', value, onChange }: { className?: string; value?: Granularity; onChange?: (g: Granularity) => void }) {
  const app = useAppState();
  const granularity = value ?? app.granularity;
  const setGranularity = onChange ?? app.setGranularity;
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

/** Clicks on these never open the dialog (they have their own action). */
const INTERACTIVE = 'button,a,input,select,textarea,label,[role="button"],[role="tooltip"]';

/** Chart card as in the product: title + period total, period line, Daily/Monthly, expand and print icons. */
export function ChartCard(props: ChartCardProps) {
  const app = useAppState();
  const { range, platform } = app;
  const spark = props.variant === 'spark';
  const [ownGranularity, setOwnGranularity] = useState<Granularity>('daily');
  const granularity: Granularity = spark ? (props.monthlyUnavailable ? 'daily' : ownGranularity) : app.granularity;
  const [expanded, setExpanded] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set());
  const [options, setOptions] = useState<ChartOptions>({ grid: true, bars: false });
  const [showTable, setShowTable] = useState(true);
  const [metric, setMetric] = useState<string | undefined>(props.metrics?.[0]?.value);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setExpanded(false), []);
  const period = dateRange(range);
  const scope = props.scope ?? PLATFORM_LABELS[platform];
  const granLabel = granularity === 'daily' ? 'Daily' : 'Monthly';
  const defaultMetric = props.metrics?.[0]?.value;
  const metricChanged = metric !== undefined && metric !== defaultMetric;

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
    }, 120);
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
  const periodText = (
    <>
      {period} · {scope}
      {props.subtitle ? <> · {props.subtitle}</> : null}
    </>
  );
  const how = props.howCalculated ? `${props.howCalculated} ${DEFAULT_HOW_CALCULATED}` : DEFAULT_HOW_CALCULATED;
  const periodHead = granularity === 'daily' ? 'Day' : 'Month';

  const savePdf = async (models: Partial<Record<string, ChartModel>>) => {
    const model = models.dialog ?? models.card;
    if (!model || !range) return;
    setBusy(true);
    setStatus(null);
    try {
      const { head, rows, colors } = valueRows(model, hidden);
      const metricLabel = metricChanged ? props.metrics?.find((m) => m.value === metric)?.label : undefined;
      const fileName = await saveChartPdf({
        title: metricLabel ? `${props.title} - ${metricLabel}` : props.title,
        from: range.start,
        to: range.end,
        periodText: period,
        scope,
        granularity: granLabel,
        headline: !metricChanged && props.total !== undefined && typeof props.total !== 'object' ? `${props.totalLabel ?? 'Period total'}: ${String(props.total)}` : undefined,
        howCalculated: how,
        series: head.map((label, i) => ({ label, color: colors[i]! })),
        rows,
        svg: bodyRef.current?.querySelector<SVGSVGElement>('[data-chart-plot] svg.recharts-surface') ?? null,
      });
      setStatus(`Saved ${fileName}`);
    } catch {
      setStatus('Could not create the PDF in this browser.');
    } finally {
      setBusy(false);
    }
  };

  const toggle = props.hideGranularity ? null : spark ? (
    props.monthlyUnavailable ? (
      <span className="text-xs text-ink-3">{props.monthlyUnavailable}</span>
    ) : (
      <GranularityToggle value={ownGranularity} onChange={setOwnGranularity} />
    )
  ) : (
    <GranularityToggle />
  );
  /** Click anywhere on the plot opens the dialog; legend pills and other controls keep their own action. */
  const onSurfaceClick = (e: React.MouseEvent) => {
    const t = e.target as Element;
    if (!(e.currentTarget as Element).contains(t) || t.closest(INTERACTIVE)) return;
    setExpanded(true);
  };

  const overlays = (models: Partial<Record<string, ChartModel>>) => (
    <>
      {expanded &&
        createPortal(
          <ChartRoleScope value="dialog">
            <ChartDialog
              title={props.title}
              headline={metricChanged ? null : headline}
              periodLine={periodText}
              granularity={toggle}
              metrics={props.metrics && props.metrics.length > 1 && metric ? { options: props.metrics, value: metric, onChange: setMetric } : undefined}
              options={options}
              onOptions={setOptions}
              canUseBars={!!(models.dialog ?? models.card)?.series.every((s) => (s.kind ?? 'line') === 'line')}
              showTable={showTable}
              onShowTable={setShowTable}
              chart={props.render({ expanded: true, print: false, height: 420, metric, granularity })}
              table={(models.dialog ?? models.card) ? <ValuesTable model={(models.dialog ?? models.card)!} hidden={hidden} periodHead={periodHead} /> : null}
              how={how}
              note={note ? props.note : undefined}
              bodyRef={bodyRef}
              busy={busy}
              status={status}
              onPrint={() => setPrinting(true)}
              onPdf={() => void savePdf(models)}
              onClose={close}
            />
          </ChartRoleScope>,
          document.body,
        )}

      {printing &&
        createPortal(
          <div className="print-sheet" aria-hidden="true">
            <h2 className="text-xl font-semibold text-black">{props.title}</h2>
            <p className="mt-1 text-sm text-black">
              {period} · {scope} · {granLabel}
            </p>
            {props.total !== undefined && !metricChanged && (
              <p className="mt-1 text-sm text-black">
                {props.totalLabel ?? 'Period total'}: <strong>{props.total}</strong>
              </p>
            )}
            <div className="mt-4">
              <ChartRoleScope value="print">{props.render({ expanded: true, print: true, height: 420, fixedWidth: 1000, metric: expanded ? metric : defaultMetric, granularity })}</ChartRoleScope>
            </div>
            {note}
            <p className="mt-3 text-xs text-black">How it is calculated: {how}</p>
            {models.print && <ValuesTable model={models.print} hidden={hidden} periodHead={periodHead} className="print-values mt-3" />}
            <p className="print-footer mt-4 text-xs text-black">Synthetic demo data</p>
          </div>,
          document.body,
        )}
    </>
  );

  if (spark) {
    return (
      <ChartHostProvider options={options} hidden={hidden} setHidden={setHidden}>
        <ChartHostConsumer>
          {(models) => (
            <>
              <button
                type="button"
                data-spark-trigger
                className="block h-full w-full cursor-zoom-in rounded-[inherit] text-left transition-colors hover:bg-slate-50/80 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand"
                aria-label={`Open chart: ${props.title}`}
                title="Click to enlarge"
                aria-haspopup="dialog"
                onClick={(e) => {
                  e.stopPropagation();
                  setExpanded(true);
                }}
              >
                {props.trigger}
              </button>
              {overlays(models)}
            </>
          )}
        </ChartHostConsumer>
      </ChartHostProvider>
    );
  }

  return (
    <figure className={`card chart-card m-0 flex min-w-0 flex-col ${props.className ?? ''}`}>
      <ChartHostProvider options={options} hidden={hidden} setHidden={setHidden}>
        <ChartHostConsumer>
          {(models) => (
            <>
              <div className="chart-pad flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5 px-4 pb-1 pt-4 sm:px-5">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <h3 className="text-[15px] font-semibold leading-5 tracking-tight text-ink">{props.title}</h3>
                    {headline}
                  </div>
                  <div className="mt-0.5 text-xs leading-snug text-ink-3">{periodText}</div>
                </div>
                <div className="flex shrink-0 items-center gap-0.5" data-print-hide>
                  {!props.hideGranularity && <GranularityToggle className="mr-1" />}
                  <button type="button" className={iconBtn} onClick={() => setExpanded(true)} aria-label={`Expand chart: ${props.title}`} title="Expand">
                    <Glyph d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7" />
                  </button>
                  <button type="button" className={iconBtn} onClick={() => setPrinting(true)} aria-label={`Print chart: ${props.title}`} title="Print">
                    <Glyph d="M7 9V4h10v5M7 17H5v-6h14v6h-2M7 14h10v6H7z" />
                  </button>
                </div>
              </div>
              <div className="chart-pad min-w-0 flex-1 cursor-zoom-in px-4 pb-4 pt-3 sm:px-5" onClick={onSurfaceClick} data-chart-surface title="Click the chart to enlarge">
                <ChartRoleScope value="card">{props.render({ expanded: false, print: false, height: 280, metric: defaultMetric, granularity })}</ChartRoleScope>
                {note}
              </div>
              {overlays(models)}
            </>
          )}
        </ChartHostConsumer>
      </ChartHostProvider>
    </figure>
  );
}

function ChartHostConsumer({ children }: { children: (models: Partial<Record<string, ChartModel>>) => ReactNode }) {
  const host = useChartHost();
  return <>{children(host?.models ?? {})}</>;
}
