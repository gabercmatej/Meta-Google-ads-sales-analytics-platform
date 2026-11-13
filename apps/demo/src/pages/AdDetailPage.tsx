import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { adSeries, entityPerformance, performanceTotals, type SeriesMetric } from '@sedem-ads/analytics-core';
import { Card, EmptyState, KpiCard, PageTitle, Segmented, StatList, StatRow, StatusPill, Value } from '../components/ui';
import { PeriodBar } from '../components/PeriodBar';
import { ChartCard } from '../components/charts/ChartCard';
import { TimeSeriesChart, type ChartRow } from '../components/charts/TimeSeriesChart';
import { COLOR, metricColor } from '../components/charts/colors';
import { AdPreview } from '../components/AdPreview';
import { ChangeText, HintBadges, PlatformBadge } from '../components/EntityBits';
import { CoverageNotes } from '../components/Notes';
import { METRIC_FORMAT, Spark, sparkSpec } from '../components/OverviewCharts';
import { EntityActions, useSim } from '../sim/SimProvider';
import { useAppState } from '../state/AppState';
import { getDataset } from '../lib/data';
import { isPmax } from '../lib/campaignView';
import { count, date, dateRange, money, pct } from '../lib/format';

type Metric = Extract<SeriesMetric, 'spend' | 'clicks' | 'leads' | 'ctr' | 'cpc' | 'cpl'>;
const METRICS: { value: Metric; label: string }[] = [
  { value: 'spend', label: 'Spend' },
  { value: 'clicks', label: 'Clicks' },
  { value: 'leads', label: 'Leads' },
  { value: 'ctr', label: 'CTR' },
  { value: 'cpc', label: 'CPC' },
  { value: 'cpl', label: 'CPL' },
];

/** One ad: creative, KPIs with sparklines, trend, comparison with the previous period and settings. */
export default function AdDetailPage() {
  const { adId = '' } = useParams();
  const { range, granularity } = useAppState();
  const sim = useSim();
  const [metric, setMetric] = useState<Metric>('spend');
  const ds = getDataset();
  const ad = ds.ads.find((a) => a.id === adId);

  const data = useMemo(() => {
    if (!range || !ad) return null;
    const row = entityPerformance(ds, { level: 'ad', view: ad.platform, range, campaignId: ad.campaignId }).find((r) => r.id === ad.id) ?? null;
    return { row, totals: performanceTotals(ds, ad.platform, range) };
  }, [ds, ad, range]);

  const sparkOf = (m: Metric): (number | null)[] => (range && ad ? adSeries(ds, { adIds: [ad.id], metric: m, range, granularity: 'daily' }).map((p) => p.values[ad.id] ?? null) : []);
  const chartRows: ChartRow[] = useMemo(
    () => (range && ad ? adSeries(ds, { adIds: [ad.id], metric, range, granularity }).map((p) => ({ key: p.key, label: p.label, incomplete: p.incomplete, value: p.values[ad.id] ?? null })) : []),
    [ds, ad, metric, range, granularity],
  );

  const back = (
    <Link className="text-brand hover:underline" to="/campaigns">
      Back to Campaigns &amp; ads
    </Link>
  );
  if (!ad) {
    const created = sim.created.find((e) => e.id === adId);
    return (
      <div className="space-y-4">
        <PageTitle title={created ? created.name : 'Ad not found'} badge={created ? <PlatformBadge platform={created.platform} /> : undefined} />
        <EmptyState title={created ? 'No delivery data yet' : 'This ad does not exist in the demo dataset'}>
          {created ? 'Ads created in the simulation start paused and have no delivery data. ' : null}
          {back}
        </EmptyState>
      </div>
    );
  }
  if (!range || !data || !data.row) {
    return (
      <div className="space-y-4">
        <PageTitle title={ad.name} />
        <PeriodBar />
        <EmptyState title="No data for this period">Pick another period. {back}</EmptyState>
      </div>
    );
  }

  const o = sim.overlay(ad.id);
  const name = o?.name ?? ad.name;
  const status = o?.status ?? ad.status;
  const { row } = data;
  const c = row.current;
  const p = row.previous;
  const creativeBase = ds.creatives.find((x) => x.id === ad.creativeId);
  const creative = creativeBase ? { ...creativeBase, headline: o?.headline ?? creativeBase.headline, primaryText: o?.primaryText ?? creativeBase.primaryText } : undefined;
  const campaign = ds.campaigns.find((x) => x.id === ad.campaignId);
  const group = ds.adGroups.find((x) => x.id === ad.adGroupId);
  const pmax = isPmax(ds, ad.campaignId);
  const groupWord = ad.platform === 'meta' ? 'Ad set' : pmax ? 'Asset group' : 'Ad group';
  const rel = (a: number | null, b: number | null) => (a === null || b === null || b === 0 ? null : ((a - b) / Math.abs(b)) * 100);
  const delta = (a: number | null, b: number | null, goodWhen: 'up' | 'down' | 'neutral' = 'up') => ({ pct: rel(a, b), goodWhen });
  const st = (v: number | null): 'ok' | 'no_data' => (v === null ? 'no_data' : 'ok');
  const color = ad.platform === 'meta' ? COLOR.meta : COLOR.google;
  const sparkData: Record<string, (number | null)[]> = { spend: sparkOf('spend'), clicks: sparkOf('clicks'), impressions: sparkOf('impressions' as Metric), leads: sparkOf('leads'), ctr: sparkOf('ctr'), cpc: sparkOf('cpc'), cpl: sparkOf('cpl') };
  const sp = (m: Metric) => <Spark {...sparkSpec(sparkData, m)} color={metricColor(ad.platform, m)} label={`${METRIC_FORMAT[m].label} per day`} title={`${name}: ${METRIC_FORMAT[m].label}`} />;
  const fmt = METRIC_FORMAT[metric];
  const total = metric === 'spend' ? money(c.spendMinor) : metric === 'clicks' ? count(c.clicks) : metric === 'leads' ? count(c.leads) : metric === 'ctr' ? pct(c.ctr) : metric === 'cpc' ? money(c.cpcMinor) : money(c.cplMinor);
  const campaignHref = `/campaigns?platform=${ad.platform}&level=adsets&campaign=${ad.campaignId}`;
  const groupHref = `/campaigns?platform=${ad.platform}&level=ads&campaign=${ad.campaignId}&adset=${ad.adGroupId}`;

  const compareRows: { label: string; cur: string; prev: string; change: number | null; lowerIsBetter?: boolean }[] = [
    { label: 'Spend', cur: money(c.spendMinor), prev: money(p.spendMinor), change: row.change.spend },
    { label: 'CTR', cur: pct(c.ctr), prev: pct(p.ctr), change: row.change.ctr },
    { label: 'CPC', cur: money(c.cpcMinor), prev: money(p.cpcMinor), change: row.change.cpc, lowerIsBetter: true },
    { label: 'Leads', cur: count(c.leads), prev: count(p.leads), change: row.change.leads },
    { label: 'CPL', cur: money(c.cplMinor), prev: money(p.cplMinor), change: row.change.cpl, lowerIsBetter: true },
  ];

  return (
    <div className="space-y-4">
      <PageTitle
        title={name}
        badge={
          <>
            <PlatformBadge platform={ad.platform} /> <StatusPill status={status} /> <HintBadges row={row} />
          </>
        }
        sub={`${pmax ? 'Asset-group ad (combined assets)' : 'Ad'} · launched ${date(ad.launchDate)} · ${dateRange(range)}`}
        right={
          <div className="flex flex-wrap items-center gap-2">
            <Link className="btn btn-secondary btn-sm" to={`/compare?ads=${ad.id}`}>
              Compare
            </Link>
            <EntityActions entity={{ id: ad.id, level: 'ad', platform: ad.platform, name, status, dailyBudgetMinor: null }} />
          </div>
        }
      />
      <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-xs text-ink-3">
        <Link to={`/campaigns?platform=${ad.platform}`} className="text-brand hover:underline">All campaigns</Link>
        <span className="text-slate-400">›</span>
        <Link to={campaignHref} className="text-brand hover:underline">{sim.overlay(ad.campaignId)?.name ?? campaign?.name ?? ad.campaignId}</Link>
        <span className="text-slate-400">›</span>
        <Link to={groupHref} className="text-brand hover:underline">{sim.overlay(ad.adGroupId)?.name ?? group?.name ?? ad.adGroupId}</Link>
        <span className="text-slate-400">›</span>
        <span className="font-semibold text-ink">{name}</span>
      </nav>
      <PeriodBar />
      <CoverageNotes totals={data.totals} range={range} />
      {pmax && <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-ink-3 ring-1 ring-inset ring-slate-200/70">Performance Max combines assets automatically. Results are reported for the asset group, not for individual assets.</p>}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KpiCard label="Spend" value={money(c.spendMinor)} delta={delta(c.spendMinor, p.spendMinor, 'neutral')} comparison="vs previous" state={st(c.spendMinor)} sparkline={sp('spend')} />
        <KpiCard label="Clicks" value={count(c.clicks)} delta={delta(c.clicks, p.clicks)} comparison="vs previous" state={st(c.clicks)} sparkline={sp('clicks')} />
        <KpiCard label="CTR" value={pct(c.ctr)} delta={delta(c.ctr, p.ctr)} comparison="vs previous" state={st(c.ctr)} sparkline={sp('ctr')} />
        <KpiCard label="CPC" value={money(c.cpcMinor)} delta={delta(c.cpcMinor, p.cpcMinor, 'down')} comparison="vs previous" state={st(c.cpcMinor)} sparkline={sp('cpc')} />
        <KpiCard label="Leads" value={count(c.leads)} delta={delta(c.leads, p.leads)} comparison="vs previous" state={st(c.leads)} sparkline={sp('leads')} />
        <KpiCard label="CPL" value={money(c.cplMinor)} delta={delta(c.cplMinor, p.cplMinor, 'down')} comparison="vs previous" state={c.cplMinor === null ? 'no_calc' : 'ok'} reason="No leads in this period" sparkline={sp('cpl')} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ChartCard
            title={`${fmt.label} trend`}
            total={total}
            subtitle={<Segmented<Metric> label="Metric" size="sm" value={metric} options={METRICS} onChange={setMetric} />}
            render={(r) => (
              <TimeSeriesChart
                data={chartRows}
                series={[{ key: 'value', label: `${name}: ${fmt.label}`, color, shape: ad.platform === 'meta' ? 'circle' : 'square', format: fmt.value }]}
                yFormat={fmt.axis}
                height={r.height}
                fixedWidth={r.fixedWidth}
                ariaLabel={`${fmt.label} of ${name}`}
              />
            )}
          />
        </div>
        <Card title="Creative" subtitle="Synthetic demo creative">
          <div className="px-4 pb-4 sm:px-5">{creative ? <AdPreview creative={creative} /> : <EmptyState title="No creative" />}</div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Comparison with the previous period" subtitle="Same length, immediately before">
          <div className="overflow-x-auto px-4 pb-3 sm:px-5">
            <table className="w-full text-sm" aria-label="Comparison with the previous period">
              <thead>
                <tr className="text-xs text-ink-3">
                  <th className="py-2 text-left font-semibold">Metric</th>
                  <th className="py-2 text-right font-semibold">This period</th>
                  <th className="py-2 text-right font-semibold">Previous</th>
                  <th className="py-2 text-right font-semibold">Change</th>
                </tr>
              </thead>
              <tbody>
                {compareRows.map((r) => (
                  <tr key={r.label} className="border-t border-line">
                    <td className="py-2 font-medium text-ink-2">{r.label}</td>
                    <td className="py-2 text-right font-semibold"><Value text={r.cur} /></td>
                    <td className="py-2 text-right text-ink-3"><Value text={r.prev} /></td>
                    <td className="py-2 text-right"><ChangeText value={r.change} lowerIsBetter={r.lowerIsBetter} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <Card title="Ad settings" subtitle="Read from the simulated account">
          <div className="px-4 pb-3 sm:px-5">
            <StatList>
              <StatRow label="Status" value={<StatusPill status={status} />} />
              <StatRow label="Campaign" value={<Link className="text-brand hover:underline" to={campaignHref}>{campaign?.name ?? ad.campaignId}</Link>} />
              <StatRow label={groupWord} value={<Link className="text-brand hover:underline" to={groupHref}>{group?.name ?? ad.adGroupId}</Link>} />
              <StatRow label="Launched" value={date(ad.launchDate)} />
              <StatRow label="Budget" value="Set on the parent" hint="ads have no budget of their own" />
              <StatRow label="New objects" value="Created paused" hint="activation is a separate step" />
            </StatList>
          </div>
        </Card>
      </div>
    </div>
  );
}
