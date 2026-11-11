import { useMemo, useState, type ReactNode } from 'react';
import { attributionOverview, performanceTotals, salesOverview, type PlatformView, type SeriesMetric } from '@sedem-ads/analytics-core';
import { PageHeader, Dialog, EmptyState } from '../components/ui';
import { KpiCard } from '../components/KpiCard';
import { ChartCard } from '../components/charts/ChartCard';
import { CoverageNotes, Notice } from '../components/Notes';
import { MetricChart, RoasChart, SalesChart, SourcesChart, SurplusChart, SELECTED_LABEL } from '../components/OverviewCharts';
import { PLATFORM_LABELS, useAppState } from '../state/AppState';
import { getDataset } from '../lib/data';
import { usablePreviousRange } from '../lib/useView';
import { SURPLUS_NOTE } from '../lib/analytics';
import { count, dateRange, money, multiple, pct } from '../lib/format';
import './analytics.css';

type Chart = (o: { height: number; fixedWidth?: number }) => ReactNode;

interface Kpi {
  key: string;
  label: string;
  value: string;
  change: number | null;
  lowerIsBetter?: boolean;
  sub?: ReactNode;
  tone?: 'negative';
  chart: Chart;
  note?: string;
}

function rel(cur: number | null | undefined, prev: number | null | undefined): number | null {
  if (cur === null || cur === undefined || prev === null || prev === undefined || prev === 0) return null;
  return (cur - prev) / Math.abs(prev);
}

function metric(m: SeriesMetric): Chart {
  return (o) => <MetricChart metric={m} {...o} />;
}

interface Snapshot {
  totals: ReturnType<typeof performanceTotals>;
  attr: ReturnType<typeof attributionOverview>;
  paidOrders: number;
  revenueMinor: number;
  surplusMinor: number | null;
  roas: number | null;
}

function snapshot(platform: PlatformView, range: { start: string; end: string }): Snapshot {
  const ds = getDataset();
  const totals = performanceTotals(ds, platform, range);
  const attr = attributionOverview(ds, { range });
  const part = salesOverview(ds, { range }).partition;
  let paidOrders = part.eligibleOrders;
  let revenueMinor = part.eligibleRevenueMinor;
  let surplusMinor = attr.surplusMinor;
  let roas = attr.roas.combined;
  if (platform !== 'combined') {
    const p = part.parts.find((x) => x.source === platform);
    paidOrders = p?.orders ?? 0;
    revenueMinor = p?.revenueMinor ?? 0;
    const spend = platform === 'meta' ? attr.spend.metaMinor : attr.spend.googleMinor;
    surplusMinor = spend === null ? null : revenueMinor - spend;
    roas = attr.roas[platform];
  }
  return { totals, attr, paidOrders, revenueMinor, surplusMinor, roas };
}

export default function OverviewPage() {
  const { platform, range } = useAppState();
  const [open, setOpen] = useState<Kpi | null>(null);

  const data = useMemo(() => {
    if (!range) return null;
    const cur = snapshot(platform, range);
    const prevRange = usablePreviousRange(range);
    const prev = prevRange ? snapshot(platform, prevRange) : null;
    return { cur, prev, prevRange };
  }, [platform, range]);

  if (!range || !data) {
    return (
      <>
        <PageHeader title="Overview" />
        <EmptyState title="No completed days in this period">Pick another period. Today is a partial day and is excluded.</EmptyState>
      </>
    );
  }

  const { cur, prev, prevRange } = data;
  const c = cur.totals;
  const p = prev?.totals ?? null;
  const surplusNote = platform === 'combined' ? 'Selected-source revenue − total spend.' : `${PLATFORM_LABELS[platform]} customer-source revenue − ${PLATFORM_LABELS[platform]} spend.`;

  const kpis: Kpi[] = [
    { key: 'spend', label: 'Spend', value: money(c.spendMinor), change: rel(c.spendMinor, p?.spendMinor), chart: metric('spend') },
    { key: 'impressions', label: 'Impressions', value: count(c.impressions), change: rel(c.impressions, p?.impressions), chart: metric('impressions') },
    { key: 'clicks', label: 'Clicks', value: count(c.clicks), change: rel(c.clicks, p?.clicks), chart: metric('clicks') },
    { key: 'ctr', label: 'CTR', value: pct(c.ctr), change: rel(c.ctr, p?.ctr), chart: metric('ctr') },
    { key: 'cpc', label: 'CPC', value: money(c.cpcMinor), change: rel(c.cpcMinor, p?.cpcMinor), lowerIsBetter: true, chart: metric('cpc') },
    { key: 'leads', label: 'Leads', value: count(c.leads), change: rel(c.leads, p?.leads), sub: 'Platform lead forms', chart: metric('leads') },
    { key: 'cpl', label: 'CPL', value: money(c.cplMinor), change: rel(c.cplMinor, p?.cplMinor), lowerIsBetter: true, chart: metric('cpl') },
    { key: 'orders', label: 'Paid orders', value: count(cur.paidOrders), change: rel(cur.paidOrders, prev?.paidOrders), sub: platform === 'combined' ? 'All sources' : `${PLATFORM_LABELS[platform]} customers`, chart: (o) => <SalesChart {...o} /> },
    { key: 'revenue', label: 'Revenue', value: money(cur.revenueMinor), change: rel(cur.revenueMinor, prev?.revenueMinor), sub: 'Incl. 22% VAT', chart: (o) => <SalesChart {...o} /> },
    {
      key: 'roas',
      label: 'Attributable ROAS',
      value: multiple(cur.roas),
      change: rel(cur.roas, prev?.roas),
      sub: 'Verified evidence only',
      chart: (o) => <RoasChart {...o} />,
      note: 'Verified attributed revenue divided by spend. Unattributed revenue is left out, not guessed.',
    },
    {
      key: 'surplus',
      label: 'Advertising surplus',
      value: money(cur.surplusMinor),
      change: rel(cur.surplusMinor, prev?.surplusMinor),
      sub: 'Not profit',
      tone: cur.surplusMinor !== null && cur.surplusMinor < 0 ? 'negative' : undefined,
      chart: (o) => <SurplusChart {...o} />,
      note: `${surplusNote} ${SURPLUS_NOTE}`,
    },
  ];

  const a = cur.attr;
  const roasTotal = `Meta ${multiple(a.roas.meta)} · Google ${multiple(a.roas.google)} · Combined ${multiple(a.roas.combined)}`;
  const spendNote = c.partial ? 'Combined spend counts only days where both platforms have data.' : undefined;

  return (
    <div className="stack">
      <PageHeader
        title="Overview"
        description={
          <>
            {PLATFORM_LABELS[platform]} · {dateRange(range)}
            {prevRange ? <> · compared with {dateRange(prevRange)}</> : <> · no previous period inside the available history</>}
          </>
        }
      />
      <CoverageNotes totals={c} range={range} />
      {!prev && <Notice>Change vs previous period is shown as "–" because the previous equal-length window starts before the first day of history.</Notice>}

      <div className="kpi-grid" role="list" aria-label="Key metrics">
        {kpis.map((k) => (
          <div role="listitem" key={k.key} style={{ display: 'contents' }}>
            <KpiCard
              label={k.label}
              value={k.value}
              change={k.change}
              lowerIsBetter={k.lowerIsBetter}
              sub={k.sub}
              tone={k.tone}
              noDataReason={c.partial ? 'Some days in the period have no data for this view' : 'No data for this period'}
              onClick={() => setOpen(k)}
            />
          </div>
        ))}
      </div>

      <div className="grid-2">
        <ChartCard title="Spend" total={money(c.spendMinor)} note={spendNote} render={(o) => <MetricChart metric="spend" {...o} />} />
        <ChartCard title="Leads" total={count(c.leads)} render={(o) => <MetricChart metric="leads" {...o} />} />
        <ChartCard title="Paid orders and revenue" total={`${count(cur.paidOrders)} orders · ${money(cur.revenueMinor)}`} totalLabel="Period" render={(o) => <SalesChart {...o} />} />
        <ChartCard
          title="Sales by source"
          total={`${money(a.selectedSourceRevenueMinor)}`}
          totalLabel={`${SELECTED_LABEL}`}
          note="Source is the customer’s recorded source. It classifies sales; it does not prove which ad produced them."
          render={(o) => <SourcesChart {...o} />}
        />
        <ChartCard
          title="Attributable ROAS"
          total={roasTotal}
          totalLabel="Period"
          note="Only orders with verified evidence (lead match or click id) count as attributed. Meta’s own reported conversions are not mixed in."
          render={(o) => <RoasChart {...o} />}
        />
        <ChartCard
          title="Advertising surplus"
          total={money(cur.surplusMinor)}
          note={`${SURPLUS_NOTE} ${surplusNote}`}
          render={(o) => <SurplusChart {...o} />}
        />
      </div>

      <Dialog open={open !== null} title={open ? `${open.label} · ${PLATFORM_LABELS[platform]}` : ''} onClose={() => setOpen(null)} wide>
        {open && (
          <>
            <p className="card-sub" style={{ marginBottom: 8 }}>
              {open.value} in {dateRange(range)}
            </p>
            {open.chart({ height: 380 })}
            {open.note && <div className="chart-note">{open.note}</div>}
          </>
        )}
      </Dialog>
    </div>
  );
}
