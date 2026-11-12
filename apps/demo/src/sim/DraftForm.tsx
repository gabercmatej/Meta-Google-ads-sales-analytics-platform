// Shared state, validation and helpers for the Meta and Google create wizards.
// It only ever creates PAUSED objects through the simulated workflow; nothing leaves the browser.
import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { CreativeTheme, Platform, ShowcaseCreative } from '@sedem-ads/analytics-core';
import { Badge, Button, inputCls } from '../components/ui';
import { getDataset } from '../lib/data';
import { useSim } from './simContext';
import { canWrite, GOOGLE_VALIDATE_ONLY_MESSAGE, type CreateResult } from './changeFlow';
import { validateDraft, URL_PREFIX, type DraftErrors } from './draftValidation';
import type { Draft, WizExtra } from './simCore';

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
  wiz: WizExtra;
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
export const THEME_COLORS: Record<CreativeTheme, { background: string; accent: string }> = {
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
    wiz: defaultWiz(platform),
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
    wiz: { ...defaultWiz(d.platform), ...(d.wiz ?? {}) },
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
    wiz: f.wiz,
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
  const picked = f.wiz.creativeId ? getDataset().creatives.find((c) => c.id === f.wiz.creativeId)?.visual : null;
  const colors = picked ? { background: picked.background, accent: picked.accent } : THEME_COLORS[f.theme];
  const heads = (f.wiz.headlines ?? []).map((h) => h.trim()).filter(Boolean);
  const descs = (f.wiz.descriptions ?? []).map((h) => h.trim()).filter(Boolean);
  const search = f.platform === 'google' && f.objective === 'SEARCH';
  return {
    id: 'draft-preview',
    platform: f.platform,
    format: f.platform === 'meta' ? 'single_image' : search ? 'responsive_search' : f.objective === 'DISPLAY' ? 'responsive_display' : 'pmax_asset_group',
    headline,
    headlines: heads.length ? heads : [headline],
    primaryText: primary,
    descriptions: descs.length ? descs : [primary],
    callToAction: f.callToAction,
    finalUrl: f.finalUrl,
    visual: search ? null : { theme: picked?.theme ?? f.theme, ...colors, title: headline, subtitle: 'Demo creative' },
  };
}



export function defaultWiz(platform: Platform): WizExtra {
  return platform === 'meta'
    ? {
        account: 'Demo Meta account',
        locations: 'Slovenia',
        ageMin: 25,
        ageMax: 55,
        gender: 'all',
        interests: '',
        format: 'single_image',
        description: '',
        placementsMode: 'advantage',
        placements: ['Facebook feed', 'Instagram feed', 'Stories'],
        schedule: 'daily',
        lifetimeBudgetText: '300',
        start: '',
        end: '',
      }
    : {
        goal: 'LEADS',
        bidding: 'maximize_conversions',
        networks: ['Search'],
        locations: 'Slovenia',
        languages: 'English',
        adGroupName: '',
        keywords: '',
        assetGroupName: '',
        headlines: ['', '', ''],
        descriptions: ['', ''],
        conversions: [],
      };
}

/** Extra wizard rules beyond the base draft validation (local checks only, no Meta or Google call). */
export function wizardIssues(f: FormState): string[] {
  const out: string[] = [];
  const w = f.wiz;
  if (f.platform === 'meta') {
    const lo = w.ageMin ?? 18;
    const hi = w.ageMax ?? 65;
    if (lo < 18 || hi > 65 || lo > hi) out.push('Age range must be between 18 and 65, with the minimum not above the maximum.');
    if ((w.placementsMode ?? 'advantage') === 'manual' && (w.placements ?? []).length === 0) out.push('Choose at least one placement, or switch to Advantage+ placements.');
    if (w.schedule === 'lifetime' && parseBudgetMinor(w.lifetimeBudgetText ?? '') === null) out.push('Enter a lifetime budget in EUR.');
    if (w.start && w.end && w.end < w.start) out.push('The end date must not be before the start date.');
  } else {
    const heads = (w.headlines ?? []).map((h) => h.trim()).filter(Boolean);
    const descs = (w.descriptions ?? []).map((h) => h.trim()).filter(Boolean);
    if (f.includeAd) {
      if (heads.length < 3) out.push('Add at least 3 headlines (up to 15).');
      if (descs.length < 2) out.push('Add at least 2 descriptions (up to 4).');
      if ((w.headlines ?? []).some((h) => h.length > 30)) out.push('Each headline must be at most 30 characters.');
      if ((w.descriptions ?? []).some((h) => h.length > 90)) out.push('Each description must be at most 90 characters.');
    }
    if (f.objective === 'SEARCH' && !(w.keywords ?? '').trim()) out.push('Add at least one keyword for the ad group.');
    if (f.objective === 'PERFORMANCE_MAX' && !(w.assetGroupName ?? '').trim()) out.push('Name the asset group.');
    if ((w.networks ?? []).length === 0) out.push('Choose at least one network.');
  }
  return out;
}

export function allIssues(f: FormState): string[] {
  return [...Object.values(formErrors(f)), ...wizardIssues(f)];
}

export const CAMPAIGN_FIELDS: (keyof DraftErrors)[] = ['campaignName', 'dailyBudget'];
export const AD_FIELDS: (keyof DraftErrors)[] = ['adName', 'headline', 'primaryText', 'callToAction', 'finalUrl'];

export const labelCls = 'text-xs font-semibold text-ink-2';
export const fieldCls = `${inputCls} !h-9 w-full`;

export function Field(props: {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  children: (p: { id: string; 'aria-invalid': boolean; 'aria-describedby'?: string; className: string }) => ReactNode;
}) {
  const describedBy = props.error ? `${props.id}-err` : props.hint ? `${props.id}-hint` : undefined;
  return (
    <div className="grid gap-1">
      <label htmlFor={props.id} className={labelCls}>
        {props.label}
      </label>
      {props.children({
        id: props.id,
        'aria-invalid': Boolean(props.error),
        ...(describedBy ? { 'aria-describedby': describedBy } : {}),
        className: `${fieldCls} ${props.error ? '!border-negative' : ''}`,
      })}
      {props.error ? (
        <span className="text-xs text-negative" id={`${props.id}-err`} role="alert">
          {props.error}
        </span>
      ) : (
        props.hint && (
          <span className="text-2xs text-ink-3" id={`${props.id}-hint`}>
            {props.hint}
          </span>
        )
      )}
    </div>
  );
}

export function StepCard(props: { title: string; sub?: string; children: ReactNode }) {
  return (
    <section className="card p-4 sm:p-6">
      <h2 className="text-lg font-semibold text-ink">{props.title}</h2>
      {props.sub && <p className="mt-1 text-sm text-ink-3">{props.sub}</p>}
      <div className="mt-5 grid gap-4">{props.children}</div>
    </section>
  );
}

/** Eyebrow + question title above every wizard step. */
export function StepHeader(props: { n: number; of: number; title: string; sub?: string }) {
  return (
    <header>
      <p className="text-2xs font-semibold uppercase tracking-wider text-ink-3">
        Step {props.n} of {props.of}
      </p>
      <h2 className="mt-1 text-xl font-semibold tracking-tight text-ink">{props.title}</h2>
      {props.sub && <p className="mt-1 text-sm text-ink-3">{props.sub}</p>}
    </header>
  );
}

/** Neutral blue-gray information box with an (i) icon. */
export function InfoBox({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-sm leading-snug text-ink-2">
      <span aria-hidden className="mt-px inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-slate-400 text-[10px] font-semibold leading-none text-slate-500">
        i
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/** Radio card (objective, placements mode, campaign type). */
export function RadioCard(props: { name: string; checked: boolean; onChange: () => void; title: string; text: string; disabled?: boolean; badge?: ReactNode }) {
  return (
    <label
      className={`flex items-start gap-3 rounded-xl border p-3.5 text-sm transition ${props.disabled ? 'cursor-not-allowed opacity-55' : 'cursor-pointer'} ${
        props.checked ? 'border-brand bg-brand-soft/50 ring-1 ring-brand' : 'border-line bg-white hover:border-line-strong'
      }`}
    >
      <input type="radio" name={props.name} className="mt-1" checked={props.checked} disabled={props.disabled} onChange={props.onChange} />
      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-2 font-semibold text-ink">
          {props.title} {props.badge}
        </span>
        <span className="mt-0.5 block text-xs text-ink-3">{props.text}</span>
      </span>
    </label>
  );
}

/** State and actions shared by both wizards. Nothing here ever leaves the browser. */
export function useWizard(initial: FormState, stepCount: number) {
  const sim = useSim();
  const [f, setF] = useState<FormState>(initial);
  const [step, setStep] = useState(0);
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CreateResult | null>(null);
  const [savedNote, setSavedNote] = useState<string | null>(null);
  const allowed = canWrite(sim.role);
  const errors = useMemo(() => formErrors(f), [f]);
  const issues = useMemo(() => allIssues(f), [f]);
  const shown = (k: keyof DraftErrors) => (touched.has(k) || touched.has('*') ? errors[k] : undefined);
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    setF((s) => ({ ...s, [k]: v }));
    setSavedNote(null);
  };
  const setWiz = (patch: Partial<WizExtra>) => {
    setF((s) => ({ ...s, wiz: { ...s.wiz, ...patch } }));
    setSavedNote(null);
  };
  const touch = (keys: string[]) => setTouched((t) => new Set([...t, ...keys]));
  const go = (n: number) => setStep(Math.max(0, Math.min(stepCount - 1, n)));
  const save = (): Draft => {
    const saved = sim.saveDraft(toDraftFields({ ...f, campaignName: f.campaignName.trim() || 'Untitled draft' }));
    setF((s) => ({ ...s, id: saved.id }));
    setSavedNote(`Draft saved in this browser (${saved.id}). Nothing was sent anywhere.`);
    return saved;
  };
  const create = async () => {
    touch(['*']);
    if (issues.length > 0) return;
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
    } finally {
      setBusy(false);
    }
  };
  return { sim, f, set, setWiz, setF, step, go, touched, touch, errors, issues, shown, busy, result, setResult, savedNote, setSavedNote, allowed, save, create };
}

export function CreateResultCard({ result, onBack }: { result: CreateResult; onBack: () => void }) {
  const validatedOnly = result.mode === 'validated_only';
  return (
    <div className="card grid gap-3 p-4 sm:p-5" role="status">
      <div className="grid gap-1 rounded-lg bg-positive-soft p-3 text-sm text-ink">
        <strong>{validatedOnly ? 'Validated only' : 'Created in simulation (PAUSED)'}</strong>
        <span>{result.message}</span>
        {validatedOnly && <span>{GOOGLE_VALIDATE_ONLY_MESSAGE}</span>}
      </div>
      {!validatedOnly && (
        <ul className="grid gap-1.5 pl-5 text-sm">
          {result.entities.map((e) => (
            <li key={e.id}>
              {e.level === 'ad' ? 'Ad' : 'Campaign'} <strong>{e.name}</strong> <Badge tone="neutral">{e.status}</Badge> <code className="text-xs">{e.id}</code>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-ink-3">{validatedOnly ? 'The draft is kept so you can adjust it.' : 'Activation is a separate confirmed action: use Resume on the campaign row.'}</p>
      <div className="flex flex-wrap items-center gap-2">
        {!validatedOnly && (
          <Link className="btn btn-primary btn-sm" to="/campaigns">
            Open campaigns
          </Link>
        )}
        <Link className="btn btn-secondary btn-sm" to="/activity">
          View activity log
        </Link>
        <Button size="sm" variant="ghost" onClick={onBack}>
          Back to the form
        </Button>
      </div>
    </div>
  );
}
