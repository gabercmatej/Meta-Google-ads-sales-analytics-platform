// Seven-step "New Google campaign" wizard. Google is validate-only in the simulation: nothing is applied,
// and the draft is kept. No real Google call exists.
import { Link } from 'react-router-dom';
import { AdPreview } from '../components/AdPreview';
import { Badge, Button, StatList, StatRow } from '../components/ui';
import { CHANNEL_LABEL } from '../components/EntityBits';
import { money } from '../lib/format';
import { GOOGLE_VALIDATE_ONLY_MESSAGE, VIEWER_TOOLTIP } from './changeFlow';
import { AD_FIELDS, CTA_OPTIONS, CreateResultCard, Field, InfoBox, RadioCard, StepHeader, labelCls, parseBudgetMinor, previewCreative, useWizard, wizardIssues, type FormState } from './DraftForm';

const STEPS = ['Goal', 'Campaign type', 'Basics', 'Ad groups & keywords', 'Ad', 'Conversions', 'Review'] as const;
const GOALS: { id: string; title: string; text: string }[] = [
  { id: 'LEADS', title: 'Leads', text: 'Get enquiries through the site or a call.' },
  { id: 'TRAFFIC', title: 'Website traffic', text: 'Get the right people to visit the site.' },
  { id: 'SALES', title: 'Sales', text: 'Drive purchases tracked by a conversion action.' },
  { id: 'AWARENESS', title: 'Brand awareness', text: 'Show the brand to a wide audience.' },
];
const TYPES: { id: string; title: string; text: string; available: boolean }[] = [
  { id: 'SEARCH', title: 'Search', text: 'Text ads on Google results when people search for your keywords. You control keywords and ad text.', available: true },
  { id: 'PERFORMANCE_MAX', title: 'Performance Max', text: 'One campaign that serves across Google channels from your assets. It uses asset groups, not ad groups or keywords.', available: true },
  { id: 'DISPLAY', title: 'Display', text: 'Image and responsive ads across partner sites and apps. Best for reach and remarketing.', available: true },
  { id: 'VIDEO', title: 'Video', text: 'Video ads on YouTube. Not available in this demo.', available: false },
  { id: 'DEMAND_GEN', title: 'Demand Gen', text: 'Visual ads on YouTube, Discover and Gmail. Not available in this demo.', available: false },
];
const BIDDING = [
  ['maximize_conversions', 'Maximize conversions'],
  ['target_cpa', 'Target cost per action'],
  ['maximize_clicks', 'Maximize clicks'],
  ['manual_cpc', 'Manual CPC'],
] as const;
const NETWORKS = ['Search', 'Search partners', 'Display'];
const CONVERSIONS = ['Contact form submitted', 'Phone call from ads', 'Newsletter sign-up', 'Booking completed'];
const MAX_HEADS = 15;
const MAX_DESCS = 4;

function Counter({ value, max }: { value: string; max: number }) {
  return <span className={`tabular text-2xs ${value.length > max ? 'text-negative' : 'text-ink-3'}`}>{value.length}/{max}</span>;
}

export function GoogleWizard({ initial, idPrefix = 'gw' }: { initial: FormState; idPrefix?: string }) {
  const w = useWizard(initial, STEPS.length);
  const { f, set, setWiz, setF, step, go, touch, shown, result, setResult, savedNote, allowed, busy } = w;
  const x = f.wiz;
  const pmax = f.objective === 'PERFORMANCE_MAX';
  const search = f.objective === 'SEARCH';
  const heads = x.headlines ?? [];
  const descs = x.descriptions ?? [];

  const setHeads = (next: string[]) => {
    setF((s) => ({ ...s, headline: next.find((h) => h.trim()) ?? '', wiz: { ...s.wiz, headlines: next } }));
  };
  const setDescs = (next: string[]) => {
    setF((s) => ({ ...s, primaryText: next.find((h) => h.trim()) ?? '', wiz: { ...s.wiz, descriptions: next } }));
  };

  const issues = wizardIssues(f);
  const stepOk = (i: number): boolean => {
    if (i === 2) return w.errors.campaignName === undefined && w.errors.dailyBudget === undefined && !issues.some((m) => m.includes('network'));
    if (i === 3) return !issues.some((m) => m.includes('keyword') || m.includes('asset group'));
    if (i === 4) return !f.includeAd || (AD_FIELDS.every((k) => !w.errors[k]) && !issues.some((m) => m.includes('headline') || m.includes('description') || m.includes('Headline')));
    return true;
  };
  const touchFor = (i: number) => {
    if (i === 2) touch(['campaignName', 'dailyBudget']);
    if (i === 3) touch(['assetGroup']);
    if (i === 4) touch(AD_FIELDS);
  };
  const next = () => {
    touchFor(step);
    if (!stepOk(step)) return;
    go(step + 1);
  };

  if (result?.success) return <CreateResultCard result={result} onBack={() => setResult(null)} />;

  const budgetMinor = parseBudgetMinor(f.budgetText);
  const toggle = (key: 'networks' | 'conversions', v: string) => {
    const cur = x[key] ?? [];
    setWiz({ [key]: cur.includes(v) ? cur.filter((p) => p !== v) : [...cur, v] });
  };

  return (
    <div className="grid grid-cols-1 gap-5 [&>*]:min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ol className="no-scrollbar flex min-w-0 flex-1 gap-2 overflow-x-auto" aria-label="Steps">
          {STEPS.map((label, i) => {
            const done = i < step;
            const on = i === step;
            return (
              <li
                key={label}
                data-done={done ? 'true' : undefined}
                aria-current={on ? 'step' : undefined}
                className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${
                  on ? 'border-brand bg-brand-soft text-brand' : done ? 'border-transparent bg-positive-soft text-positive' : 'border-line bg-slate-50 text-ink-3'
                }`}
              >
                <span className="tabular">{i + 1}.</span> {label}
              </li>
            );
          })}
        </ol>
        <Link className="btn btn-secondary btn-sm" to="/drafts">
          Drafts
        </Link>
      </div>

      <section className="card grid gap-5 p-4 sm:p-6">
        <StepHeader n={step + 1} of={STEPS.length} title={['What is the goal of this campaign?', 'Which campaign type fits?', 'Set up the basics', pmax ? 'Create an asset group' : search ? 'Set up the ad group and keywords' : 'Set up the ad group', pmax ? 'Write the asset group text' : 'Write the ad', 'Which conversions should it optimise for?', 'Review and validate'][step] ?? ''} sub={step === 0 ? 'Google Ads is validate-only in this demo: nothing is created, and a draft is kept.' : undefined} />

        {step === 0 && (
          <div className="grid gap-3 sm:grid-cols-2">
            {GOALS.map((g) => (
              <RadioCard key={g.id} name={`${idPrefix}-goal`} checked={x.goal === g.id} onChange={() => setWiz({ goal: g.id })} title={g.title} text={g.text} />
            ))}
          </div>
        )}

        {step === 1 && (
          <div className="grid gap-3 sm:grid-cols-2">
            {TYPES.map((t) => (
              <RadioCard
                key={t.id}
                name={`${idPrefix}-type`}
                checked={f.objective === t.id}
                disabled={!t.available}
                onChange={() => set('objective', t.id)}
                title={t.title}
                text={t.text}
                badge={!t.available ? <Badge tone="gray">Not in demo</Badge> : undefined}
              />
            ))}
          </div>
        )}

        {step === 2 && (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id={`${idPrefix}-name`} label="Campaign name" error={shown('campaignName')}>
                {(p) => <input {...p} value={f.campaignName} onChange={(e) => set('campaignName', e.target.value)} onBlur={() => touch(['campaignName'])} />}
              </Field>
              <Field id={`${idPrefix}-budget`} label="Daily budget (EUR)" error={shown('dailyBudget')} hint="Between €5.00 and €1,000.00">
                {(p) => <input {...p} inputMode="decimal" value={f.budgetText} onChange={(e) => set('budgetText', e.target.value)} onBlur={() => touch(['dailyBudget'])} />}
              </Field>
              <Field id={`${idPrefix}-bidding`} label="Bidding">
                {(p) => (
                  <select {...p} value={x.bidding} onChange={(e) => setWiz({ bidding: e.target.value })}>
                    {BIDDING.map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
              <Field id={`${idPrefix}-lang`} label="Languages">
                {(p) => <input {...p} value={x.languages ?? ''} onChange={(e) => setWiz({ languages: e.target.value })} />}
              </Field>
              <Field id={`${idPrefix}-loc`} label="Locations">
                {(p) => <input {...p} value={x.locations ?? ''} onChange={(e) => setWiz({ locations: e.target.value })} />}
              </Field>
            </div>
            {!pmax && (
              <fieldset className="grid gap-2">
                <legend className={`${labelCls} mb-1`}>Networks</legend>
                <div className="flex flex-wrap gap-4">
                  {NETWORKS.map((n) => (
                    <label key={n} className="flex items-center gap-2 text-sm text-ink-2">
                      <input type="checkbox" checked={(x.networks ?? []).includes(n)} onChange={() => toggle('networks', n)} /> {n}
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
            {issues.some((m) => m.includes('network')) && !pmax && (
              <p className="text-xs text-negative" role="alert">
                Choose at least one network.
              </p>
            )}
          </>
        )}

        {step === 3 && (
          <>
            {pmax ? (
              <>
                <Field id={`${idPrefix}-ag`} label="Asset group name" error={issues.find((m) => m.includes('asset group')) && touchedAny(w.touched) ? 'Name the asset group.' : undefined}>
                  {(p) => <input {...p} value={x.assetGroupName ?? ''} onChange={(e) => setWiz({ assetGroupName: e.target.value })} />}
                </Field>
                <InfoBox>Performance Max has asset groups instead of ad groups, and no keywords. Assets for the group are written in the next step.</InfoBox>
              </>
            ) : (
              <>
                <Field id={`${idPrefix}-adgroup`} label="Ad group name">
                  {(p) => <input {...p} value={x.adGroupName ?? ''} onChange={(e) => setWiz({ adGroupName: e.target.value })} />}
                </Field>
                {search ? (
                  <Field id={`${idPrefix}-kw`} label="Keywords" hint="One per line. Use quotes for phrase match and [brackets] for exact match.">
                    {(p) => <textarea {...p} aria-invalid={w.touched.has('assetGroup') && issues.some((m) => m.includes('keyword'))} className={`${p.className} !h-auto py-2`} rows={5} value={x.keywords ?? ''} onChange={(e) => setWiz({ keywords: e.target.value })} />}
                  </Field>
                ) : (
                  <InfoBox>Display ad groups target audiences and placements, not keywords. The demo uses automated targeting.</InfoBox>
                )}
              </>
            )}
          </>
        )}

        {step === 4 && (
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(260px,340px)] lg:items-start">
            <div className="grid min-w-0 gap-4">
              <label className="flex items-center gap-2 text-sm text-ink-2">
                <input type="checkbox" checked={f.includeAd} onChange={(e) => set('includeAd', e.target.checked)} /> {pmax ? 'Add text assets to the asset group' : 'Create the first ad'}
              </label>
              {f.includeAd ? (
                <>
                  <Field id={`${idPrefix}-adname`} label="Ad name" error={shown('adName')}>
                    {(p) => <input {...p} value={f.adName} onChange={(e) => set('adName', e.target.value)} onBlur={() => touch(['adName'])} />}
                  </Field>
                  <fieldset className="grid gap-2">
                    <legend className={labelCls}>Headlines ({heads.length}/{MAX_HEADS}), at least 3</legend>
                    {heads.map((h, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <input
                          aria-label={`Headline ${i + 1}`}
                          className={`${'h-9 w-full'} flex-1 rounded-lg border px-3 text-sm ${h.length > 30 ? 'border-negative' : 'border-line'}`}
                          value={h}
                          onChange={(e) => setHeads(heads.map((v, j) => (j === i ? e.target.value : v)))}
                        />
                        <Counter value={h} max={30} />
                        {heads.length > 3 && (
                          <Button size="sm" variant="ghost" aria-label={`Remove headline ${i + 1}`} onClick={() => setHeads(heads.filter((_, j) => j !== i))}>
                            ×
                          </Button>
                        )}
                      </div>
                    ))}
                    {heads.length < MAX_HEADS && (
                      <Button size="sm" variant="ghost" className="justify-self-start" onClick={() => setHeads([...heads, ''])}>
                        + Add headline
                      </Button>
                    )}
                    {shown('headline') && <span className="text-xs text-negative" role="alert">{shown('headline')}</span>}
                  </fieldset>
                  <fieldset className="grid gap-2">
                    <legend className={labelCls}>Descriptions ({descs.length}/{MAX_DESCS}), at least 2</legend>
                    {descs.map((d, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <input
                          aria-label={`Description ${i + 1}`}
                          className={`h-9 w-full flex-1 rounded-lg border px-3 text-sm ${d.length > 90 ? 'border-negative' : 'border-line'}`}
                          value={d}
                          onChange={(e) => setDescs(descs.map((v, j) => (j === i ? e.target.value : v)))}
                        />
                        <Counter value={d} max={90} />
                        {descs.length > 2 && (
                          <Button size="sm" variant="ghost" aria-label={`Remove description ${i + 1}`} onClick={() => setDescs(descs.filter((_, j) => j !== i))}>
                            ×
                          </Button>
                        )}
                      </div>
                    ))}
                    {descs.length < MAX_DESCS && (
                      <Button size="sm" variant="ghost" className="justify-self-start" onClick={() => setDescs([...descs, ''])}>
                        + Add description
                      </Button>
                    )}
                    {shown('primaryText') && <span className="text-xs text-negative" role="alert">{shown('primaryText')}</span>}
                  </fieldset>
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
                  {issues.filter((m) => m.includes('headline') || m.includes('description') || m.includes('Headline')).length > 0 && w.touched.has('adName') && (
                    <ul className="m-0 pl-5 text-xs text-negative" role="alert">
                      {issues
                        .filter((m) => m.includes('headline') || m.includes('description'))
                        .map((m) => (
                          <li key={m}>{m}</li>
                        ))}
                    </ul>
                  )}
                </>
              ) : (
                <InfoBox>No ad text will be saved with the campaign.</InfoBox>
              )}
            </div>
            <aside className="grid gap-2 lg:sticky lg:top-3" aria-label="Live ad preview">
              <h3 className="text-sm font-semibold text-ink">Live preview</h3>
              <AdPreview creative={previewCreative(f)} size="md" />
            </aside>
          </div>
        )}

        {step === 5 && (
          <>
            <fieldset className="grid gap-2">
              <legend className={`${labelCls} mb-1`}>Conversion actions (demo)</legend>
              {CONVERSIONS.map((c) => (
                <label key={c} className="flex items-center gap-2 text-sm text-ink-2">
                  <input type="checkbox" checked={(x.conversions ?? []).includes(c)} onChange={() => toggle('conversions', c)} /> {c}
                </label>
              ))}
            </fieldset>
            <InfoBox>These are fictional conversion actions. The demo has no conversion tracking and never reads one from Google.</InfoBox>
          </>
        )}

        {step === 6 && (
          <>
            <StatList>
              <StatRow label="Goal" value={GOALS.find((g) => g.id === x.goal)?.title ?? '–'} />
              <StatRow label="Campaign type" value={CHANNEL_LABEL[f.objective] ?? f.objective} />
              <StatRow label="Campaign" value={f.campaignName || '–'} />
              <StatRow label="Daily budget" value={money(budgetMinor)} />
              <StatRow label="Bidding" value={BIDDING.find(([v]) => v === x.bidding)?.[1] ?? '–'} />
              <StatRow label="Locations and languages" value={`${x.locations || '–'}, ${x.languages || '–'}`} />
              <StatRow label={pmax ? 'Asset group' : 'Ad group'} value={pmax ? x.assetGroupName || '–' : x.adGroupName || '–'} />
              {search && <StatRow label="Keywords" value={String((x.keywords ?? '').split('\n').filter((k) => k.trim()).length)} />}
              <StatRow label="Headlines / descriptions" value={f.includeAd ? `${heads.filter((h) => h.trim()).length} / ${descs.filter((d) => d.trim()).length}` : 'Not included'} />
              <StatRow label="Conversions" value={(x.conversions ?? []).join(', ') || 'None selected'} />
              <StatRow label="Status" value={<Badge tone="neutral">PAUSED</Badge>} />
            </StatList>
            {w.issues.length > 0 ? (
              <ul className="m-0 rounded-lg bg-negative-soft py-2.5 pl-7 pr-3 text-sm text-negative" role="alert">
                {w.issues.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            ) : (
              <InfoBox>No validation issues.</InfoBox>
            )}
            <InfoBox>{GOOGLE_VALIDATE_ONLY_MESSAGE}.</InfoBox>
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
          <Button variant="secondary" onClick={() => w.save()}>
            Save draft
          </Button>
          {step > 0 && (
            <Button variant="ghost" onClick={() => go(step - 1)}>
              Back
            </Button>
          )}
          {step < STEPS.length - 1 ? (
            <Button variant="primary" onClick={next}>
              Next
            </Button>
          ) : (
            <span title={allowed ? undefined : VIEWER_TOOLTIP}>
              <Button variant="primary" disabled={!allowed || busy} onClick={() => void w.create()}>
                Validate (no real change)
              </Button>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function touchedAny(t: Set<string>): boolean {
  return t.has('*') || t.has('assetGroup');
}
