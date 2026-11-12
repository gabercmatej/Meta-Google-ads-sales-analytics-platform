import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { attributionOverview, performanceTotals, salesOverview } from '@sedem-ads/analytics-core';
import { Badge, Card, EmptyState, KpiCard, Notice, PageTitle, Section, ShareBar, type GoodWhen } from '../components/ui';
import { PeriodBar } from '../components/PeriodBar';
import { ChartCard } from '../components/charts/ChartCard';
import { COLOR, sourceColor, sourceLabel } from '../components/charts/colors';
import { MetricChart, RoasChart, SalesChart, SourcesChart, Spark, SurplusChart, SELECTED_LABEL, useSparks } from '../components/OverviewCharts';
import { useAppState } from '../state/AppState';
import { getDataset } from '../lib/data';
import { usablePreviousRange } from '../lib/useView';
import { SELECTED_SOURCES, SURPLUS_NOTE } from '../lib/analytics';
import { count, date, dateRange, money, multiple, pct, share } from '../lib/format';

function rel(cur: number | null | undefined, prev: number | null | undefined): number | null {
  if (cur === null || cur === undefined || prev === null || prev === undefined || prev === 0) return null;
  return ((cur - prev) / Math.abs(prev)) * 100;
}

function snapshot(range: { start: string; end: string }) {
  const ds = getDataset();
  const attr = attributionOverview(ds, { range });
  const sales = salesOverview(ds, { range });
  return {
    meta: performanceTotals(ds, 'meta', range),
    google: performanceTotals(ds, 'google', range),
    total: performanceTotals(ds, 'combined', range),
    attr,
    sales,
  };
}

export default function CombinedOverviewPage() {
  const { range } = useAppState();
  const sparks = useSparks('combined');
  const sparksMeta = useSparks('meta');
  const sparksGoogle = useSparks('google');
  const data = useMemo(() => {
    if (!range) return null;
    const prevRange = usablePreviousRange(range);
    return { cur: snapshot(range), prev: prevRange ? snapshot(prevRange) : null, prevRange };
  }, [range]);

  if (!range || !data) {
    return (
      <div className="space-y-5">
        <PageTitle title="Combined overview" />
        <PeriodBar />
        <EmptyState title="No completed days in this period">Pick another period. Today is a partial day and is excluded.</EmptyState>
      </div>
    );
  }

  const { cur, prev, prevRange } = data;
  const { attr, sales, total, meta, google } = cur;
  const cmp = prevRange ? `vs ${dateRange(prevRange)}` : undefined;
  const d = (a: number | null | undefined, b: number | null | undefined, goodWhen: GoodWhen = 'up') => ({ pct: rel(a, b), goodWhen });
  const spendOf = (t: typeof meta) => t.spendMinor;
  const spendSum = (spendOf(meta) ?? 0) + (spendOf(google) ?? 0);
  const part = sales.partition;
  const partOf = (s: string) => part.parts.find((x) => x.source === s);
  const selectedOrders = part.selected.orders;
  const verifiedRevenue = attr.verified.meta.revenueMinor + attr.verified.google.revenueMinor;
  const prevAttr = prev?.attr;
  const state = (v: number | null) => (v === null ? ({ state: 'no_data', reason: total.partial ? 'Some days have no data for both platforms' : 'No data for this period' } as const) : ({ state: 'ok' } as const));

  const ratioRows: { key: 'meta' | 'google'; name: string; spend: number | null; verified: { orders: number; revenueMinor: number }; sourceRev: number; sourceOrders: number; roas: number | null }[] = (['meta', 'google'] as const).map((k) => ({
    key: k,
    name: sourceLabel(k),
    spend: k === 'meta' ? attr.spend.metaMinor : attr.spend.googleMinor,
    verified: attr.verified[k],
    sourceRev: partOf(k)?.revenueMinor ?? 0,
    sourceOrders: partOf(k)?.orders ?? 0,
    roas: attr.roas[k],
  }));

  return (
    <div className="space-y-6">
      <PageTitle
        title="Combined overview"
        sub="How much are we investing in advertising, how many sales can we link to it, and which platform earns more per euro spent?"
        badge={<Badge tone="combined">Meta + Google</Badge>}
      />
      <PeriodBar />

      <Notice tone="warn" title="Demo mode">
        Every figure here is synthetic. No real Meta, Google, CRM or payment data is connected, and nothing can be written to any advertising account.
      </Notice>
      {total.partial && (
        <Notice tone="warn" title="Partial data">
          Combined spend counts only days where both platforms have data: {total.completeDays} of {total.expectedDays} days in {dateRange(range)}
          {total.missingDates.length > 0 && <> (missing: {total.missingDates.slice(0, 5).map((x) => date(x)).join(', ')}{total.missingDates.length > 5 ? ` and ${total.missingDates.length - 5} more` : ''})</>}. A missing day is “no data”, never zero.
        </Notice>
      )}

      <Section title="Advertising investment" description={`${dateRange(range)}${prevRange ? ` · compared with ${dateRange(prevRange)}` : ' · no previous period inside the available history'}`}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard series="spend" label="Total spend" value={money(total.spendMinor)} {...state(total.spendMinor)} delta={d(total.spendMinor, prev?.total.spendMinor, 'neutral')} comparison={cmp} sub={total.partial ? 'Only days with both platforms' : 'Meta + Google'} sparkline={<Spark values={sparks.spend ?? []} label="Total spend trend" />} />
          <KpiCard label="Meta spend" value={money(meta.spendMinor)} {...state(meta.spendMinor)} delta={d(meta.spendMinor, prev?.meta.spendMinor, 'neutral')} comparison={cmp} sub={meta.partial ? `${meta.completeDays} of ${meta.expectedDays} days` : 'Complete'} sparkline={<Spark values={sparksMeta.spend ?? []} color={COLOR.meta} label="Meta spend trend" />} />
          <KpiCard label="Google spend" value={money(google.spendMinor)} {...state(google.spendMinor)} delta={d(google.spendMinor, prev?.google.spendMinor, 'neutral')} comparison={cmp} sub={google.partial ? `${google.completeDays} of ${google.expectedDays} days` : 'Complete'} sparkline={<Spark values={sparksGoogle.spend ?? []} color={COLOR.google} label="Google spend trend" />} />
          <div className="card px-4 py-4 sm:px-5" data-testid="platform-share">
            <div className="text-xs font-medium text-ink-3">Platform share of spend</div>
            {meta.spendMinor !== null && google.spendMinor !== null && spendSum > 0 ? (
              <>
                <div className="kpi-value kpi-value-lg mt-2">{share(meta.spendMinor, spendSum)} <span className="text-sm font-medium text-ink-3">Meta</span></div>
                <div className="mt-3">
                  <ShareBar label="Spend share" parts={[{ label: 'Meta', value: meta.spendMinor, color: COLOR.meta }, { label: 'Google', value: google.spendMinor, color: COLOR.google }]} />
                </div>
                <div className="mt-2 flex justify-between text-xs text-ink-3">
                  <span>Meta {money(meta.spendMinor)}</span>
                  <span>Google {money(google.spendMinor)}</span>
                </div>
              </>
            ) : (
              <p className="mt-2 text-xs text-slate-600">Not calculated: one platform has no spend data for this period.</p>
            )}
          </div>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
          <ChartCard title="Daily spend by platform" total={money(total.spendMinor)} totalLabel="Combined" note={total.partial ? 'The combined line is empty on days where one platform has no data.' : undefined} render={(o) => <MetricChart metric="spend" view="combined" {...o} />} />
          <ChartCard title="Leads by platform" subtitle="Platform lead forms" total={count(total.leads)} totalLabel="Combined" render={(o) => <MetricChart metric="leads" view="combined" {...o} />} />
        </div>
      </Section>

      <Section title="Sales and revenue" description="Paid orders by the customer’s recorded source, by order date. Revenue includes 22% VAT. Unattributed revenue is never credited to a platform.">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard series="paid-sales" label="Paid orders (all sources)" value={count(part.eligibleOrders)} delta={d(part.eligibleOrders, prev?.sales.partition.eligibleOrders)} comparison={cmp} sparkline={<Spark values={sparks.orders ?? []} color={COLOR.combined} label="Paid orders trend" />} />
          <KpiCard label="Revenue (all sources)" value={money(part.eligibleRevenueMinor)} delta={d(part.eligibleRevenueMinor, prev?.sales.partition.eligibleRevenueMinor)} comparison={cmp} sub="Incl. 22% VAT" sparkline={<Spark values={sparks.revenue ?? []} color={COLOR.combined} label="Revenue trend" />} />
          <KpiCard label="Meta + Google + Chatbot/AI" value={money(attr.selectedSourceRevenueMinor)} delta={d(attr.selectedSourceRevenueMinor, prevAttr?.selectedSourceRevenueMinor)} comparison={cmp} sub={`${count(selectedOrders)} orders · subtotal of the selected sources`} />
          <KpiCard label="Platform leads (Meta + Google)" value={count(total.leads)} {...state(total.leads)} delta={d(total.leads, prev?.total.leads)} comparison={cmp} sub="Lead forms, not sales" sparkline={<Spark values={sparks.leads ?? []} label="Leads trend" />} />
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard label="Attributable ROAS · Meta" value={multiple(attr.roas.meta)} {...(attr.roas.meta === null ? { state: 'no_calc' as const, reason: 'No spend or no verified attribution' } : {})} delta={d(attr.roas.meta, prevAttr?.roas.meta)} comparison={cmp} sub="Verified evidence only" note="Verified attributed revenue divided by Meta spend." />
          <KpiCard label="Attributable ROAS · Google" value={multiple(attr.roas.google)} {...(attr.roas.google === null ? { state: 'no_calc' as const, reason: 'No spend or no verified attribution' } : {})} delta={d(attr.roas.google, prevAttr?.roas.google)} comparison={cmp} sub="Verified evidence only" note="Verified attributed revenue divided by Google spend." />
          <KpiCard label="Attributable ROAS · Combined" value={multiple(attr.roas.combined)} {...(attr.roas.combined === null ? { state: 'no_calc' as const, reason: 'No spend or no verified attribution' } : {})} delta={d(attr.roas.combined, prevAttr?.roas.combined)} comparison={cmp} sub="Ratio of sums" note="Total verified revenue divided by total spend. Not an average of the two platform ratios." sparkline={<Spark values={sparks.roas ?? []} color={COLOR.good} label="Combined ROAS trend" />} />
          <KpiCard
            label="Advertising surplus"
            value={money(attr.surplusMinor)}
            {...state(attr.surplusMinor)}
            delta={d(attr.surplusMinor, prevAttr?.surplusMinor)}
            comparison={cmp}
            sub="Not profit"
            note={`Selected-source revenue − total spend. ${SURPLUS_NOTE}`}
            sparkline={<Spark values={sparks.surplus ?? []} color={attr.surplusMinor !== null && attr.surplusMinor < 0 ? COLOR.bad : COLOR.good} label="Surplus trend" />}
          />
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
          <ChartCard
            title="Sales by source"
            total={money(attr.selectedSourceRevenueMinor)}
            totalLabel={SELECTED_LABEL}
            note="Stacked parts are paid revenue by customer source. The line is a subtotal of Meta, Google and Chatbot/AI, not an extra part. Source classifies a sale; it does not prove which ad produced it."
            render={(o) => <SourcesChart {...o} />}
          />
          <ChartCard title="Paid orders and revenue" total={`${count(part.eligibleOrders)} orders · ${money(part.eligibleRevenueMinor)}`} totalLabel="Period" render={(o) => <SalesChart view="combined" {...o} />} />
        </div>
      </Section>

      <Section title="Surplus and ROAS" description="Revenue against spend, per platform and combined. Ratios are computed from sums.">
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <ChartCard title="Advertising surplus" total={money(attr.surplusMinor)} note={`Selected-source revenue − total spend. ${SURPLUS_NOTE}`} render={(o) => <SurplusChart view="combined" {...o} />} />
          <ChartCard
            title="Attributable ROAS: Meta, Google and combined"
            total={`Meta ${multiple(attr.roas.meta)} · Google ${multiple(attr.roas.google)} · Combined ${multiple(attr.roas.combined)}`}
            note="Only orders with verified evidence (lead match or click id) are attributed. Platform-reported conversions are not mixed in."
            render={(o) => <RoasChart view="combined" {...o} />}
          />
        </div>
      </Section>

      <Card title="Revenue and attribution by platform" subtitle="Customer-source revenue classifies sales. ROAS uses verified attribution only; the rest stays unattributed.">
        <div className="overflow-x-auto">
          <table className="nav-table w-full text-sm" data-testid="platform-comparison">
            <thead>
              <tr className="text-left text-2xs uppercase tracking-wide text-ink-3">
                <th className="px-4 py-2 font-semibold">Source</th>
                <th className="px-2 py-2 text-right font-semibold">Orders</th>
                <th className="px-2 py-2 text-right font-semibold">Revenue</th>
                <th className="px-2 py-2 text-right font-semibold">Share</th>
                <th className="px-2 py-2 text-right font-semibold">Spend</th>
                <th className="px-2 py-2 text-right font-semibold">Verified revenue</th>
                <th className="px-4 py-2 text-right font-semibold">ROAS (verified)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {ratioRows.map((r) => (
                <tr key={r.key}>
                  <td className="px-4 py-2.5 font-medium text-ink"><span aria-hidden className="mr-2 inline-block h-2 w-2 rounded-[2px]" style={{ background: sourceColor(r.key) }} />{r.name}</td>
                  <td className="tabular px-2 py-2.5 text-right">{count(r.sourceOrders)}</td>
                  <td className="tabular px-2 py-2.5 text-right">{money(r.sourceRev)}</td>
                  <td className="tabular px-2 py-2.5 text-right">{share(r.sourceRev, part.eligibleRevenueMinor)}</td>
                  <td className="tabular px-2 py-2.5 text-right">{money(r.spend)}</td>
                  <td className="tabular px-2 py-2.5 text-right">{money(r.verified.revenueMinor)}</td>
                  <td className="tabular px-4 py-2.5 text-right font-semibold">{multiple(r.roas)}</td>
                </tr>
              ))}
              {part.parts
                .filter((x) => !['meta', 'google'].includes(x.source))
                .map((x) => (
                  <tr key={x.source}>
                    <td className="px-4 py-2.5 text-ink-2"><span aria-hidden className="mr-2 inline-block h-2 w-2 rounded-[2px]" style={{ background: sourceColor(x.source) }} />{sourceLabel(x.source)}{(SELECTED_SOURCES as readonly string[]).includes(x.source) ? '' : ''}</td>
                    <td className="tabular px-2 py-2.5 text-right">{count(x.orders)}</td>
                    <td className="tabular px-2 py-2.5 text-right">{money(x.revenueMinor)}</td>
                    <td className="tabular px-2 py-2.5 text-right">{share(x.revenueMinor, part.eligibleRevenueMinor)}</td>
                    <td className="px-2 py-2.5 text-right text-slate-300">—</td>
                    <td className="px-2 py-2.5 text-right text-slate-300">—</td>
                    <td className="px-4 py-2.5 text-right text-ink-3" title="No advertising platform, so no ROAS">no ROAS</td>
                  </tr>
                ))}
              <tr className="bg-slate-50 font-semibold">
                <td className="px-4 py-2.5 text-ink">All paid orders</td>
                <td className="tabular px-2 py-2.5 text-right">{count(part.eligibleOrders)}</td>
                <td className="tabular px-2 py-2.5 text-right">{money(part.eligibleRevenueMinor)}</td>
                <td className="tabular px-2 py-2.5 text-right">{pct(part.eligibleRevenueMinor > 0 ? 1 : null, 0)}</td>
                <td className="tabular px-2 py-2.5 text-right">{money(total.spendMinor)}</td>
                <td className="tabular px-2 py-2.5 text-right">{money(verifiedRevenue)}</td>
                <td className="tabular px-4 py-2.5 text-right">{multiple(attr.roas.combined)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="border-t border-line px-4 py-3 text-xs leading-relaxed text-ink-3 sm:px-5">
          Parts reconcile to the total{part.reconciles ? '' : ' (check failed)'}. Revenue by source is the customer’s recorded source, a classification; it is not proof an ad produced the sale. See{' '}
          <Link to="/attribution" className="font-semibold text-brand hover:underline">Attribution</Link> for the evidence behind each order.
        </p>
      </Card>
    </div>
  );
}
