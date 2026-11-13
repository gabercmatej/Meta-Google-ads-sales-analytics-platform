import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { PageTitle, Card, Button, Badge, EmptyState, SimulationNotice, BoxTabs, inputCls, type Tone } from '../components/ui';
import { PeriodBar } from '../components/PeriodBar';
import { PlatformBadge } from '../components/EntityBits';
import { RecSpark } from '../components/RecSpark';
import { PrepareChange, useSim } from '../sim/SimProvider';
import { buildRecommendations, PRIORITY_LABEL, REC_TYPES, REC_TYPE_LABEL, THRESHOLDS, type RecPriority, type RecType, type Recommendation } from '../ai/recommendations';
import { narrativeOf, sparkFor, type SparkData } from '../ai/recDetail';
import { getDataset } from '../lib/data';
import { useAppState } from '../state/AppState';
import { dateRange } from '../lib/format';
import { MAX_BUDGET_CHANGE_PERCENT } from '../sim/changeFlow';
import type { PlatformView } from '@sedem-ads/analytics-core';

const PRIORITY_TONE: Record<RecPriority, Tone> = { high: 'bad', medium: 'warn', low: 'neutral' };
const PRIORITY_BAR: Record<RecPriority, string> = { high: 'border-l-negative', medium: 'border-l-slate-500', low: 'border-l-slate-300' };
type PriorityFilter = 'all' | RecPriority;

export const recPath = (key: string) => `/recommendations/${encodeURIComponent(key)}`;

function RecCard({ rec, spark, onDismiss, onRestore, dismissed }: { rec: Recommendation; spark: SparkData | null; onDismiss: () => void; onRestore: () => void; dismissed: boolean }) {
  const ask = `/assistant?q=${encodeURIComponent(rec.ask)}`;
  const nar = narrativeOf(rec.type);
  const head = rec.evidence[0]!;
  return (
    <article className={`card border-l-4 ${PRIORITY_BAR[rec.priority]} flex min-w-0 flex-col p-4 sm:p-5 ${dismissed ? 'opacity-70' : ''}`} data-dismissed={dismissed ? 'true' : undefined} aria-label={rec.title}>
      <header className="flex flex-wrap items-center gap-1.5">
        <Badge tone={PRIORITY_TONE[rec.priority]}>{PRIORITY_LABEL[rec.priority]} priority</Badge>
        <Badge tone="info">{REC_TYPE_LABEL[rec.type]}</Badge>
        <PlatformBadge platform={rec.platform} />
        <span className="ml-auto" title="Rule-based; the evidence below is what the rule used">
          <Badge tone="neutral">Rule-based</Badge>
        </span>
      </header>
      <h3 className="mt-3 text-[15px] font-semibold leading-snug tracking-tight text-ink">
        <Link to={recPath(rec.key)} className="hover:text-brand hover:underline" data-testid="rec-detail-link">
          {rec.title}
        </Link>
      </h3>
      <p className="mt-1 text-xs text-ink-3">
        {rec.level === 'ad' ? 'Ad' : 'Campaign'}:{' '}
        <Link to={rec.openTo} className="font-semibold text-brand hover:underline">
          {rec.entityName}
        </Link>
      </p>

      <div className="mt-3 grid grid-cols-[1fr_auto] items-end gap-x-4 gap-y-2 rounded-lg bg-slate-50 px-3 py-2.5">
        <div>
          <p className="text-2xs font-semibold uppercase tracking-wide text-ink-3">{head.label}: now vs previous period</p>
          <p className="tabular mt-0.5 text-lg font-semibold text-ink">
            {head.current} <span className="text-sm font-medium text-ink-3">vs {head.previous}</span>
          </p>
        </div>
        <p className="tabular text-sm font-semibold text-ink-2" aria-label={`${head.label} change`}>
          {head.change}
        </p>
      </div>

      <ul className="mt-3 space-y-1 text-sm text-ink-2" aria-label="Evidence">
        {rec.evidence.map((e) => (
          <li key={e.label} className="flex gap-2">
            <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-slate-400" />
            <span>
              <span className="font-medium text-ink">{e.label}</span>: <span className="tabular">{e.current}</span>
              {e.previous !== '–' && (
                <>
                  {' '}
                  vs <span className="tabular">{e.previous}</span>
                </>
              )}
              {e.change !== '–' && <span className="tabular font-semibold"> ({e.change})</span>}
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-3">{spark ? <RecSpark data={spark} label={`${rec.entityName} trend, this period against the previous period`} title={`${rec.entityName}: 7-day rolling ${spark.metric.toUpperCase()}`} /> : null}</div>

      <p className="mt-3 text-sm leading-snug text-ink-2">{rec.explanation}</p>
      <div className="mt-3 rounded-lg bg-brand-soft/70 px-3 py-2 text-sm leading-snug text-blue-950">
        <strong className="font-semibold">Suggested optimization:</strong> {rec.nextStep}
      </div>

      <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-2xs font-semibold uppercase tracking-wide text-ink-3">Why it matters</dt>
          <dd className="mt-0.5 leading-snug text-ink-2">{nar.why}</dd>
        </div>
        <div>
          <dt className="text-2xs font-semibold uppercase tracking-wide text-ink-3">Expected impact</dt>
          <dd className="mt-0.5 leading-snug text-ink-2">
            <span className="mr-1 font-semibold text-ink">
              {nar.impact.arrow} {nar.impact.metric}
            </span>
            {nar.impact.text}
          </dd>
        </div>
      </dl>
      <div className="mt-3 text-sm">
        <p className="text-2xs font-semibold uppercase tracking-wide text-ink-3">Risks</p>
        <ul className="mt-0.5 list-disc space-y-0.5 pl-5 leading-snug text-ink-2 marker:text-slate-400">
          {nar.risks.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      </div>

      <footer className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-3">
        {rec.prepare && <PrepareChange entity={rec.prepare.entity} kind={rec.prepare.kind} newDailyBudgetMinor={rec.prepare.newDailyBudgetMinor} label="Prepare change" />}
        <Link className="btn btn-secondary btn-sm" to={ask}>
          Ask assistant
        </Link>
        <Link className="btn btn-secondary btn-sm" to={rec.openTo}>
          Open campaign
        </Link>
        <Link className="btn btn-ghost btn-sm" to={recPath(rec.key)}>
          Details
        </Link>
        {rec.compareTo && (
          <Link className="btn btn-ghost btn-sm" to={rec.compareTo}>
            Compare ads
          </Link>
        )}
        <span className="ml-auto">
          {dismissed ? (
            <Button size="sm" variant="ghost" onClick={onRestore}>
              Restore
            </Button>
          ) : (
            <Button size="sm" variant="ghost" onClick={onDismiss}>
              Dismiss
            </Button>
          )}
        </span>
      </footer>
    </article>
  );
}

export default function RecommendationsPage() {
  const app = useAppState();
  const sim = useSim();
  const [params] = useSearchParams();
  const ds = useMemo(() => getDataset(), []);
  const [priority, setPriority] = useState<PriorityFilter>('all');
  const [type, setType] = useState<'all' | RecType>('all');
  const [showDismissed, setShowDismissed] = useState(false);
  const [calcBusy, setCalcBusy] = useState(false);
  const [calcRuns, setCalcRuns] = useState(0);
  const timer = useRef<number | null>(null);
  useEffect(() => () => { if (timer.current !== null) window.clearTimeout(timer.current); }, []);

  const set = useMemo(() => (app.range ? buildRecommendations(ds, app.platform, app.range) : null), [ds, app.platform, app.range]);
  const dismissed = useMemo(() => new Set(sim.dismissed), [sim.dismissed]);
  const sparks = useMemo(() => {
    const m = new Map<string, SparkData>();
    if (set && app.range) for (const r of set.items) m.set(r.key, sparkFor(ds, r, app.range, set.previous));
    return m;
  }, [ds, set, app.range]);

  const filtered = useMemo(() => (set?.items ?? []).filter((r) => (priority === 'all' || r.priority === priority) && (type === 'all' || r.type === type)), [set, priority, type]);
  const open = filtered.filter((r) => !dismissed.has(r.key));
  const hidden = filtered.filter((r) => dismissed.has(r.key));
  const hiddenTotal = (set?.items ?? []).filter((r) => dismissed.has(r.key)).length;

  const deepLink = params.get('rec');
  if (deepLink) return <Navigate to={recPath(deepLink)} replace />;

  const calculate = () => {
    if (calcBusy) return;
    setCalcBusy(true);
    timer.current = window.setTimeout(() => {
      setCalcBusy(false);
      setCalcRuns((n) => n + 1);
    }, 700);
  };

  return (
    <div className="space-y-5">
      <BoxTabs<PlatformView>
        label="Platform"
        value={app.platform}
        onChange={app.setPlatform}
        options={[
          { value: 'meta', label: 'Meta Ads' },
          { value: 'google', label: 'Google Ads' },
          { value: 'combined', label: 'Meta + Google' },
        ]}
      />
      <PageTitle
        title="Recommendations"
        sub={
          <>
            Rule-based suggestions from verifiable metrics. Nothing here changes anything by itself ·{' '}
            <a href="#how-rules-work" className="font-medium text-brand hover:underline">
              Rules
            </a>
          </>
        }
        right={
          <Button variant="primary" onClick={calculate} disabled={calcBusy || !app.range}>
            {calcBusy ? 'Calculating…' : 'Calculate for period'}
          </Button>
        }
      />
      <PeriodBar />
      {!set || !app.range ? (
        <EmptyState title="No completed days in this period">Choose another period to see recommendations.</EmptyState>
      ) : (
        <>
          <section className="card px-4 py-3" aria-label="Calculation status" data-testid="rec-status">
            <p className="text-sm font-semibold text-ink">
              Recommendations for {dateRange(set.current)}: {set.items.length} computed
              {calcRuns > 0 ? ` · recalculated just now (${calcRuns}×)` : ''}
            </p>
            <p className="mt-0.5 text-xs leading-relaxed text-ink-3">
              {set.previous ? `Compared with ${dateRange(set.previous)}, the previous period of the same length. ` : 'The previous period would start before the available history, so change-based rules cannot run for this selection. '}
              Only completed days are used. Fewer than 5 leads or 1,000 impressions counts as no data, never as zero.
            </p>
          </section>
          <SimulationNotice />

          <div className="card flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2.5 text-xs font-medium text-ink-3" role="group" aria-label="Filters">
            <label className="flex items-center gap-2">
              Priority
              <select className={inputCls} value={priority} onChange={(e) => setPriority(e.target.value as PriorityFilter)}>
                <option value="all">All priorities</option>
                {(['high', 'medium', 'low'] as const).map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_LABEL[p]}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2">
              Type
              <select className={inputCls} value={type} onChange={(e) => setType(e.target.value as 'all' | RecType)}>
                <option value="all">All types</option>
                {REC_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {REC_TYPE_LABEL[t]}
                  </option>
                ))}
              </select>
            </label>
            <span className="text-ink-3">
              {open.length} shown{hiddenTotal > 0 ? `, ${hiddenTotal} dismissed` : ''}
            </span>
            {hiddenTotal > 0 && (
              <>
                <Button size="sm" variant="ghost" onClick={() => setShowDismissed((v) => !v)}>
                  {showDismissed ? 'Hide dismissed' : 'Show dismissed'}
                </Button>
                <Button size="sm" variant="ghost" onClick={sim.restoreAll}>
                  Restore all
                </Button>
              </>
            )}
          </div>

          {open.length === 0 ? (
            <EmptyState title="No recommendations match">
              {set.items.length === 0 ? 'No rule triggered for this period. That is a valid result, not a data gap.' : 'Adjust the filters or restore dismissed items.'}
            </EmptyState>
          ) : (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              {open.map((r) => (
                <RecCard key={r.key} rec={r} spark={sparks.get(r.key) ?? null} dismissed={false} onDismiss={() => sim.dismiss(r.key)} onRestore={() => sim.restore(r.key)} />
              ))}
            </div>
          )}

          {showDismissed && hidden.length > 0 && (
            <Card title="Dismissed">
              <div className="grid grid-cols-1 gap-4 p-4 xl:grid-cols-2">
                {hidden.map((r) => (
                  <RecCard key={r.key} rec={r} spark={sparks.get(r.key) ?? null} dismissed onDismiss={() => sim.dismiss(r.key)} onRestore={() => sim.restore(r.key)} />
                ))}
              </div>
            </Card>
          )}

          <Card title="How the rules work" id="how-rules-work">
            <ul className="list-disc space-y-1.5 px-9 py-4 text-sm text-ink-2 marker:text-slate-400">
              <li>Rising CPL: campaign CPL up at least {Math.round(THRESHOLDS.cplRise * 100)}% with enough leads in both periods.</li>
              <li>Falling CTR: ad CTR down at least {Math.round(THRESHOLDS.ctrFall * 100)}% with enough impressions in both periods.</li>
              <li>Creative fatigue: an ad whose CTR keeps falling while frequency or spend stays high.</li>
              <li>Budget shift: move at most {MAX_BUDGET_CHANGE_PERCENT}% of a weak campaign budget to a stronger one.</li>
              <li>Scale creative: active ads with a CPL clearly below the median and a CTR at or above it.</li>
              <li>Poor efficiency: an active campaign with CPL far above the average and a material spend share.</li>
              <li>Fewer than 5 leads or 1,000 impressions in a period is treated as no data, never as zero.</li>
            </ul>
          </Card>
          <p className="text-xs leading-relaxed text-ink-3">
            Recommendations come from platform metrics and fixed, verifiable rules with a minimum sample size. The app never changes campaigns or budgets by itself; "Prepare change" only creates a local draft. Results of different types (forms, visits, clicks, purchases)
            are not added together.
          </p>
        </>
      )}
    </div>
  );
}
