import { useMemo, useState } from 'react';
import { Badge, Card, EmptyState, KpiCard, PageTitle, Section, Segmented } from '../components/ui';
import { PeriodBar } from '../components/PeriodBar';
import { ChartCard } from '../components/charts/ChartCard';
import { TimeSeriesChart, type ChartRow, type ChartSeries } from '../components/charts/TimeSeriesChart';
import { SourcesChart, SELECTED_LABEL, Spark, SurplusChart } from '../components/OverviewCharts';
import { COLOR, METRIC_COLOR, sourceColor, sourceLabel } from '../components/charts/colors';
import { Collapsible, InfoLine, Pill, td, tdr, tdw, th, thr } from '../components/ResultsParts';
import { PLATFORM_LABELS, useAppState } from '../state/AppState';
import { getDataset } from '../lib/data';
import { usablePreviousRange } from '../lib/useView';
import { combinedFigures, relChange } from '../lib/combined';
import { linkedByStatus, salesDays, salesFigures, servicesBreakdown, STATUS_LABEL, STATUS_ORDER, type Basis } from '../lib/resultsData';
import { count, countAxis, date, dateRange, money, moneyAxis, netOfVat, share } from '../lib/format';

const BASIS_OPTIONS = [
  { value: 'payment' as Basis, label: 'By payment date' },
  { value: 'order' as Basis, label: 'By order date (as in CRM)' },
];

const SOURCE_ROWS = ['meta', 'google', 'partner_portal', 'chatbot_ai', 'other_verified', 'unknown', 'conflicting'];

export default function SalesPage() {
  const { range, workspace, granularity } = useAppState();
  const [basis, setBasis] = useState<Basis>('order');
  const ds = getDataset();
  const prevRange = useMemo(() => (range ? usablePreviousRange(range) : null), [range]);
  const f = useMemo(() => (range ? salesFigures(ds, range, basis) : null), [ds, range, basis]);
  const pf = useMemo(() => (prevRange ? salesFigures(ds, prevRange, basis) : null), [ds, prevRange, basis]);
  const combined = useMemo(() => (range ? combinedFigures(ds, range) : null), [ds, range]);
  const daily = useMemo(() => (range ? salesDays(ds, range, 'daily', basis, workspace) : []), [ds, range, basis, workspace]);
  const bucketed = useMemo(() => (range ? salesDays(ds, range, granularity, basis, workspace) : []), [ds, range, granularity, basis, workspace]);
  const services = useMemo(() => (range ? servicesBreakdown(ds, range, basis) : []), [ds, range, basis]);
  const linked = useMemo(() => (range ? linkedByStatus(ds, range, basis, workspace) : null), [ds, range, basis, workspace]);

  if (!range || !f || !combined) {
    return (
      <div className="space-y-5">
        <PageTitle title="Sales" />
        <PeriodBar />
        <EmptyState title="No completed days in this period">Pick another period. Today is a partial day and is excluded.</EmptyState>
      </div>
    );
  }

  const vat = f.vatRatePercent;
  const wsLabel = PLATFORM_LABELS[workspace];
  const basisWord = basis === 'order' ? 'order date' : 'payment date';
  const basisShown = basis === 'order' ? 'by order date (as in CRM)' : 'by payment date';
  const comparison = prevRange ? `vs ${dateRange(prevRange)}` : undefined;
  const part = f.partition;
  const byKey = new Map<string, { orders: number; revenueMinor: number }>(part.parts.map((x) => [x.source, x]));
  const partsOrders = part.parts.reduce((a, x) => a + x.orders, 0);
  const partsRevenue = part.parts.reduce((a, x) => a + x.revenueMinor, 0);
  const dayKeys = daily.map((x) => x.key);
  const sparkOf = (pick: (x: (typeof daily)[number]) => number, title: string, color: string, format: 'money' | 'count') => (
    <Spark values={daily.map(pick)} dates={dayKeys} color={color} format={format} label="Daily trend" title={title} />
  );
  const linkedColor = workspace === 'meta' ? COLOR.meta : COLOR.google;
  const linkedLabel = workspace === 'meta' ? 'Meta → CRM (directly linked)' : 'Google → CRM (click-id linked)';

  const valueRows: ChartRow[] = bucketed.map((b) => ({ key: b.key, label: b.label, incomplete: b.incomplete, all: b.paidValue, linked: b.linkedValue }));
  const orderRows: ChartRow[] = bucketed.map((b) => ({ key: b.key, label: b.label, incomplete: b.incomplete, all: b.paidOrders, linked: b.linkedOrders }));
  const pairSeries = (fmt: (v: number) => string): ChartSeries[] => [
    { key: 'all', label: 'All paid sales (CRM)', color: COLOR.neutral, kind: 'bar', format: fmt },
    { key: 'linked', label: linkedLabel, color: linkedColor, kind: 'bar', format: fmt },
  ];
  const timeline: ChartRow[] = bucketed.map((b) => ({ key: b.key, label: b.label, incomplete: b.incomplete, value: b.paidValue, orders: b.paidOrders }));
  const timelineSeries: ChartSeries[] = [
    { key: 'value', label: 'Paid value', color: COLOR.combined, kind: 'area', format: (v) => money(v) },
    { key: 'orders', label: 'Paid orders', color: '#0d9488', kind: 'line', axis: 'right', shape: 'diamond', format: (v) => count(v) },
  ];

  return (
    <div className="space-y-5">
      <PageTitle
        title="Sales"
        sub={`${dateRange(range)} · days in Europe/Ljubljana · EUR · amounts include ${vat}% VAT unless marked net`}
        right={
          <span className="flex flex-wrap gap-1.5">
            <Badge tone="gray">Orders (CRM)</Badge>
            <Badge tone="gray">Payment status (CRM)</Badge>
            <Badge tone={workspace}>{wsLabel}</Badge>
          </span>
        }
      />
      <PeriodBar />

      <Card className="space-y-2 px-4 py-4 sm:px-5">
        <p className="text-xs font-medium text-ink-3">How many actual paid orders and revenue do we have?</p>
        <p className="text-sm font-semibold text-ink">
          {count(f.paid.orders)} paid orders · {money(f.paid.valueMinor)} incl. VAT ({money(netOfVat(f.paid.valueMinor, vat))} excl. VAT), {basisShown}.
        </p>
        <p className="text-xs text-ink-3">
          {pf && prevRange ? `Previous period (${dateRange(prevRange)}): ${count(pf.paid.orders)} paid orders · ${money(pf.paid.valueMinor)}.` : 'No comparable previous period.'} Only orders marked paid in the CRM are counted as sales; unpaid, cancelled and refunded orders are not revenue.
        </p>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <Segmented<Basis> label="Date basis" value={basis} onChange={setBasis} options={BASIS_OPTIONS} />
        <p className="text-xs text-ink-3" data-testid="basis-shown">
          Shown: {basisShown}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard label="All orders" value={count(f.all.orders)} delta={{ pct: relChange(f.all.orders, pf?.all.orders), goodWhen: 'up' }} comparison={comparison} sub="Every CRM status" sparkline={sparkOf((x) => x.allOrders, 'All orders', METRIC_COLOR.orders, 'count')} />
        <KpiCard series="paid-sales" label="Paid orders" value={count(f.paid.orders)} delta={{ pct: relChange(f.paid.orders, pf?.paid.orders), goodWhen: 'up' }} comparison={comparison} sub="Marked paid in the CRM" sparkline={sparkOf((x) => x.paidOrders, 'Paid orders', METRIC_COLOR.paidOrders, 'count')} />
        <KpiCard label="Ordered value (all orders)" value={money(f.all.valueMinor)} delta={{ pct: relChange(f.all.valueMinor, pf?.all.valueMinor), goodWhen: 'up' }} comparison={comparison} sub="Not revenue" sparkline={sparkOf((x) => x.allValue, 'Ordered value (all orders)', COLOR.neutral, 'money')} />
        <KpiCard series="paid-sales" label="Paid value" value={money(f.paid.valueMinor)} delta={{ pct: relChange(f.paid.valueMinor, pf?.paid.valueMinor), goodWhen: 'up' }} comparison={comparison} sub={`${money(netOfVat(f.paid.valueMinor, vat))} excl. VAT`} sparkline={sparkOf((x) => x.paidValue, 'Paid value', METRIC_COLOR.revenue, 'money')} />
        <KpiCard
          label="Average paid order value"
          value={money(f.averagePaidMinor)}
          state={f.averagePaidMinor === null ? 'no_data' : 'ok'}
          reason="No paid orders in this period"
          delta={{ pct: relChange(f.averagePaidMinor, pf?.averagePaidMinor), goodWhen: 'up' }}
          comparison={comparison}
          sub="Incl. VAT"
          sparkline={
            <Spark
              values={daily.map((x) => (x.paidOrders > 0 ? x.paidValue / x.paidOrders : null))}
              dates={dayKeys}
              format="money"
              agg={{ kind: 'ratio', num: daily.map((x) => x.paidValue), den: daily.map((x) => x.paidOrders) }}
              color={METRIC_COLOR.aov}
              label="Daily trend"
              title="Average paid order value"
            />
          }
        />
      </div>

      <Section
        title="Paid sales by day"
        description={`Paid orders only, by ${basisWord}. The second series counts only paid orders with verified evidence of ${wsLabel}; every other paid order stays unlinked.`}
        action={
          <span className="flex flex-wrap gap-1.5">
            <Pill color={COLOR.neutral}>All paid sales (CRM)</Pill>
            <Pill color={linkedColor}>{linkedLabel}</Pill>
          </span>
        }
      >
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ChartCard
            title="Value of paid sales"
            total={money(f.paid.valueMinor)}
            totalLabel="EUR incl. VAT"
            className="min-w-0"
            note="Bars follow the selected date basis. A day without orders is zero."
            render={(r) => <TimeSeriesChart data={valueRows} series={pairSeries((v) => money(v))} yFormat={moneyAxis} height={r.height} fixedWidth={r.fixedWidth} ariaLabel="Value of paid sales" />}
          />
          <ChartCard
            title="Number of paid orders"
            total={count(f.paid.orders)}
            totalLabel="orders"
            className="min-w-0"
            note="A verified link means a lead id or click id matches; similar dates, amounts or names never link an order."
            render={(r) => <TimeSeriesChart data={orderRows} series={pairSeries((v) => count(v))} yFormat={countAxis} height={r.height} fixedWidth={r.fixedWidth} ariaLabel="Number of paid orders" />}
          />
        </div>
      </Section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard
          title="Revenue and orders over time"
          total={money(f.paid.valueMinor)}
          totalLabel="paid value"
          className="min-w-0"
          note={`Paid value (area) and paid orders (line, right axis), by ${basisWord}.`}
          render={(r) => <TimeSeriesChart data={timeline} series={timelineSeries} yFormat={moneyAxis} rightFormat={countAxis} height={r.height} fixedWidth={r.fixedWidth} ariaLabel="Revenue and orders over time" />}
        />
        <ChartCard
          title="Sales by source"
          total={money(f.paid.valueMinor)}
          totalLabel="All paid sales"
          className="min-w-0"
          note={`Source is the customer's recorded source (classification). The line is the subtotal ${SELECTED_LABEL}, derived from the bars.`}
          render={(r) => <SourcesChart {...r} basis={basis} />}
        />
      </div>

      <ChartCard
        title="Advertising profitability"
        className="min-w-0"
        note="Revenue from the selected sources minus Meta and Google spend. This is a surplus, not profit: it ignores delivery cost, tax and staff."
        render={(r) => <SurplusChart {...r} view={workspace} />}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Order source (CRM label)" subtitle={`Paid orders, by ${basisWord}. Every paid order sits in exactly one source.`} className="min-w-0">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th scope="col" className={th}>Source</th>
                  <th scope="col" className={thr}>Orders</th>
                  <th scope="col" className={thr}>Value</th>
                  <th scope="col" className={thr}>Share</th>
                </tr>
              </thead>
              <tbody>
                {SOURCE_ROWS.map((k) => {
                  const x = byKey.get(k);
                  if (!x && (k === 'conflicting' || k === 'unknown')) return null;
                  return (
                    <tr key={k}>
                      <td className={td}>
                        <span className="mr-2 inline-block h-2.5 w-2.5 rounded-[3px] align-[-1px]" style={{ background: sourceColor(k) }} aria-hidden />
                        {sourceLabel(k)}
                      </td>
                      <td className={tdr}>{count(x?.orders ?? 0)}</td>
                      <td className={tdr}>{money(x?.revenueMinor ?? 0)}</td>
                      <td className={tdr}>{share(x?.revenueMinor ?? 0, part.eligibleRevenueMinor)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50 font-semibold text-ink">
                  <td className={td}>Total (sum of parts)</td>
                  <td className={tdr}>{count(partsOrders)}</td>
                  <td className={tdr}>{money(partsRevenue)}</td>
                  <td className={tdr}>{share(partsRevenue, part.eligibleRevenueMinor)}</td>
                </tr>
                <tr>
                  <td className={`${td} italic`}>Subtotal: {SELECTED_LABEL}</td>
                  <td className={tdr}>{count(part.selected.orders)}</td>
                  <td className={tdr}>{money(part.selected.revenueMinor)}</td>
                  <td className={tdr}>{share(part.selected.revenueMinor, part.eligibleRevenueMinor)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>

        <Card title="Services" subtitle={`Orders by service, by ${basisWord}. Paid value is revenue; ordered value is not.`} className="min-w-0">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th scope="col" className={th}>Service</th>
                  <th scope="col" className={thr}>All orders</th>
                  <th scope="col" className={thr}>Paid orders</th>
                  <th scope="col" className={thr}>Paid value</th>
                  <th scope="col" className={thr}>Share</th>
                </tr>
              </thead>
              <tbody>
                {services.map((s) => (
                  <tr key={s.service}>
                    <td className={tdw}>{s.service}</td>
                    <td className={tdr}>{count(s.allOrders)}</td>
                    <td className={tdr}>{count(s.paidOrders)}</td>
                    <td className={tdr}>{money(s.paidValue)}</td>
                    <td className={tdr}>{share(s.paidValue, f.paid.valueMinor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="All orders by status" subtitle={`By ${basisWord}. Only paid orders are revenue.`} className="min-w-0">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th scope="col" className={th}>Status</th>
                  <th scope="col" className={thr}>Orders</th>
                  <th scope="col" className={thr}>Value</th>
                </tr>
              </thead>
              <tbody>
                {STATUS_ORDER.map((s) => (
                  <tr key={s} className={s === 'paid' ? 'font-semibold text-ink' : undefined}>
                    <td className={td}>{STATUS_LABEL[s]}</td>
                    <td className={tdr}>{count(f.statuses[s].orders)}</td>
                    <td className={tdr}>{money(f.statuses[s].revenueMinor)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50 font-semibold text-ink">
                  <td className={td}>All orders</td>
                  <td className={tdr}>{count(f.all.orders)}</td>
                  <td className={tdr}>{money(f.all.valueMinor)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>

        <Card
          title={`${wsLabel} → CRM by status`}
          subtitle={`Orders with verified ${workspace === 'meta' ? 'lead-form' : 'click-id'} evidence of ${wsLabel}, by CRM status. Not a guess from names, amounts or dates.`}
          className="min-w-0"
        >
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th scope="col" className={th}>Status</th>
                  <th scope="col" className={thr}>Orders</th>
                  <th scope="col" className={thr}>Value</th>
                </tr>
              </thead>
              <tbody>
                {STATUS_ORDER.map((s) => (
                  <tr key={s}>
                    <td className={td}>{STATUS_LABEL[s]}</td>
                    <td className={tdr}>{count(linked?.[s].orders ?? 0)}</td>
                    <td className={tdr}>{money(linked?.[s].valueMinor ?? 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <Card title="CRM reconciliation" subtitle="How the order list in the CRM becomes the paid sales above." id="crm-reconciliation">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th scope="col" className={th}>Row</th>
                <th scope="col" className={thr}>Orders</th>
                <th scope="col" className={thr}>Value</th>
                <th scope="col" className={th}>Note</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className={td}>All CRM orders</td>
                <td className={tdr}>{count(combined.crm.all.orders)}</td>
                <td className={tdr}>{money(combined.crm.all.revenueMinor)}</td>
                <td className={td}>By order date, every status</td>
              </tr>
              <tr className="font-semibold text-ink">
                <td className={td}>Paid orders</td>
                <td className={tdr}>{count(combined.crm.paid.orders)}</td>
                <td className={tdr}>{money(combined.crm.paid.revenueMinor)}</td>
                <td className={`${td} font-normal`}>The revenue figure used across the app</td>
              </tr>
              <tr>
                <td className={td}>Unpaid</td>
                <td className={tdr}>{count(combined.crm.unpaid.orders)}</td>
                <td className={tdr}>{money(combined.crm.unpaid.revenueMinor)}</td>
                <td className={td}>Not revenue until paid</td>
              </tr>
              <tr>
                <td className={td}>Excluded / invalid</td>
                <td className={tdr}>{count(combined.crm.excluded.orders)}</td>
                <td className={tdr}>{money(combined.crm.excluded.revenueMinor)}</td>
                <td className={td}>Cancelled and refunded</td>
              </tr>
              <tr>
                <td className={td}>Paid, by payment-date basis</td>
                <td className={tdr}>{count(combined.crm.paidByPayment.orders)}</td>
                <td className={tdr}>{money(combined.crm.paidByPayment.revenueMinor)}</td>
                <td className={td}>Same orders counted on the day they were paid</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="space-y-2 border-t border-line p-4">
          <InfoLine>
            Reconciliation: {count(partsOrders)} orders and {money(partsRevenue)} across all sources {partsOrders === part.eligibleOrders && partsRevenue === part.eligibleRevenueMinor ? 'equal' : 'do not equal'} the {count(part.eligibleOrders)} paid orders and {money(part.eligibleRevenueMinor)} total. Nothing is counted twice.
          </InfoLine>
          {(part.excluded.notPaid > 0 || part.excluded.missingPaymentDate > 0 || part.excluded.duplicateIds > 0) && (
            <InfoLine>
              Left out of paid sales: {count(part.excluded.notPaid)} not paid
              {part.excluded.missingPaymentDate > 0 && `, ${count(part.excluded.missingPaymentDate)} paid without a payment date`}
              {part.excluded.duplicateIds > 0 && `, ${count(part.excluded.duplicateIds)} duplicate ids`}.
            </InfoLine>
          )}
        </div>
      </Card>

      <Collapsible title="How the date basis works" hint="Order date matches the CRM export; payment date follows the money">
        <div className="space-y-2 p-4 text-sm text-ink-2 sm:px-5">
          <p>By order date an order counts on the day it was placed, even if it was paid later. By payment date it counts on the day it was paid, so an order placed on the last day of a month and paid in the next appears in the later month.</p>
          <p>Both views use the same paid orders and the same source rules; they differ only in which day an order is placed on.</p>
        </div>
      </Collapsible>
      <Collapsible title="Why paid value is not profit" hint="Value includes VAT and is before any cost">
        <div className="space-y-2 p-4 text-sm text-ink-2 sm:px-5">
          <p>Paid value includes {vat}% VAT. The net figure divides by {(1 + vat / 100).toFixed(2)}. Neither number subtracts advertising spend, later refunds or the cost of delivering the service.</p>
          <p>The period ends on {date(range.end, { year: true })}. Today is a partial day and is not included.</p>
        </div>
      </Collapsible>
    </div>
  );
}
