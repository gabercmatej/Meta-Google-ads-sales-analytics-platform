// Campaign + ad wizard shared by the Create page and the Drafts page.
// It only ever creates PAUSED objects through the simulated workflow; nothing leaves the browser.
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { CreativeTheme, Platform, ShowcaseCreative } from '@sedem-ads/analytics-core';
import { Badge, Button, SimulationNotice } from '../components/ui';
import { Notice } from '../components/Notes';
import { AdPreview } from '../components/AdPreview';
import { CHANNEL_LABEL, OBJECTIVE_LABEL } from '../components/EntityBits';
import { money } from '../lib/format';
import { useSim } from './simContext';
import { canWrite, GOOGLE_VALIDATE_ONLY_MESSAGE, VIEWER_TOOLTIP, type CreateResult } from './changeFlow';
import { validateDraft, URL_PREFIX, type DraftErrors } from './draftValidation';
import type { Draft } from './simCore';
import './sim.css';
import '../pages/sim-pages.css';

export interface FormState {
  id?: string;
  platform: Platform;
  campaignName: string;
  objective: string;
  /** EUR as typed by the user (e.g. "25" or "25.50"). */
  budgetText: string;
  includeAd: boolean;
  adName: string;
  headline: string;
  primaryText: string;
  callToAction: string;
  finalUrl: string;
  theme: CreativeTheme;
}

export const OBJECTIVES: Record<Platform, string[]> = {
  meta: ['LEADS', 'TRAFFIC', 'SALES', 'AWARENESS'],
  google: ['SEARCH', 'DISPLAY', 'PERFORMANCE_MAX'],
};
export const CTA_OPTIONS = ['Learn more', 'Sign up', 'Get quote', 'Contact us', 'Book now', 'Download'];
export const THEME_OPTIONS: { value: CreativeTheme; label: string }[] = [
  { value: 'consultation', label: 'Consultation' },
  { value: 'documents', label: 'Documents' },
  { value: 'family', label: 'Family' },
  { value: 'business', label: 'Business' },
  { value: 'chat', label: 'Chat' },
  { value: 'brand', label: 'Brand' },
  { value: 'deadline', label: 'Deadline' },
  { value: 'property', label: 'Property' },
];
const THEME_COLORS: Record<CreativeTheme, { background: string; accent: string }> = {
  consultation: { background: '#1e3a8a', accent: '#93c5fd' },
  documents: { background: '#064e3b', accent: '#6ee7b7' },
  family: { background: '#7c2d12', accent: '#fdba74' },
  business: { background: '#1f2937', accent: '#fbbf24' },
  chat: { background: '#4c1d95', accent: '#c4b5fd' },
  brand: { background: '#0f766e', accent: '#99f6e4' },
  deadline: { background: '#7f1d1d', accent: '#fca5a5' },
  property: { background: '#365314', accent: '#bef264' },
};

export function emptyForm(platform: Platform = 'meta'): FormState {
  return {
    platform,
    campaignName: '',
    objective: OBJECTIVES[platform][0] ?? 'LEADS',
    budgetText: '20',
    includeAd: true,
    adName: '',
    headline: '',
    primaryText: '',
    callToAction: 'Learn more',
    finalUrl: `${URL_PREFIX}/`,
    theme: 'consultation',
  };
}

export function fromDraft(d: Draft): FormState {
  return {
    id: d.id,
    platform: d.platform,
    campaignName: d.campaignName,
    objective: d.objective,
    budgetText: d.dailyBudgetMinor === null ? '' : String(d.dailyBudgetMinor / 100),
    includeAd: d.includeAd,
    adName: d.adName,
    headline: d.creative.headline,
    primaryText: d.creative.primaryText,
    callToAction: d.creative.callToAction,
    finalUrl: d.creative.finalUrl,
    theme: d.creative.theme,
  };
}

/** EUR text to integer cents; null when it is not a plain positive amount. */
export function parseBudgetMinor(text: string): number | null {
  const t = text.trim().replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  return Math.round(Number(t) * 100);
}

export function toDraftFields(f: FormState): Omit<Draft, 'id' | 'createdAt' | 'updatedAt'> & { id?: string } {
  return {
    ...(f.id ? { id: f.id } : {}),
    platform: f.platform,
    campaignName: f.campaignName.trim(),
    objective: f.objective,
    dailyBudgetMinor: parseBudgetMinor(f.budgetText),
    includeAd: f.includeAd,
    adName: f.adName.trim(),
    creative: { headline: f.headline, primaryText: f.primaryText, callToAction: f.callToAction, finalUrl: f.finalUrl, theme: f.theme },
  };
}

export function formErrors(f: FormState): DraftErrors {
  const d = toDraftFields(f);
  const e = validateDraft(d);
  if (d.dailyBudgetMinor === null && f.budgetText.trim() !== '') e.dailyBudget = 'Enter a positive amount in EUR, for example 25 or 25.50.';
  return e;
}

export function previewCreative(f: FormState): ShowcaseCreative {
  const headline = f.headline.trim() || 'Your headline';
  const primary = f.primaryText.trim() || 'Your primary text appears here.';
  const colors = THEME_COLORS[f.theme];
  const search = f.platform === 'google' && f.objective === 'SEARCH';
  return {
    id: 'draft-preview',
    platform: f.platform,
    format: f.platform === 'meta' ? 'single_image' : search ? 'responsive_search' : f.objective === 'DISPLAY' ? 'responsive_display' : 'pmax_asset_group',
    headline,
    headlines: [headline],
    primaryText: primary,
    descriptions: [primary],
    callToAction: f.callToAction,
    finalUrl: f.finalUrl,
    visual: search ? null : { theme: f.theme, ...colors, title: headline, subtitle: 'Demo creative' },
  };
}

const STEPS = ['Campaign', 'Ad', 'Review'] as const;
const CAMPAIGN_FIELDS: (keyof DraftErrors)[] = ['campaignName', 'dailyBudget'];
const AD_FIELDS: (keyof DraftErrors)[] = ['adName', 'headline', 'primaryText', 'callToAction', 'finalUrl'];

function Field(props: { id: string; label: string; error?: string; hint?: string; children: (p: { id: string; 'aria-invalid': boolean; 'aria-describedby'?: string }) => React.ReactNode }) {
  const describedBy = props.error ? `${props.id}-err` : props.hint ? `${props.id}-hint` : undefined;
  return (
    <div className="sim-field">
      <label htmlFor={props.id}>{props.label}</label>
      {props.children({ id: props.id, 'aria-invalid': Boolean(props.error), ...(describedBy ? { 'aria-describedby': describedBy } : {}) })}
      {props.error ? (
        <span className="field-error" id={`${props.id}-err`} role="alert">
          {props.error}
        </span>
      ) : (
        props.hint && (
          <span className="muted" id={`${props.id}-hint`}>
            {props.hint}
          </span>
        )
      )}
    </div>
  );
}

export function DraftForm(props: { initial: FormState; onSaved?: (d: Draft) => void; onCreated?: (r: CreateResult) => void; idPrefix?: string }) {
  const sim = useSim();
  const [f, setF] = useState<FormState>(props.initial);
  const [step, setStep] = useState(0);
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CreateResult | null>(null);
  const [savedNote, setSavedNote] = useState<string | null>(null);
  const prefix = props.idPrefix ?? 'df';
  const allowed = canWrite(sim.role);
  const errors = useMemo(() => formErrors(f), [f]);
  const shown = (k: keyof DraftErrors) => (touched.has(k) || touched.has('*') ? errors[k] : undefined);
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    setF((s) => ({ ...s, [k]: v }));
    setSavedNote(null);
  };
  const touch = (keys: string[]) => setTouched((t) => new Set([...t, ...keys]));
  const campaignOk = CAMPAIGN_FIELDS.every((k) => !errors[k]);
  const adOk = !f.includeAd || AD_FIELDS.every((k) => !errors[k]);
  const allOk = Object.keys(errors).length === 0;

  const next = () => {
    if (step === 0) {
      touch(CAMPAIGN_FIELDS);
      if (!campaignOk) return;
    }
    if (step === 1) {
      touch(AD_FIELDS);
      if (!adOk) return;
    }
    setStep((s) => Math.min(2, s + 1));
  };

  const save = () => {
    const draftFields = toDraftFields({ ...f, campaignName: f.campaignName.trim() || 'Untitled draft' });
    const saved = sim.saveDraft(draftFields);
    setF((s) => ({ ...s, id: saved.id }));
    setSavedNote(`Draft saved in this browser (${saved.id}). Nothing was sent anywhere.`);
    props.onSaved?.(saved);
  };

  const create = async () => {
    touch(['*']);
    if (!allOk) return;
    const d = toDraftFields(f);
    setBusy(true);
    try {
      const r = await sim.create(
        {
          platform: f.platform,
          campaign: { name: d.campaignName, dailyBudgetMinor: d.dailyBudgetMinor },
          ...(f.includeAd ? { ad: { name: d.adName, headline: f.headline.trim(), primaryText: f.primaryText.trim() } } : {}),
        },
        f.id,
      );
      setResult(r);
      props.onCreated?.(r);
    } finally {
      setBusy(false);
    }
  };

  if (result?.success) {
    const validatedOnly = result.mode === 'validated_only';
    return (
      <div className="sim-dialog" role="status">
        <div className="sim-result sim-result-ok">
          <strong>{validatedOnly ? 'Validated only' : 'Created in simulation (PAUSED)'}</strong>
          <span>{result.message}</span>
          {validatedOnly && <span>{GOOGLE_VALIDATE_ONLY_MESSAGE}</span>}
        </div>
        {!validatedOnly && (
          <ul className="create-ids">
            {result.entities.map((e) => (
              <li key={e.id}>
                {e.level === 'ad' ? 'Ad' : 'Campaign'} <strong>{e.name}</strong> <Badge tone="warn">{e.status}</Badge> <code>{e.id}</code>
              </li>
            ))}
          </ul>
        )}
        <p className="muted">
          {validatedOnly
            ? 'The draft is kept so you can adjust it.'
            : 'Activation is a separate confirmed action: use Resume on the campaign row.'}
        </p>
        <div className="create-actions">
          {!validatedOnly && (
            <Link className="btn btn-primary btn-sm" to="/campaigns">
              Open campaigns
            </Link>
          )}
          <Link className="btn btn-secondary btn-sm" to="/activity">
            View activity log
          </Link>
          <Button size="sm" variant="ghost" onClick={() => setResult(null)}>
            Back to the form
          </Button>
        </div>
      </div>
    );
  }

  const objectiveLabel = (o: string) => (f.platform === 'meta' ? OBJECTIVE_LABEL[o] : CHANNEL_LABEL[o]) ?? o;

  return (
    <div className="create-grid">
      <div className="create-form">
        <SimulationNotice />
        <ol className="sim-steps" aria-label="Steps">
          {STEPS.map((s, i) => (
            <li key={s} data-done={i < step ? 'true' : undefined} aria-current={i === step ? 'step' : undefined}>
              {s}
            </li>
          ))}
        </ol>

        {step === 0 && (
          <fieldset className="create-fieldset">
            <legend>Campaign</legend>
            <div className="sim-field">
              <label htmlFor={`${prefix}-platform`}>Platform</label>
              <select
                id={`${prefix}-platform`}
                value={f.platform}
                onChange={(e) => {
                  const p = e.target.value as Platform;
                  setF((s) => ({ ...s, platform: p, objective: OBJECTIVES[p][0] ?? s.objective }));
                }}
              >
                <option value="meta">Meta Ads</option>
                <option value="google">Google Ads (validate-only)</option>
              </select>
            </div>
            <div className="sim-field">
              <label htmlFor={`${prefix}-objective`}>{f.platform === 'meta' ? 'Objective' : 'Channel'}</label>
              <select id={`${prefix}-objective`} value={f.objective} onChange={(e) => set('objective', e.target.value)}>
                {OBJECTIVES[f.platform].map((o) => (
                  <option key={o} value={o}>
                    {objectiveLabel(o)}
                  </option>
                ))}
              </select>
            </div>
            <Field id={`${prefix}-name`} label="Campaign name" error={shown('campaignName')}>
              {(p) => <input {...p} value={f.campaignName} onChange={(e) => set('campaignName', e.target.value)} onBlur={() => touch(['campaignName'])} />}
            </Field>
            <Field id={`${prefix}-budget`} label="Daily budget (EUR)" error={shown('dailyBudget')} hint="Between €5.00 and €1,000.00">
              {(p) => <input {...p} inputMode="decimal" value={f.budgetText} onChange={(e) => set('budgetText', e.target.value)} onBlur={() => touch(['dailyBudget'])} />}
            </Field>
            <label className="create-check">
              <input type="checkbox" checked={f.includeAd} onChange={(e) => set('includeAd', e.target.checked)} /> Add a first ad
            </label>
          </fieldset>
        )}

        {step === 1 && (
          <fieldset className="create-fieldset">
            <legend>Ad</legend>
            {!f.includeAd ? (
              <p className="muted">No ad will be created. Go back to the campaign step to add one.</p>
            ) : (
              <>
                <Field id={`${prefix}-adname`} label="Ad name" error={shown('adName')}>
                  {(p) => <input {...p} value={f.adName} onChange={(e) => set('adName', e.target.value)} onBlur={() => touch(['adName'])} />}
                </Field>
                <Field id={`${prefix}-headline`} label="Headline" error={shown('headline')} hint={`${f.headline.length}/60`}>
                  {(p) => <input {...p} value={f.headline} onChange={(e) => set('headline', e.target.value)} onBlur={() => touch(['headline'])} />}
                </Field>
                <Field id={`${prefix}-text`} label="Primary text" error={shown('primaryText')} hint={`${f.primaryText.length}/300`}>
                  {(p) => <textarea {...p} rows={3} value={f.primaryText} onChange={(e) => set('primaryText', e.target.value)} onBlur={() => touch(['primaryText'])} />}
                </Field>
                <Field id={`${prefix}-cta`} label="Call to action" error={shown('callToAction')}>
                  {(p) => (
                    <select {...p} value={f.callToAction} onChange={(e) => set('callToAction', e.target.value)}>
                      {CTA_OPTIONS.map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                  )}
                </Field>
                <Field id={`${prefix}-url`} label="Final URL" error={shown('finalUrl')} hint={`Must start with ${URL_PREFIX}/`}>
                  {(p) => <input {...p} value={f.finalUrl} onChange={(e) => set('finalUrl', e.target.value)} onBlur={() => touch(['finalUrl'])} />}
                </Field>
                <div className="sim-field">
                  <label htmlFor={`${prefix}-theme`}>Visual theme</label>
                  <select id={`${prefix}-theme`} value={f.theme} onChange={(e) => set('theme', e.target.value as CreativeTheme)}>
                    {THEME_OPTIONS.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}
          </fieldset>
        )}

        {step === 2 && (
          <fieldset className="create-fieldset">
            <legend>Review</legend>
            <dl className="ai-rows">
              <div><dt>Platform</dt><dd>{f.platform === 'meta' ? 'Meta Ads' : 'Google Ads'}</dd></div>
              <div><dt>{f.platform === 'meta' ? 'Objective' : 'Channel'}</dt><dd>{objectiveLabel(f.objective)}</dd></div>
              <div><dt>Campaign</dt><dd>{f.campaignName || '–'}</dd></div>
              <div><dt>Daily budget</dt><dd>{money(parseBudgetMinor(f.budgetText))}</dd></div>
              <div><dt>Ad</dt><dd>{f.includeAd ? f.adName || '–' : 'Not included'}</dd></div>
              <div><dt>Status after creation</dt><dd><Badge tone="warn">PAUSED</Badge></dd></div>
            </dl>
            {!allOk && (
              <ul className="sim-issues" role="alert">
                {Object.values(errors).map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            )}
            {f.platform === 'google' && <Notice tone="warn">{GOOGLE_VALIDATE_ONLY_MESSAGE}.</Notice>}
            <Notice tone="info">New objects are always created PAUSED. Activating them is a separate confirmed action.</Notice>
            {!allowed && <Notice tone="warn">{VIEWER_TOOLTIP}.</Notice>}
            {result && !result.success && (
              <ul className="sim-issues" role="alert">
                {result.issues.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            )}
          </fieldset>
        )}

        <div className="create-actions">
          {step > 0 && (
            <Button variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))}>
              Back
            </Button>
          )}
          {step < 2 && (
            <Button variant="primary" onClick={next}>
              Next
            </Button>
          )}
          <Button variant="secondary" onClick={save}>
            Save as draft
          </Button>
          {step === 2 && (
            <span title={allowed ? undefined : VIEWER_TOOLTIP}>
              <Button variant="primary" disabled={!allowed || busy} onClick={() => void create()}>
                Create (PAUSED)
              </Button>
            </span>
          )}
        </div>
        {savedNote && (
          <p className="sim-ok" role="status">
            {savedNote}
          </p>
        )}
      </div>

      <aside className="create-preview" aria-label="Live ad preview">
        <h3>Live preview</h3>
        <AdPreview creative={previewCreative(f)} size="md" />
        <p className="muted">Original demo creative, drawn in the browser. {f.platform === 'google' && f.objective === 'SEARCH' ? 'Search ads are text only.' : ''}</p>
      </aside>
    </div>
  );
}
