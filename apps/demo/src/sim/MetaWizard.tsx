// Six-step Meta campaign wizard: Goal, Audience, Ad, Placements, Budget & schedule, Review.
// Every object is created PAUSED through the simulated workflow; nothing leaves the browser.
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { AdPreview } from '../components/AdPreview';
import { Badge, Button, StatList, StatRow } from '../components/ui';
import { OBJECTIVE_LABEL } from '../components/EntityBits';
import { getDataset } from '../lib/data';
import { money } from '../lib/format';
import { VIEWER_TOOLTIP } from './changeFlow';
import { AD_FIELDS, CTA_OPTIONS, CreateResultCard, Field, InfoBox, OBJECTIVES, RadioCard, StepHeader, THEME_OPTIONS, fieldCls, labelCls, parseBudgetMinor, previewCreative, useWizard, wizardIssues, type FormState } from './DraftForm';
import type { CreativeTheme } from '@sedem-ads/analytics-core';

const SUBS = ['Account and objective', 'Location, age, interests', 'Image, text, creative', 'Facebook, Instagram, Stories', 'Daily or lifetime budget', 'Check and confirm'] as const;
const STEPS = ['Goal', 'Audience', 'Ad', 'Placements', 'Budget & schedule', 'Review'] as const;
const TITLES = ['What do you want to achieve?', 'Who should see your ads?', 'What will your ad look like?', 'Where should your ads appear?', 'How much do you want to spend, and when?', 'Ready to create?'];
const OBJECTIVE_TEXT: Record<string, string> = {
  LEADS: 'Collect enquiries through an instant form or a landing page.',
  TRAFFIC: 'Send people to a page on the site and count link clicks.',
  SALES: 'Optimise for purchases tracked by a conversion event.',
  AWARENESS: 'Reach as many people as possible. Results are reach, not leads.',
};
const PLACEMENTS = ['Facebook feed', 'Instagram feed', 'Stories', 'Reels', 'Right column', 'Audience Network'];

export function MetaWizard({ initial, idPrefix = 'mw' }: { initial: FormState; idPrefix?: string }) {
  const w = useWizard(initial, STEPS.length);
  const { f, set, setWiz, step, go, touch, shown, result, setResult, savedNote, allowed, busy } = w;
  const x = f.wiz;
  const creatives = useMemo(() => getDataset().creatives.filter((c) => c.platform === 'meta' && c.visual).slice(0, 6), []);

  const stepOk = (i: number): boolean => {
    if (i === 0) return w.errors.campaignName === undefined;
    if (i === 1) return !wizardIssues(f).some((m) => m.startsWith('Age'));
    if (i === 2) return !f.includeAd || AD_FIELDS.every((k) => !w.errors[k]);
    if (i === 3) return !wizardIssues(f).some((m) => m.includes('placement'));
    if (i === 4) return w.errors.dailyBudget === undefined && !wizardIssues(f).some((m) => m.includes('budget') || m.includes('date'));
    return true;
  };
  const touchFor = (i: number) => {
    if (i === 0) touch(['campaignName']);
    if (i === 2) touch(AD_FIELDS);
    if (i === 4) touch(['dailyBudget']);
  };
  const advance = () => {
    touchFor(step);
    if (!stepOk(step)) return;
    w.save();
    go(step + 1);
  };

  if (result?.success) return <CreateResultCard result={result} onBack={() => setResult(null)} />;

  const budgetMinor = parseBudgetMinor(f.budgetText);
  const days = x.start && x.end ? Math.max(1, Math.round((Date.parse(x.end) - Date.parse(x.start)) / 86_400_000) + 1) : 7;
  const dailyEff = x.schedule === 'lifetime' ? Math.round((parseBudgetMinor(x.lifetimeBudgetText ?? '') ?? 0) / days) : (budgetMinor ?? 0);
  const estReach = Math.round(((dailyEff / 100) / 6.5) * 1000 * days);
  const estLeads = Math.round(((dailyEff / 100) / 9) * days);

  const toggleIn = (key: 'placements', v: string) => {
    const cur = x[key] ?? [];
    setWiz({ [key]: cur.includes(v) ? cur.filter((p) => p !== v) : [...cur, v] });
  };

  return (
    <div className="grid grid-cols-1 gap-5 [&>*]:min-w-0">
      <div className="flex items-start gap-3">
        <ol className="no-scrollbar grid min-w-0 flex-1 grid-flow-col auto-cols-[minmax(9.5rem,1fr)] overflow-x-auto rounded-xl border border-line bg-white shadow-sm" aria-label="Steps">
          {STEPS.map((label, i) => {
            const done = i < step;
            const on = i === step;
            return (
              <li key={label} aria-current={on ? 'step' : undefined} data-done={done ? 'true' : undefined} className={`border-line ${i > 0 ? 'border-l' : ''} ${on ? 'bg-brand-soft/50' : ''}`}>
                <button type="button" disabled={i > step} onClick={() => go(i)} className="flex h-full w-full items-start gap-2.5 p-3 text-left">
                  <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-2xs font-semibold tabular ${on ? 'bg-brand text-white' : done ? 'bg-positive-soft text-positive' : 'border border-line-strong text-ink-3'}`}>{done ? '✓' : i + 1}</span>
                  <span className="min-w-0">
                    <span className={`block text-sm font-semibold ${on || done ? 'text-ink' : 'text-ink-2'}`}>{label}</span>
                    <span className="mt-0.5 block text-2xs leading-snug text-ink-3">{SUBS[i]}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
        <Link className="btn btn-secondary btn-md shrink-0" to="/drafts">
          Drafts
        </Link>
      </div>

      <section className="card grid gap-5 p-4 sm:p-6">
        <StepHeader n={step + 1} of={STEPS.length} title={TITLES[step] ?? ''} />

        {step === 0 && (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id={`${idPrefix}-account`} label="Ad account">
                {(p) => (
                  <select {...p} value={x.account} onChange={(e) => setWiz({ account: e.target.value })}>
                    <option>Demo Meta account</option>
                  </select>
                )}
              </Field>
              <Field id={`${idPrefix}-name`} label="Campaign name" error={shown('campaignName')}>
                {(p) => <input {...p} value={f.campaignName} onChange={(e) => set('campaignName', e.target.value)} onBlur={() => touch(['campaignName'])} />}
              </Field>
            </div>
            <fieldset className="grid gap-2">
              <legend className={labelCls}>Objective</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                {OBJECTIVES.meta.map((o) => (
                  <RadioCard key={o} name={`${idPrefix}-objective`} checked={f.objective === o} onChange={() => set('objective', o)} title={OBJECTIVE_LABEL[o] ?? o} text={OBJECTIVE_TEXT[o] ?? ''} />
                ))}
              </div>
            </fieldset>
            <InfoBox>The new campaign is always created PAUSED. Turning it on later is a separate confirmed action, and nothing here is sent to Meta.</InfoBox>
          </>
        )}

        {step === 1 && (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id={`${idPrefix}-loc`} label="Locations">
                {(p) => <input {...p} value={x.locations ?? ''} onChange={(e) => setWiz({ locations: e.target.value })} />}
              </Field>
              <Field id={`${idPrefix}-gender`} label="Gender">
                {(p) => (
                  <select {...p} value={x.gender} onChange={(e) => setWiz({ gender: e.target.value as 'all' | 'women' | 'men' })}>
                    <option value="all">All genders</option>
                    <option value="women">Women</option>
                    <option value="men">Men</option>
                  </select>
                )}
              </Field>
              <Field id={`${idPrefix}-agemin`} label="Minimum age">
                {(p) => <input {...p} type="number" min={18} max={65} value={x.ageMin ?? 18} onChange={(e) => setWiz({ ageMin: Number(e.target.value) })} />}
              </Field>
              <Field id={`${idPrefix}-agemax`} label="Maximum age">
                {(p) => <input {...p} type="number" min={18} max={65} value={x.ageMax ?? 65} onChange={(e) => setWiz({ ageMax: Number(e.target.value) })} />}
              </Field>
            </div>
            <Field id={`${idPrefix}-interests`} label="Interests" hint="Comma separated, optional">
              {(p) => <input {...p} value={x.interests ?? ''} onChange={(e) => setWiz({ interests: e.target.value })} />}
            </Field>
            {wizardIssues(f).some((m) => m.startsWith('Age')) && (
              <p className="text-xs text-negative" role="alert">
                Age range must be between 18 and 65, with the minimum not above the maximum.
              </p>
            )}
            <InfoBox>
              <strong>Estimated audience size: about {(Math.max(40, 520 - ((x.ageMin ?? 18) - 18) * 6 - (65 - (x.ageMax ?? 65)) * 4) * 1000).toLocaleString('en-GB')} people.</strong> Simulated estimate for the demo, not a Meta figure.
            </InfoBox>
          </>
        )}

        {step === 2 && (
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(260px,340px)] lg:items-start">
            <div className="grid min-w-0 gap-4">
              <label className="flex items-center gap-2 text-sm text-ink-2">
                <input type="checkbox" checked={f.includeAd} onChange={(e) => set('includeAd', e.target.checked)} /> Create a first ad with this campaign
              </label>
              {f.includeAd ? (
                <>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field id={`${idPrefix}-format`} label="Format">
                      {(p) => (
                        <select {...p} value={x.format} onChange={(e) => setWiz({ format: e.target.value as 'single_image' | 'carousel' | 'video' })}>
                          <option value="single_image">Single image</option>
                          <option value="carousel" disabled>
                            Carousel (not in the demo)
                          </option>
                          <option value="video" disabled>
                            Video (not in the demo)
                          </option>
                        </select>
                      )}
                    </Field>
                    <Field id={`${idPrefix}-adname`} label="Ad name" error={shown('adName')}>
                      {(p) => <input {...p} value={f.adName} onChange={(e) => set('adName', e.target.value)} onBlur={() => touch(['adName'])} />}
                    </Field>
                  </div>
                  <Field id={`${idPrefix}-headline`} label="Headline" error={shown('headline')} hint={`${f.headline.length}/60`}>
                    {(p) => <input {...p} value={f.headline} onChange={(e) => set('headline', e.target.value)} onBlur={() => touch(['headline'])} />}
                  </Field>
                  <Field id={`${idPrefix}-text`} label="Primary text" error={shown('primaryText')} hint={`${f.primaryText.length}/300`}>
                    {(p) => <textarea {...p} className={`${p.className} !h-auto py-2`} rows={3} value={f.primaryText} onChange={(e) => set('primaryText', e.target.value)} onBlur={() => touch(['primaryText'])} />}
                  </Field>
                  <Field id={`${idPrefix}-desc`} label="Description" hint="Optional, shown under the headline">
                    {(p) => <input {...p} value={x.description ?? ''} onChange={(e) => setWiz({ description: e.target.value })} />}
                  </Field>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field id={`${idPrefix}-cta`} label="Call to action" error={shown('callToAction')}>
                      {(p) => (
                        <select {...p} value={f.callToAction} onChange={(e) => set('callToAction', e.target.value)}>
                          {CTA_OPTIONS.map((c) => (
                            <option key={c}>{c}</option>
                          ))}
                        </select>
                      )}
                    </Field>
                    <Field id={`${idPrefix}-url`} label="Final URL" error={shown('finalUrl')} hint="Must start with https://example.com/">
                      {(p) => <input {...p} value={f.finalUrl} onChange={(e) => set('finalUrl', e.target.value)} onBlur={() => touch(['finalUrl'])} />}
                    </Field>
                  </div>
                  <fieldset className="grid gap-2">
                    <legend className={labelCls}>Creative</legend>
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-6" role="radiogroup" aria-label="Creative">
                      {creatives.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          role="radio"
                          aria-checked={x.creativeId === c.id}
                          aria-label={`Creative: ${c.visual?.title ?? c.id}`}
                          onClick={() => {
                            setWiz({ creativeId: c.id });
                            if (c.visual) set('theme', c.visual.theme as CreativeTheme);
                          }}
                          className={`aspect-square overflow-hidden rounded-lg p-1.5 text-left text-[10px] font-semibold leading-tight ring-2 ${x.creativeId === c.id ? 'ring-brand' : 'ring-transparent hover:ring-line-strong'}`}
                          style={{ background: c.visual?.background, color: c.visual?.accent }}
                        >
                          {c.visual?.title}
                        </button>
                      ))}
                    </div>
                    <div className="grid gap-1 sm:max-w-xs">
                      <label htmlFor={`${idPrefix}-theme`} className={labelCls}>
                        Visual theme
                      </label>
                      <select id={`${idPrefix}-theme`} className={fieldCls} value={f.theme} onChange={(e) => (setWiz({ creativeId: undefined }), set('theme', e.target.value as CreativeTheme))}>
                        {THEME_OPTIONS.map((t) => (
                          <option key={t.value} value={t.value}>
                            {t.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <p className="text-xs text-ink-3">Original illustrations drawn in the browser. No uploads in the demo.</p>
                  </fieldset>
                </>
              ) : (
                <InfoBox>No ad will be created. The campaign is created empty and PAUSED.</InfoBox>
              )}
            </div>
            <aside className="grid gap-2 lg:sticky lg:top-3" aria-label="Live ad preview">
              <h3 className="text-sm font-semibold text-ink">Live preview</h3>
              <AdPreview creative={previewCreative(f)} size="md" />
            </aside>
          </div>
        )}

        {step === 3 && (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <RadioCard name={`${idPrefix}-pl`} checked={(x.placementsMode ?? 'advantage') === 'advantage'} onChange={() => setWiz({ placementsMode: 'advantage' })} title="Advantage+ placements" text="Let the delivery system spread the budget across all placements. Recommended." badge={<Badge tone="blue">Recommended</Badge>} />
              <RadioCard name={`${idPrefix}-pl`} checked={x.placementsMode === 'manual'} onChange={() => setWiz({ placementsMode: 'manual' })} title="Manual placements" text="Choose exactly where the ad can appear." />
            </div>
            {x.placementsMode === 'manual' && (
              <fieldset className="grid gap-2 sm:grid-cols-2">
                <legend className={`${labelCls} mb-1`}>Placements</legend>
                {PLACEMENTS.map((p) => (
                  <label key={p} className="flex items-center gap-2 text-sm text-ink-2">
                    <input type="checkbox" checked={(x.placements ?? []).includes(p)} onChange={() => toggleIn('placements', p)} /> {p}
                  </label>
                ))}
              </fieldset>
            )}
            {wizardIssues(f).some((m) => m.includes('placement')) && (
              <p className="text-xs text-negative" role="alert">
                Choose at least one placement, or switch to Advantage+ placements.
              </p>
            )}
          </>
        )}

        {step === 4 && (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id={`${idPrefix}-sched`} label="Budget type">
                {(p) => (
                  <select {...p} value={x.schedule} onChange={(e) => setWiz({ schedule: e.target.value as 'daily' | 'lifetime' })}>
                    <option value="daily">Daily budget</option>
                    <option value="lifetime">Lifetime budget</option>
                  </select>
                )}
              </Field>
              {x.schedule === 'lifetime' ? (
                <Field id={`${idPrefix}-lifetime`} label="Lifetime budget (EUR)">
                  {(p) => <input {...p} inputMode="decimal" value={x.lifetimeBudgetText ?? ''} onChange={(e) => setWiz({ lifetimeBudgetText: e.target.value })} />}
                </Field>
              ) : (
                <Field id={`${idPrefix}-budget`} label="Daily budget (EUR)" error={shown('dailyBudget')} hint="Between €5.00 and €1,000.00">
                  {(p) => <input {...p} inputMode="decimal" value={f.budgetText} onChange={(e) => set('budgetText', e.target.value)} onBlur={() => touch(['dailyBudget'])} />}
                </Field>
              )}
              <Field id={`${idPrefix}-start`} label="Start date">
                {(p) => <input {...p} type="date" value={x.start ?? ''} onChange={(e) => setWiz({ start: e.target.value })} />}
              </Field>
              <Field id={`${idPrefix}-end`} label="End date (optional)">
                {(p) => <input {...p} type="date" value={x.end ?? ''} onChange={(e) => setWiz({ end: e.target.value })} />}
              </Field>
            </div>
            {x.schedule === 'lifetime' && (
              <Field id={`${idPrefix}-budget`} label="Daily budget (EUR)" error={shown('dailyBudget')} hint="Used for the PAUSED campaign in the demo">
                {(p) => <input {...p} inputMode="decimal" value={f.budgetText} onChange={(e) => set('budgetText', e.target.value)} onBlur={() => touch(['dailyBudget'])} />}
              </Field>
            )}
            <InfoBox>
              <strong>
                Estimated results over {days} days: about {estReach.toLocaleString('en-GB')} people reached and {estLeads.toLocaleString('en-GB')} {f.objective === 'LEADS' ? 'leads' : 'results'}.
              </strong>{' '}
              Simulated estimate for the demo, not a Meta forecast.
            </InfoBox>
          </>
        )}

        {step === 5 && (
          <>
            <StatList>
              <StatRow label="Ad account" value={x.account ?? '–'} />
              <StatRow label="Campaign" value={f.campaignName || '–'} />
              <StatRow label="Objective" value={OBJECTIVE_LABEL[f.objective] ?? f.objective} />
              <StatRow label="Audience" value={`${x.locations || '–'}, ${x.ageMin}–${x.ageMax}, ${x.gender === 'all' ? 'all genders' : x.gender}`} />
              <StatRow label="Placements" value={x.placementsMode === 'manual' ? (x.placements ?? []).join(', ') || 'None selected' : 'Advantage+ placements'} />
              <StatRow label="Budget" value={x.schedule === 'lifetime' ? `${money(parseBudgetMinor(x.lifetimeBudgetText ?? ''))} lifetime` : `${money(budgetMinor)} per day`} />
              <StatRow label="Schedule" value={x.start ? `${x.start}${x.end ? ` to ${x.end}` : ', no end date'}` : 'Starts when activated'} />
              <StatRow label="Ad" value={f.includeAd ? f.adName || '–' : 'Not included'} />
              <StatRow label="Status after creation" value={<Badge tone="neutral">PAUSED</Badge>} />
            </StatList>
            {w.issues.length > 0 ? (
              <ul className="m-0 rounded-lg bg-negative-soft py-2.5 pl-7 pr-3 text-sm text-negative" role="alert">
                {w.issues.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            ) : (
              <InfoBox>No validation issues. Creating is simulated and the objects are PAUSED.</InfoBox>
            )}
            {!allowed && <InfoBox>{VIEWER_TOOLTIP}.</InfoBox>}
            {result && !result.success && (
              <ul className="m-0 rounded-lg bg-negative-soft py-2.5 pl-7 pr-3 text-sm text-negative" role="alert">
                {result.issues.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-white px-4 py-3">
        <Link to="/drafts" className="text-sm font-medium text-ink-2 underline underline-offset-2 hover:text-ink">
          Draft list
        </Link>
        {savedNote && (
          <span className="min-w-0 text-xs font-semibold text-positive" role="status">
            {savedNote}
          </span>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {step > 0 && (
            <Button variant="ghost" onClick={() => go(step - 1)}>
              Back
            </Button>
          )}
          {step < STEPS.length - 1 ? (
            <Button variant="primary" onClick={advance}>
              Create draft and continue →
            </Button>
          ) : (
            <span title={allowed ? undefined : VIEWER_TOOLTIP}>
              <Button variant="primary" disabled={!allowed || busy} onClick={() => void w.create()}>
                Create (PAUSED)
              </Button>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
