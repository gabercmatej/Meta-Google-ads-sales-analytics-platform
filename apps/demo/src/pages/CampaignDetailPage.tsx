import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { entityPerformance, performanceTotals } from '@sedem-ads/analytics-core';
import { Card, EmptyState, KpiCard, PageTitle, Section, Segmented, StatList, StatRow, StatusPill, Value } from '../components/ui';
import { PeriodBar } from '../components/PeriodBar';
import { ChartCard } from '../components/charts/ChartCard';
import { TimeSeriesChart } from '../components/charts/TimeSeriesChart';
import { COLOR, metricColor } from '../components/charts/colors';
import { AdPreview } from '../components/AdPreview';
import { ChangeText, HintBadges, PlatformBadge, CHANNEL_LABEL, OBJECTIVE_LABEL } from '../components/EntityBits';
import { CoverageNotes } from '../components/Notes';
import { METRIC_FORMAT, Spark } from '../components/OverviewCharts';
import { EntityActions, useSim } from '../sim/SimProvider';
import { useAppState } from '../state/AppState';
import { getDataset } from '../lib/data';
import { campaignSeries } from '../lib/analytics';
import { isPmax, resultTrend } from '../lib/campaignView';
import { count, date, dateRange, money, pct } from '../lib/format';

type Metric = 'spend' | 'clicks' | 'leads' | 'ctr' | 'cpc' | 'cpl';
const METRICS: { value: Metric; label: string }[] = [
  { value: 'spend', label: 'Spend' },
  { value: 'clicks', label: 'Clicks' },
  { value: 'leads', label: 'Leads' },
  { value: 'ctr', label: 'CTR' },
  { value: 'cpc', label: 'CPC' },
  { value: 'cpl', label: 'CPL' },
];

const backLink = (
  <Link className="text-brand hover:underline" to="/campaigns">
    Back to Campaigns &amp; ads
  </Link>
);

export default function CampaignDetailPage() {
  const { campaignId = '' } = useParams();
  const { range, granularity } = useAppState();
  const sim = useSim();
  const [metric, setMetric] = useState<Metric>('spend');
  const ds = getDataset();
  const campaign = ds.campaigns.find((c) => c.id === campaignId);

  const data = useMemo(() => {
    if (!range || !campaign) return null;
    const view = campaign.platform;
    const row = entityPerformance(ds, { level: 'campaign', view, range }).find((r) => r.id === campaign.id) ?? null;
    return {
      row,
      totals: performanceTotals(ds, view, range),
      groups: entityPerformance(ds, { level: 'ad_group', view, range, campaignId: campaign.id }),
      ads: entityPerformance(ds, { level: 'ad', view, range, campaignId: campaign.id }),
    };
  }, [ds, campaign, range]);

  if (!campaign) {
    const created = sim.created.find((e) => e.id === campaignId);
    return (
      <div className="space-y-4">
        <PageTitle title={created ? created.name : 'Campaign not found'} badge={created ? <PlatformBadge platform={created.platform} /> : undefined} />
        <EmptyState title={created ? 'No delivery data yet' : 'This campaign does not exist in the demo dataset'}>
          {created ? 'Campaigns created in the simulation start paused and have no delivery data. ' : null}
          {backLink}
        </EmptyState>
      </div>
    );
  }
  if (!range || !data || !data.row) {
    return (
      <div className="space-y-4">
        <PageTitle title={campaign.name} />
        <PeriodBar />
        <EmptyState title="No data for this period">Pick another period. {backLink}</EmptyState>
      </div>
    );
  }

  const o = sim.overlay(campaign.id);
  const name = o?.name ?? campaign.name;
  const status = o?.status ?? campaign.status;
  const budget = o && o.dailyBudgetMinor !== undefined ? o.dailyBudgetMinor : campaign.dailyBudgetMinor;
  const { row } = data;
  const c = row.current;
  const p = row.previous;
  const rel = (a: number | null, b: number | null) => (a === null || b === null || b === 0 ? null : ((a - b) / Math.abs(b)) * 100);
  const fmt = METRIC_FORMAT[metric];
  const chartRows = campaignSeries(ds, { campaignId: campaign.id, platform: campaign.platform, metric, range, granularity });
  const assistantQ = encodeURIComponent(`How is the campaign "${name}" performing in ${dateRange(range)}? What would you change?`);
  const color = campaign.platform === 'meta' ? COLOR.meta : COLOR.google;
  const pmax = isPmax(ds, campaign.id);
  const groupWord = campaign.platform === 'meta' ? 'Ad set' : pmax ? 'Asset group' : 'Ad group';
  const spark = <Spark values={resultTrend(ds, row, 'leads', range)} color={metricColor(campaign.platform, 'leads')} label="Leads per day" title={`${name}: leads`} />;
  const kind = campaign.objective ? OBJECTIVE_LABEL[campaign.objective] : campaign.channelType ? CHANNEL_LABEL[campaign.channelType] : '–';
  const metricTotal = metric === 'spend' ? money(c.spendMinor) : metric === 'clicks' ? count(c.clicks) : metric === 'leads' ? count(c.leads) : metric === 'ctr' ? pct(c.ctr) : metric === 'cpc' ? money(c.cpcMinor) : money(c.cplMinor);
  const shape = campaign.platform === 'meta' ? 'circle' : 'square';
  const th = 'px-3 py-2 text-right text-xs font-semibold text-ink-3';
  const delta = (a: number | null, b: number | null, goodWhen: 'up' | 'down' | 'neutral' = 'up') => ({ pct: rel(a, b), goodWhen });
  const st = (v: number | null): 'ok' | 'no_data' => (v === null ? 'no_data' : 'ok');

  return (
    <div className="space-y-4">
      <PageTitle
        title={name}
        badge={
          <>
            <PlatformBadge platform={campaign.platform} /> <StatusPill status={status} /> <HintBadges row={row} />
          </>
        }
        sub={`${kind} · started ${date(campaign.startDate)} · ${dateRange(range)}`}
        right={
          <div className="flex flex-wrap items-center gap-2">
            <Link className="btn btn-secondary btn-sm" to={`/assistant?q=${assistantQ}`}>
              Ask the AI assistant
            </Link>
            <EntityActions entity={{ id: campaign.id, level: 'campaign', platform: campaign.platform, name, status, dailyBudgetMinor: budget }} />
          </div>
        }
      />
      <nav aria-label="Breadcrumb" className="text-xs text-ink-3">
        <Link to="/campaigns" className="text-brand hover:underline">
          Campaigns &amp; ads
        </Link>
        <span className="px-1.5 text-slate-400">/</span>
        <span className="text-ink-2">{name}</span>
      </nav>
      <PeriodBar />
      <CoverageNotes totals={data.totals} range={range} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        <KpiCard label="Spend" value={money(c.spendMinor)} delta={delta(c.spendMinor, p.spendMinor, 'neutral')} comparison="vs previous" state={st(c.spendMinor)} series="spend" />
        <KpiCard label="Impressions" value={count(c.impressions)} delta={delta(c.impressions, p.impressions)} comparison="vs previous" state={st(c.impressions)} />
        <KpiCard label="Clicks" value={count(c.clicks)} delta={delta(c.clicks, p.clicks)} comparison="vs previous" state={st(c.clicks)} />
        <KpiCard label="CTR" value={pct(c.ctr)} delta={delta(c.ctr, p.ctr)} comparison="vs previous" state={st(c.ctr)} />
        <KpiCard label="CPC" value={money(c.cpcMinor)} delta={delta(c.cpcMinor, p.cpcMinor, 'down')} comparison="vs previous" state={st(c.cpcMinor)} />
        <KpiCard label="Leads" value={count(c.leads)} delta={delta(c.leads, p.leads)} comparison="vs previous" state={st(c.leads)} series="meta-leads" sparkline={spark} />
        <KpiCard label="CPL" value={money(c.cplMinor)} delta={delta(c.cplMinor, p.cplMinor, 'down')} comparison="vs previous" state={c.cplMinor === null ? 'no_calc' : 'ok'} reason="No leads in this period" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ChartCard
            title={`${fmt.label} trend`}
            total={metricTotal}
            subtitle={<Segmented<Metric> label="Metric" size="sm" value={metric} options={METRICS} onChange={setMetric} />}
            render={(r) => (
              <TimeSeriesChart
                data={chartRows}
                series={[{ key: 'value', label: `${name}: ${fmt.label}`, color, shape, format: fmt.value }]}
                yFormat={fmt.axis}
                height={r.height}
                fixedWidth={r.fixedWidth}
                ariaLabel={`${fmt.label} of ${name}`}
              />
            )}
          />
        </div>
        <Card title="Campaign settings" subtitle="Read from the simulated account">
          <div className="px-4 pb-3 sm:px-5">
            <StatList>
              <StatRow label="Status" value={<StatusPill status={status} />} />
              <StatRow label={campaign.platform === 'meta' ? 'Objective' : 'Channel'} value={kind} />
              <StatRow label="Daily budget" value={budget !== null ? money(budget) : `set per ${groupWord.toLowerCase()}`} />
              <StatRow label="Budget level" value={campaign.budgetLevel === 'campaign' ? 'Campaign' : groupWord} />
              <StatRow label="Start date" value={date(campaign.startDate)} />
              <StatRow label={`${groupWord}s`} value={String(data.groups.length)} />
              <StatRow label="Ads" value={String(data.ads.length)} />
              <StatRow label="New objects" value="Created paused" hint="activation is a separate step" />
            </StatList>
          </div>
        </Card>
      </div>

      <Section title={`${groupWord}s`}>
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="nav-table w-full" aria-label={`${groupWord}s`}>
              <thead>
                <tr className="nav-cols">
                  <th scope="col" className="nav-stick nav-stick-edge px-3 py-2 text-left text-xs font-semibold text-ink-3" style={{ left: 0, minWidth: 240 }}>
                    {groupWord}
                  </th>
                  <th scope="col" className="px-3 text-left text-xs font-semibold text-ink-3">Status</th>
                  <th scope="col" className={th}>Budget</th>
                  <th scope="col" className={th}>Spend</th>
                  <th scope="col" className={th}>Clicks</th>
                  <th scope="col" className={th}>CTR</th>
                  <th scope="col" className={th}>Leads</th>
                  <th scope="col" className={th}>CPL</th>
                  <th scope="col" className={th}>Leads vs previous</th>
                  <th scope="col" className={th}>Manage</th>
                </tr>
              </thead>
              <tbody>
                {data.groups.map((g) => {
                  const go = sim.overlay(g.id);
                  const gs = go?.status ?? g.status;
                  const gb = go && go.dailyBudgetMinor !== undefined ? go.dailyBudgetMinor : g.dailyBudgetMinor;
                  const gn = go?.name ?? g.name;
                  const targeting = ds.adGroups.find((x) => x.id === g.id)?.targeting;
                  return (
                    <tr key={g.id}>
                      <td className="nav-stick nav-stick-edge px-3 py-2.5" style={{ left: 0, maxWidth: 320 }}>
                        <Link to={`/campaigns?platform=${campaign.platform}&level=ads&campaign=${campaign.id}&adset=${g.id}`} className="block truncate font-semibold text-ink hover:text-brand hover:underline" title={gn}>{gn}</Link>
                        {targeting && <div className="truncate text-2xs text-slate-500" title={targeting}>{targeting}</div>}
                      </td>
                      <td className="px-3"><StatusPill status={gs} /></td>
                      <td className="px-3 text-right"><Value text={money(gb)} reason="Budget is set at campaign level" /></td>
                      <td className="px-3 text-right font-semibold"><Value text={money(g.current.spendMinor)} /></td>
                      <td className="px-3 text-right"><Value text={count(g.current.clicks)} /></td>
                      <td className="px-3 text-right"><Value text={pct(g.current.ctr)} /></td>
                      <td className="px-3 text-right"><Value text={count(g.current.leads)} /></td>
                      <td className="px-3 text-right"><Value text={money(g.current.cplMinor)} /></td>
                      <td className="px-3 text-right"><ChangeText value={g.change.leads} /></td>
                      <td className="px-3 text-right">
                        <EntityActions entity={{ id: g.id, level: 'ad_group', platform: g.platform, name: gn, status: gs, dailyBudgetMinor: gb }} compact />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </Section>

      <Section title={pmax ? 'Asset-group ads (combined assets)' : 'Ads'}>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {data.ads.map((a) => {
            const creative = ds.creatives.find((x) => x.id === a.creativeId);
            const ao = sim.overlay(a.id);
            const as = ao?.status ?? a.status;
            const an = ao?.name ?? a.name;
            return (
              <article className="card cmp-card flex flex-col gap-3 p-4" key={a.id}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-semibold text-ink" title={an}><Link to={`/ads/${a.id}?platform=${a.platform}`} className="hover:text-brand hover:underline">{an}</Link></h3>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <StatusPill status={as} /> <HintBadges row={a} />
                    </div>
                  </div>
                  <Link to={`/compare?ads=${a.id}`} className="whitespace-nowrap text-xs font-medium text-brand hover:underline">
                    Compare
                  </Link>
                </div>
                {creative ? (
                  <AdPreview creative={ao?.headline || ao?.primaryText ? { ...creative, headline: ao.headline ?? creative.headline, primaryText: ao.primaryText ?? creative.primaryText } : creative} size="sm" />
                ) : (
                  <EmptyState title="No creative" />
                )}
                <dl className="grid grid-cols-3 gap-x-3 gap-y-2 text-xs">
                  <div><dt className="text-2xs text-slate-500">Spend</dt><dd className="font-semibold text-ink"><Value text={money(a.current.spendMinor)} /></dd></div>
                  <div><dt className="text-2xs text-slate-500">CTR</dt><dd><Value text={pct(a.current.ctr)} /></dd></div>
                  <div><dt className="text-2xs text-slate-500">CPC</dt><dd><Value text={money(a.current.cpcMinor)} /></dd></div>
                  <div><dt className="text-2xs text-slate-500">Leads</dt><dd className="font-semibold text-ink"><Value text={count(a.current.leads)} /></dd></div>
                  <div><dt className="text-2xs text-slate-500">CPL</dt><dd><Value text={money(a.current.cplMinor)} /></dd></div>
                </dl>
                <div className="mt-auto">
                  <EntityActions entity={{ id: a.id, level: 'ad', platform: a.platform, name: an, status: as, dailyBudgetMinor: null }} compact />
                </div>
              </article>
            );
          })}
        </div>
      </Section>
    </div>
  );
}
