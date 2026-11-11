import { useMemo, useState } from 'react';
import { salesOverview } from '@sedem-ads/analytics-core';
import { PageHeader, EmptyState, Segmented } from '../components/ui';
import { KpiCard } from '../components/KpiCard';
import { ChartCard } from '../components/charts/ChartCard';
import { SourcesChart, SELECTED_LABEL } from '../components/OverviewCharts';
import { SOURCE_KEYS, sourceColor, sourceLabel } from '../components/charts/colors';
import { Notice } from '../components/Notes';
import { useAppState } from '../state/AppState';
import { getDataset } from '../lib/data';
import { usablePreviousRange } from '../lib/useView';
import { SELECTED_SOURCES } from '../lib/analytics';
import { count, dateRange, money, netOfVat, share } from '../lib/format';
import './analytics.css';

type Basis = 'payment' | 'order';

export default function SalesPage() {
  const { range } = useAppState();
  const [basis, setBasis] = useState<Basis>('payment');
  const o = useMemo(() => (range ? salesOverview(getDataset(), { range, basis }) : null), [range, basis]);
  const prevRange = useMemo(() => (range ? usablePreviousRange(range) : null), [range]);
  const p = useMemo(() => (prevRange ? salesOverview(getDataset(), { range: prevRange, basis }) : null), [prevRange, basis]);

  if (!range || !o) {
    return (
      <>
        <PageHeader title="Sales" />
        <EmptyState title="No completed days in this period" />
      </>
    );
  }

  const vat = o.vatRatePercent;
  const s = o.statusCounts;
  const part = o.partition;
  const partsOrders = part.parts.reduce((a, p) => a + p.orders, 0);
  const partsRevenue = part.parts.reduce((a, p) => a + p.revenueMinor, 0);
  const reconciles = partsOrders === part.eligibleOrders && partsRevenue === part.eligibleRevenueMinor;
  const byKey = new Map(part.parts.map((p) => [p.source, p]));
  const keys = [...SOURCE_KEYS, ...part.parts.map((p) => p.source).filter((k) => !(SOURCE_KEYS as readonly string[]).includes(k))];
  const selectedOrders = SELECTED_SOURCES.reduce((a, k) => a + (byKey.get(k)?.orders ?? 0), 0);
  const selectedRevenue = SELECTED_SOURCES.reduce((a, k) => a + (byKey.get(k)?.revenueMinor ?? 0), 0);
  const basisLabel = basis === 'payment' ? 'payment date' : 'order date';
  const ex = part.excluded;
  /** Relative change vs the previous equal-length period; null when there is no previous period or it was zero. */
  const ch = (cur: number | null, pick: (x: NonNullable<typeof p>) => number | null): number | null => {
    const prev = p ? pick(p) : null;
    return cur === null || prev === null || prev === 0 ? null : (cur - prev) / prev;
  };
  const changeNote = p && prevRange ? `Change vs ${dateRange(prevRange)}` : 'No previous period of equal length in the available history';

  return (
    <div className="stack">
      <PageHeader
        title="Sales"
        description={`Orders in ${dateRange(range)}, placed in the period by ${basisLabel}. Amounts include ${vat}% VAT unless marked net.`}
        actions={
          <Segmented<Basis>
            label="Date basis"
            value={basis}
            onChange={setBasis}
            options={[
              { value: 'payment', label: 'Payment date' },
              { value: 'order', label: 'Order date' },
            ]}
          />
        }
      />
      <Notice>
        {basis === 'payment'
          ? 'Payment-date basis: an order counts when it was paid, so an order placed late in one month and paid in the next appears in the later month.'
          : 'Order-date basis: an order counts on the day it was placed, even if it was paid later or not at all.'}
      </Notice>

      <div className="kpi-grid">
        <KpiCard label="Paid orders" value={count(s.paid.orders)} change={ch(s.paid.orders, (x) => x.statusCounts.paid.orders)} changeNote={changeNote} sub={money(s.paid.revenueMinor)} />
        <KpiCard label="Unpaid orders" value={count(s.unpaid.orders)} change={ch(s.unpaid.orders, (x) => x.statusCounts.unpaid.orders)} lowerIsBetter changeNote={changeNote} sub={money(s.unpaid.revenueMinor)} />
        <KpiCard label="Cancelled orders" value={count(s.cancelled.orders)} change={ch(s.cancelled.orders, (x) => x.statusCounts.cancelled.orders)} lowerIsBetter changeNote={changeNote} sub={money(s.cancelled.revenueMinor)} />
        <KpiCard label="Refunded orders" value={count(s.refunded.orders)} change={ch(s.refunded.orders, (x) => x.statusCounts.refunded.orders)} lowerIsBetter changeNote={changeNote} sub={money(s.refunded.revenueMinor)} />
        <KpiCard label={`Gross revenue (incl. ${vat}% VAT)`} value={money(part.eligibleRevenueMinor)} change={ch(part.eligibleRevenueMinor, (x) => x.partition.eligibleRevenueMinor)} changeNote={changeNote} sub="Paid orders only" />
        <KpiCard label="Net revenue (excl. VAT)" value={money(netOfVat(part.eligibleRevenueMinor, vat))} change={ch(part.eligibleRevenueMinor, (x) => x.partition.eligibleRevenueMinor)} changeNote={changeNote} sub={`Gross ÷ ${(1 + vat / 100).toFixed(2)}`} />
        <KpiCard label="Average paid order" value={money(o.averageOrderMinor)} change={ch(o.averageOrderMinor, (x) => x.averageOrderMinor)} changeNote={changeNote} sub="Incl. VAT" />
      </div>

      <ChartCard
        title="Sales by source"
        total={money(part.eligibleRevenueMinor)}
        totalLabel="All paid sales"
        note={`Source is the customer’s recorded source (classification). The line shows the subtotal ${SELECTED_LABEL}, derived from the bars.`}
        render={(r) => <SourcesChart {...r} basis={basis} />}
      />

      <section className="card">
        <header className="card-head">
          <div>
            <h3 className="card-title">Sales by source</h3>
            <p className="card-sub">Paid orders, {basisLabel}. Every paid order is in exactly one source.</p>
          </div>
        </header>
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th scope="col">Source</th>
                <th scope="col" className="r">Orders</th>
                <th scope="col" className="r">Gross revenue</th>
                <th scope="col" className="r">Net of VAT</th>
                <th scope="col" className="r">Share of revenue</th>
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => {
                const p = byKey.get(k);
                const orders = p?.orders ?? 0;
                const rev = p?.revenueMinor ?? 0;
                return (
                  <tr key={k}>
                    <td><span className="swatch" style={{ background: sourceColor(k) }} aria-hidden="true" />{sourceLabel(k)}</td>
                    <td className="r num">{count(orders)}</td>
                    <td className="r num">{money(rev)}</td>
                    <td className="r num">{money(netOfVat(rev, vat))}</td>
                    <td className="r num">{share(rev, part.eligibleRevenueMinor)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td>Total (sum of parts)</td>
                <td className="r num">{count(partsOrders)}</td>
                <td className="r num">{money(partsRevenue)}</td>
                <td className="r num">{money(netOfVat(partsRevenue, vat))}</td>
                <td className="r num">{share(partsRevenue, part.eligibleRevenueMinor)}</td>
              </tr>
              <tr>
                <td><em>Subtotal: {SELECTED_LABEL} (derived, not an extra part)</em></td>
                <td className="r num">{count(selectedOrders)}</td>
                <td className="r num">{money(selectedRevenue)}</td>
                <td className="r num">{money(netOfVat(selectedRevenue, vat))}</td>
                <td className="r num">{share(selectedRevenue, part.eligibleRevenueMinor)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <div style={{ marginTop: 12 }} className="notice-list">
          <Notice tone={reconciles ? 'info' : 'bad'}>
            <strong>Reconciliation:</strong> {count(partsOrders)} orders and {money(partsRevenue)} across all sources {reconciles ? 'equal' : 'do NOT equal'} the {count(part.eligibleOrders)} paid orders and {money(part.eligibleRevenueMinor)} total. {reconciles ? 'Nothing is lost or counted twice.' : 'Investigate before trusting these figures.'}
          </Notice>
          {(ex.notPaid > 0 || ex.missingPaymentDate > 0 || ex.duplicateIds > 0 || part.remappedToFallback > 0) && (
            <Notice>
              <strong>Left out of paid sales:</strong> {ex.notPaid > 0 && <>{count(ex.notPaid)} orders not paid (unpaid, cancelled or refunded). </>}
              {ex.missingPaymentDate > 0 && <>{count(ex.missingPaymentDate)} paid orders without a payment date. </>}
              {ex.duplicateIds > 0 && <>{count(ex.duplicateIds)} duplicate order ids. </>}
              {part.remappedToFallback > 0 && <>{count(part.remappedToFallback)} orders with an unrecognised source moved to Unknown.</>}
            </Notice>
          )}
        </div>
      </section>
    </div>
  );
}
