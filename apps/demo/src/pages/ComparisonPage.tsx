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
import { Badge, Button, EmptyState, PageTitle, Segmented, Value, inputCls } from '../components/ui';
import { PeriodBar } from '../components/PeriodBar';
import { ChartCard } from '../components/charts/ChartCard';
import { TimeSeriesChart, type ChartRow, type ChartSeries } from '../components/charts/TimeSeriesChart';
import { AD_COLORS, SHAPES } from '../components/charts/colors';
import { AdPreview } from '../components/AdPreview';
import { PlatformBadge, StatusBadge } from '../components/EntityBits';
import { Notice } from '../components/ui';
import { METRIC_FORMAT } from '../components/OverviewCharts';
import { useAppState } from '../state/AppState';
import { getDataset } from '../lib/data';
import { count, dateRange, money, pct } from '../lib/format';

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

/** Best three ads by CPL with enough volume, plus the planted fatigued ad when it belongs to this workspace. */
function defaultSelection(rows: readonly EntityPerformanceRow[], fatiguedId: string): string[] {
  const enough = rows
    .filter((r) => (r.current.impressions ?? 0) >= DEFAULT_VOLUME_GUARD.minImpressions && (r.current.leads ?? 0) >= DEFAULT_VOLUME_GUARD.minLeads && r.current.cplMinor !== null)
    .sort((a, b) => (a.current.cplMinor ?? 0) - (b.current.cplMinor ?? 0));
  const ids = enough.slice(0, 2).map((r) => r.id);
  const fatigued = rows.find((r) => r.id === fatiguedId);
  if (fatigued && !ids.includes(fatigued.id)) ids.push(fatigued.id);
  for (const r of [...enough, ...rows]) {
    if (ids.length >= 3) break;
    if (!ids.includes(r.id)) ids.push(r.id);
  }
  return ids.slice(0, 3);
}

export default function ComparisonPage() {
  const { range, granularity, workspace } = useAppState();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [trend, setTrend] = useState<TrendMetric>('ctr');
  const ds = getDataset();

  // A workspace only compares its own platform's ads; Meta and Google results are never mixed.
  const rows = useMemo(() => (range ? entityPerformance(ds, { level: 'ad', view: 'combined', range }).filter((r) => r.platform === workspace) : []), [ds, range, workspace]);
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
      <div className="space-y-4">
        <PageTitle title="Ad comparison" />
        <PeriodBar />
        <EmptyState title="No completed days in this period" />
      </div>
    );
  }

  const q = search.trim().toLowerCase();
  const candidates = rows.filter((r) => (!q || labelOf(r).toLowerCase().includes(q)));
  const fmt = METRIC_FORMAT[trend];
  const series: ChartSeries[] = picked.map((r, i) => ({
    key: r.id,
    label: labelOf(r),
    color: AD_COLORS[i % AD_COLORS.length] ?? '#4f46e5',
    shape: SHAPES[i % SHAPES.length],
    format: fmt.value,
  }));

  return (
    <div className="space-y-4">
      <PageTitle title="Ad comparison" sub={`${workspace === 'meta' ? 'Meta Ads' : 'Google Ads'} ads side by side for ${dateRange(range)}. Pick ${MIN_ADS} to ${MAX_ADS} ads.`} />
      <PeriodBar />
      {unknownRequested.length > 0 && <Notice tone="warn">Ignored unknown ad ids in the link: {unknownRequested.join(', ')}.</Notice>}
      <Notice tone="blue">
        A "best" marker needs enough volume ({count(DEFAULT_VOLUME_GUARD.minImpressions)} impressions for CTR and CPM, {DEFAULT_VOLUME_GUARD.minClicks} clicks for CPC, {DEFAULT_VOLUME_GUARD.minLeads} leads for CPL).
        Ads below that are never called best, because small numbers are noisy.
      </Notice>

      <section className="card p-4" aria-label="Choose ads">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-ink">
            Choose ads ({selected.length} of {MAX_ADS})
          </h3>
          {picked.length > 0 && (
            <Button size="sm" onClick={() => setSelected([])}>
              Clear
            </Button>
          )}
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {picked.map((r, i) => (
            <span key={r.id} className="inline-flex max-w-full items-center gap-1.5 rounded-full border-2 bg-white py-0.5 pl-3 pr-1.5 text-xs font-medium text-ink-2" style={{ borderColor: AD_COLORS[i % AD_COLORS.length] }}>
              <span className="truncate">{labelOf(r)}</span>
              <button type="button" className="rounded-full px-1.5 text-ink-3 hover:bg-slate-100 hover:text-ink" aria-label={`Remove ${labelOf(r)} from comparison`} onClick={() => toggle(r.id)}>
                ×
              </button>
            </span>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="grid gap-1 text-xs font-semibold text-ink-2">
            <span>Search ads</span>
            <input className={`${inputCls} w-56 max-w-full`} type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Ad name" />
          </label>
        </div>
        <ul className="mt-3 grid max-h-64 gap-0.5 overflow-y-auto rounded-lg border border-line p-1 sm:grid-cols-2">
          {candidates.length === 0 && <li className="p-2 text-xs text-ink-3">No ads match.</li>}
          {candidates.slice(0, 60).map((r) => {
            const on = selected.includes(r.id);
            const isFull = !on && selected.length >= MAX_ADS;
            return (
              <li key={r.id}>
                <label className={`flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-slate-50 ${isFull ? 'opacity-50' : ''}`}>
                  <input type="checkbox" checked={on} disabled={isFull} onChange={() => toggle(r.id)} />
                  <span className="min-w-0 flex-1 truncate">
                    {r.name} <span className="text-2xs text-ink-3">{campaignName.get(r.campaignId)}</span>
                  </span>
                  <PlatformBadge platform={r.platform} />
                  <span className="tabular text-xs text-ink-3">{money(r.current.spendMinor)}</span>
                </label>
              </li>
            );
          })}
        </ul>
        {candidates.length > 60 && <p className="mt-2 text-xs text-ink-3">Showing the first 60 matches. Use search to narrow.</p>}
      </section>

      {picked.length < MIN_ADS || !comparison ? (
        <EmptyState title="Select at least two ads to compare" />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {picked.map((r, i) => {
              const creative = ds.creatives.find((c) => c.id === r.creativeId);
              const m = comparison.table[r.id];
              return (
                <article className="card cmp-card flex flex-col gap-3 p-4" key={r.id} aria-label={labelOf(r)}>
                  <div className="min-w-0">
                    <h4 className="flex items-center gap-2 text-sm font-semibold text-ink">
                      <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: AD_COLORS[i % AD_COLORS.length] }} aria-hidden="true" />
                      <span className="truncate">{r.name}</span>
                    </h4>
                    <div className="truncate text-xs text-ink-3">{campaignName.get(r.campaignId)}</div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <PlatformBadge platform={r.platform} /> <StatusBadge status={r.status} /> {r.fatigued && <Badge tone="warn">Creative fatigue</Badge>}
                    </div>
                  </div>
                  {creative ? <AdPreview creative={creative} size="sm" /> : <EmptyState title="No creative" />}
                  <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1.5 text-sm">
                    <MetricRow label="Spend" text={money(r.current.spendMinor)} />
                    <MetricRow label="Impressions" text={count(r.current.impressions)} />
                    <MetricRow label="Clicks" text={count(r.current.clicks)} />
                    <MetricRow label="Leads" text={count(r.current.leads)} />
                    {TABLE_METRICS.map((t) => {
                      const v = m?.[t.key] ?? null;
                      const best = comparison.best[t.key];
                      const isBest = (best.status === 'winner' && best.entityId === r.id) || (best.status === 'tie' && best.entityIds.includes(r.id));
                      return (
                        <MetricRow
                          key={t.key}
                          label={t.label}
                          text={v === null ? '–' : t.fmt(v)}
                          best={isBest ? <Badge tone="good" title="Best of the selected ads with enough volume">Best{best.status === 'tie' ? ' (tie)' : ''}</Badge> : null}
                        />
                      );
                    })}
                  </dl>
                </article>
              );
            })}
          </div>
          <ul className="grid gap-1 pl-1 text-xs text-ink-3">
            {TABLE_METRICS.map((t) => {
              const b = comparison.best[t.key];
              if (b.status !== 'insufficient_data') return null;
              return <li key={t.key}>{t.label}: no best ad. {b.reason}.</li>;
            })}
          </ul>

          <ChartCard
            title={`${fmt.label} trend`}
            subtitle={<Segmented<TrendMetric> label="Trend metric" size="sm" value={trend} options={TREND} onChange={setTrend} />}
            render={(r) => (
              <TimeSeriesChart data={chartData} series={series} yFormat={fmt.axis} height={r.height} fixedWidth={r.fixedWidth} ariaLabel={`${fmt.label} of selected ads`} />
            )}
          />
        </>
      )}
    </div>
  );
}

function MetricRow(props: { label: string; text: string; best?: React.ReactNode }) {
  return (
    <>
      <dt className="text-xs text-ink-3">{props.label}</dt>
      <dd className={`m-0 text-right font-semibold tabular ${props.best ? 'text-positive' : 'text-ink'}`}>
        <Value text={props.text} />
        {props.best && <> {props.best}</>}
      </dd>
    </>
  );
}
