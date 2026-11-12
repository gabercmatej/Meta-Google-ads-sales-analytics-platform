import { useMemo, useState, type ReactNode } from 'react';
import { EmptyState, KpiCard, PageTitle, Segmented, ShareBar, Tabs, Dialog, InfoTip, type GoodWhen } from '../components/ui';
import { PeriodBar } from '../components/PeriodBar';
import { ChartCard } from '../components/charts/ChartCard';
import { COLOR } from '../components/charts/colors';
import { TimeSeriesChart, type ChartRow, type ChartSeries } from '../components/charts/TimeSeriesChart';
import { Spark, useSparks } from '../components/OverviewCharts';
import { CHANNEL_LABEL, StatusBadge } from '../components/EntityBits';
import { useAppState } from '../state/AppState';
import { getDataset } from '../lib/data';
import { usablePreviousRange } from '../lib/useView';
import { entityPerformance } from '@sedem-ads/analytics-core';
import { campaignRows, googleConversionsByCampaign, googleDailyRows, platformSnapshot, rel, type GoogleDailyMetric } from '../lib/overviewData';
import { count, countAxis, dateRange, money, moneyAxis, multiple, pct } from '../lib/format';

type DialogKey = 'spend' | 'impressions' | 'clicks' | null;
type CampView = 'cards' | 'table';
type Tab = 'campaigns' | 'groups' | 'ads';

const METRIC_TITLE: Record<GoogleDailyMetric, string> = { spend: 'Spend', impressions: 'Impressions', clicks: 'Clicks', conversions: 'Conversions' };
const COLORS = ['#ea8a1a', '#2563eb', '#0d9488', '#7c3aed'];

const CONVERSION_ACTIONS = [
  { name: 'Contact form submitted', category: 'Lead', primary: true, share: 0.46 },
  { name: 'Phone call from ad', category: 'Phone call', primary: true, share: 0.22 },
  { name: 'Booking started', category: 'Begin checkout', primary: true, share: 0.19 },
  { name: 'Guide downloaded', category: 'Page view', primary: false, share: 0.13 },
];

function Group({ title, children, cols = 3 }: { title: string; children: ReactNode; cols?: 2 | 3 }) {
  return (
    <div>
      <p className="eyebrow mb-2">{title}</p>
      <div className={`grid grid-cols-1 gap-3 sm:grid-cols-2 ${cols === 3 ? 'xl:grid-cols-3' : ''}`}>{children}</div>
    </div>
  );
}

function ExpandLink({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick} className="mt-1.5 text-xs font-semibold text-brand hover:underline" aria-label={label}>
      Chart, campaigns and calculation →
    </button>
  );
}

export default function GoogleOverview() {
  const { range, granularity } = useAppState();
  const sparks = useSparks('google');
  const [dialog, setDialog] = useState<DialogKey>(null);
  const [campView, setCampView] = useState<CampView>('cards');
  const [tab, setTab] = useState<Tab>('campaigns');

  const data = useMemo(() => {
    if (!range) return null;
    const ds = getDataset();
    const prevRange = usablePreviousRange(range);
    const cur = platformSnapshot(ds, 'google', range);
    const prev = prevRange ? platformSnapshot(ds, 'google', prevRange) : null;
    const campaigns = campaignRows(ds, 'google', range).filter((r) => (r.current.spendMinor ?? 0) > 0);
    const groups = entityPerformance(ds, { level: 'ad_group', view: 'google', range }).filter((r) => (r.current.spendMinor ?? 0) > 0);
    const ads = entityPerformance(ds, { level: 'ad', view: 'google', range }).filter((r) => (r.current.spendMinor ?? 0) > 0);
    const conv = googleConversionsByCampaign(ds, range);
    const daily: Record<string, number[]> = {};
    for (const r of ds.daily) {
      if (r.platform !== 'google' || r.date < range.start || r.date > range.end) continue;
      (daily[r.campaignId] ??= []).push(r.spendMinor);
    }
    return { cur, prev, prevRange, campaigns, groups, ads, conv, daily };
  }, [range]);

  const dailySpend = useMemo(() => {
    if (!range) return [] as ChartRow[];
    const rows = googleDailyRows(getDataset(), range, granularity, 'spend');
    const vals = rows.map((r) => r.value).filter((v): v is number => typeof v === 'number');
    const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    return rows.map((r) => ({ ...r, avg: r.value === null ? null : avg }));
  }, [range, granularity]);

  const dialogRows = useMemo(() => (range && dialog ? googleDailyRows(getDataset(), range, granularity, dialog) : []), [range, granularity, dialog]);

  if (!range || !data) {
    return (
      <div className="space-y-5">
        <PageTitle title="Google overview" />
        <PeriodBar />
        <EmptyState title="No completed days in this period">Pick another period.</EmptyState>
      </div>
    );
  }

  const { cur, prev, prevRange, campaigns, groups, ads, conv, daily } = data;
  const c = cur.totals;
  const p = prev?.totals ?? null;
  const d = (a: number | null | undefined, b: number | null | undefined, goodWhen: GoodWhen = 'up') => ({ pct: rel(a, b), goodWhen });
  const cmp = prevRange ? `vs ${dateRange(prevRange)}` : undefined;
  const missing = (v: number | null): { state: 'ok' | 'no_data'; reason?: string } => (v === null ? { state: 'no_data', reason: 'No data for this period' } : { state: 'ok' });
  const totalSpend = c.spendMinor ?? 0;
  const costPerConversion = c.platformConversions && c.spendMinor !== null && c.platformConversions > 0 ? Math.round(c.spendMinor / c.platformConversions) : null;
  const totalConv = c.platformConversions ?? 0;
  const actions = CONVERSION_ACTIONS.map((a, i) => ({ ...a, value: i === 0 ? 0 : Math.round(totalConv * a.share) }));
  actions[0]!.value = Math.max(0, totalConv - actions.slice(1).reduce((s, a) => s + a.value, 0));

  const dailySeries: ChartSeries[] = [
    { key: 'value', label: 'Daily spend', color: COLOR.google, kind: 'bar', format: (v: number) => money(v) },
    { key: 'avg', label: 'Average', color: COLOR.combined, kind: 'line', dashed: true, width: 2, format: (v: number) => money(v) },
  ];
  const dialogMetric = dialog;
  const dialogFormat = dialogMetric === 'spend' ? (v: number) => money(v) : (v: number) => count(v);
  const dialogAxis = dialogMetric === 'spend' ? moneyAxis : countAxis;
  const dialogTotal = dialogMetric === 'spend' ? money(c.spendMinor) : dialogMetric === 'impressions' ? count(c.impressions) : count(c.clicks);
  const calcText: Record<'spend' | 'impressions' | 'clicks', string> = {
    spend: 'Sum of daily cost reported by Google Ads for completed days. A day without data is missing, not zero.',
    impressions: 'Sum of daily impressions reported by Google Ads for completed days.',
    clicks: 'Sum of daily clicks reported by Google Ads for completed days.',
  };

  return (
    <div className="space-y-6">
      <PageTitle
        title="Google overview"
        sub={
          <>
            {dateRange(range)} · completed days only
          </>
        }
        right={
          <span className="inline-flex items-center gap-2 rounded-full border border-line bg-white px-3 py-1.5 text-xs font-medium text-ink-2 shadow-sm" data-testid="account-pill">
            <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: COLOR.google }} />
            Google Ads: Northwind Advisory demo
          </span>
        }
      />
      <PeriodBar />

      <section className="card overflow-hidden" aria-label="Google advertising">
        <div className="border-b border-line px-4 py-4 sm:px-6 sm:py-5">
          <p className="eyebrow">Google advertising</p>
          <h2 className="mt-0.5 text-xl font-semibold tracking-tight text-ink">Google Ads overview</h2>
          <p className="mt-0.5 text-xs text-ink-3">
            {dateRange(range)}
            {prevRange ? ` · compared with the previous period (${dateRange(prevRange)})` : ''}
          </p>
        </div>
        <div className="space-y-6 bg-slate-50/50 px-4 py-5 sm:px-6">
          <Group title="Traffic and reach">
            <div>
              <KpiCard label="Spend" value={money(c.spendMinor)} {...missing(c.spendMinor)} delta={d(c.spendMinor, p?.spendMinor, 'neutral')} comparison={cmp} sparkline={<Spark values={sparks.spend ?? []} color={COLOR.google} label="Spend trend" />} />
              <ExpandLink onClick={() => setDialog('spend')} label="Spend: chart, campaigns and calculation" />
            </div>
            <div>
              <KpiCard label="Impressions" value={count(c.impressions)} {...missing(c.impressions)} delta={d(c.impressions, p?.impressions)} comparison={cmp} sparkline={<Spark values={sparks.impressions ?? []} color={COLOR.google} label="Impressions trend" />} />
              <ExpandLink onClick={() => setDialog('impressions')} label="Impressions: chart, campaigns and calculation" />
            </div>
            <div>
              <KpiCard label="Clicks" value={count(c.clicks)} {...missing(c.clicks)} delta={d(c.clicks, p?.clicks)} comparison={cmp} sparkline={<Spark values={sparks.clicks ?? []} color={COLOR.google} label="Clicks trend" />} />
              <ExpandLink onClick={() => setDialog('clicks')} label="Clicks: chart, campaigns and calculation" />
            </div>
          </Group>

          <Group title="Ad efficiency" cols={2}>
            <KpiCard label="CTR" value={pct(c.ctr)} {...missing(c.ctr)} delta={d(c.ctr, p?.ctr)} comparison={cmp} sub="Clicks ÷ impressions" sparkline={<Spark values={sparks.ctr ?? []} color={COLOR.google} label="CTR trend" />} />
            <KpiCard label="Avg. CPC" value={money(c.cpcMinor)} {...missing(c.cpcMinor)} delta={d(c.cpcMinor, p?.cpcMinor, 'down')} comparison={cmp} sub="Spend ÷ clicks" sparkline={<Spark values={sparks.cpc ?? []} color={COLOR.google} label="CPC trend" />} />
          </Group>

          <Group title="Google conversions" cols={2}>
            <KpiCard label="Conversions" value={count(c.platformConversions)} {...missing(c.platformConversions)} delta={d(c.platformConversions, p?.platformConversions)} comparison={cmp} sub="Google-reported; not added to leads or sales" />
            <KpiCard
              label="Cost per conversion"
              value={money(costPerConversion)}
              {...(costPerConversion === null ? { state: 'no_calc' as const, reason: 'No conversions in this period' } : {})}
              delta={d(costPerConversion, p && p.platformConversions && p.spendMinor !== null ? Math.round(p.spendMinor / p.platformConversions) : null, 'down')}
              comparison={cmp}
              sub="Spend ÷ Google conversions"
            />
          </Group>

          <Group title="Verified sales">
            <KpiCard label="Verified paid sales" value={money(cur.verifiedRevenueMinor)} delta={d(cur.verifiedRevenueMinor, prev?.verifiedRevenueMinor)} comparison={cmp} sub={`${count(cur.verifiedOrders)} orders with a Google click id`} />
            <KpiCard
              label="ROAS"
              value={multiple(cur.roas)}
              {...(cur.roas === null ? { state: 'no_calc' as const, reason: 'No spend or no verified sales in this period' } : {})}
              delta={d(cur.roas, prev?.roas)}
              comparison={cmp}
              sub="Verified evidence only"
              note="Verified Google revenue divided by Google spend. Orders without evidence are left out, not guessed."
            />
            <KpiCard
              label="Cost per paying customer"
              value={money(cur.costPerCustomerMinor)}
              {...(cur.costPerCustomerMinor === null ? { state: 'no_calc' as const, reason: 'No verified customers in this period' } : {})}
              delta={d(cur.costPerCustomerMinor, prev?.costPerCustomerMinor, 'down')}
              comparison={cmp}
              sub="Spend ÷ verified paid orders"
            />
          </Group>
        </div>
      </section>

      <section className="min-w-0">
        <ChartCard
          scope="Google Ads"
          title="Daily spend"
          total={money(c.spendMinor)}
          note="The dashed line is the average of the days shown."
          render={(o) => <TimeSeriesChart data={dailySpend} series={dailySeries} yFormat={moneyAxis} height={o.height} fixedWidth={o.fixedWidth} ariaLabel="Google daily spend" />}
        />
      </section>

      <section className="min-w-0" data-testid="campaign-comparison">
        <div className="mb-3.5 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold tracking-tight text-ink">Campaign comparison</h2>
          <Segmented<CampView>
            label="Campaign view"
            value={campView}
            onChange={setCampView}
            options={[
              { value: 'cards', label: 'Cards' },
              { value: 'table', label: 'Table' },
            ]}
          />
        </div>
        {campaigns.length === 0 ? (
          <EmptyState title="No campaign delivered in this period" />
        ) : campView === 'cards' ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            {campaigns.map((r, i) => {
              const share = totalSpend > 0 ? (r.current.spendMinor ?? 0) / totalSpend : 0;
              return (
                <article key={r.id} className="card overflow-hidden px-4 py-4" data-testid="campaign-card">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-sm font-semibold text-ink">{r.name}</h3>
                    <StatusBadge status={r.status} />
                  </div>
                  <p className="text-2xs text-ink-3">{r.channelType ? CHANNEL_LABEL[r.channelType] : ''}</p>
                  <p className="tabular mt-3 text-xl font-bold text-ink">{money(r.current.spendMinor)}</p>
                  <div className="mt-1.5">
                    <ShareBar parts={[{ label: r.name, value: share, color: COLORS[i % COLORS.length] ?? '#ea8a1a' }, { label: 'Other campaigns', value: 1 - share, color: '#e2e8f0' }]} label={`${r.name} share of Google spend`} />
                  </div>
                  <p className="mt-1 text-2xs text-ink-3">{(share * 100).toFixed(0)}% of Google spend</p>
                  <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                    {[
                      ['Impressions', count(r.current.impressions)],
                      ['Clicks', count(r.current.clicks)],
                      ['CTR', pct(r.current.ctr)],
                      ['Avg. CPC', money(r.current.cpcMinor)],
                      ['Conversions', count(conv.get(r.id) ?? 0)],
                      ['Verified orders', count(r.current.verifiedOrders)],
                    ].map(([k, v]) => (
                      <div key={k}>
                        <dt className="text-ink-3">{k}</dt>
                        <dd className="tabular font-medium text-ink">{v}</dd>
                      </div>
                    ))}
                  </dl>
                  <div className="mt-3">
                    <Spark values={daily[r.id] ?? []} color={COLORS[i % COLORS.length] ?? '#ea8a1a'} label={`${r.name} spend trend`} />
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="card overflow-x-auto">
            <table className="nav-table w-full min-w-[720px] text-sm" data-testid="campaign-table">
              <thead>
                <tr className="text-left text-2xs uppercase tracking-wide text-ink-3">
                  <th className="px-4 py-2 font-semibold">Campaign</th>
                  <th className="px-2 py-2 text-right font-semibold">Spend</th>
                  <th className="px-2 py-2 text-right font-semibold">Share</th>
                  <th className="px-2 py-2 text-right font-semibold">Impressions</th>
                  <th className="px-2 py-2 text-right font-semibold">Clicks</th>
                  <th className="px-2 py-2 text-right font-semibold">CTR</th>
                  <th className="px-2 py-2 text-right font-semibold">Avg. CPC</th>
                  <th className="px-4 py-2 text-right font-semibold">Conversions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {campaigns.map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-2.5 font-medium text-ink">{r.name}</td>
                    <td className="tabular px-2 py-2.5 text-right">{money(r.current.spendMinor)}</td>
                    <td className="tabular px-2 py-2.5 text-right">{totalSpend > 0 ? `${(((r.current.spendMinor ?? 0) / totalSpend) * 100).toFixed(0)}%` : '—'}</td>
                    <td className="tabular px-2 py-2.5 text-right">{count(r.current.impressions)}</td>
                    <td className="tabular px-2 py-2.5 text-right">{count(r.current.clicks)}</td>
                    <td className="tabular px-2 py-2.5 text-right">{pct(r.current.ctr)}</td>
                    <td className="tabular px-2 py-2.5 text-right">{money(r.current.cpcMinor)}</td>
                    <td className="tabular px-4 py-2.5 text-right">{count(conv.get(r.id) ?? 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="min-w-0" data-testid="structure-table">
        <div className="mb-3.5 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold tracking-tight text-ink">Campaigns, ad groups, ads</h2>
          <Tabs<Tab>
            label="Structure level"
            value={tab}
            onChange={setTab}
            options={[
              { value: 'campaigns', label: 'Campaigns' },
              { value: 'groups', label: 'Ad groups / Asset groups' },
              { value: 'ads', label: 'Ads' },
            ]}
          />
        </div>
        <div className="card overflow-x-auto">
          <table className="nav-table w-full min-w-[720px] text-sm">
            <thead>
              <tr className="text-left text-2xs uppercase tracking-wide text-ink-3">
                <th className="px-4 py-2 font-semibold">{tab === 'campaigns' ? 'Campaign' : tab === 'groups' ? 'Ad group / Asset group' : 'Ad'}</th>
                {tab !== 'campaigns' && <th className="px-2 py-2 font-semibold">Campaign</th>}
                <th className="px-2 py-2 font-semibold">Status</th>
                <th className="px-2 py-2 text-right font-semibold">Spend</th>
                <th className="px-2 py-2 text-right font-semibold">Impressions</th>
                <th className="px-2 py-2 text-right font-semibold">Clicks</th>
                <th className="px-2 py-2 text-right font-semibold">CTR</th>
                <th className="px-4 py-2 text-right font-semibold">Avg. CPC</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {(tab === 'campaigns' ? campaigns : tab === 'groups' ? groups : ads).map((r) => {
                const camp = campaigns.find((x) => x.id === r.campaignId);
                const pmax = (camp?.channelType ?? r.channelType) === 'PERFORMANCE_MAX';
                return (
                  <tr key={r.id}>
                    <td className="px-4 py-2.5 font-medium text-ink">
                      {r.name}
                      {tab === 'groups' && pmax && <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-2xs font-semibold text-ink-2">Asset group</span>}
                    </td>
                    {tab !== 'campaigns' && <td className="px-2 py-2.5 text-ink-2">{camp?.name ?? String(r.campaignId)}</td>}
                    <td className="px-2 py-2.5">
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="tabular px-2 py-2.5 text-right">{money(r.current.spendMinor)}</td>
                    <td className="tabular px-2 py-2.5 text-right">{count(r.current.impressions)}</td>
                    <td className="tabular px-2 py-2.5 text-right">{count(r.current.clicks)}</td>
                    <td className="tabular px-2 py-2.5 text-right">{pct(r.current.ctr)}</td>
                    <td className="tabular px-4 py-2.5 text-right">{money(r.current.cpcMinor)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-ink-3">Performance Max campaigns have asset groups instead of ad groups.</p>
      </section>

      <section className="min-w-0" data-testid="conversion-actions">
        <h2 className="mb-1 flex items-center text-lg font-semibold tracking-tight text-ink">
          Conversion actions (Google definitions) <InfoTip title="Conversion actions" text="Google-reported conversions, split by the action that triggered them. They are not sales and are never added to Meta results or verified orders." />
        </h2>
        <p className="mb-3 text-xs text-ink-3">Google-reported, not verified sales. Synthetic split for the demo.</p>
        <div className="card overflow-x-auto">
          <table className="nav-table w-full min-w-[560px] text-sm">
            <thead>
              <tr className="text-left text-2xs uppercase tracking-wide text-ink-3">
                <th className="px-4 py-2 font-semibold">Conversion action</th>
                <th className="px-2 py-2 font-semibold">Category</th>
                <th className="px-2 py-2 font-semibold">Counted as</th>
                <th className="px-2 py-2 text-right font-semibold">Conversions</th>
                <th className="px-4 py-2 text-right font-semibold">Cost per conversion</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {actions.map((a) => (
                <tr key={a.name}>
                  <td className="px-4 py-2.5 font-medium text-ink">{a.name}</td>
                  <td className="px-2 py-2.5 text-ink-2">{a.category}</td>
                  <td className="px-2 py-2.5">{a.primary ? 'Primary' : 'Secondary'}</td>
                  <td className="tabular px-2 py-2.5 text-right">{count(a.value)}</td>
                  <td className="tabular px-4 py-2.5 text-right">{a.value > 0 && c.spendMinor !== null ? money(Math.round(c.spendMinor / a.value)) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <Dialog open={dialog !== null} onClose={() => setDialog(null)} title={dialogMetric ? `${METRIC_TITLE[dialogMetric]}: chart, campaigns and calculation` : ''} wide>
        {dialogMetric && (
          <div className="space-y-4">
            <p className="tabular text-2xl font-bold text-ink">{dialogTotal}</p>
            <TimeSeriesChart
              data={dialogRows}
              series={[{ key: 'value', label: METRIC_TITLE[dialogMetric], color: COLOR.google, kind: 'bar', format: dialogFormat }]}
              yFormat={dialogAxis}
              height={240}
              ariaLabel={`Google ${METRIC_TITLE[dialogMetric]}`}
            />
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-2xs uppercase tracking-wide text-ink-3">
                  <th className="py-2 font-semibold">Campaign</th>
                  <th className="py-2 text-right font-semibold">{METRIC_TITLE[dialogMetric]}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {campaigns.map((r) => (
                  <tr key={r.id}>
                    <td className="py-2">{r.name}</td>
                    <td className="tabular py-2 text-right">{dialogMetric === 'spend' ? money(r.current.spendMinor) : dialogMetric === 'impressions' ? count(r.current.impressions) : count(r.current.clicks)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-ink-3">{calcText[dialogMetric as 'spend' | 'impressions' | 'clicks']}</p>
          </div>
        )}
      </Dialog>
    </div>
  );
}
