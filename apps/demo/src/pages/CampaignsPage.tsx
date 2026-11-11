import { Fragment, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { entityPerformance, type EntityPerformanceRow, type PlatformView, type ShowcaseEntityStatus } from '@sedem-ads/analytics-core';
import { PageHeader, EmptyState, Badge } from '../components/ui';
import { EntityActions, useSim } from '../sim/SimProvider';
import { ChangeText, HintBadges, PlatformBadge, StatusBadge, CHANNEL_LABEL, OBJECTIVE_LABEL } from '../components/EntityBits';
import { useAppState } from '../state/AppState';
import { getDataset } from '../lib/data';
import { count, dateRange, money, pct } from '../lib/format';
import { Value } from '../components/ui';
import './analytics.css';

type SortKey = 'spend' | 'impressions' | 'clicks' | 'ctr' | 'cpc' | 'leads' | 'cpl' | 'change';

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'spend', label: 'Spend' },
  { key: 'impressions', label: 'Impr.' },
  { key: 'clicks', label: 'Clicks' },
  { key: 'ctr', label: 'CTR' },
  { key: 'cpc', label: 'CPC' },
  { key: 'leads', label: 'Leads' },
  { key: 'cpl', label: 'CPL' },
  { key: 'change', label: 'vs previous' },
];

function sortValue(r: EntityPerformanceRow, k: SortKey): number | null {
  const c = r.current;
  switch (k) {
    case 'spend': return c.spendMinor;
    case 'impressions': return c.impressions;
    case 'clicks': return c.clicks;
    case 'ctr': return c.ctr;
    case 'cpc': return c.cpcMinor;
    case 'leads': return c.leads;
    case 'cpl': return c.cplMinor;
    case 'change': return r.change.spend;
  }
}

function bySort(key: SortKey, dir: 1 | -1) {
  return (a: EntityPerformanceRow, b: EntityPerformanceRow) => {
    const x = sortValue(a, key);
    const y = sortValue(b, key);
    if (x === null && y === null) return a.name.localeCompare(b.name);
    if (x === null) return 1;
    if (y === null) return -1;
    return (x - y) * dir || a.name.localeCompare(b.name);
  };
}

export default function CampaignsPage() {
  const { platform: globalPlatform, range } = useAppState();
  const sim = useSim();
  const [platform, setPlatform] = useState<PlatformView>(globalPlatform);
  const [status, setStatus] = useState<'all' | ShowcaseEntityStatus>('all');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'spend', dir: -1 });
  const [open, setOpen] = useState<Set<string>>(new Set());

  // The global platform selector wins whenever it changes.
  useEffect(() => setPlatform(globalPlatform), [globalPlatform]);

  const rows = useMemo(() => {
    if (!range) return null;
    const ds = getDataset();
    return {
      campaigns: entityPerformance(ds, { level: 'campaign', view: 'combined', range }),
      groups: entityPerformance(ds, { level: 'ad_group', view: 'combined', range }),
      ads: entityPerformance(ds, { level: 'ad', view: 'combined', range }),
    };
  }, [range]);

  if (!range || !rows) {
    return (
      <>
        <PageHeader title="Campaigns & Ads" />
        <EmptyState title="No completed days in this period" />
      </>
    );
  }

  const q = search.trim().toLowerCase();
  const eff = (r: EntityPerformanceRow) => {
    const o = sim.overlay(r.id);
    return { status: o?.status ?? r.status, name: o?.name ?? r.name, budget: o && 'dailyBudgetMinor' in o && o.dailyBudgetMinor !== undefined ? o.dailyBudgetMinor : r.dailyBudgetMinor, validatedOnly: o?.validatedOnly };
  };
  const matchesBase = (r: EntityPerformanceRow) => (platform === 'combined' || r.platform === platform) && (status === 'all' || eff(r).status === status);
  const matchesText = (r: EntityPerformanceRow) => !q || eff(r).name.toLowerCase().includes(q);

  const cmp = bySort(sort.key, sort.dir);
  const campaigns = rows.campaigns
    .filter((c) => {
      if (!matchesBase(c)) return false;
      if (!q) return true;
      // keep a campaign when it or any descendant matches the search
      return matchesText(c) || rows.groups.some((g) => g.campaignId === c.id && (matchesText(g) || rows.ads.some((a) => a.adGroupId === g.id && matchesText(a)))) || rows.ads.some((a) => a.campaignId === c.id && matchesText(a));
    })
    .sort(cmp);

  const createdCampaigns = sim.created.filter((e) => e.level === 'campaign' && (platform === 'combined' || e.platform === platform) && (status === 'all' || e.status === status) && (!q || e.name.toLowerCase().includes(q)));

  const toggle = (id: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const setSortKey = (key: SortKey) => setSort((s) => (s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: key === 'cpc' || key === 'cpl' ? 1 : -1 }));

  const metricCells = (r: EntityPerformanceRow) => (
    <>
      <td className="r num"><Value text={money(r.current.spendMinor)} /></td>
      <td className="r num"><Value text={count(r.current.impressions)} /></td>
      <td className="r num"><Value text={count(r.current.clicks)} /></td>
      <td className="r num"><Value text={pct(r.current.ctr)} /></td>
      <td className="r num"><Value text={money(r.current.cpcMinor)} /></td>
      <td className="r num"><Value text={count(r.current.leads)} /></td>
      <td className="r num"><Value text={money(r.current.cplMinor)} /></td>
      <td className="r num"><ChangeText value={r.change.spend} /></td>
    </>
  );

  const actions = (r: EntityPerformanceRow) => {
    const e = eff(r);
    return (
      <td className="actions-cell">
        <EntityActions entity={{ id: r.id, level: r.level, platform: r.platform, name: e.name, status: e.status, dailyBudgetMinor: e.budget }} compact />
      </td>
    );
  };

  const total = campaigns.length + createdCampaigns.length;

  return (
    <div className="stack">
      <PageHeader title="Campaigns & Ads" description={`Campaigns, ad sets / ad groups and ads · ${dateRange(range)}. Changes you make here are simulated and stored in this browser only.`} />
      <div className="filters">
        <label className="field">
          Platform
          <select value={platform} onChange={(e) => setPlatform(e.target.value as PlatformView)}>
            <option value="combined">Meta + Google</option>
            <option value="meta">Meta</option>
            <option value="google">Google</option>
          </select>
        </label>
        <label className="field">
          Status
          <select value={status} onChange={(e) => setStatus(e.target.value as 'all' | ShowcaseEntityStatus)}>
            <option value="all">All</option>
            <option value="ACTIVE">Active</option>
            <option value="PAUSED">Paused</option>
          </select>
        </label>
        <label className="field" style={{ flex: '1 1 220px' }}>
          Search
          <input type="search" value={search} placeholder="Campaign, ad set or ad name" onChange={(e) => setSearch(e.target.value)} aria-label="Search campaigns, ad sets and ads" />
        </label>
        <button type="button" className="link-btn" onClick={() => setOpen(new Set(rows.campaigns.map((c) => c.id).concat(rows.groups.map((g) => g.id))))}>Expand all</button>
        <button type="button" className="link-btn" onClick={() => setOpen(new Set())}>Collapse all</button>
      </div>

      {total === 0 ? (
        <EmptyState title="No campaigns match these filters">Try another platform or status, or clear the search.</EmptyState>
      ) : (
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Status</th>
                <th scope="col" className="r">Daily budget</th>
                {COLUMNS.map((c) => (
                  <th key={c.key} scope="col" className="r" aria-sort={sort.key === c.key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
                    <button type="button" className="sort-btn" onClick={() => setSortKey(c.key)}>
                      {c.label} {sort.key === c.key ? (sort.dir === 1 ? '▲' : '▼') : ''}
                    </button>
                  </th>
                ))}
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {createdCampaigns.map((e) => (
                <tr key={e.id}>
                  <td className="wrap">
                    <div className="name-cell">
                      <strong>{sim.overlay(e.id)?.name ?? e.name}</strong>
                      <small><PlatformBadge platform={e.platform} /> <Badge tone="info">Created in demo</Badge></small>
                    </div>
                  </td>
                  <td><StatusBadge status={sim.overlay(e.id)?.status ?? e.status} /></td>
                  <td className="r num"><Value text={money(e.dailyBudgetMinor)} /></td>
                  <td colSpan={8} className="no-data">No delivery data yet: new objects start paused</td>
                  <td>
                    <EntityActions entity={{ id: e.id, level: e.level, platform: e.platform, name: e.name, status: e.status, dailyBudgetMinor: e.dailyBudgetMinor }} compact />
                  </td>
                </tr>
              ))}
              {campaigns.map((c) => {
                const ce = eff(c);
                const isOpen = open.has(c.id) || !!q;
                const groups = rows.groups.filter((g) => g.campaignId === c.id && (status === 'all' || eff(g).status === status)).sort(cmp);
                return (
                  <Fragment key={c.id}>
                    <tr>
                      <td className="wrap">
                        <div className="name-cell">
                          <span>
                            <button type="button" className="link-btn" aria-expanded={isOpen} aria-label={`${isOpen ? 'Collapse' : 'Expand'} ${ce.name}`} onClick={() => toggle(c.id)}>
                              {isOpen ? '▾' : '▸'}
                            </button>
                            <Link to={`/campaigns/${c.id}`}><strong>{ce.name}</strong></Link>
                          </span>
                          <small>
                            <PlatformBadge platform={c.platform} /> {c.objective ? OBJECTIVE_LABEL[c.objective] : c.channelType ? CHANNEL_LABEL[c.channelType] : ''} <HintBadges row={c} />
                            {ce.validatedOnly && <Badge tone="warn" title="Google changes are validated only in this demo">Validated, not applied</Badge>}
                          </small>
                        </div>
                      </td>
                      <td><StatusBadge status={ce.status} /></td>
                      <td className="r num">
                        {ce.budget !== null ? money(ce.budget) : <span className="no-data" title="Budget is set at ad set / ad group level">ad set level</span>}
                      </td>
                      {metricCells(c)}
                      {actions(c)}
                    </tr>
                    {isOpen &&
                      groups.map((g) => {
                        const ge = eff(g);
                        const ads = rows.ads.filter((a) => a.adGroupId === g.id && (status === 'all' || eff(a).status === status)).sort(cmp);
                        const gOpen = open.has(g.id) || !!q;
                        return (
                          <Fragment key={g.id}>
                            <tr className="lvl-1">
                              <td className="wrap">
                                <div className="name-cell">
                                  <span>
                                    <button type="button" className="link-btn" aria-expanded={gOpen} aria-label={`${gOpen ? 'Collapse' : 'Expand'} ${ge.name}`} onClick={() => toggle(g.id)}>
                                      {gOpen ? '▾' : '▸'}
                                    </button>
                                    {ge.name}
                                  </span>
                                  <small>{g.platform === 'meta' ? 'Ad set' : 'Ad group'}</small>
                                </div>
                              </td>
                              <td><StatusBadge status={ge.status} /></td>
                              <td className="r num"><Value text={money(ge.budget)} /></td>
                              {metricCells(g)}
                              {actions(g)}
                            </tr>
                            {gOpen &&
                              ads.map((a) => {
                                const ae = eff(a);
                                return (
                                  <tr className="lvl-2" key={a.id}>
                                    <td className="wrap">
                                      <div className="name-cell">
                                        <Link to={`/campaigns/${a.campaignId}`}>{ae.name}</Link>
                                        <small>Ad <HintBadges row={a} /></small>
                                      </div>
                                    </td>
                                    <td><StatusBadge status={ae.status} /></td>
                                    <td className="r num"><span className="no-data" title="Ads do not have their own budget">–</span></td>
                                    {metricCells(a)}
                                    {actions(a)}
                                  </tr>
                                );
                              })}
                          </Fragment>
                        );
                      })}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="card-sub">Change vs previous compares spend with the previous equal-length period. A “–” means the previous period has no data. Status and budget reflect your simulated changes.</p>
    </div>
  );
}
