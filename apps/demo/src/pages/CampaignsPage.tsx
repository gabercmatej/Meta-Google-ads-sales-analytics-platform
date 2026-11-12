import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { entityPerformance, type EntityLevel, type EntityPerformanceRow, type ShowcaseCreative, type ShowcaseEntityStatus } from '@sedem-ads/analytics-core';
import { Badge, Dialog, EmptyState, InfoTip, Notice, PageTitle, StatusPill, Value } from '../components/ui';
import { PeriodBar } from '../components/PeriodBar';
import { AdPreview } from '../components/AdPreview';
import { EntityActions, useSim } from '../sim/SimProvider';
import { ChangeText, HintBadges, PlatformBadge, CHANNEL_LABEL, OBJECTIVE_LABEL } from '../components/EntityBits';
import { useAppState } from '../state/AppState';
import { getDataset } from '../lib/data';
import { count, dateRange, money, pct } from '../lib/format';

type SortKey = 'name' | 'status' | 'budget' | 'spend' | 'leads' | 'cpl' | 'ctr' | 'cpc' | 'impressions';
type Level = 'campaign' | 'ad_group' | 'ad';

const SORT_DEFAULT_ASC: readonly SortKey[] = ['name', 'cpc', 'cpl'];

interface Eff {
  status: ShowcaseEntityStatus;
  name: string;
  budget: number | null;
  validatedOnly?: boolean;
}

function sortValue(r: EntityPerformanceRow, e: Eff, k: SortKey): number | string | null {
  const c = r.current;
  switch (k) {
    case 'name': return e.name.toLowerCase();
    case 'status': return e.status;
    case 'budget': return e.budget;
    case 'spend': return c.spendMinor;
    case 'leads': return c.leads;
    case 'cpl': return c.cplMinor;
    case 'ctr': return c.ctr;
    case 'cpc': return c.cpcMinor;
    case 'impressions': return c.impressions;
  }
}

const tabCls = (on: boolean) =>
  `inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ${on ? 'bg-white text-ink shadow' : 'text-ink-3 hover:text-ink'}`;
const chipCls = (on: boolean) =>
  `h-8 rounded-full border px-3 text-xs font-semibold transition-colors ${on ? 'border-brand bg-brand-soft text-brand-hover' : 'border-line-strong bg-white text-ink-2 hover:border-slate-400'}`;

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

export default function CampaignsPage() {
  const { workspace, range } = useAppState();
  const sim = useSim();
  const ds = getDataset();
  const [level, setLevel] = useState<Level>('campaign');
  const [status, setStatus] = useState<'all' | ShowcaseEntityStatus>('all');
  const [hint, setHint] = useState<'all' | 'strong' | 'weak' | 'fatigued'>('all');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'spend', dir: -1 });
  const [preview, setPreview] = useState<ShowcaseCreative | null>(null);
  const groupWord = workspace === 'meta' ? 'Ad sets' : 'Ad groups';

  useEffect(() => {
    setLevel('campaign');
    setHint('all');
  }, [workspace]);

  const rows = useMemo(() => {
    if (!range) return null;
    return {
      campaign: entityPerformance(ds, { level: 'campaign', view: workspace, range }),
      ad_group: entityPerformance(ds, { level: 'ad_group', view: workspace, range }),
      ad: entityPerformance(ds, { level: 'ad', view: workspace, range }),
    } as Record<Level, EntityPerformanceRow[]>;
  }, [ds, range, workspace]);

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
  const campName = new Map(rows.campaign.map((c) => [c.id, eff(c).name]));
  const groupName = new Map(rows.ad_group.map((g) => [g.id, eff(g).name]));
  const q = search.trim().toLowerCase();

  const visible = (lv: Level) => rows[lv].filter((r) => (status === 'all' || eff(r).status === status) && (!q || eff(r).name.toLowerCase().includes(q)));
  const counts: Record<Level, number> = { campaign: visible('campaign').length, ad_group: visible('ad_group').length, ad: visible('ad').length };

  const list = visible(level)
    .filter((r) => hint === 'all' || (hint === 'fatigued' ? r.fatigued : r.tier === hint))
    .sort((a, b) => {
      const x = sortValue(a, eff(a), sort.key);
      const y = sortValue(b, eff(b), sort.key);
      if (x === null && y === null) return a.name.localeCompare(b.name);
      if (x === null) return 1;
      if (y === null) return -1;
      const d = typeof x === 'string' && typeof y === 'string' ? x.localeCompare(y) : (x as number) - (y as number);
      return d * sort.dir || a.name.localeCompare(b.name);
    });
  const created = level === 'campaign' ? sim.created.filter((e) => e.level === 'campaign' && e.platform === workspace && (status === 'all' || e.status === status) && (!q || e.name.toLowerCase().includes(q))) : [];
  const levelSpend = rows[level].reduce((s, r) => s + (r.current.spendMinor ?? 0), 0);
  const total = list.length + created.length;

  const setSortKey = (key: SortKey) => setSort((s) => (s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: SORT_DEFAULT_ASC.includes(key) ? 1 : -1 }));
  const arrow = (k: SortKey) => (sort.key === k ? (sort.dir === 1 ? ' ▲' : ' ▼') : '');
  const th = (k: SortKey, label: string, extra = '') => (
    <th scope="col" className={`px-3 py-1 text-right ${extra}`} aria-sort={sort.key === k ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
      <button type="button" className="font-semibold hover:text-ink" onClick={() => setSortKey(k)}>
        {label}
        {arrow(k)}
      </button>
    </th>
  );

  const creativeOf = (r: EntityPerformanceRow) => ds.creatives.find((c) => c.id === r.creativeId);
  const secondLine = (r: EntityPerformanceRow): string => {
    if (r.level === 'campaign') return (r.objective ? OBJECTIVE_LABEL[r.objective] : r.channelType ? CHANNEL_LABEL[r.channelType] : '') ?? '';
    if (r.level === 'ad_group') return campName.get(r.campaignId) ?? '';
    return groupName.get(r.adGroupId ?? '') ?? campName.get(r.campaignId) ?? '';
  };
  const entityRef = (r: EntityPerformanceRow, e: Eff) => ({ id: r.id, level: r.level as EntityLevel, platform: r.platform, name: e.name, status: e.status, dailyBudgetMinor: e.budget });

  const budgetCell = (r: EntityPerformanceRow, e: Eff) =>
    r.level === 'ad' ? (
      <span className="text-slate-400" title="Ads do not have their own budget">–</span>
    ) : e.budget !== null ? (
      <>
        <div className="font-semibold text-ink">{money(e.budget)}</div>
        <div className="text-2xs text-slate-500">per day</div>
      </>
    ) : (
      <span className="text-2xs text-slate-500" title="The budget is set at ad set / ad group level">at {workspace === 'meta' ? 'ad set' : 'ad group'} level</span>
    );

  const spendCell = (r: EntityPerformanceRow) => {
    const s = r.current.spendMinor;
    const share = s !== null && levelSpend > 0 ? (s / levelSpend) * 100 : null;
    return (
      <>
        <div className="acc-val font-semibold">
          <Value text={money(s)} />
        </div>
        <div className="text-2xs text-slate-500">{share === null ? '' : `${share.toFixed(share < 10 ? 1 : 0)}% of level`}</div>
      </>
    );
  };

  const cplCell = (r: EntityPerformanceRow) => (
    <>
      <div className="font-semibold text-ink">
        <Value text={money(r.current.cplMinor)} reason="No leads in this period, so no cost per lead" />
      </div>
      <div className="text-2xs text-slate-500">
        {r.change.cpl === null ? 'per lead' : <ChangeText value={r.change.cpl} lowerIsBetter />}
      </div>
    </>
  );

  const headerBadges = (r: EntityPerformanceRow, e: Eff) => (
    <>
      <HintBadges row={r} />
      {e.validatedOnly && <Badge tone="warn" title="Google changes are validated only in this demo">Validated, not applied</Badge>}
    </>
  );

  const nameCell = (r: EntityPerformanceRow, e: Eff) => (
    <div className="flex min-w-0 items-center gap-2.5">
      {r.level === 'ad' && <AdThumb creative={creativeOf(r)} onOpen={() => setPreview(creativeOf(r) ?? null)} />}
      <div className="min-w-0 flex-1">
        <Link to={`/campaigns/${r.campaignId}`} className="block truncate font-semibold text-ink hover:text-brand hover:underline" title={e.name}>
          {e.name}
        </Link>
        <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-2xs text-slate-500">
          <span className="truncate" title={secondLine(r)}>{secondLine(r)}</span>
          {headerBadges(r, e)}
        </div>
      </div>
      {r.level === 'ad' && (
        <Link to={`/compare?ads=${r.id}`} className="hidden whitespace-nowrap rounded-md px-1.5 py-1 text-xs font-medium text-brand hover:bg-brand-soft lg:inline" title="Compare this ad with another">
          Compare
        </Link>
      )}
    </div>
  );

  const levelLabel = level === 'campaign' ? 'campaign' : level === 'ad_group' ? (workspace === 'meta' ? 'ad set' : 'ad group') : 'ad';

  return (
    <div className="space-y-4">
      <PageTitle title="Campaigns & ads" sub={`Campaigns, ${groupWord.toLowerCase()} and ads · ${dateRange(range)}`} badge={<PlatformBadge platform={workspace} />} />
      <PeriodBar />
      <Notice tone="amber" title="Management is in SIMULATED mode">
        Pause, resume, budget and edit actions go through the full preview, validation, confirmation, read-back and audit flow, but they only change this browser&apos;s local copy. No real advertising account is touched.
        {workspace === 'google' && ' Google changes are validated only and never applied.'}
      </Notice>

      <div className="card overflow-hidden" data-testid="ads-navigator">
        <div className="space-y-3 px-4 pt-4">
          <div role="tablist" aria-label="Level" className="no-scrollbar inline-flex max-w-full gap-0.5 overflow-x-auto rounded-lg bg-slate-100 p-0.5 ring-1 ring-inset ring-slate-200/70">
            {([['campaign', 'Campaigns'], ['ad_group', groupWord], ['ad', 'Ads']] as const).map(([k, label]) => (
              <button key={k} type="button" role="tab" aria-selected={level === k} className={tabCls(level === k)} onClick={() => setLevel(k)}>
                {label}
                <span className={`rounded px-1 text-2xs ${level === k ? 'bg-brand text-white' : 'bg-slate-200 text-slate-600'}`}>{counts[k]}</span>
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2 pb-3">
            <input
              type="search"
              value={search}
              placeholder="Search by name"
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search campaigns, ad sets and ads"
              className="h-8 w-full rounded-lg border border-line-strong bg-white px-2.5 text-sm text-ink-2 outline-none hover:border-slate-400 focus:border-brand focus:ring-2 focus:ring-brand/15 sm:w-56"
            />
            <div role="group" aria-label="Status" className="flex flex-wrap gap-1.5">
              {([['all', 'All'], ['ACTIVE', 'Active'], ['PAUSED', 'Paused']] as const).map(([k, label]) => (
                <button key={k} type="button" aria-pressed={status === k} className={chipCls(status === k)} onClick={() => setStatus(k)}>
                  {label}
                </button>
              ))}
            </div>
            <div role="group" aria-label="Performance hints" className="flex flex-wrap gap-1.5">
              {([['strong', 'Strong'], ['weak', 'Needs attention'], ['fatigued', 'Fatigue']] as const).map(([k, label]) => (
                <button key={k} type="button" aria-pressed={hint === k} className={chipCls(hint === k)} onClick={() => setHint(hint === k ? 'all' : k)}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {total === 0 ? (
          <div className="border-t border-line p-4">
            <EmptyState title={`No ${levelLabel}s match these filters`}>Try another status or hint, or clear the search.</EmptyState>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden overflow-x-auto border-t border-line md:block">
              <table className="nav-table w-full" aria-label={`${levelLabel} performance`}>
                <thead>
                  <tr className="nav-groups">
                    <th className="nav-stick px-3" style={{ left: 0 }} />
                    <th className="px-3 text-left" colSpan={2}>Delivery</th>
                    <th className="grp acc-spend px-3 text-right" colSpan={2}>Spend &amp; results</th>
                    <th className="grp px-3 text-right" colSpan={3}>Engagement</th>
                    <th className="grp px-3 text-right">Actions</th>
                  </tr>
                  <tr className="nav-cols">
                    <th scope="col" className="nav-stick nav-stick-edge px-3 text-left" style={{ left: 0, minWidth: 280 }} aria-sort={sort.key === 'name' ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
                      <button type="button" className="font-semibold hover:text-ink" onClick={() => setSortKey('name')}>
                        {level === 'campaign' ? 'Campaign' : level === 'ad_group' ? (workspace === 'meta' ? 'Ad set' : 'Ad group') : 'Ad'}
                        {arrow('name')}
                      </button>
                    </th>
                    <th scope="col" className="px-3 text-left" aria-sort={sort.key === 'status' ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
                      <button type="button" className="font-semibold hover:text-ink" onClick={() => setSortKey('status')}>Status{arrow('status')}</button>
                    </th>
                    {th('budget', 'Budget')}
                    {th('spend', 'Spend', 'grp acc-spend')}
                    {th('leads', 'Leads')}
                    {th('cpl', 'CPL', 'grp')}
                    {th('ctr', 'CTR')}
                    {th('cpc', 'CPC')}
                    <th scope="col" className="grp px-3 text-right">Manage</th>
                  </tr>
                </thead>
                <tbody>
                  {created.map((e) => (
                    <tr key={e.id} className="group">
                      <td className="nav-stick nav-stick-edge px-3 py-2.5" style={{ left: 0 }}>
                        <div className="font-semibold text-ink">{sim.overlay(e.id)?.name ?? e.name}</div>
                        <div className="flex items-center gap-1.5 text-2xs text-slate-500"><PlatformBadge platform={e.platform} /> <Badge tone="info">Created in demo</Badge></div>
                      </td>
                      <td className="px-3"><StatusPill status={sim.overlay(e.id)?.status ?? e.status} /></td>
                      <td className="px-3 text-right"><Value text={money(e.dailyBudgetMinor)} /></td>
                      <td colSpan={5} className="grp px-3 text-xs text-slate-500">No delivery data yet: new objects start paused</td>
                      <td className="grp px-3 text-right">
                        <EntityActions entity={{ id: e.id, level: e.level, platform: e.platform, name: e.name, status: e.status, dailyBudgetMinor: e.dailyBudgetMinor }} compact />
                      </td>
                    </tr>
                  ))}
                  {list.map((r) => {
                    const e = eff(r);
                    return (
                      <tr key={r.id} className="group">
                        <td className="nav-stick nav-stick-edge px-3 py-2.5" style={{ left: 0, maxWidth: 360 }}>{nameCell(r, e)}</td>
                        <td className="px-3"><StatusPill status={e.status} /></td>
                        <td className="px-3 text-right">{budgetCell(r, e)}</td>
                        <td className="grp acc-spend px-3 text-right">{spendCell(r)}</td>
                        <td className="px-3 text-right">
                          <div className="font-semibold text-ink"><Value text={count(r.current.leads)} reason="No lead data for this period" /></div>
                          <div className="text-2xs text-slate-500">{r.platform === 'meta' ? 'Meta leads' : 'Google leads'}</div>
                        </td>
                        <td className="grp px-3 text-right">{cplCell(r)}</td>
                        <td className="px-3 text-right"><Value text={pct(r.current.ctr)} /></td>
                        <td className="px-3 text-right"><Value text={money(r.current.cpcMinor)} /></td>
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
                  <p className="text-2xs text-slate-500">Created in demo. No delivery data yet: new objects start paused.</p>
                  <EntityActions entity={{ id: e.id, level: e.level, platform: e.platform, name: e.name, status: e.status, dailyBudgetMinor: e.dailyBudgetMinor }} compact />
                </li>
              ))}
              {list.map((r) => {
                const e = eff(r);
                return (
                  <li key={r.id} className="space-y-2.5 px-4 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">{nameCell(r, e)}</div>
                      <StatusPill status={e.status} />
                    </div>
                    <dl className="grid grid-cols-3 gap-x-3 gap-y-2 text-xs">
                      <div><dt className="text-2xs text-slate-500">Spend</dt><dd className="font-semibold text-ink"><Value text={money(r.current.spendMinor)} /></dd></div>
                      <div><dt className="text-2xs text-slate-500">Leads</dt><dd className="font-semibold text-ink"><Value text={count(r.current.leads)} /></dd></div>
                      <div><dt className="text-2xs text-slate-500">CPL</dt><dd className="font-semibold text-ink"><Value text={money(r.current.cplMinor)} /></dd></div>
                      <div><dt className="text-2xs text-slate-500">CTR</dt><dd><Value text={pct(r.current.ctr)} /></dd></div>
                      <div><dt className="text-2xs text-slate-500">CPC</dt><dd><Value text={money(r.current.cpcMinor)} /></dd></div>
                      <div><dt className="text-2xs text-slate-500">Budget</dt><dd>{r.level === 'ad' ? '–' : e.budget !== null ? money(e.budget) : 'at group level'}</dd></div>
                    </dl>
                    <EntityActions entity={entityRef(r, e)} compact />
                  </li>
                );
              })}
            </ul>
          </>
        )}
        <div className="flex flex-wrap items-center gap-x-1 border-t border-line px-4 py-2 text-xs text-slate-500">
          <span>
            {total} {levelLabel}
            {total === 1 ? '' : 's'}. Results are leads of the platform&apos;s own lead type and are never summed across platforms. A &ldquo;–&rdquo; means no data, not zero. Spend share is relative to the whole level.
          </span>
          <InfoTip text="CPL is spend divided by leads. It is not calculated when there are no leads." />
        </div>
      </div>

      <Dialog open={!!preview} title="Creative preview" onClose={() => setPreview(null)}>
        {preview && <AdPreview creative={preview} />}
      </Dialog>
    </div>
  );
}
