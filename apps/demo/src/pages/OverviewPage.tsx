import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { attributionOverview, entityPerformance, performanceTotals, salesOverview, type PlatformView } from '@sedem-ads/analytics-core';
import { Badge, Card, EmptyState, KpiCard, Notice, PageTitle, Section, type GoodWhen } from '../components/ui';
import { PeriodBar } from '../components/PeriodBar';
import { ChartCard } from '../components/charts/ChartCard';
import { COLOR } from '../components/charts/colors';
import { ChangeText, StatusBadge } from '../components/EntityBits';
import { MetricChart, RoasChart, SalesChart, SourcesChart, Spark, SurplusChart, SELECTED_LABEL, useSparks } from '../components/OverviewCharts';
import { PLATFORM_LABELS, useAppState } from '../state/AppState';
import { getDataset } from '../lib/data';
import { usablePreviousRange } from '../lib/useView';
import { SURPLUS_NOTE } from '../lib/analytics';
import { count, date, dateRange, money, multiple, pct } from '../lib/format';

function rel(cur: number | null | undefined, prev: number | null | undefined): number | null {
  if (cur === null || cur === undefined || prev === null || prev === undefined || prev === 0) return null;
  return ((cur - prev) / Math.abs(prev)) * 100;
}

interface Snapshot {
  totals: ReturnType<typeof performanceTotals>;
  attr: ReturnType<typeof attributionOverview>;
  paidOrders: number;
  revenueMinor: number;
  surplusMinor: number | null;
  roas: number | null;
}

function snapshot(view: 'meta' | 'google', range: { start: string; end: string }): Snapshot {
  const ds = getDataset();
  const totals = performanceTotals(ds, view, range);
  const attr = attributionOverview(ds, { range });
  const part = salesOverview(ds, { range }).partition.parts.find((x) => x.source === view);
  const revenueMinor = part?.revenueMinor ?? 0;
  const spend = view === 'meta' ? attr.spend.metaMinor : attr.spend.googleMinor;
  return { totals, attr, paidOrders: part?.orders ?? 0, revenueMinor, surplusMinor: spend === null ? null : revenueMinor - spend, roas: attr.roas[view] };
}

const view = (w: 'meta' | 'google'): PlatformView => w;

export default function OverviewPage() {
  const { workspace, range } = useAppState();
  const label = PLATFORM_LABELS[workspace];
  const sparks = useSparks(workspace);
  const color = workspace === 'meta' ? COLOR.meta : COLOR.google;

  const data = useMemo(() => {
    if (!range) return null;
    const cur = snapshot(workspace, range);
    const prevRange = usablePreviousRange(range);
    const prev = prevRange ? snapshot(workspace, prevRange) : null;
    const campaigns = entityPerformance(getDataset(), { level: 'campaign', view: workspace, range }).filter((r) => r.current.spendMinor !== null && r.current.spendMinor > 0);
    const ads = entityPerformance(getDataset(), { level: 'ad', view: workspace, range }).filter((r) => r.current.spendMinor !== null && r.current.spendMinor > 0);
    return { cur, prev, prevRange, campaigns, ads };
  }, [workspace, range]);

  if (!range || !data) {
    return (
      <div className="space-y-5">
        <PageTitle title={`${label} overview`} />
        <PeriodBar />
        <EmptyState title="No completed days in this period">Pick another period. Today is a partial day and is excluded.</EmptyState>
      </div>
    );
  }

  const { cur, prev, prevRange } = data;
  const c = cur.totals;
  const p = prev?.totals ?? null;
  const d = (a: number | null | undefined, b: number | null | undefined, goodWhen: GoodWhen = 'up') => ({ pct: rel(a, b), goodWhen });
  const cmp = prevRange ? `vs ${dateRange(prevRange)}` : undefined;
  const surplusNote = `${label} customer-source revenue − ${label} spend.`;
  const topCampaigns = [...data.campaigns].sort((a, b) => (b.current.spendMinor ?? 0) - (a.current.spendMinor ?? 0)).slice(0, 6);
  const topAds = [...data.ads].sort((a, b) => (b.current.leads ?? 0) - (a.current.leads ?? 0)).slice(0, 6);
  const missing = (v: number | null): { state: 'ok' | 'no_data'; reason?: string } => (v === null ? { state: 'no_data', reason: c.partial ? 'Some days in the period have no data' : 'No data for this period' } : { state: 'ok' });

  return (
    <div className="space-y-5">
      <PageTitle
        title={`${label} overview`}
        sub={
          <>
            {dateRange(range)} · completed days only
            {prevRange ? <> · compared with {dateRange(prevRange)}</> : <> · no previous period inside the available history</>}
          </>
        }
      />
      <PeriodBar />

      {c.partial && (
        <Notice tone="warn" title="Partial data">
          {c.completeDays} of {c.expectedDays} days in {dateRange(range)} have data for {label}
          {c.missingDates.length > 0 && <> (missing: {c.missingDates.slice(0, 5).map((x) => date(x)).join(', ')}{c.missingDates.length > 5 ? ` and ${c.missingDates.length - 5} more` : ''})</>}. A missing day is shown as “no data”, never as zero.
        </Notice>
      )}
      {!prev && <Notice tone="info">Change vs previous period shows “No comparison” because the previous equal-length window starts before the first day of history.</Notice>}

      <section className="card overflow-hidden" aria-label="Total advertising">
        <div className="border-b border-line px-4 py-4 sm:px-6 sm:py-5">
          <p className="eyebrow">{label} advertising</p>
          <h2 className="mt-0.5 text-xl font-semibold tracking-tight text-ink">Advertising summary</h2>
          <p className="mt-0.5 text-xs text-ink-3">
            {dateRange(range)}
            {prevRange ? ` · compared with the previous period (${dateRange(prevRange)})` : ''}
          </p>
        </div>
        <div className="space-y-6 bg-slate-50/50 px-4 py-5 sm:px-6">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard series="spend" label="Total spend" value={money(c.spendMinor)} {...missing(c.spendMinor)} delta={d(c.spendMinor, p?.spendMinor, 'neutral')} comparison={cmp} sparkline={<Spark values={sparks.spend ?? []} color={color} label="Spend trend" />} />
            <KpiCard series="meta-leads" label={`${label} platform leads`} value={count(c.leads)} {...missing(c.leads)} delta={d(c.leads, p?.leads)} comparison={cmp} sub="Lead forms reported by the platform" sparkline={<Spark values={sparks.leads ?? []} color={color} label="Leads trend" />} />
            <KpiCard label="Cost per lead (CPL)" value={money(c.cplMinor)} {...missing(c.cplMinor)} delta={d(c.cplMinor, p?.cplMinor, 'down')} comparison={cmp} sparkline={<Spark values={sparks.cpl ?? []} color={color} label="CPL trend" />} />
            <KpiCard series="paid-sales" label="Paid orders" value={count(cur.paidOrders)} delta={d(cur.paidOrders, prev?.paidOrders)} comparison={cmp} sub={`${label} customers, paid`} />
          </div>

          <div>
            <p className="eyebrow mb-2">Linked sales · estimate</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <KpiCard label="Revenue (incl. VAT)" value={money(cur.revenueMinor)} delta={d(cur.revenueMinor, prev?.revenueMinor)} comparison={cmp} sub={`Customer source: ${label}`} sparkline={<Spark values={sparks.revenue ?? []} color={COLOR.combined} label="Revenue trend" />} />
              <KpiCard
                label="Attributable ROAS"
                value={multiple(cur.roas)}
                {...(cur.roas === null ? { state: 'no_calc' as const, reason: 'No spend or no verified attribution in this period' } : {})}
                delta={d(cur.roas, prev?.roas)}
                comparison={cmp}
                sub="Verified evidence only"
                note="Verified attributed revenue divided by spend. Unattributed revenue is left out, not guessed."
                sparkline={<Spark values={sparks.roas ?? []} color={COLOR.good} label="ROAS trend" />}
              />
              <KpiCard
                label="Advertising surplus"
                value={money(cur.surplusMinor)}
                {...missing(cur.surplusMinor)}
                delta={d(cur.surplusMinor, prev?.surplusMinor)}
                comparison={cmp}
                sub="Not profit"
                note={`${surplusNote} ${SURPLUS_NOTE}`}
                sparkline={<Spark values={sparks.surplus ?? []} color={cur.surplusMinor !== null && cur.surplusMinor < 0 ? COLOR.bad : COLOR.good} label="Surplus trend" />}
              />
              <KpiCard label="Cost per click (CPC)" value={money(c.cpcMinor)} {...missing(c.cpcMinor)} delta={d(c.cpcMinor, p?.cpcMinor, 'down')} comparison={cmp} sparkline={<Spark values={sparks.cpc ?? []} color={color} label="CPC trend" />} />
            </div>
          </div>

          <div>
            <p className="eyebrow mb-2">Delivery</p>
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
              <KpiCard label="Impressions" value={count(c.impressions)} {...missing(c.impressions)} delta={d(c.impressions, p?.impressions)} sparkline={<Spark values={sparks.impressions ?? []} color={color} label="Impressions trend" />} />
              <KpiCard label="Clicks" value={count(c.clicks)} {...missing(c.clicks)} delta={d(c.clicks, p?.clicks)} sparkline={<Spark values={sparks.clicks ?? []} color={color} label="Clicks trend" />} />
              <KpiCard label="CTR" value={pct(c.ctr)} {...missing(c.ctr)} delta={d(c.ctr, p?.ctr)} sparkline={<Spark values={sparks.ctr ?? []} color={color} label="CTR trend" />} />
              <KpiCard label="Platform conversions" value={count(c.platformConversions)} {...missing(c.platformConversions)} sub="Platform-reported; not added to leads or sales" />
            </div>
          </div>
        </div>
      </section>

      <Section title="Charts" description={`${label} · ${dateRange(range)}`}>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <ChartCard title="Spend" total={money(c.spendMinor)} note={c.partial ? 'Days without data are gaps, not zero.' : undefined} render={(o) => <MetricChart metric="spend" view={view(workspace)} {...o} />} />
          <ChartCard title="Leads" total={count(c.leads)} subtitle="Platform lead forms" render={(o) => <MetricChart metric="leads" view={view(workspace)} {...o} />} />
          <ChartCard title="Clicks and CTR" total={`${count(c.clicks)} clicks · ${pct(c.ctr)}`} totalLabel="Period" render={(o) => <MetricChart metric="ctr" view={view(workspace)} {...o} />} />
          <ChartCard title="Cost per lead" total={money(c.cplMinor)} render={(o) => <MetricChart metric="cpl" view={view(workspace)} {...o} />} />
          <ChartCard title="Revenue from paid orders" total={money(cur.revenueMinor)} totalLabel={`${label} customers`} render={(o) => <SalesChart view={view(workspace)} {...o} />} />
          <ChartCard
            title="Sales by source"
            total={money(cur.attr.selectedSourceRevenueMinor)}
            totalLabel={SELECTED_LABEL}
            note="Source is the customer’s recorded source. It classifies sales; it does not prove which ad produced them."
            render={(o) => <SourcesChart {...o} />}
          />
          <ChartCard
            title="Attributable ROAS"
            total={multiple(cur.roas)}
            totalLabel={label}
            note="Only orders with verified evidence (lead match or click id) count as attributed. Platform-reported conversions are not mixed in."
            render={(o) => <RoasChart view={view(workspace)} {...o} />}
          />
          <ChartCard title="Advertising surplus" total={money(cur.surplusMinor)} note={`${SURPLUS_NOTE} ${surplusNote}`} render={(o) => <SurplusChart view={view(workspace)} {...o} />} />
        </div>
      </Section>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card title="Top campaigns by spend" subtitle={`${label} · ${dateRange(range)}`} actions={<Link className="text-xs font-semibold text-brand hover:underline" to="/campaigns">All campaigns</Link>}>
          {topCampaigns.length === 0 ? (
            <p className="px-5 py-6 text-center text-xs text-ink-3">No campaign delivered in this period.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="nav-table w-full text-sm">
                <thead>
                  <tr className="text-left text-2xs uppercase tracking-wide text-ink-3">
                    <th className="px-4 py-2 font-semibold">Campaign</th>
                    <th className="px-2 py-2 text-right font-semibold">Spend</th>
                    <th className="px-2 py-2 text-right font-semibold">Leads</th>
                    <th className="px-2 py-2 text-right font-semibold">CPL</th>
                    <th className="px-4 py-2 text-right font-semibold">CPL change</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {topCampaigns.map((r) => (
                    <tr key={r.id}>
                      <td className="px-4 py-2.5">
                        <Link to={`/campaigns/${r.id}`} className="font-medium text-ink hover:text-brand">{r.name}</Link>
                        <div className="mt-0.5"><StatusBadge status={r.status} /></div>
                      </td>
                      <td className="tabular px-2 py-2.5 text-right">{money(r.current.spendMinor)}</td>
                      <td className="tabular px-2 py-2.5 text-right">{count(r.current.leads)}</td>
                      <td className="tabular px-2 py-2.5 text-right">{money(r.current.cplMinor)}</td>
                      <td className="tabular px-4 py-2.5 text-right"><ChangeText value={r.change.cpl} lowerIsBetter /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        <Card title="Top ads by leads" subtitle={`${label} · ${dateRange(range)}`} actions={<Badge tone={workspace}>{label}</Badge>}>
          {topAds.length === 0 ? (
            <p className="px-5 py-6 text-center text-xs text-ink-3">No ad delivered in this period.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="nav-table w-full text-sm">
                <thead>
                  <tr className="text-left text-2xs uppercase tracking-wide text-ink-3">
                    <th className="px-4 py-2 font-semibold">Ad</th>
                    <th className="px-2 py-2 text-right font-semibold">Leads</th>
                    <th className="px-2 py-2 text-right font-semibold">CTR</th>
                    <th className="px-4 py-2 text-right font-semibold">CPL</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {topAds.map((r) => (
                    <tr key={r.id}>
                      <td className="px-4 py-2.5 font-medium text-ink">{r.name}</td>
                      <td className="tabular px-2 py-2.5 text-right">{count(r.current.leads)}</td>
                      <td className="tabular px-2 py-2.5 text-right">{pct(r.current.ctr)}</td>
                      <td className="tabular px-4 py-2.5 text-right">{money(r.current.cplMinor)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <p className="text-xs leading-relaxed text-ink-3">
        Demo data only. Results of different kinds (forms, clicks, purchases) are never added together; ROAS uses verified attribution only.
      </p>
    </div>
  );
}
