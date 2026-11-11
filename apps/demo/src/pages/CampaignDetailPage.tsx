import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { entityPerformance, performanceTotals } from '@sedem-ads/analytics-core';
import { PageHeader, EmptyState, Segmented, Value } from '../components/ui';
import { KpiCard } from '../components/KpiCard';
import { ChartCard } from '../components/charts/ChartCard';
import { TimeSeriesChart } from '../components/charts/TimeSeriesChart';
import { COLOR } from '../components/charts/colors';
import { AdPreview } from '../components/AdPreview';
import { ChangeText, HintBadges, PlatformBadge, StatusBadge, CHANNEL_LABEL, OBJECTIVE_LABEL } from '../components/EntityBits';
import { CoverageNotes } from '../components/Notes';
import { METRIC_FORMAT } from '../components/OverviewCharts';
import { EntityActions, useSim } from '../sim/SimProvider';
import { useAppState } from '../state/AppState';
import { getDataset } from '../lib/data';
import { campaignSeries } from '../lib/analytics';
import { count, dateRange, money, pct } from '../lib/format';
import './analytics.css';

type Metric = 'spend' | 'clicks' | 'leads' | 'ctr' | 'cpc' | 'cpl';
const METRICS: { value: Metric; label: string }[] = [
  { value: 'spend', label: 'Spend' },
  { value: 'clicks', label: 'Clicks' },
  { value: 'leads', label: 'Leads' },
  { value: 'ctr', label: 'CTR' },
  { value: 'cpc', label: 'CPC' },
  { value: 'cpl', label: 'CPL' },
];

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
      <>
        <PageHeader title={created ? created.name : 'Campaign not found'} badge={created ? <PlatformBadge platform={created.platform} /> : undefined} />
        <EmptyState title={created ? 'No delivery data yet' : 'This campaign does not exist in the demo dataset'}>
          {created ? 'Campaigns created in the simulation start paused and have no delivery data.' : null} <Link to="/campaigns">Back to Campaigns & Ads</Link>
        </EmptyState>
      </>
    );
  }
  if (!range || !data || !data.row) {
    return (
      <>
        <PageHeader title={campaign.name} />
        <EmptyState title="No data for this period">Pick another period. <Link to="/campaigns">Back to Campaigns & Ads</Link></EmptyState>
      </>
    );
  }

  const o = sim.overlay(campaign.id);
  const name = o?.name ?? campaign.name;
  const status = o?.status ?? campaign.status;
  const budget = o && o.dailyBudgetMinor !== undefined ? o.dailyBudgetMinor : campaign.dailyBudgetMinor;
  const { row } = data;
  const c = row.current;
  const p = row.previous;
  const rel = (a: number | null, b: number | null) => (a === null || b === null || b === 0 ? null : (a - b) / Math.abs(b));
  const fmt = METRIC_FORMAT[metric];
  const chartRows = campaignSeries(ds, { campaignId: campaign.id, platform: campaign.platform, metric, range, granularity });
  const assistantQ = encodeURIComponent(`How is the campaign "${name}" performing in ${dateRange(range)}? What would you change?`);
  const color = campaign.platform === 'meta' ? COLOR.meta : COLOR.google;

  return (
    <div className="stack">
      <PageHeader
        title={name}
        badge={<><PlatformBadge platform={campaign.platform} /> <StatusBadge status={status} /> <HintBadges row={row} /></>}
        description={
          <span className="hero-meta">
            <span>Objective / channel: <b>{campaign.objective ? OBJECTIVE_LABEL[campaign.objective] : campaign.channelType ? CHANNEL_LABEL[campaign.channelType] : '–'}</b></span>
            <span>Daily budget: <b>{budget !== null ? money(budget) : `set per ${campaign.platform === 'meta' ? 'ad set' : 'ad group'}`}</b></span>
            <span>Started: <b>{campaign.startDate}</b></span>
            <span>Period: <b>{dateRange(range)}</b></span>
          </span>
        }
        actions={
          <>
            <Link className="btn btn-secondary" to={`/assistant?q=${assistantQ}`}>Ask the AI Assistant about this campaign</Link>
            <EntityActions entity={{ id: campaign.id, level: 'campaign', platform: campaign.platform, name, status, dailyBudgetMinor: budget }} />
          </>
        }
      />
      <p><Link to="/campaigns">← All campaigns</Link></p>
      <CoverageNotes totals={data.totals} range={range} />

      <div className="kpi-grid">
        <KpiCard label="Spend" value={money(c.spendMinor)} change={rel(c.spendMinor, p.spendMinor)} />
        <KpiCard label="Impressions" value={count(c.impressions)} change={rel(c.impressions, p.impressions)} />
        <KpiCard label="Clicks" value={count(c.clicks)} change={rel(c.clicks, p.clicks)} />
        <KpiCard label="CTR" value={pct(c.ctr)} change={rel(c.ctr, p.ctr)} />
        <KpiCard label="CPC" value={money(c.cpcMinor)} change={rel(c.cpcMinor, p.cpcMinor)} lowerIsBetter />
        <KpiCard label="Leads" value={count(c.leads)} change={rel(c.leads, p.leads)} />
        <KpiCard label="CPL" value={money(c.cplMinor)} change={rel(c.cplMinor, p.cplMinor)} lowerIsBetter />
      </div>

      <ChartCard
        title={`${fmt.label} trend`}
        total={metric === 'spend' ? money(c.spendMinor) : metric === 'clicks' ? count(c.clicks) : metric === 'leads' ? count(c.leads) : metric === 'ctr' ? pct(c.ctr) : metric === 'cpc' ? money(c.cpcMinor) : money(c.cplMinor)}
        subtitle={<Segmented<Metric> label="Metric" value={metric} options={METRICS} onChange={setMetric} />}
        render={(r) => (
          <TimeSeriesChart
            data={chartRows}
            series={[{ key: 'value', label: `${name}: ${fmt.label}`, color, shape: campaign.platform === 'meta' ? 'circle' : 'square', format: fmt.value }]}
            yFormat={fmt.axis}
            height={r.height}
            fixedWidth={r.fixedWidth}
            ariaLabel={`${fmt.label} of ${name}`}
          />
        )}
      />

      <h2 className="section-title">{campaign.platform === 'meta' ? 'Ad sets' : 'Ad groups'}</h2>
      <div className="table-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th scope="col">Name</th><th scope="col">Status</th><th scope="col" className="r">Budget</th><th scope="col" className="r">Spend</th>
              <th scope="col" className="r">Clicks</th><th scope="col" className="r">CTR</th><th scope="col" className="r">Leads</th><th scope="col" className="r">CPL</th>
              <th scope="col" className="r">vs previous</th><th scope="col">Actions</th>
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
                  <td className="wrap"><div className="name-cell"><strong>{gn}</strong>{targeting && <small>{targeting}</small>}</div></td>
                  <td><StatusBadge status={gs} /></td>
                  <td className="r num"><Value text={money(gb)} reason="Budget is set at campaign level" /></td>
                  <td className="r num"><Value text={money(g.current.spendMinor)} /></td>
                  <td className="r num"><Value text={count(g.current.clicks)} /></td>
                  <td className="r num"><Value text={pct(g.current.ctr)} /></td>
                  <td className="r num"><Value text={count(g.current.leads)} /></td>
                  <td className="r num"><Value text={money(g.current.cplMinor)} /></td>
                  <td className="r num"><ChangeText value={g.change.spend} /></td>
                  <td><EntityActions entity={{ id: g.id, level: 'ad_group', platform: g.platform, name: gn, status: gs, dailyBudgetMinor: gb }} compact /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <h2 className="section-title">Ads</h2>
      <div className="cmp-grid">
        {data.ads.map((a) => {
          const creative = ds.creatives.find((x) => x.id === a.creativeId);
          const ao = sim.overlay(a.id);
          const as = ao?.status ?? a.status;
          const an = ao?.name ?? a.name;
          return (
            <article className="card cmp-card" key={a.id}>
              <div>
                <h4>{an}</h4>
                <div className="name-cell"><small><StatusBadge status={as} /> <HintBadges row={a} /></small></div>
              </div>
              {creative ? <AdPreview creative={ao?.headline || ao?.primaryText ? { ...creative, headline: ao.headline ?? creative.headline, primaryText: ao.primaryText ?? creative.primaryText } : creative} size="sm" /> : <EmptyState title="No creative" />}
              <dl className="metric-grid">
                <dt>Spend</dt><dd><Value text={money(a.current.spendMinor)} /></dd>
                <dt>CTR</dt><dd><Value text={pct(a.current.ctr)} /></dd>
                <dt>CPC</dt><dd><Value text={money(a.current.cpcMinor)} /></dd>
                <dt>Leads</dt><dd><Value text={count(a.current.leads)} /></dd>
                <dt>CPL</dt><dd><Value text={money(a.current.cplMinor)} /></dd>
              </dl>
              <EntityActions entity={{ id: a.id, level: 'ad', platform: a.platform, name: an, status: as, dailyBudgetMinor: null }} compact />
            </article>
          );
        })}
      </div>
    </div>
  );
}
