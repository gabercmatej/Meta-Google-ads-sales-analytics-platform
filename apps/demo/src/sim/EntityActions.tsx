import { useEffect, useMemo, useRef, useState } from 'react';
import { Badge, Button, Dialog, SimulationNotice } from '../components/ui';
import { getDataset } from '../lib/data';
import type { EntityRef } from './contract';
import { MAX_BUDGET_CHANGE_PERCENT, VIEWER_TOOLTIP, canWrite, effectiveEntity, type ChangeRequest, type ChangeResult, type ChangeReview, type EffectiveEntity } from './changeFlow';
import { useSim } from './simContext';
import './sim.css';

type Kind = 'pause' | 'resume' | 'set_budget' | 'edit';

const KIND_TITLE: Record<Kind, string> = { pause: 'Pause', resume: 'Resume', set_budget: 'Change budget', edit: 'Edit' };

const FLOW_STEPS = ['Preview', 'Validate', 'Confirm (human)', 'Execute (simulated)', 'Read back', 'Audit log'];

function eur(minor: number | null): string {
  return minor === null ? '–' : `€${(minor / 100).toFixed(2)}`;
}

/** Ads: look up the current creative copy so the edit dialog can show before → after. */
function withCreative(e: EntityRef): EffectiveEntity {
  if (e.level !== 'ad') return e;
  try {
    const ds = getDataset();
    const ad = ds.ads.find((a) => a.id === e.id);
    const creative = ad ? ds.creatives.find((c) => c.id === ad.creativeId) : undefined;
    return creative ? { ...e, headline: creative.headline, primaryText: creative.primaryText } : e;
  } catch {
    return e;
  }
}

/** Pause / Resume / Budget / Edit controls for one entity row. Every action opens a confirm dialog. */
export function EntityActions(props: { entity: EntityRef; compact?: boolean }) {
  const sim = useSim();
  const [kind, setKind] = useState<Kind | null>(null);
  const overlay = sim.overlay(props.entity.id);
  const entity = useMemo(() => effectiveEntity(withCreative(props.entity), overlay), [props.entity, overlay]);
  const allowed = canWrite(sim.role);
  const tip = allowed ? undefined : VIEWER_TOOLTIP;
  const size = props.compact ? 'sm' : 'md';
  const hasBudget = entity.dailyBudgetMinor !== null;
  const toggle: Kind = entity.status === 'ACTIVE' ? 'pause' : 'resume';
  return (
    <span className="inline-flex flex-wrap items-center gap-1" data-compact={props.compact ? 'true' : undefined}>
      <span title={tip}>
        <Button size={size} variant="secondary" disabled={!allowed} onClick={() => setKind(toggle)} aria-label={`${KIND_TITLE[toggle]} ${entity.name}`}>
          {KIND_TITLE[toggle]}
        </Button>
      </span>
      <span title={allowed ? (hasBudget ? undefined : 'Budget is set at ad set / ad group level') : tip}>
        <Button size={size} variant="secondary" disabled={!allowed || !hasBudget} onClick={() => setKind('set_budget')} aria-label={`Change budget of ${entity.name}`}>
          Budget
        </Button>
      </span>
      <span title={tip}>
        <Button size={size} variant="ghost" disabled={!allowed} onClick={() => setKind('edit')} aria-label={`Edit ${entity.name}`}>
          Edit
        </Button>
      </span>
      {overlay?.validatedOnly && (
        <Badge tone="warn" title="A change was validated but not applied (Google is validate-only in this demo)">
          Validated only
        </Badge>
      )}
      {kind && <ChangeDialog entity={entity} kind={kind} onClose={() => setKind(null)} />}
    </span>
  );
}

/** Button that opens the normal change dialog pre-filled (e.g. from a recommendation). Never applies anything by itself. */
export function PrepareChange(props: { entity: EntityRef; kind: Kind; newDailyBudgetMinor?: number; label?: string }) {
  const sim = useSim();
  const [open, setOpen] = useState(false);
  const overlay = sim.overlay(props.entity.id);
  const entity = useMemo(() => effectiveEntity(withCreative(props.entity), overlay), [props.entity, overlay]);
  const allowed = canWrite(sim.role);
  return (
    <>
      <span title={allowed ? undefined : VIEWER_TOOLTIP}>
        <Button size="sm" variant="secondary" disabled={!allowed} onClick={() => setOpen(true)}>
          {props.label ?? 'Prepare change'}
        </Button>
      </span>
      {open && <ChangeDialog entity={entity} kind={props.kind} initialBudgetMinor={props.newDailyBudgetMinor} onClose={() => setOpen(false)} />}
    </>
  );
}

function ChangeDialog(props: { entity: EffectiveEntity; kind: Kind; initialBudgetMinor?: number; onClose: () => void }) {
  const { entity, kind } = props;
  const sim = useSim();
  const needsInput = kind === 'set_budget' || kind === 'edit';
  const [phase, setPhase] = useState<'input' | 'review' | 'done'>(needsInput ? 'input' : 'review');
  const [busy, setBusy] = useState(false);
  const [review, setReview] = useState<ChangeReview | null>(null);
  const [result, setResult] = useState<ChangeResult | null>(null);
  const [budget, setBudget] = useState(() => {
    const m = props.initialBudgetMinor ?? entity.dailyBudgetMinor;
    return m === null ? '' : (m / 100).toFixed(2);
  });
  const [name, setName] = useState(entity.name);
  const [headline, setHeadline] = useState(entity.headline ?? '');
  const [primaryText, setPrimaryText] = useState(entity.primaryText ?? '');
  const started = useRef(false);

  const request = (): ChangeRequest => {
    if (kind === 'pause' || kind === 'resume') return { kind };
    if (kind === 'set_budget') return { kind, newDailyBudgetMinor: Math.round(Number(budget.replace(',', '.')) * 100) };
    return {
      kind: 'edit',
      name: name !== entity.name ? name : undefined,
      ...(entity.level === 'ad' ? { headline: headline !== (entity.headline ?? '') ? headline : undefined, primaryText: primaryText !== (entity.primaryText ?? '') ? primaryText : undefined } : {}),
    };
  };

  const runReview = async () => {
    setBusy(true);
    const r = await sim.review(entity, request());
    setReview(r);
    if (!r.ok) sim.logRejection(r);
    setPhase('review');
    setBusy(false);
  };

  useEffect(() => {
    if (!needsInput && !started.current) {
      started.current = true;
      void runReview();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onConfirm = async () => {
    if (!review) return;
    setBusy(true);
    setResult(await sim.confirm(review));
    setPhase('done');
    setBusy(false);
  };

  const title = `${KIND_TITLE[kind]}: ${entity.name}`;
  const budgetNum = Number(budget.replace(',', '.'));
  const lo = entity.dailyBudgetMinor === null ? null : Math.round(entity.dailyBudgetMinor * (1 - MAX_BUDGET_CHANGE_PERCENT / 100));
  const hi = entity.dailyBudgetMinor === null ? null : Math.round(entity.dailyBudgetMinor * (1 + MAX_BUDGET_CHANGE_PERCENT / 100));

  const footer = (
    <>
      <Button variant="ghost" onClick={props.onClose}>
        {phase === 'done' ? 'Close' : 'Cancel'}
      </Button>
      {phase === 'input' && (
        <Button variant="primary" disabled={busy || (kind === 'set_budget' && !(budgetNum > 0))} onClick={() => void runReview()}>
          Preview change
        </Button>
      )}
      {phase === 'review' && review && !review.ok && needsInput && (
        <Button variant="secondary" onClick={() => setPhase('input')}>
          Back
        </Button>
      )}
      {phase === 'review' && review?.ok && (
        <Button variant="primary" disabled={busy} onClick={() => void onConfirm()}>
          Confirm {KIND_TITLE[kind].toLowerCase()}
        </Button>
      )}
    </>
  );

  return (
    <Dialog open title={title} onClose={props.onClose} footer={footer}>
      <div className="sim-dialog">
        <SimulationNotice />
        <p className="flex flex-wrap items-center gap-2">
          <Badge tone={entity.platform}>{entity.platform === 'meta' ? 'Meta Ads' : 'Google Ads'}</Badge>{' '}
          <span className="sim-muted">{entity.level.replace('_', ' ')} · {entity.platform === 'meta' ? 'changes are applied in the simulation' : 'validate-only: nothing is applied'}</span>
        </p>

        <ol className="sim-steps" aria-label="Change workflow">
          {FLOW_STEPS.map((s, i) => (
            <li key={s} data-done={stepDone(phase, review, result, i) ? 'true' : undefined}>
              {s}
            </li>
          ))}
        </ol>

        {phase === 'input' && kind === 'set_budget' && (
          <div className="sim-field">
            <label htmlFor="sim-budget">New daily budget (EUR)</label>
            <input id="sim-budget" inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} />
            <span className="sim-muted">
              Current {eur(entity.dailyBudgetMinor)}. A single change may not exceed {MAX_BUDGET_CHANGE_PERCENT}% ({eur(lo)} – {eur(hi)}).
            </span>
          </div>
        )}
        {phase === 'input' && kind === 'edit' && (
          <>
            <div className="sim-field">
              <label htmlFor="sim-name">Name</label>
              <input id="sim-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
            </div>
            {entity.level === 'ad' && (
              <>
                <div className="sim-field">
                  <label htmlFor="sim-headline">Headline</label>
                  <input id="sim-headline" value={headline} onChange={(e) => setHeadline(e.target.value)} maxLength={80} />
                  <span className="sim-muted">{headline.length}/60</span>
                </div>
                <div className="sim-field">
                  <label htmlFor="sim-primary">Primary text</label>
                  <textarea id="sim-primary" rows={3} value={primaryText} onChange={(e) => setPrimaryText(e.target.value)} />
                  <span className="sim-muted">{primaryText.length}/300</span>
                </div>
              </>
            )}
          </>
        )}

        {phase === 'review' && !review && <p className="sim-muted">Reading current state…</p>}
        {phase === 'review' && review && (
          <>
            <table className="sim-diff">
              <thead>
                <tr>
                  <th>Field</th>
                  <th>Before</th>
                  <th>After</th>
                </tr>
              </thead>
              <tbody>
                {review.lines.map((l) => (
                  <tr key={l.label}>
                    <td>{l.label}</td>
                    <td>{l.before}</td>
                    <td>
                      <strong>{l.after}</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {review.ok ? (
              <p className="sim-ok">Validation passed. Nothing has changed yet; confirm to continue.</p>
            ) : (
              <ul className="sim-issues" role="alert">
                {review.issues.map((i) => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
            )}
          </>
        )}

        {phase === 'done' && result && (
          <div className={result.success ? 'sim-result sim-result-ok' : 'sim-result sim-result-bad'} role="status">
            <strong>{result.success ? result.message : `Not applied: ${result.message}`}</strong>
            {result.mode === 'applied' && result.success && result.readBack && <div>Read-back: {result.readBack}</div>}
            {result.mode === 'validated_only' && <div>Status and budget are unchanged.</div>}
            <div className="sim-muted">An entry was added to the Activity Log.</div>
          </div>
        )}
      </div>
    </Dialog>
  );
}

function stepDone(phase: 'input' | 'review' | 'done', review: ChangeReview | null, result: ChangeResult | null, i: number): boolean {
  if (i <= 1) return phase !== 'input' && review !== null;
  if (!result) return false;
  if (i === 2 || i === 3) return result.success;
  if (i === 4) return result.success && result.mode === 'applied';
  return result.success;
}
