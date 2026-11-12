import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { entityPerformance, type EntityLevel, type EntityPerformanceRow, type ShowcaseCreative, type ShowcaseEntityStatus } from '@sedem-ads/analytics-core';
import { Badge, Dialog, EmptyState, InfoTip, PageTitle, StatusPill, Value, inputCls } from '../components/ui';
import { PeriodBar } from '../components/PeriodBar';
import { AdPreview } from '../components/AdPreview';
import { EntityActions, useSim } from '../sim/SimProvider';
import { ChangeText, PlatformBadge, CHANNEL_LABEL, OBJECTIVE_LABEL } from '../components/EntityBits';
import { Spark } from '../components/OverviewCharts';
import { COLOR } from '../components/charts/colors';
import { useAppState } from '../state/AppState';
import { getDataset } from '../lib/data';
import { count, date, dateRange, money, pct } from '../lib/format';
import {
  CLASS_LABEL,
  COLUMNS,
  PILLS,
  RESULT_OPTIONS,
  classify,
  costPerResult,
  isAssetGroupName,
  isPmax,
  keywordCount,
  loadColumns,
  median,
  resultOf,
  resultTrend,
  saveColumns,
  type Classification,
  type ColumnId,
  type PillId,
  type ResultKind,
  type TableLevel,
} from '../lib/campaignView';

type SortKey = 'name' | 'status' | 'performance' | 'spend' | 'results' | 'cpl' | 'ctr' | 'cpc' | 'budget' | 'dates';
const LEVELS: readonly TableLevel[] = ['campaigns', 'adsets', 'ads'];
const SORT_DEFAULT_ASC: readonly SortKey[] = ['name', 'cpc', 'cpl'];

interface Eff {
  status: ShowcaseEntityStatus;
  name: string;
  budget: number | null;
  validatedOnly?: boolean;
}

const tabCls = (on: boolean) =>
  `inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ${on ? 'bg-white text-ink shadow' : 'text-ink-3 hover:text-ink'}`;
const chipCls = (on: boolean) =>
  `h-8 whitespace-nowrap rounded-full border px-3 text-xs font-semibold transition-colors ${on ? 'border-brand bg-brand-soft text-brand-hover' : 'border-line-strong bg-white text-ink-2 hover:border-slate-400'}`;
const ddBtn = 'inline-flex h-8 items-center gap-1.5 rounded-lg border border-line-strong bg-white px-3 text-sm font-medium text-ink-2 hover:border-slate-400';
const CLASS_TONE: Record<Classification, 'good' | 'bad' | 'warn' | 'gray'> = { strong: 'good', attention: 'bad', fatigue: 'warn', average: 'gray', no_results: 'gray' };

/** Small creative thumbnail drawn from the synthetic creative spec; click opens the full preview. */
function AdThumb({ creative, onOpen }: { creative: ShowcaseCreative | undefined; onOpen: () => void }) {
  const v = creative?.visual;
  const style = v ? { background: `linear-gradient(135deg, ${v.background}, ${v.accent})` } : undefined;
  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={!creative}
      title={creative ? 'Preview this creative' : 'No creative'}
      aria-label={creative ? `Preview creative: ${creative.headline}` : 'No creative'}
      className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md border border-line bg-slate-100 text-[9px] font-bold uppercase leading-none text-white hover:border-brand"
      style={style}
    >
      {creative ? (v ? creative.format.split('_')[0] : 'Aa') : ''}
    </button>
  );
}

function CopyId({ id, name }: { id: string; name: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      aria-label={`Copy ID of ${name}`}
      title={done ? 'Copied' : `Copy ID ${id}`}
      className="shrink-0 rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-ink-2"
      onClick={() => {
        try {
          void navigator.clipboard?.writeText(id);
        } catch {
          /* clipboard unavailable */
        }
        setDone(true);
        window.setTimeout(() => setDone(false), 1200);
      }}
    >
      {done ? (
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M3 8.5l3.2 3L13 4.5" /></svg>
      ) : (
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden><rect x="5.5" y="5.5" width="8" height="8" rx="1.5" /><path d="M10.5 5.5V3.8a1.3 1.3 0 0 0-1.3-1.3H3.8a1.3 1.3 0 0 0-1.3 1.3v5.4a1.3 1.3 0 0 0 1.3 1.3h1.7" /></svg>
      )}
    </button>
  );
}

/** Dropdown button with a click-outside-to-close panel. */
function Dropdown({ label, children, badge }: { label: string; children: ReactNode; badge?: number }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      <button type="button" className={ddBtn} aria-haspopup="true" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {label}
        {badge ? <span className="rounded bg-brand px-1 text-2xs text-white">{badge}</span> : null}
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden><path d="M2 3.5l3 3 3-3" /></svg>
      </button>
      {open && <div className="absolute left-0 top-9 z-30 w-64 rounded-lg border border-line bg-white p-3 shadow-lg">{children}</div>}
    </div>
  );
}

export default function CampaignsPage() {
  const { workspace, range, setPlatform } = useAppState();
  const sim = useSim();
  const ds = getDataset();
  const [params, setParams] = useSearchParams();
  const level: TableLevel = (LEVELS as readonly string[]).includes(params.get('level') ?? '') ? (params.get('level') as TableLevel) : 'campaigns';
  const campaignId = params.get('campaign') ?? '';
  const adsetId = params.get('adset') ?? '';
  const treeView = params.get('view') === 'tree';

  const [result, setResult] = useState<ResultKind>('leads');
  const [pill, setPill] = useState<PillId>('all');
  const [statusF, setStatusF] = useState<'all' | ShowcaseEntityStatus>('all');
  const [classF, setClassF] = useState<'all' | Classification>('all');
  const [search, setSearch] = useState('');
  const [cols, setCols] = useState<ColumnId[]>(() => loadColumns());
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'spend', dir: -1 });
  const [preview, setPreview] = useState<ShowcaseCreative | null>(null);

  // Deep link: ?platform= selects the workspace once on arrival; later switcher changes reset the drill-down.
  const mounted = useRef(false);
  const lastWorkspace = useRef(workspace);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      const p = params.get('platform');
      if ((p === 'meta' || p === 'google') && p !== workspace) setPlatform(p);
      return;
    }
    if (lastWorkspace.current !== workspace) {
      lastWorkspace.current = workspace;
      setParams({ platform: workspace }, { replace: true });
      setPill('all');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace]);

  const link = (next: { level?: TableLevel; campaign?: string; adset?: string; view?: string }): string => {
    const q = new URLSearchParams({ platform: workspace });
    if (next.level && next.level !== 'campaigns') q.set('level', next.level);
    if (next.campaign) q.set('campaign', next.campaign);
    if (next.adset) q.set('adset', next.adset);
    if (next.view) q.set('view', next.view);
    return `/campaigns?${q.toString()}`;
  };

  const rows = useMemo(() => {
    if (!range) return null;
    return {
      campaigns: entityPerformance(ds, { level: 'campaign', view: workspace, range }),
      adsets: entityPerformance(ds, { level: 'ad_group', view: workspace, range }),
      ads: entityPerformance(ds, { level: 'ad', view: workspace, range }),
    } as Record<TableLevel, EntityPerformanceRow[]>;
  }, [ds, range, workspace]);

  const toggleCol = (id: ColumnId) => {
    setCols((c) => {
      const next = c.includes(id) ? c.filter((x) => x !== id) : COLUMNS.map((d) => d.id).filter((x) => x === id || c.includes(x));
      saveColumns(next);
      return next;
    });
  };
  const resetCols = () => {
    const all = COLUMNS.map((c) => c.id);
    setCols(all);
    saveColumns(all);
  };
  const show = (id: ColumnId) => cols.includes(id);

  if (!range || !rows) {
    return (
      <>
        <PageTitle title="Campaigns & ads" />
        <EmptyState title="No completed days in this period" />
      </>
    );
  }

  const eff = (r: EntityPerformanceRow): Eff => {
    const o = sim.overlay(r.id);
    return { status: o?.status ?? r.status, name: o?.name ?? r.name, budget: o && 'dailyBudgetMinor' in o && o.dailyBudgetMinor !== undefined ? o.dailyBudgetMinor : r.dailyBudgetMinor, validatedOnly: o?.validatedOnly };
  };
  const campaignRow = rows.campaigns.find((c) => c.id === campaignId);
  const adsetRow = rows.adsets.find((g) => g.id === adsetId);
  const campaignPmax = campaignId ? isPmax(ds, campaignId) : false;
  const campName = new Map(rows.campaigns.map((c) => [c.id, eff(c).name]));
  const groupName = new Map(rows.adsets.map((g) => [g.id, eff(g).name]));
  const targetingOf = new Map(ds.adGroups.map((g) => [g.id, g.targeting]));
  const startOf = new Map(ds.campaigns.map((c) => [c.id, c.startDate]));
  const launchOf = new Map(ds.ads.map((a) => [a.id, a.launchDate]));

  const groupWord = workspace === 'meta' ? 'Ad sets' : campaignPmax ? 'Asset groups' : 'Ad groups';
  const levelLabelPlural: Record<TableLevel, string> = { campaigns: 'Campaigns', adsets: groupWord, ads: 'Ads' };
  const levelWord: Record<TableLevel, string> = {
    campaigns: 'campaign',
    adsets: workspace === 'meta' ? 'ad set' : campaignPmax ? 'asset group' : 'ad group',
    ads: campaignPmax ? 'asset-group ad' : 'ad',
  };

  // Parent scoping.
  const scoped = (lv: TableLevel): EntityPerformanceRow[] => {
    const all = rows[lv];
    if (lv === 'adsets' && campaignId) return all.filter((r) => r.campaignId === campaignId);
    if (lv === 'ads') {
      if (adsetId) return all.filter((r) => r.adGroupId === adsetId);
      if (campaignId) return all.filter((r) => r.campaignId === campaignId);
    }
    return all;
  };
  const q = search.trim().toLowerCase();
  const base = scoped(level).filter((r) => !q || eff(r).name.toLowerCase().includes(q));
  const medianCpl = median(scoped(level).map((r) => costPerResult(r, 'leads')).filter((v): v is number => v !== null));
  const klass = (r: EntityPerformanceRow) => classify(r, medianCpl);
  const cprOf = (r: EntityPerformanceRow) => costPerResult(r, result);
  const medianCpr = median(base.map(cprOf).filter((v): v is number => v !== null));

  const top3 = (key: (r: EntityPerformanceRow) => number | null) =>
    new Set([...base].filter((r) => key(r) !== null).sort((a, b) => (key(b) ?? 0) - (key(a) ?? 0)).slice(0, 3).map((r) => r.id));
  const topSpend = top3((r) => r.current.spendMinor);
  const topResults = top3((r) => resultOf(r, result));

  const pillFilter = (r: EntityPerformanceRow): boolean => {
    switch (pill) {
      case 'all': return true;
      case 'active': return eff(r).status === 'ACTIVE';
      case 'no_results': { const v = resultOf(r, result); return v === null || v === 0; }
      case 'high_cpl': { const c = cprOf(r); return c !== null && medianCpr !== null && c >= medianCpr * 1.25; }
      case 'highest_spend': return topSpend.has(r.id);
      case 'best_results': return topResults.has(r.id);
      case 'attention': return klass(r) === 'attention';
    }
  };

  const sortValue = (r: EntityPerformanceRow, e: Eff, k: SortKey): number | string | null => {
    const c = r.current;
    switch (k) {
      case 'name': return e.name.toLowerCase();
      case 'status': return e.status;
      case 'performance': return CLASS_LABEL[klass(r)];
      case 'budget': return e.budget;
      case 'spend': return c.spendMinor;
      case 'results': return resultOf(r, result);
      case 'cpl': return cprOf(r);
      case 'ctr': return c.ctr;
      case 'cpc': return c.cpcMinor;
      case 'dates': return (r.level === 'ad' ? launchOf.get(r.id) : startOf.get(r.campaignId)) ?? null;
    }
  };

  const list = base
    .filter((r) => (statusF === 'all' || eff(r).status === statusF) && (classF === 'all' || klass(r) === classF) && pillFilter(r))
    .sort((a, b) => {
      const x = sortValue(a, eff(a), sort.key);
      const y = sortValue(b, eff(b), sort.key);
      if (x === null && y === null) return a.name.localeCompare(b.name);
      if (x === null) return 1;
      if (y === null) return -1;
      const d = typeof x === 'string' && typeof y === 'string' ? x.localeCompare(y) : (x as number) - (y as number);
      return d * sort.dir || a.name.localeCompare(b.name);
    });

  const createdAll = sim.created.filter((e) => e.platform === workspace && (!q || e.name.toLowerCase().includes(q)) && (statusF === 'all' || e.status === statusF));
  const created = pill !== 'all' && pill !== 'active' ? [] : createdAll.filter((e) => (level === 'campaigns' && e.level === 'campaign') || (level === 'ads' && e.level === 'ad' && !adsetId && (!campaignId || e.campaignId === campaignId)));
  const total = list.length + created.length;
  const levelSpend = list.reduce((s, r) => s + (r.current.spendMinor ?? 0), 0);
  const counts: Record<TableLevel, number> = { campaigns: rows.campaigns.length, adsets: scoped('adsets').length, ads: scoped('ads').length };
  const resultMeta = RESULT_OPTIONS.find((o) => o.value === result)!;
  const lpvNoData = result === 'lpv';

  const setSortKey = (key: SortKey) => setSort((s) => (s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: SORT_DEFAULT_ASC.includes(key) ? 1 : -1 }));
  const arrow = (k: SortKey) => (sort.key === k ? (sort.dir === 1 ? ' ▲' : ' ▼') : '');
  const ariaSort = (k: SortKey) => (sort.key === k ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none');
  const th = (k: SortKey, label: string, cls = 'text-right', acc = '') => (
    <th scope="col" className={`px-3 py-1 ${cls} ${acc}`} aria-sort={ariaSort(k)}>
      {acc && <span className="acc-dot" aria-hidden />}
      <button type="button" className="font-semibold hover:text-ink" onClick={() => setSortKey(k)}>
        {label}
        {arrow(k)}
      </button>
    </th>
  );

  const creativeOf = (r: EntityPerformanceRow) => ds.creatives.find((c) => c.id === r.creativeId);
  const secondLine = (r: EntityPerformanceRow): string => {
    if (r.level === 'campaign') return (r.objective ? OBJECTIVE_LABEL[r.objective] : r.channelType ? CHANNEL_LABEL[r.channelType] : '') ?? '';
    if (r.level === 'ad_group') {
      const kw = r.channelType === 'SEARCH' || ds.campaigns.find((c) => c.id === r.campaignId)?.channelType === 'SEARCH' ? keywordCount(targetingOf.get(r.id)) : null;
      return [campName.get(r.campaignId), kw !== null ? `${kw} keywords` : null].filter(Boolean).join(' · ');
    }
    return groupName.get(r.adGroupId ?? '') ?? campName.get(r.campaignId) ?? '';
  };
  const entityRef = (r: EntityPerformanceRow, e: Eff) => ({ id: r.id, level: r.level as EntityLevel, platform: r.platform, name: e.name, status: e.status, dailyBudgetMinor: e.budget });

  const nameHref = (r: EntityPerformanceRow): string => {
    if (r.level === 'campaign') return link({ level: 'adsets', campaign: r.id });
    if (r.level === 'ad_group') return link({ level: 'ads', campaign: r.campaignId, adset: r.id });
    return `/ads/${r.id}?platform=${workspace}`;
  };

  const nameCell = (r: EntityPerformanceRow, e: Eff) => {
    const assetGroup = r.level === 'ad_group' && isAssetGroupName(r.name);
    const pmaxAd = r.level === 'ad' && isPmax(ds, r.campaignId);
    return (
      <div className="flex min-w-0 items-center gap-2.5">
        <input type="checkbox" className="shrink-0" aria-label={`Select ${e.name}`} />
        {r.level === 'ad' && <AdThumb creative={creativeOf(r)} onOpen={() => setPreview(creativeOf(r) ?? null)} />}
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1">
            <Link to={nameHref(r)} className="block truncate font-semibold text-ink hover:text-brand hover:underline" title={e.name}>
              {e.name}
            </Link>
            <CopyId id={r.id} name={e.name} />
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-2xs text-slate-500">
            <span className="truncate" title={secondLine(r)}>{secondLine(r)}</span>
            {assetGroup && <Badge tone="gray" title="Performance Max groups assets; there are no ad groups">Asset group</Badge>}
            {pmaxAd && <Badge tone="gray" title="Assets are combined by Google; individual asset results are not reported in the demo">Combined assets</Badge>}
            {e.validatedOnly && <Badge tone="neutral" title="Google changes are validated only in this demo">Validated, not applied</Badge>}
            {r.level === 'campaign' && (
              <Link to={`/campaigns/${r.id}?platform=${workspace}`} className="text-brand hover:underline">Details</Link>
            )}
            {r.level === 'ad' && (
              <Link to={`/compare?ads=${r.id}`} className="text-brand hover:underline">Compare</Link>
            )}
          </div>
        </div>
      </div>
    );
  };

  const resultCell = (r: EntityPerformanceRow) => {
    const v = resultOf(r, result);
    return (
      <>
        <div className="font-semibold leading-tight" style={{ color: 'var(--color-m-result)' }}>
          <Value text={count(v)} reason={lpvNoData ? 'Landing page views are not reported in the demo data' : result === 'purchases' ? 'No verified purchases for this entity' : 'No data for this period'} />
        </div>
        <div className="text-2xs text-slate-500">{lpvNoData ? 'not reported' : resultMeta.unit}</div>
      </>
    );
  };
  const cprCell = (r: EntityPerformanceRow) => (
    <>
      <div className="font-semibold leading-tight text-ink">
        <Value text={money(cprOf(r))} reason={`No ${resultMeta.unit}, so no cost per result`} />
      </div>
      <div className="text-2xs text-slate-500">{result === 'leads' && r.change.cpl !== null ? <ChangeText value={r.change.cpl} lowerIsBetter /> : 'per result'}</div>
    </>
  );
  const spendCell = (r: EntityPerformanceRow) => {
    const s = r.current.spendMinor;
    const share = s !== null && levelSpend > 0 ? (s / levelSpend) * 100 : null;
    return (
      <>
        <div className="font-semibold leading-tight" style={{ color: 'var(--color-m-spend-ink, inherit)' }}>
          <Value text={money(s)} />
        </div>
        <div className="mt-0.5 flex items-center justify-end gap-1.5">
          <span className="h-0.5 w-10 overflow-hidden rounded-full bg-slate-100" aria-hidden>
            <span className="block h-full rounded-full" style={{ width: `${share ?? 0}%`, background: COLOR.meta }} />
          </span>
          <span className="whitespace-nowrap text-right text-2xs text-slate-500">{share === null ? '' : `${share.toFixed(share < 10 ? 1 : 0)} % of total`}</span>
        </div>
      </>
    );
  };
  const trendCell = (r: EntityPerformanceRow) => {
    const vals = resultTrend(ds, r, result, range);
    const has = vals.filter((v) => v !== null).length >= 2;
    return has ? (
      <div className="ml-auto h-5 w-24" title={`${resultMeta.label} per day`}>
        <Spark values={vals} color={r.platform === 'meta' ? COLOR.meta : COLOR.google} label={`${resultMeta.label} per day for ${r.name}`} />
      </div>
    ) : (
      <span className="no-data text-slate-400" title="No daily series for this result">–</span>
    );
  };
  const budgetCell = (r: EntityPerformanceRow, e: Eff) =>
    r.level === 'ad' ? (
      <span className="text-slate-400" title="Ads do not have their own budget">–</span>
    ) : e.budget !== null ? (
      <>
        <div className="font-semibold text-ink">{money(e.budget)}</div>
        <div className="text-2xs text-slate-500">per day{r.level === 'campaign' && r.objective ? ` · ${OBJECTIVE_LABEL[r.objective]}` : ''}</div>
      </>
    ) : (
      <span className="text-2xs text-slate-500" title="The budget is set at ad set / ad group level">at {workspace === 'meta' ? 'ad set' : 'ad group'} level</span>
    );
  const datesCell = (r: EntityPerformanceRow) => {
    const d = r.level === 'ad' ? launchOf.get(r.id) : startOf.get(r.campaignId);
    return (
      <>
        <div className="text-xs text-ink-2">{date(d ?? null)}</div>
        <div className="text-2xs text-slate-500">{r.status === 'PAUSED' ? 'paused' : 'ongoing'}</div>
      </>
    );
  };

  const statusCols = (show('status') ? 1 : 0) + (show('performance') ? 1 : 0);
  const perfCols = (['spend', 'results', 'cpl', 'ctr', 'cpc', 'trend'] as const).filter(show).length;
  const budgetCols = (show('budget') ? 1 : 0) + (show('dates') ? 1 : 0);

  const crumb = (
    <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-xs text-ink-3">
      <Link to={link({})} className={level === 'campaigns' && !campaignId ? 'font-semibold text-ink' : 'text-brand hover:underline'}>All campaigns</Link>
      {campaignId && (
        <>
          <span className="text-slate-400">›</span>
          <Link to={link({ level: 'adsets', campaign: campaignId })} className={!adsetId && level === 'adsets' ? 'font-semibold text-ink' : 'text-brand hover:underline'}>
            {campName.get(campaignId) ?? campaignRow?.name ?? campaignId}
          </Link>
        </>
      )}
      {adsetId && (
        <>
          <span className="text-slate-400">›</span>
          <Link to={link({ level: 'ads', campaign: campaignId || adsetRow?.campaignId, adset: adsetId })} className="font-semibold text-ink">
            {groupName.get(adsetId) ?? adsetId}
          </Link>
        </>
      )}
    </nav>
  );

  const filterCount = (statusF !== 'all' ? 1 : 0) + (classF !== 'all' ? 1 : 0);

  return (
    <div className="space-y-4">
      <PageTitle title="Campaigns & ads" sub={`Campaigns, ${groupWord.toLowerCase()} and ads · ${dateRange(range)}`} badge={<PlatformBadge platform={workspace} />} />
      <PeriodBar />
      <p className="text-xs text-ink-3" data-testid="simulation-note">
        Actions run through preview, confirmation and read-back, but only change this browser&apos;s local copy.
        {workspace === 'google' && ' Google changes are validated only and never applied.'}
      </p>

      <div className="card overflow-hidden" data-testid="ads-navigator">
        <div className="space-y-3 px-4 pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div role="tablist" aria-label="Level" className="no-scrollbar inline-flex max-w-full gap-0.5 overflow-x-auto rounded-lg bg-slate-100 p-0.5 ring-1 ring-inset ring-slate-200/70">
              {LEVELS.map((k) => (
                <Link
                  key={k}
                  role="tab"
                  aria-selected={level === k && !treeView}
                  className={tabCls(level === k && !treeView)}
                  to={link({ level: k, campaign: k === 'campaigns' ? undefined : campaignId, adset: k === 'ads' ? adsetId : undefined })}
                >
                  {levelLabelPlural[k]}
                  <span className={`rounded px-1 text-2xs ${level === k && !treeView ? 'bg-brand text-white' : 'bg-slate-200 text-slate-600'}`}>{counts[k]}</span>
                </Link>
              ))}
            </div>
            <Link to={treeView ? link({}) : link({ view: 'tree' })} className="text-sm font-medium text-brand hover:underline">
              {treeView ? 'Table view' : 'Tree view'}
            </Link>
          </div>
          {!treeView && (campaignId || adsetId) && crumb}
          {!treeView && campaignPmax && (
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-ink-3 ring-1 ring-inset ring-slate-200/70">
              Performance Max has asset groups instead of ad groups. Assets are combined by Google, so results are reported per asset group, not per individual asset.
            </p>
          )}
          {!treeView && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="search"
                  value={search}
                  placeholder="Search by name"
                  onChange={(e) => setSearch(e.target.value)}
                  aria-label="Search campaigns, ad sets and ads"
                  className={`${inputCls} w-full sm:w-56`}
                />
                <label className="flex items-center gap-1.5 text-xs font-medium text-ink-3">
                  Result
                  <select className={`${inputCls} pr-6`} value={result} onChange={(e) => setResult(e.target.value as ResultKind)} aria-label="Result">
                    {RESULT_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </label>
                <InfoTip text="Results are one kind at a time. Leads, link clicks, landing page views and purchases are never added together." />
              </div>
              <div className="flex flex-wrap items-center gap-2 pb-3">
                <div role="group" aria-label="Quick filters" className="no-scrollbar flex min-w-0 flex-1 gap-1.5 overflow-x-auto">
                  {PILLS.map((p) => (
                    <button key={p.id} type="button" aria-pressed={pill === p.id} className={chipCls(pill === p.id)} onClick={() => setPill(p.id)}>
                      {p.label}
                    </button>
                  ))}
                </div>
                <div className="ml-auto flex shrink-0 items-center gap-2">
                  <Dropdown label="Filters" badge={filterCount}>
                    <div className="space-y-3 text-sm">
                      <label className="block text-xs font-medium text-ink-3">
                        Status
                        <select className={`${inputCls} mt-1 w-full`} value={statusF} onChange={(e) => setStatusF(e.target.value as 'all' | ShowcaseEntityStatus)}>
                          <option value="all">All statuses</option>
                          <option value="ACTIVE">Active</option>
                          <option value="PAUSED">Paused</option>
                        </select>
                      </label>
                      <label className="block text-xs font-medium text-ink-3">
                        Performance
                        <select className={`${inputCls} mt-1 w-full`} value={classF} onChange={(e) => setClassF(e.target.value as 'all' | Classification)}>
                          <option value="all">Any</option>
                          {(Object.keys(CLASS_LABEL) as Classification[]).map((k) => (
                            <option key={k} value={k}>{CLASS_LABEL[k]}</option>
                          ))}
                        </select>
                      </label>
                      <button type="button" className="text-xs font-medium text-brand hover:underline" onClick={() => { setStatusF('all'); setClassF('all'); }}>Clear filters</button>
                    </div>
                  </Dropdown>
                  <Dropdown label="Columns">
                    <fieldset className="space-y-1.5">
                      <legend className="sr-only">Visible columns</legend>
                      {COLUMNS.map((c) => (
                        <label key={c.id} className="flex items-center gap-2 text-sm text-ink-2">
                          <input type="checkbox" checked={show(c.id)} onChange={() => toggleCol(c.id)} />
                          {c.label}
                        </label>
                      ))}
                      <button type="button" className="pt-1 text-xs font-medium text-brand hover:underline" onClick={resetCols}>Show all</button>
                    </fieldset>
                  </Dropdown>
                </div>
              </div>
            </>
          )}
        </div>

        {treeView ? (
          <TreeView rows={rows} eff={eff} link={link} nameOf={(id) => id} workspace={workspace} />
        ) : total === 0 ? (
          <div className="border-t border-line p-4">
            <EmptyState title={`No ${levelWord[level]}s match these filters`}>Try another quick filter or status, or clear the search.</EmptyState>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden overflow-x-auto border-t border-line md:block">
              <table className="nav-table w-full" aria-label={`${levelWord[level]} performance`}>
                <thead>
                  <tr className="nav-groups">
                    <th className="nav-stick px-3" style={{ left: 0 }} />
                    {statusCols > 0 && <th className="px-3 text-left" colSpan={statusCols}>STATUS</th>}
                    {perfCols > 0 && <th className="grp px-3 text-right" colSpan={perfCols}>PERFORMANCE</th>}
                    {budgetCols > 0 && <th className="grp px-3 text-right" colSpan={budgetCols}>BUDGET AND SCHEDULE</th>}
                    <th className="grp px-3 text-right">ACTIONS</th>
                  </tr>
                  <tr className="nav-cols">
                    <th scope="col" className="nav-stick nav-stick-edge px-3 text-left" style={{ left: 0, minWidth: 280 }} aria-sort={ariaSort('name')}>
                      <button type="button" className="font-semibold capitalize hover:text-ink" onClick={() => setSortKey('name')}>
                        {levelWord[level]}
                        {arrow('name')}
                      </button>
                    </th>
                    {show('status') && th('status', 'Status', 'text-left')}
                    {show('performance') && th('performance', 'Performance', 'text-left')}
                    {show('spend') && th('spend', 'Spend', 'grp text-right', 'acc-spend')}
                    {show('results') && th('results', 'Results', 'text-right', 'acc-result')}
                    {show('cpl') && th('cpl', 'Cost per result')}
                    {show('ctr') && th('ctr', 'CTR')}
                    {show('cpc') && th('cpc', 'CPC')}
                    {show('trend') && <th scope="col" className="px-3 text-right">Results per day</th>}
                    {show('budget') && th('budget', 'Budget', 'grp text-right')}
                    {show('dates') && th('dates', 'Dates')}
                    <th scope="col" className="grp px-3 text-right">Manage</th>
                  </tr>
                </thead>
                <tbody>
                  {created.map((e) => {
                    const o = sim.overlay(e.id);
                    return (
                      <tr key={e.id} className="group">
                        <td className="nav-stick nav-stick-edge px-3 py-1.5" style={{ left: 0 }}>
                          <div className="font-semibold text-ink">{o?.name ?? e.name}</div>
                          <div className="flex items-center gap-1.5 text-2xs text-slate-500"><PlatformBadge platform={e.platform} /> <Badge tone="info">Created in demo</Badge></div>
                        </td>
                        {show('status') && <td className="px-3"><StatusPill status={o?.status ?? e.status} /></td>}
                        {show('performance') && <td className="px-3 text-xs text-slate-500">–</td>}
                        <td colSpan={Math.max(1, perfCols)} className="grp px-3 text-xs text-slate-500">No delivery data yet: new objects start paused</td>
                        {show('budget') && <td className="grp px-3 text-right"><Value text={money(e.dailyBudgetMinor)} /></td>}
                        {show('dates') && <td className="px-3 text-right text-xs text-slate-500">{date(e.createdAt)}</td>}
                        <td className="grp px-3 text-right">
                          <EntityActions entity={{ id: e.id, level: e.level, platform: e.platform, name: e.name, status: e.status, dailyBudgetMinor: e.dailyBudgetMinor }} compact />
                        </td>
                      </tr>
                    );
                  })}
                  {list.map((r) => {
                    const e = eff(r);
                    const k = klass(r);
                    return (
                      <tr key={r.id} className="group">
                        <td className="nav-stick nav-stick-edge px-3 py-1.5" style={{ left: 0, maxWidth: 360 }}>{nameCell(r, e)}</td>
                        {show('status') && <td className="px-3"><StatusPill status={e.status} /></td>}
                        {show('performance') && <td className="px-3"><Badge tone={CLASS_TONE[k]}>{CLASS_LABEL[k]}</Badge></td>}
                        {show('spend') && <td className="grp px-3 text-right">{spendCell(r)}</td>}
                        {show('results') && <td className="px-3 text-right">{resultCell(r)}</td>}
                        {show('cpl') && <td className="px-3 text-right">{cprCell(r)}</td>}
                        {show('ctr') && <td className="px-3 text-right"><Value text={pct(r.current.ctr)} /></td>}
                        {show('cpc') && <td className="px-3 text-right"><Value text={money(r.current.cpcMinor)} /></td>}
                        {show('trend') && <td className="px-3 text-right">{trendCell(r)}</td>}
                        {show('budget') && <td className="grp px-3 text-right">{budgetCell(r, e)}</td>}
                        {show('dates') && <td className="px-3 text-right">{datesCell(r)}</td>}
                        <td className="grp px-3 text-right">
                          <EntityActions entity={entityRef(r, e)} compact />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <ul className="divide-y divide-line border-t border-line md:hidden">
              {created.map((e) => (
                <li key={e.id} className="space-y-2 px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate font-semibold text-ink">{sim.overlay(e.id)?.name ?? e.name}</span>
                    <StatusPill status={sim.overlay(e.id)?.status ?? e.status} />
                  </div>
                  <p className="text-2xs text-slate-500"><Badge tone="info">Created in demo</Badge> No delivery data yet: new objects start paused.</p>
                  <EntityActions entity={{ id: e.id, level: e.level, platform: e.platform, name: e.name, status: e.status, dailyBudgetMinor: e.dailyBudgetMinor }} compact />
                </li>
              ))}
              {list.map((r) => {
                const e = eff(r);
                const k = klass(r);
                return (
                  <li key={r.id} className="space-y-2.5 px-4 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">{nameCell(r, e)}</div>
                      <StatusPill status={e.status} />
                    </div>
                    <dl className="grid grid-cols-3 gap-x-3 gap-y-2 text-xs">
                      <div><dt className="text-2xs text-slate-500">Spend</dt><dd className="font-semibold text-ink"><Value text={money(r.current.spendMinor)} /></dd></div>
                      <div><dt className="text-2xs text-slate-500">{resultMeta.label}</dt><dd className="font-semibold text-ink"><Value text={count(resultOf(r, result))} /></dd></div>
                      <div><dt className="text-2xs text-slate-500">Cost per result</dt><dd className="font-semibold text-ink"><Value text={money(cprOf(r))} /></dd></div>
                      <div><dt className="text-2xs text-slate-500">CTR</dt><dd><Value text={pct(r.current.ctr)} /></dd></div>
                      <div><dt className="text-2xs text-slate-500">CPC</dt><dd><Value text={money(r.current.cpcMinor)} /></dd></div>
                      <div><dt className="text-2xs text-slate-500">Budget</dt><dd>{r.level === 'ad' ? '–' : e.budget !== null ? money(e.budget) : 'at group level'}</dd></div>
                    </dl>
                    <div className="flex flex-wrap items-center gap-2"><Badge tone={CLASS_TONE[k]}>{CLASS_LABEL[k]}</Badge></div>
                    <EntityActions entity={entityRef(r, e)} compact />
                  </li>
                );
              })}
            </ul>
          </>
        )}
        <div className="flex flex-wrap items-center gap-x-1 border-t border-line px-4 py-2 text-xs text-slate-500">
          <span>
            {treeView ? 'Tree of all campaigns, ' + groupWord.toLowerCase() + ' and ads.' : `${total} ${levelWord[level]}${total === 1 ? '' : 's'}.`} Results show one kind at a time ({resultMeta.label.toLowerCase()}) and are never summed across kinds or platforms. A &ldquo;–&rdquo; means no data, not zero. Spend share is relative to the rows shown.
          </span>
          <InfoTip text="Cost per result is spend divided by the selected result. It is not calculated when there are none." />
        </div>
      </div>

      <Dialog open={!!preview} title="Creative preview" onClose={() => setPreview(null)}>
        {preview && <AdPreview creative={preview} />}
      </Dialog>
    </div>
  );
}

function TreeView(props: {
  rows: Record<TableLevel, EntityPerformanceRow[]>;
  eff: (r: EntityPerformanceRow) => Eff;
  link: (n: { level?: TableLevel; campaign?: string; adset?: string }) => string;
  nameOf: (id: string) => string;
  workspace: string;
}) {
  const { rows, eff, link, workspace } = props;
  const fmt = (r: EntityPerformanceRow) => `${money(r.current.spendMinor)} · ${count(r.current.leads)} leads`;
  return (
    <ul className="space-y-2 border-t border-line px-4 py-3 text-sm" aria-label="Campaign tree">
      {rows.campaigns.map((c) => (
        <li key={c.id}>
          <div className="flex flex-wrap items-center gap-2">
            <Link to={link({ level: 'adsets', campaign: c.id })} className="font-semibold text-ink hover:text-brand hover:underline">{eff(c).name}</Link>
            <StatusPill status={eff(c).status} />
            <span className="text-xs text-slate-500">{fmt(c)}</span>
          </div>
          <ul className="ml-4 mt-1 space-y-1 border-l border-line pl-3">
            {rows.adsets.filter((g) => g.campaignId === c.id).map((g) => (
              <li key={g.id}>
                <div className="flex flex-wrap items-center gap-2">
                  <Link to={link({ level: 'ads', campaign: c.id, adset: g.id })} className="font-medium text-ink-2 hover:text-brand hover:underline">{eff(g).name}</Link>
                  <StatusPill status={eff(g).status} />
                  <span className="text-xs text-slate-500">{fmt(g)}</span>
                </div>
                <ul className="ml-4 mt-1 space-y-0.5 border-l border-line pl-3">
                  {rows.ads.filter((a) => a.adGroupId === g.id).map((a) => (
                    <li key={a.id} className="flex flex-wrap items-center gap-2 text-xs">
                      <Link to={`/ads/${a.id}?platform=${workspace}`} className="text-ink-2 hover:text-brand hover:underline">{eff(a).name}</Link>
                      <StatusPill status={eff(a).status} />
                      <span className="text-slate-500">{fmt(a)}</span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}
