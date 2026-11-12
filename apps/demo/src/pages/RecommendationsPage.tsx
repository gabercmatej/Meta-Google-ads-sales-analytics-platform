import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageTitle, Card, Button, Badge, EmptyState, Segmented, SimulationNotice, Notice, inputCls, type Tone } from '../components/ui';
import { PeriodBar } from '../components/PeriodBar';
import { PlatformBadge } from '../components/EntityBits';
import { PrepareChange, useSim } from '../sim/SimProvider';
import { buildRecommendations, PRIORITY_LABEL, REC_TYPES, REC_TYPE_LABEL, THRESHOLDS, type RecPriority, type RecType, type Recommendation } from '../ai/recommendations';
import { getDataset } from '../lib/data';
import { useAppState, PLATFORM_LABELS } from '../state/AppState';
import { dateRange } from '../lib/format';
import { MAX_BUDGET_CHANGE_PERCENT } from '../sim/changeFlow';

const PRIORITY_TONE: Record<RecPriority, Tone> = { high: 'bad', medium: 'warn', low: 'neutral' };
const PRIORITY_BAR: Record<RecPriority, string> = { high: 'border-l-negative', medium: 'border-l-amber-500', low: 'border-l-slate-300' };
type PriorityFilter = 'all' | RecPriority;
type PlatformFilter = 'all' | 'meta' | 'google';

function RecCard({ rec, comparisonLabel, onDismiss, onRestore, dismissed }: { rec: Recommendation; comparisonLabel: string; onDismiss: () => void; onRestore: () => void; dismissed: boolean }) {
  const ask = `/assistant?q=${encodeURIComponent(rec.ask)}`;
  return (
    <article className={`card border-l-4 ${PRIORITY_BAR[rec.priority]} flex min-w-0 flex-col p-4 sm:p-5 ${dismissed ? 'opacity-70' : ''}`} data-dismissed={dismissed ? 'true' : undefined} aria-label={rec.title}>
      <header className="flex flex-wrap items-center gap-1.5">
        <Badge tone={PRIORITY_TONE[rec.priority]}>{PRIORITY_LABEL[rec.priority]} priority</Badge>
        <Badge tone="info">{REC_TYPE_LABEL[rec.type]}</Badge>
        <PlatformBadge platform={rec.platform} />
        <span className="ml-auto" title="Rule-based; evidence below is what the rule used">
          <Badge tone="neutral">Rule-based</Badge>
        </span>
      </header>
      <h3 className="mt-3 text-[15px] font-semibold leading-snug tracking-tight text-ink">{rec.title}</h3>
      <p className="mt-1 text-xs text-ink-3">
        {rec.level === 'ad' ? 'Ad' : 'Campaign'}:{' '}
        <Link to={rec.openTo} className="font-semibold text-brand hover:underline">
          {rec.entityName}
        </Link>
      </p>
      <div className="mt-3 overflow-x-auto rounded-lg border border-line">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-slate-50 text-left text-2xs uppercase tracking-wide text-ink-3">
              <th scope="col" className="px-3 py-1.5 font-semibold">Evidence</th>
              <th scope="col" className="px-2 py-1.5 text-right font-semibold">Current</th>
              <th scope="col" className="px-2 py-1.5 text-right font-semibold">Previous</th>
              <th scope="col" className="px-3 py-1.5 text-right font-semibold">Change</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rec.evidence.map((e) => (
              <tr key={e.label}>
                <th scope="row" className="px-3 py-1.5 text-left font-medium text-ink-2">{e.label}</th>
                <td className="tabular px-2 py-1.5 text-right">{e.current}</td>
                <td className="tabular px-2 py-1.5 text-right">{e.previous}</td>
                <td className="tabular px-3 py-1.5 text-right font-semibold">{e.change}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-1.5 text-2xs text-ink-3">Compared: {comparisonLabel}</p>
      <p className="mt-2 text-sm leading-snug text-ink-2">{rec.explanation}</p>
      <div className="mt-3 rounded-lg bg-brand-soft/70 px-3 py-2 text-sm leading-snug text-blue-950">
        <strong className="font-semibold">Suggested next step:</strong> {rec.nextStep}
      </div>
      <footer className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-3">
        {rec.prepare && <PrepareChange entity={rec.prepare.entity} kind={rec.prepare.kind} newDailyBudgetMinor={rec.prepare.newDailyBudgetMinor} label="Prepare change" />}
        <Link className="btn btn-secondary btn-sm" to={ask}>
          Ask assistant
        </Link>
        <Link className="btn btn-secondary btn-sm" to={rec.openTo}>
          Open campaign
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
  const ds = useMemo(() => getDataset(), []);
  const [priority, setPriority] = useState<PriorityFilter>('all');
  const [type, setType] = useState<'all' | RecType>('all');
  const [platform, setPlatform] = useState<PlatformFilter>('all');
  const [showDismissed, setShowDismissed] = useState(false);

  const set = useMemo(() => (app.range ? buildRecommendations(ds, app.platform, app.range) : null), [ds, app.platform, app.range]);
  const dismissed = useMemo(() => new Set(sim.dismissed), [sim.dismissed]);

  const filtered = useMemo(
    () => (set?.items ?? []).filter((r) => (priority === 'all' || r.priority === priority) && (type === 'all' || r.type === type) && (platform === 'all' || r.platform === platform)),
    [set, priority, type, platform],
  );
  const open = filtered.filter((r) => !dismissed.has(r.key));
  const hidden = filtered.filter((r) => dismissed.has(r.key));
  const hiddenTotal = (set?.items ?? []).filter((r) => dismissed.has(r.key)).length;

  return (
    <div className="space-y-5">
      <PageTitle
        title="Recommendations"
        sub="Rule-based suggestions for the selected period compared with the previous period of the same length. Nothing here changes anything by itself."
        badge={<Badge tone="warn">Simulated</Badge>}
      />
      <PeriodBar />
      <SimulationNotice />
      {!set || !app.range ? (
        <EmptyState title="No completed days in this period">Choose another period to see recommendations.</EmptyState>
      ) : (
        <>
          <Notice tone="info">
            {PLATFORM_LABELS[app.platform]}: {dateRange(set.current)}
            {set.previous ? ` compared with ${dateRange(set.previous)}.` : `. ${set.comparisonLabel}`}
          </Notice>
          {!set.previous && <Notice tone="warn">The previous period would start before the available history, so change-based rules cannot run for this selection.</Notice>}

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
            <Segmented<PlatformFilter>
              label="Platform"
              value={platform}
              onChange={setPlatform}
              options={[
                { value: 'all', label: 'All' },
                { value: 'meta', label: 'Meta' },
                { value: 'google', label: 'Google' },
              ]}
            />
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
                <RecCard key={r.key} rec={r} comparisonLabel={set.comparisonLabel} dismissed={false} onDismiss={() => sim.dismiss(r.key)} onRestore={() => sim.restore(r.key)} />
              ))}
            </div>
          )}

          {showDismissed && hidden.length > 0 && (
            <Card title="Dismissed">
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                {hidden.map((r) => (
                  <RecCard key={r.key} rec={r} comparisonLabel={set.comparisonLabel} dismissed onDismiss={() => sim.dismiss(r.key)} onRestore={() => sim.restore(r.key)} />
                ))}
              </div>
            </Card>
          )}

          <Card title="How the rules work">
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
        </>
      )}
    </div>
  );
}
