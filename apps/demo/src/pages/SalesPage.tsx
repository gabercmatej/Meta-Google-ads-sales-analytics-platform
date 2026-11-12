import { useMemo, useState } from 'react';
import { orderAttributionRows, salesOverview, type OrderAttributionRow } from '@sedem-ads/analytics-core';
import { Badge, Card, EmptyState, KpiCard, Notice, PageTitle, Segmented, StatList, StatRow, type Tone } from '../components/ui';
import { PeriodBar } from '../components/PeriodBar';
import { ChartCard } from '../components/charts/ChartCard';
import { SourcesChart, SELECTED_LABEL } from '../components/OverviewCharts';
import { SOURCE_KEYS, sourceColor, sourceLabel } from '../components/charts/colors';
import { PLATFORM_LABELS, useAppState } from '../state/AppState';
import { getDataset } from '../lib/data';
import { usablePreviousRange } from '../lib/useView';
import { SELECTED_SOURCES } from '../lib/analytics';
import { count, dateRange, dateTime, money, netOfVat, share } from '../lib/format';

type Basis = 'payment' | 'order';
type AttrStatus = OrderAttributionRow['attribution']['status'];

const th = 'whitespace-nowrap px-4 py-2.5 text-left text-xs font-medium text-ink-3';
const thr = `${th} !text-right`;
const td = 'whitespace-nowrap border-t border-line px-4 py-2.5 text-[13px] text-ink-2';
const tdr = `${td} tabular text-right`;

const ATTR_LABEL: Record<AttrStatus, { label: string; tone: Tone }> = {
  attributed_paid_ad: { label: 'Verified attribution', tone: 'good' },
  source_only: { label: 'Source label only', tone: 'warn' },
  unknown: { label: 'Not attributed', tone: 'neutral' },
  conflict: { label: 'Conflicting evidence', tone: 'bad' },
};

/** Relative change in percent, or null when there is nothing reliable to compare with. */
function pctChange(cur: number | null, prev: number | null | undefined): number | null {
  return cur === null || prev === null || prev === undefined || prev === 0 ? null : ((cur - prev) / Math.abs(prev)) * 100;
}

export default function SalesPage() {
  const { range, workspace } = useAppState();
  const [basis, setBasis] = useState<Basis>('payment');
  const o = useMemo(() => (range ? salesOverview(getDataset(), { range, basis }) : null), [range, basis]);
  const prevRange = useMemo(() => (range ? usablePreviousRange(range) : null), [range]);
  const p = useMemo(() => (prevRange ? salesOverview(getDataset(), { range: prevRange, basis }) : null), [prevRange, basis]);
  const orders = useMemo(() => (range ? orderAttributionRows(getDataset(), { range, limit: 25 }) : []), [range]);

  if (!range || !o) {
    return (
      <div className="space-y-5">
        <PageTitle title="Sales" />
        <PeriodBar />
        <EmptyState title="No completed days in this period">Pick another period. Today is a partial day and is excluded.</EmptyState>
      </div>
    );
  }

  const vat = o.vatRatePercent;
  const s = o.statusCounts;
  const part = o.partition;
  const partsOrders = part.parts.reduce((a, x) => a + x.orders, 0);
  const partsRevenue = part.parts.reduce((a, x) => a + x.revenueMinor, 0);
  const reconciles = partsOrders === part.eligibleOrders && partsRevenue === part.eligibleRevenueMinor;
  const byKey = new Map(part.parts.map((x) => [x.source, x]));
  const keys = [...SOURCE_KEYS, ...part.parts.map((x) => x.source).filter((k) => !(SOURCE_KEYS as readonly string[]).includes(k))];
  const selectedOrders = SELECTED_SOURCES.reduce((a, k) => a + (byKey.get(k)?.orders ?? 0), 0);
  const selectedRevenue = SELECTED_SOURCES.reduce((a, k) => a + (byKey.get(k)?.revenueMinor ?? 0), 0);
  const basisLabel = basis === 'payment' ? 'payment date' : 'order date';
  const ex = part.excluded;
  const comparison = prevRange ? `vs ${dateRange(prevRange)}` : undefined;
  const wsLabel = PLATFORM_LABELS[workspace];
  const wsPart = byKey.get(workspace);

  return (
    <div className="space-y-5">
      <PageTitle
        title="Sales"
        sub={`${dateRange(range)} · days in Europe/Ljubljana · EUR. Orders by ${basisLabel}; amounts include ${vat}% VAT unless marked net.`}
        right={
          <span className="flex gap-1.5">
            <Badge tone="gray">Orders (CRM)</Badge>
            <Badge tone={workspace}>{wsLabel}</Badge>
          </span>
        }
      />
      <PeriodBar />

      <Card className="space-y-3 px-4 py-4 sm:px-5">
        <p className="text-sm font-semibold text-ink">
          How much real paid revenue do we have? {count(s.paid.orders)} paid orders · {money(s.paid.revenueMinor)} incl. VAT by {basisLabel}.
        </p>
        <p className="text-xs text-ink-3">
          {basis === 'payment'
            ? 'Payment-date basis: an order counts when it was paid, so an order placed late in one month and paid in the next appears in the later month.'
            : 'Order-date basis: an order counts on the day it was placed, even if it was paid later or not at all.'}
        </p>
        <Segmented<Basis>
          label="Date basis"
          value={basis}
          onChange={setBasis}
          options={[
            { value: 'payment', label: 'Payment date' },
            { value: 'order', label: 'Order date' },
          ]}
        />
      </Card>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard series="paid-sales" label="Paid orders" value={count(s.paid.orders)} delta={{ pct: pctChange(s.paid.orders, p?.statusCounts.paid.orders), goodWhen: 'up' }} comparison={comparison} sub={money(s.paid.revenueMinor)} />
        <KpiCard label="Unpaid orders" value={count(s.unpaid.orders)} delta={{ pct: pctChange(s.unpaid.orders, p?.statusCounts.unpaid.orders), goodWhen: 'down' }} comparison={comparison} sub={`${money(s.unpaid.revenueMinor)}, not revenue`} />
        <KpiCard label="Cancelled orders" value={count(s.cancelled.orders)} delta={{ pct: pctChange(s.cancelled.orders, p?.statusCounts.cancelled.orders), goodWhen: 'down' }} comparison={comparison} sub={money(s.cancelled.revenueMinor)} />
        <KpiCard label="Refunded orders" value={count(s.refunded.orders)} delta={{ pct: pctChange(s.refunded.orders, p?.statusCounts.refunded.orders), goodWhen: 'down' }} comparison={comparison} sub={money(s.refunded.revenueMinor)} />
        <KpiCard size="primary" label={`Gross revenue (incl. ${vat}% VAT)`} value={money(part.eligibleRevenueMinor)} delta={{ pct: pctChange(part.eligibleRevenueMinor, p?.partition.eligibleRevenueMinor), goodWhen: 'up' }} comparison={comparison} sub="Paid orders only" />
        <KpiCard size="primary" label="Net revenue (excl. VAT)" value={money(netOfVat(part.eligibleRevenueMinor, vat))} delta={{ pct: pctChange(part.eligibleRevenueMinor, p?.partition.eligibleRevenueMinor), goodWhen: 'up' }} comparison={comparison} sub={`Gross ÷ ${(1 + vat / 100).toFixed(2)}`} />
        <KpiCard
          label="Average paid order"
          value={money(o.averageOrderMinor)}
          state={o.averageOrderMinor === null ? 'no_data' : 'ok'}
          reason="No paid orders in this period"
          delta={{ pct: pctChange(o.averageOrderMinor, p?.averageOrderMinor), goodWhen: 'up' }}
          comparison={comparison}
          sub="Incl. VAT"
        />
        <KpiCard
          label={`${wsLabel} customers`}
          value={count(wsPart?.orders ?? 0)}
          sub={`${money(wsPart?.revenueMinor ?? 0)} · by recorded customer source`}
          note="Customer-recorded source (classification). It is not proof that a paid ad caused the sale; see Attribution."
        />
      </div>

      <ChartCard
        title="Sales by source"
        total={money(part.eligibleRevenueMinor)}
        totalLabel="All paid sales"
        note={`Source is the customer's recorded source (classification). The line shows the subtotal ${SELECTED_LABEL}, derived from the bars.`}
        render={(r) => <SourcesChart {...r} basis={basis} />}
      />

      <Card title="Order source" subtitle={`Paid orders, ${basisLabel}. Every paid order is in exactly one source.`}>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th scope="col" className={th}>Source</th>
                <th scope="col" className={thr}>Orders</th>
                <th scope="col" className={thr}>Gross revenue</th>
                <th scope="col" className={thr}>Net of VAT</th>
                <th scope="col" className={thr}>Share of revenue</th>
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => {
                const x = byKey.get(k);
                const rev = x?.revenueMinor ?? 0;
                return (
                  <tr key={k} className={k === workspace ? 'bg-brand-soft/40' : undefined}>
                    <td className={td}>
                      <span className="mr-2 inline-block h-2.5 w-2.5 rounded-[3px] align-[-1px]" style={{ background: sourceColor(k) }} aria-hidden />
                      {sourceLabel(k)}
                    </td>
                    <td className={tdr}>{count(x?.orders ?? 0)}</td>
                    <td className={tdr}>{money(rev)}</td>
                    <td className={tdr}>{money(netOfVat(rev, vat))}</td>
                    <td className={tdr}>{share(rev, part.eligibleRevenueMinor)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50 font-semibold text-ink">
                <td className={td}>Total (sum of parts)</td>
                <td className={tdr}>{count(partsOrders)}</td>
                <td className={tdr}>{money(partsRevenue)}</td>
                <td className={tdr}>{money(netOfVat(partsRevenue, vat))}</td>
                <td className={tdr}>{share(partsRevenue, part.eligibleRevenueMinor)}</td>
              </tr>
              <tr>
                <td className={`${td} italic`}>Subtotal: {SELECTED_LABEL} (derived, not an extra part)</td>
                <td className={tdr}>{count(selectedOrders)}</td>
                <td className={tdr}>{money(selectedRevenue)}</td>
                <td className={tdr}>{money(netOfVat(selectedRevenue, vat))}</td>
                <td className={tdr}>{share(selectedRevenue, part.eligibleRevenueMinor)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <div className="space-y-2 border-t border-line p-4">
          <Notice tone={reconciles ? 'info' : 'error'} title="Reconciliation">
            {count(partsOrders)} orders and {money(partsRevenue)} across all sources {reconciles ? 'equal' : 'do NOT equal'} the {count(part.eligibleOrders)} paid orders and {money(part.eligibleRevenueMinor)} total.{' '}
            {reconciles ? 'Nothing is lost or counted twice.' : 'Investigate before trusting these figures.'}
          </Notice>
          {(ex.notPaid > 0 || ex.missingPaymentDate > 0 || ex.duplicateIds > 0 || part.remappedToFallback > 0) && (
            <Notice tone="gray" title="Left out of paid sales">
              {ex.notPaid > 0 && <>{count(ex.notPaid)} orders not paid (unpaid, cancelled or refunded). </>}
              {ex.missingPaymentDate > 0 && <>{count(ex.missingPaymentDate)} paid orders without a payment date. </>}
              {ex.duplicateIds > 0 && <>{count(ex.duplicateIds)} duplicate order ids. </>}
              {part.remappedToFallback > 0 && <>{count(part.remappedToFallback)} orders with an unrecognised source moved to Unknown.</>}
            </Notice>
          )}
        </div>
      </Card>

      <Card title="All orders by status" subtitle={`By ${basisLabel} (Europe/Ljubljana). Only paid orders are revenue.`}>
        <StatList className="px-4 sm:px-5">
          <StatRow label="Paid" hint="marked paid in the CRM, not bank-verified" value={`${count(s.paid.orders)} · ${money(s.paid.revenueMinor)}`} strong />
          <StatRow label="Unpaid" value={`${count(s.unpaid.orders)} · ${money(s.unpaid.revenueMinor)}`} />
          <StatRow label="Cancelled" value={`${count(s.cancelled.orders)} · ${money(s.cancelled.revenueMinor)}`} />
          <StatRow label="Refunded" value={`${count(s.refunded.orders)} · ${money(s.refunded.revenueMinor)}`} />
        </StatList>
      </Card>

      <Card title="Recent orders" subtitle="Newest 25 in the period, with verified attribution status. Synthetic orders; no customer data is shown.">
        {orders.length === 0 ? (
          <div className="p-4">
            <EmptyState title="No orders in this period" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th scope="col" className={th}>Order</th>
                  <th scope="col" className={th}>Service</th>
                  <th scope="col" className={th}>Ordered</th>
                  <th scope="col" className={th}>Status</th>
                  <th scope="col" className={thr}>Amount</th>
                  <th scope="col" className={th}>Customer source</th>
                  <th scope="col" className={th}>Attribution</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((r) => (
                  <tr key={r.order.id}>
                    <td className={td}><code className="text-xs">{r.order.id}</code></td>
                    <td className={td}>{r.order.product}</td>
                    <td className={td}>{dateTime(r.order.orderedAt)}</td>
                    <td className={td}>{r.order.status}</td>
                    <td className={tdr}>{money(r.order.amountMinor)}</td>
                    <td className={td}>{r.customer.sourceLabel || <span className="text-slate-400" title="No source recorded">–</span>}</td>
                    <td className={td}><Badge tone={ATTR_LABEL[r.attribution.status].tone}>{ATTR_LABEL[r.attribution.status].label}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <p className="text-xs text-ink-3">
        Amounts include {vat}% VAT unless marked net. A sale without verified evidence stays "not attributed" and gets no ROAS.
      </p>
    </div>
  );
}
