import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  adSeries,
  compareEntities,
  DEFAULT_VOLUME_GUARD,
  entityPerformance,
  type EntityMetricName,
  type EntityPerformanceRow,
} from '@sedem-ads/analytics-core';
import { Badge, Button, EmptyState, PageHeader, Segmented, Value } from '../components/ui';
import { ChartCard } from '../components/charts/ChartCard';
import { TimeSeriesChart, type ChartRow, type ChartSeries } from '../components/charts/TimeSeriesChart';
import { AD_COLORS, SHAPES } from '../components/charts/colors';
import { AdPreview } from '../components/AdPreview';
import { PlatformBadge, StatusBadge } from '../components/EntityBits';
import { Notice } from '../components/Notes';
import { METRIC_FORMAT } from '../components/OverviewCharts';
import { useAppState } from '../state/AppState';
import { getDataset } from '../lib/data';
import { count, dateRange, money, pct } from '../lib/format';
import './analytics.css';

const MAX_ADS = 4;
const MIN_ADS = 2;

type TrendMetric = 'ctr' | 'cpc' | 'cpl' | 'spend' | 'clicks' | 'leads';
const TREND: { value: TrendMetric; label: string }[] = [
  { value: 'ctr', label: 'CTR' },
  { value: 'cpc', label: 'CPC' },
  { value: 'cpl', label: 'CPL' },
  { value: 'spend', label: 'Spend' },
  { value: 'clicks', label: 'Clicks' },
  { value: 'leads', label: 'Leads' },
];

const TABLE_METRICS: { key: EntityMetricName; label: string; fmt: (n: number) => string }[] = [
  { key: 'ctr', label: 'CTR', fmt: (n) => pct(n) },
  { key: 'cpc', label: 'CPC', fmt: (n) => money(n) },
  { key: 'cpm', label: 'CPM', fmt: (n) => money(n) },
  { key: 'cpl', label: 'CPL', fmt: (n) => money(n) },
  { key: 'conversionRate', label: 'Lead rate (leads per click)', fmt: (n) => pct(n) },
];

function defaultSelection(rows: readonly EntityPerformanceRow[], fatiguedId: string): string[] {
  const ids: string[] = [];
  const enough = rows.filter((r) => (r.current.impressions ?? 0) >= DEFAULT_VOLUME_GUARD.minImpressions && (r.current.leads ?? 0) >= DEFAULT_VOLUME_GUARD.minLeads);
  const bestOn = (platform: 'meta' | 'google') =>
    enough
      .filter((r) => r.platform === platform && r.current.cplMinor !== null)
      .sort((a, b) => (a.current.cplMinor ?? 0) - (b.current.cplMinor ?? 0))[0];
  const fatigued = rows.find((r) => r.id === fatiguedId);
  for (const r of [bestOn('meta'), bestOn('google'), fatigued]) if (r && !ids.includes(r.id)) ids.push(r.id);
  for (const r of rows) {
    if (ids.length >= 3) break;
    if (!ids.includes(r.id)) ids.push(r.id);
  }
  return ids.slice(0, 3);
}

export default function ComparisonPage() {
  const { range, granularity } = useAppState();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [pf, setPf] = useState<'all' | 'meta' | 'google'>('all');
  const [trend, setTrend] = useState<TrendMetric>('ctr');
  const ds = getDataset();

  const rows = useMemo(() => (range ? entityPerformance(ds, { level: 'ad', view: 'combined', range }) : []), [ds, range]);
  const byId = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);
  /** Ad names repeat across campaigns, so every label carries its campaign. */
  const campaignName = useMemo(() => new Map(ds.campaigns.map((c) => [c.id, c.name])), [ds]);
  const labelOf = (r: { name: string; campaignId: string }) => `${r.name} · ${campaignName.get(r.campaignId) ?? r.campaignId}`;

  const requested = (params.get('ads') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const fromUrl = requested.filter((id, i) => requested.indexOf(id) === i && byId.has(id)).slice(0, MAX_ADS);
  const selected = fromUrl.length > 0 ? fromUrl : defaultSelection(rows, ds.planted?.fatiguedAdId ?? "");
  const unknownRequested = requested.filter((id) => !byId.has(id));

  const setSelected = (ids: string[]) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (ids.length) next.set('ads', ids.join(','));
        else next.delete('ads');
        return next;
      },
      { replace: true },
    );
  const toggle = (id: string) => {
    if (selected.includes(id)) setSelected(selected.filter((x) => x !== id));
    else if (selected.length < MAX_ADS) setSelected([...selected, id]);
  };

  const picked = selected.map((id) => byId.get(id)).filter((r): r is EntityPerformanceRow => !!r);
  const comparison = useMemo(
    () =>
      picked.length >= MIN_ADS
        ? compareEntities(
            picked.map((r) => ({ id: r.id, name: labelOf(r), spendMinor: r.current.spendMinor, impressions: r.current.impressions, clicks: r.current.clicks, leads: r.current.leads })),
          )
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selected.join(','), rows],
  );

  const chartData: ChartRow[] = useMemo(() => {
    if (!range || selected.length === 0) return [];
    return adSeries(ds, { adIds: selected, metric: trend, range, granularity }).map((p) => {
      const row: ChartRow = { key: p.key, label: p.label, incomplete: p.incomplete };
      for (const id of selected) row[id] = p.values[id] ?? null;
      return row;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ds, range, granularity, trend, selected.join(',')]);

  if (!range) {
    return (
      <>
        <PageHeader title="Ad Comparison" />
        <EmptyState title="No completed days in this period" />
      </>
    );
  }

  const q = search.trim().toLowerCase();
  const candidates = rows.filter((r) => (pf === 'all' || r.platform === pf) && (!q || labelOf(r).toLowerCase().includes(q)));
  const fmt = METRIC_FORMAT[trend];
  const series: ChartSeries[] = picked.map((r, i) => ({
    key: r.id,
    label: labelOf(r),
    color: AD_COLORS[i % AD_COLORS.length] ?? '#4f46e5',
    shape: SHAPES[i % SHAPES.length],
    format: fmt.value,
  }));

  return (
    <div className="stack">
      <PageHeader title="Ad Comparison" description={`Side by side for ${dateRange(range)}. Pick ${MIN_ADS} to ${MAX_ADS} ads.`} />
      {unknownRequested.length > 0 && <Notice tone="warn">Ignored unknown ad ids in the link: {unknownRequested.join(', ')}.</Notice>}
      <Notice>
        A "best" marker needs enough volume ({count(DEFAULT_VOLUME_GUARD.minImpressions)} impressions for CTR and CPM, {DEFAULT_VOLUME_GUARD.minClicks} clicks for CPC, {DEFAULT_VOLUME_GUARD.minLeads} leads for CPL).
        Ads below that are never called best, because small numbers are noisy.
      </Notice>

      <section className="card" aria-label="Choose ads">
        <h3 className="card-title">Choose ads ({selected.length} of {MAX_ADS})</h3>
        <div className="chips">
          {picked.map((r, i) => (
            <span className="chip" key={r.id} style={{ borderColor: AD_COLORS[i % AD_COLORS.length] }}>
              {labelOf(r)}
              <button type="button" aria-label={`Remove ${labelOf(r)} from comparison`} onClick={() => toggle(r.id)}>×</button>
            </span>
          ))}
          {picked.length > 0 && <Button size="sm" onClick={() => setSelected([])}>Clear</Button>}
        </div>
        <div className="filters">
          <label className="field">
            <span>Search ads</span>
            <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Ad name" />
          </label>
          <label className="field">
            <span>Platform</span>
            <select value={pf} onChange={(e) => setPf(e.target.value as 'all' | 'meta' | 'google')}>
              <option value="all">Meta + Google</option>
              <option value="meta">Meta</option>
              <option value="google">Google</option>
            </select>
          </label>
        </div>
        <ul className="picker-list">
          {candidates.length === 0 && <li className="card-sub">No ads match.</li>}
          {candidates.slice(0, 60).map((r) => {
            const on = selected.includes(r.id);
            const full = !on && selected.length >= MAX_ADS;
            return (
              <li key={r.id}>
                <label className="picker-item">
                  <input type="checkbox" checked={on} disabled={full} onChange={() => toggle(r.id)} />
                  <span>
                    {r.name} <span className="card-sub">{campaignName.get(r.campaignId)}</span>
                  </span>
                  <PlatformBadge platform={r.platform} />
                  <span className="card-sub num">{money(r.current.spendMinor)}</span>
                </label>
              </li>
            );
          })}
        </ul>
        {full(candidates.length) && <p className="card-sub">Showing the first 60 matches. Use search to narrow.</p>}
      </section>

      {picked.length < MIN_ADS || !comparison ? (
        <EmptyState title="Select at least two ads to compare" />
      ) : (
        <>
          <div className="cmp-grid">
            {picked.map((r, i) => {
              const creative = ds.creatives.find((c) => c.id === r.creativeId);
              const m = comparison.table[r.id];
              return (
                <article className="card cmp-card" key={r.id} aria-label={labelOf(r)}>
                  <div>
                    <h4><span className="swatch" style={{ background: AD_COLORS[i % AD_COLORS.length] }} aria-hidden="true" />{r.name}</h4>
                    <div className="card-sub">{campaignName.get(r.campaignId)}</div>
                    <div className="name-cell"><small><PlatformBadge platform={r.platform} /> <StatusBadge status={r.status} /> {r.fatigued && <Badge tone="warn">Creative fatigue</Badge>}</small></div>
                  </div>
                  {creative ? <AdPreview creative={creative} size="sm" /> : <EmptyState title="No creative" />}
                  <dl className="metric-grid">
                    <dt>Spend</dt><dd><Value text={money(r.current.spendMinor)} /></dd>
                    <dt>Impressions</dt><dd><Value text={count(r.current.impressions)} /></dd>
                    <dt>Clicks</dt><dd><Value text={count(r.current.clicks)} /></dd>
                    <dt>Leads</dt><dd><Value text={count(r.current.leads)} /></dd>
                    {TABLE_METRICS.map((t) => {
                      const v = m?.[t.key] ?? null;
                      const best = comparison.best[t.key];
                      const isBest = (best.status === 'winner' && best.entityId === r.id) || (best.status === 'tie' && best.entityIds.includes(r.id));
                      return [
                        <dt key={`${t.key}-l`}>{t.label}</dt>,
                        <dd key={`${t.key}-v`} className={isBest ? 'best' : undefined}>
                          <Value text={v === null ? '–' : t.fmt(v)} />
                          {isBest && <> <Badge tone="good" title="Best of the selected ads with enough volume">Best{best.status === 'tie' ? ' (tie)' : ''}</Badge></>}
                        </dd>,
                      ];
                    })}
                  </dl>
                </article>
              );
            })}
          </div>
          <ul className="notice-list">
            {TABLE_METRICS.map((t) => {
              const b = comparison.best[t.key];
              if (b.status !== 'insufficient_data') return null;
              return <li key={t.key} className="card-sub">{t.label}: no best ad. {b.reason}.</li>;
            })}
          </ul>

          <ChartCard
            title={`${fmt.label} trend`}
            subtitle={<Segmented<TrendMetric> label="Trend metric" value={trend} options={TREND} onChange={setTrend} />}
            render={(r) => (
              <TimeSeriesChart data={chartData} series={series} yFormat={fmt.axis} height={r.height} fixedWidth={r.fixedWidth} ariaLabel={`${fmt.label} of selected ads`} />
            )}
          />
        </>
      )}
    </div>
  );
}

function full(n: number): boolean {
  return n > 60;
}
