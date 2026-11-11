import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader, Card, Button, Badge, EmptyState, Segmented, SimulationNotice, type Tone } from '../components/ui';
import { Notice } from '../components/Notes';
import { PlatformBadge } from '../components/EntityBits';
import { PrepareChange, useSim } from '../sim/SimProvider';
import { buildRecommendations, PRIORITY_LABEL, REC_TYPES, REC_TYPE_LABEL, THRESHOLDS, type RecPriority, type RecType, type Recommendation } from '../ai/recommendations';
import { getDataset } from '../lib/data';
import { useAppState, PLATFORM_LABELS } from '../state/AppState';
import { dateRange } from '../lib/format';
import { MAX_BUDGET_CHANGE_PERCENT } from '../sim/changeFlow';
import './sim-pages.css';

const PRIORITY_TONE: Record<RecPriority, Tone> = { high: 'bad', medium: 'warn', low: 'neutral' };
type PriorityFilter = 'all' | RecPriority;
type PlatformFilter = 'all' | 'meta' | 'google';

function RecCard({ rec, comparisonLabel, onDismiss, onRestore, dismissed }: { rec: Recommendation; comparisonLabel: string; onDismiss: () => void; onRestore: () => void; dismissed: boolean }) {
  const ask = `/assistant?q=${encodeURIComponent(rec.ask)}`;
  return (
    <article className={`rec-card rec-${rec.priority}`} data-dismissed={dismissed ? 'true' : undefined} aria-label={rec.title}>
      <header className="rec-head">
        <Badge tone={PRIORITY_TONE[rec.priority]}>{PRIORITY_LABEL[rec.priority]} priority</Badge>
        <Badge tone="info">{REC_TYPE_LABEL[rec.type]}</Badge>
        <PlatformBadge platform={rec.platform} />
      </header>
      <h3 className="rec-title">{rec.title}</h3>
      <p className="rec-entity">
        {rec.level === 'ad' ? 'Ad' : 'Campaign'}:{' '}
        <Link to={rec.openTo} className="ai-link">
          {rec.entityName}
        </Link>
      </p>
      <table className="rec-evidence">
        <thead>
          <tr>
            <th scope="col">Evidence</th>
            <th scope="col">Current</th>
            <th scope="col">Previous</th>
            <th scope="col">Change</th>
          </tr>
        </thead>
        <tbody>
          {rec.evidence.map((e) => (
            <tr key={e.label}>
              <th scope="row">{e.label}</th>
              <td>{e.current}</td>
              <td>{e.previous}</td>
              <td>{e.change}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="rec-compared muted">Compared: {comparisonLabel}</p>
      <p>{rec.explanation}</p>
      <p>
        <strong>Next step:</strong> {rec.nextStep}
      </p>
      <footer className="rec-actions">
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
        {rec.prepare && <PrepareChange entity={rec.prepare.entity} kind={rec.prepare.kind} newDailyBudgetMinor={rec.prepare.newDailyBudgetMinor} label="Prepare change" />}
        {dismissed ? (
          <Button size="sm" variant="ghost" onClick={onRestore}>
            Restore
          </Button>
        ) : (
          <Button size="sm" variant="ghost" onClick={onDismiss}>
            Dismiss
          </Button>
        )}
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
    <div className="rec-page">
      <PageHeader
        title="Recommendations"
        description="Rule-based suggestions for the selected period compared with the previous period of the same length. Nothing here changes anything by itself."
        badge={<Badge tone="warn">Simulated</Badge>}
      />
      <SimulationNotice />
      {!set || !app.range ? (
        <EmptyState title="No completed days in this period">Choose another period to see recommendations.</EmptyState>
      ) : (
        <>
          <Notice tone="info">
            {PLATFORM_LABELS[app.platform]}: {dateRange(set.current)}
            {set.previous ? ` compared with ${dateRange(set.previous)}` : ''}. {set.comparisonLabel}
          </Notice>
          {!set.previous && <Notice tone="warn">The previous period would start before the available history, so change-based rules cannot run for this selection.</Notice>}

          <div className="rec-filters" role="group" aria-label="Filters">
            <label>
              Priority
              <select value={priority} onChange={(e) => setPriority(e.target.value as PriorityFilter)}>
                <option value="all">All priorities</option>
                {(['high', 'medium', 'low'] as const).map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_LABEL[p]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Type
              <select value={type} onChange={(e) => setType(e.target.value as 'all' | RecType)}>
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
            <span className="muted">
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
            <div className="rec-grid">
              {open.map((r) => (
                <RecCard key={r.key} rec={r} comparisonLabel={set.comparisonLabel} dismissed={false} onDismiss={() => sim.dismiss(r.key)} onRestore={() => sim.restore(r.key)} />
              ))}
            </div>
          )}

          {showDismissed && hidden.length > 0 && (
            <Card title="Dismissed">
              <div className="rec-grid">
                {hidden.map((r) => (
                  <RecCard key={r.key} rec={r} comparisonLabel={set.comparisonLabel} dismissed onDismiss={() => sim.dismiss(r.key)} onRestore={() => sim.restore(r.key)} />
                ))}
              </div>
            </Card>
          )}

          <Card title="How the rules work">
            <ul className="rec-rules">
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
