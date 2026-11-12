import { useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { adSeries, DEFAULT_VOLUME_GUARD, entityPerformance, type EntityMetrics, type EntityPerformanceRow, type SeriesMetric } from '@sedem-ads/analytics-core';
import { Badge, Button, EmptyState, Notice, PageTitle, inputCls } from '../components/ui';
import { PeriodBar } from '../components/PeriodBar';
import { ChartCard } from '../components/charts/ChartCard';
import { TimeSeriesChart, type ChartRow, type ChartSeries } from '../components/charts/TimeSeriesChart';
import { AD_COLORS, SHAPES } from '../components/charts/colors';
import { AdPreview } from '../components/AdPreview';
import { PlatformBadge, StatusBadge } from '../components/EntityBits';
import { METRIC_FORMAT } from '../components/OverviewCharts';
import { useAppState } from '../state/AppState';
import { getDataset } from '../lib/data';
import { count, dateRange, money, pct, change } from '../lib/format';
import { bestId, buildVerdict, judge, relChange, type CmpMetric, type Verdict } from '../lib/compareLogic';

const MAX_ADS = 4;
const MIN_ADS = 2;
const LETTERS = ['A', 'B', 'C', 'D'] as const;

interface RowDef {
  key: CmpMetric;
  label: string;
  get: (m: EntityMetrics) => number | null;
  fmt: (n: number) => string;
}

const ROWS: RowDef[] = [
  { key: 'spend', label: 'Spend', get: (m) => m.spendMinor, fmt: (n) => money(n) },
  { key: 'impressions', label: 'Impressions', get: (m) => m.impressions, fmt: (n) => count(n) },
  { key: 'clicks', label: 'Clicks', get: (m) => m.clicks, fmt: (n) => count(n) },
  { key: 'leads', label: 'Leads', get: (m) => m.leads, fmt: (n) => count(n) },
  { key: 'ctr', label: 'CTR', get: (m) => m.ctr, fmt: (n) => pct(n) },
  { key: 'cpc', label: 'CPC', get: (m) => m.cpcMinor, fmt: (n) => money(n) },
  { key: 'cpm', label: 'CPM', get: (m) => m.cpmMinor, fmt: (n) => money(n) },
  { key: 'cpl', label: 'CPL', get: (m) => m.cplMinor, fmt: (n) => money(n) },
  { key: 'orders', label: 'Verified orders', get: (m) => m.verifiedOrders, fmt: (n) => count(n) },
  { key: 'revenue', label: 'Verified revenue', get: (m) => m.verifiedRevenueMinor, fmt: (n) => money(n) },
];

const TREND_METRICS: SeriesMetric[] = ['ctr', 'cpc', 'cpl', 'leads', 'spend', 'clicks'];

/** Arrow + colour for a judged change. Costs: down is green. Neutral metrics stay grey. */
function DeltaChip({ metric, value, reference, label }: { metric: CmpMetric; value: number | null; reference: number | null; label: string }) {
  const rel = relChange(value, reference);
  const v: Verdict = judge(metric, value, reference);
  if (rel === null) return <span className="text-2xs text-ink-3">{label} –</span>;
  const arrow = rel > 0 ? '▲' : rel < 0 ? '▼' : '■';
  const cls = v === 'better' ? 'text-positive' : v === 'worse' ? 'text-negative' : 'text-ink-3';
  const word = v === 'better' ? 'better' : v === 'worse' ? 'worse' : 'no judgement';
  return (
    <span className={`inline-flex items-center gap-1 text-2xs font-medium ${cls}`} data-verdict={v} title={`${label}: ${word}`}>
      <span aria-hidden="true">{arrow}</span>
      {change(rel)} <span className="font-normal text-ink-3">{label}</span>
      <span className="sr-only"> ({word})</span>
    </span>
  );
}

/** Best two ads by CPL with enough volume. */
function defaultSelection(rows: readonly EntityPerformanceRow[]): string[] {
  const enough = rows
    .filter((r) => (r.current.impressions ?? 0) >= DEFAULT_VOLUME_GUARD.minImpressions && (r.current.leads ?? 0) >= DEFAULT_VOLUME_GUARD.minLeads && r.current.cplMinor !== null)
    .sort((a, b) => (a.current.cplMinor ?? 0) - (b.current.cplMinor ?? 0));
  const ids = enough.slice(0, 2).map((r) => r.id);
  for (const r of rows) {
    if (ids.length >= 2) break;
    if (!ids.includes(r.id)) ids.push(r.id);
  }
  return ids;
}

export default function ComparisonPage() {
  const { range, granularity, workspace } = useAppState();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const ds = getDataset();

  // A workspace only compares its own platform's ads; Meta and Google results are never mixed.
  const rows = useMemo(() => (range ? entityPerformance(ds, { level: 'ad', view: 'combined', range }).filter((r) => r.platform === workspace) : []), [ds, range, workspace]);
  const byId = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);
  /** Ad names repeat across campaigns, so every label carries its campaign. */
  const campaignName = useMemo(() => new Map(ds.campaigns.map((c) => [c.id, c.name])), [ds]);
  const labelOf = (r: { name: string; campaignId: string }) => `${r.name} · ${campaignName.get(r.campaignId) ?? r.campaignId}`;

  const requested = (params.get('ads') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const fromUrl = requested.filter((id, i) => requested.indexOf(id) === i && byId.has(id)).slice(0, MAX_ADS);
  const explicit = params.has('ads');
  const selected = fromUrl.length > 0 || explicit ? fromUrl : defaultSelection(rows);
  const unknownRequested = requested.filter((id) => !byId.has(id));

  const setSelected = (ids: string[]) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set('ads', ids.join(','));
        return next;
      },
      { replace: true },
    );
  const toggle = (id: string) => {
    if (selected.includes(id)) setSelected(selected.filter((x) => x !== id));
    else if (selected.length < MAX_ADS) setSelected([...selected, id]);
  };

  const picked = selected.map((id) => byId.get(id)).filter((r): r is EntityPerformanceRow => !!r);
  const colorOf = (i: number) => AD_COLORS[i % AD_COLORS.length] ?? '#2563eb';

  const verdict = useMemo(
    () =>
      picked.length >= MIN_ADS
        ? buildVerdict(
            picked.map((r, i) => ({
              id: r.id,
              label: `Ad ${LETTERS[i]} (${r.name})`,
              spendMinor: r.current.spendMinor,
              impressions: r.current.impressions,
              clicks: r.current.clicks,
              leads: r.current.leads,
              ctr: r.current.ctr,
              cplMinor: r.current.cplMinor,
              cpcMinor: r.current.cpcMinor,
            })),
          )
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selected.join(','), rows],
  );

  const seriesData = useMemo(() => {
    const out = new Map<SeriesMetric, ChartRow[]>();
    if (!range || selected.length === 0) return out;
    for (const m of TREND_METRICS) {
      out.set(
        m,
        adSeries(ds, { adIds: selected, metric: m, range, granularity }).map((p) => {
          const row: ChartRow = { key: p.key, label: p.label, incomplete: p.incomplete };
          for (const id of selected) row[id] = p.values[id] ?? null;
          return row;
        }),
      );
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ds, range, granularity, selected.join(',')]);

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
  const candidates = rows.filter((r) => !q || labelOf(r).toLowerCase().includes(q));
  const focusPicker = () => {
    searchRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    searchRef.current?.focus();
  };
  const platformName = workspace === 'meta' ? 'Meta Ads' : 'Google Ads';
  const reference = picked[0];

  return (
    <div className="space-y-4">
      <PageTitle title="Ad comparison" sub={`${platformName} ads side by side for ${dateRange(range)}. Pick ${MIN_ADS} to ${MAX_ADS} ads.`} />
      <PeriodBar />
      {unknownRequested.length > 0 && <Notice tone="warn">Ignored unknown ad ids in the link: {unknownRequested.join(', ')}.</Notice>}

      {/* Slots A-D with creative previews */}
      <section aria-label="Compared ads" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {LETTERS.map((letter, i) => {
          const r = picked[i];
          const color = colorOf(i);
          if (!r) {
            return (
              <button
                key={letter}
                type="button"
                onClick={focusPicker}
                className="flex min-h-[200px] flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed bg-white/60 p-4 text-sm font-medium transition-colors hover:bg-white"
                style={{ borderColor: color, color }}
                aria-label={`Choose ad for slot ${letter}`}
              >
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-white" style={{ background: color }}>{letter}</span>
                Choose ad
              </button>
            );
          }
          const creative = ds.creatives.find((c) => c.id === r.creativeId);
          return (
            <article className="card cmp-card flex flex-col gap-3 border-t-4 p-4" style={{ borderTopColor: color }} key={r.id} aria-label={labelOf(r)}>
              <div className="flex items-start gap-2">
                <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white" style={{ background: color }}>{letter}</span>
                <div className="min-w-0 flex-1">
                  <h4 className="truncate text-sm font-semibold text-ink">{r.name}</h4>
                  <div className="truncate text-xs text-ink-3">{campaignName.get(r.campaignId)}</div>
                </div>
                <button type="button" className="rounded-full px-1.5 text-ink-3 hover:bg-slate-100 hover:text-ink" aria-label={`Remove ${labelOf(r)} from comparison`} onClick={() => toggle(r.id)}>
                  ×
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <PlatformBadge platform={r.platform} /> <StatusBadge status={r.status} /> {r.fatigued && <Badge tone="neutral">Creative fatigue</Badge>}
              </div>
              {creative ? <AdPreview creative={creative} size="sm" /> : <EmptyState title="No creative" />}
            </article>
          );
        })}
      </section>

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
        <div className="mt-2 flex flex-wrap items-end gap-3">
          <label className="grid gap-1 text-xs font-semibold text-ink-2">
            <span>Search ads</span>
            <input ref={searchRef} className={`${inputCls} w-56 max-w-full`} type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Ad name" />
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

      {picked.length < MIN_ADS || !verdict || !reference ? (
        <EmptyState title="Select at least two ads to compare" />
      ) : (
        <>
          {/* Period and KPI comparison */}
          <section className="card overflow-hidden" aria-label="KPI comparison">
            <div className="border-b border-line px-4 py-3 sm:px-5">
              <h3 className="text-sm font-semibold text-ink">KPI comparison</h3>
              <p className="text-xs text-ink-3">
                Each value shows the change against the previous period of equal length, and (for B to D) against Ad A. Green is better, red is worse; for costs a lower value is better. Spend and impressions are not judged.
                A "best" marker needs enough volume ({count(DEFAULT_VOLUME_GUARD.minImpressions)} impressions, {DEFAULT_VOLUME_GUARD.minClicks} clicks, {DEFAULT_VOLUME_GUARD.minLeads} leads).
              </p>
            </div>
            <div className="relative overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-[13px]">
                <thead>
                  <tr className="text-left text-xs text-ink-3">
                    <th scope="col" className="px-4 py-2 font-medium sm:px-5">Metric</th>
                    {picked.map((r, i) => (
                      <th scope="col" key={r.id} className="px-3 py-2 font-medium">
                        <span className="inline-flex items-center gap-1.5">
                          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: colorOf(i) }} aria-hidden="true" />
                          Ad {LETTERS[i]}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ROWS.map((def) => {
                    const values = picked.map((r) => ({ id: r.id, value: def.get(r.current) }));
                    // Costs and rates are only called best with enough volume behind them.
                    const guardOk = (r: EntityPerformanceRow) => {
                      const m = r.current;
                      if (def.key === 'ctr' || def.key === 'cpm') return (m.impressions ?? 0) >= DEFAULT_VOLUME_GUARD.minImpressions;
                      if (def.key === 'cpc') return (m.clicks ?? 0) >= DEFAULT_VOLUME_GUARD.minClicks;
                      if (def.key === 'cpl') return (m.leads ?? 0) >= DEFAULT_VOLUME_GUARD.minLeads;
                      return true;
                    };
                    const winner = bestId(def.key, picked.filter(guardOk).map((r) => ({ id: r.id, value: def.get(r.current) })));
                    void values;
                    return (
                      <tr key={def.key} className="border-t border-line align-top">
                        <th scope="row" className="px-4 py-2.5 text-left font-medium text-ink-2 sm:px-5">{def.label}</th>
                        {picked.map((r, i) => {
                          const cur = def.get(r.current);
                          const prev = def.get(r.previous);
                          const ref = def.get(reference.current);
                          return (
                            <td key={r.id} className="px-3 py-2.5">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="tabular font-semibold text-ink">{cur === null ? '–' : def.fmt(cur)}</span>
                                {winner === r.id && <Badge tone="good" title="Best of the selected ads with enough volume">Best</Badge>}
                              </div>
                              <div className="mt-0.5 grid gap-0.5">
                                <DeltaChip metric={def.key} value={cur} reference={prev} label="vs previous period" />
                                {i > 0 && <DeltaChip metric={def.key} value={cur} reference={ref} label="vs Ad A" />}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="border-t border-line px-4 py-2.5 text-xs text-ink-3 sm:px-5">
              Verified orders and revenue count only paid orders with hard evidence (campaign-level for ads). A dash means there is no data, not zero.
            </p>
          </section>

          {/* Verdict */}
          <section className="card p-4 sm:p-5" aria-label="Verdict">
            <h3 className="text-sm font-semibold text-ink">Verdict</h3>
            <p className="mt-1 text-[15px] font-semibold text-ink" data-testid="verdict-headline">{verdict.headline}</p>
            {verdict.reasons.length > 0 && (
              <ul className="mt-2 list-disc space-y-1 pl-5 text-[13px] text-ink-2">
                {verdict.reasons.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            )}
            {verdict.caveats.length > 0 && (
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-ink-3">
                {verdict.caveats.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-2xs text-ink-3">Computed from the synthetic dataset by fixed rules. This is a summary of the numbers, not advice to change anything.</p>
          </section>

          {/* Trend charts: one card per metric, one line per ad */}
          <div className="grid gap-4 xl:grid-cols-2">
            {TREND_METRICS.map((m) => {
              const fmt = METRIC_FORMAT[m];
              const series: ChartSeries[] = picked.map((r, i) => ({
                key: r.id,
                label: `Ad ${LETTERS[i]} · ${r.name}`,
                color: colorOf(i),
                shape: SHAPES[i % SHAPES.length],
                format: fmt.value,
              }));
              return (
                <ChartCard
                  key={m}
                  title={`${fmt.label} trend`}
                  render={(o) => <TimeSeriesChart data={seriesData.get(m) ?? []} series={series} yFormat={fmt.axis} height={o.height} fixedWidth={o.fixedWidth} ariaLabel={`${fmt.label} of selected ads`} />}
                />
              );
            })}
          </div>

          {/* Detailed table */}
          <section className="card overflow-hidden" aria-label="Detailed table">
            <div className="border-b border-line px-4 py-3 sm:px-5">
              <h3 className="text-sm font-semibold text-ink">Details</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] border-collapse text-[13px]">
                <thead>
                  <tr className="text-left text-xs text-ink-3">
                    <th scope="col" className="px-4 py-2 font-medium sm:px-5">Ad</th>
                    <th scope="col" className="px-3 py-2 font-medium">Campaign</th>
                    <th scope="col" className="px-3 py-2 font-medium">Status</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">Spend</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">Impr.</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">Clicks</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">CTR</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">CPC</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">Leads</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">CPL</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">Previous CPL</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">Verified revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {picked.map((r, i) => (
                    <tr key={r.id} className="border-t border-line">
                      <th scope="row" className="px-4 py-2 text-left font-medium text-ink sm:px-5">
                        <span className="inline-flex items-center gap-1.5">
                          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: colorOf(i) }} aria-hidden="true" />
                          {LETTERS[i]} · {r.name}
                        </span>
                      </th>
                      <td className="px-3 py-2 text-ink-3">{campaignName.get(r.campaignId)}</td>
                      <td className="px-3 py-2"><StatusBadge status={r.status} /></td>
                      <td className="tabular px-3 py-2 text-right">{money(r.current.spendMinor)}</td>
                      <td className="tabular px-3 py-2 text-right">{count(r.current.impressions)}</td>
                      <td className="tabular px-3 py-2 text-right">{count(r.current.clicks)}</td>
                      <td className="tabular px-3 py-2 text-right">{pct(r.current.ctr)}</td>
                      <td className="tabular px-3 py-2 text-right">{money(r.current.cpcMinor)}</td>
                      <td className="tabular px-3 py-2 text-right">{count(r.current.leads)}</td>
                      <td className="tabular px-3 py-2 text-right">{money(r.current.cplMinor)}</td>
                      <td className="tabular px-3 py-2 text-right text-ink-3">{money(r.previous.cplMinor)}</td>
                      <td className="tabular px-3 py-2 text-right">{r.current.verifiedOrders > 0 ? money(r.current.verifiedRevenueMinor) : '–'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
