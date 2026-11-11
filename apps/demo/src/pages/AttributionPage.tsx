import { useMemo, useState } from 'react';
import { attributionOverview, orderAttributionRows, type OrderAttributionRow } from '@sedem-ads/analytics-core';
import { Badge, EmptyState, PageHeader, Value } from '../components/ui';
import { KpiCard } from '../components/KpiCard';
import { Notice } from '../components/Notes';
import { useAppState } from '../state/AppState';
import { getDataset } from '../lib/data';
import { count, dateRange, dateTime, money, multiple, share } from '../lib/format';
import { sourceColor, sourceLabel } from '../components/charts/colors';
import './analytics.css';

type AttrStatus = OrderAttributionRow['attribution']['status'];
type StatusFilter = 'all' | AttrStatus;

const STATUS_LABEL: Record<AttrStatus, string> = {
  attributed_paid_ad: 'Verified paid-ad attribution',
  source_only: 'Source label only',
  unknown: 'Unknown',
  conflict: 'Conflicting evidence',
};
const STATUS_TONE = { attributed_paid_ad: 'good', source_only: 'warn', unknown: 'neutral', conflict: 'bad' } as const;

const EVIDENCE_LABEL: Record<string, string> = {
  verified_lead_match: 'Verified lead match',
  click_id: 'Click id',
  platform_reported: 'Platform-reported (not proof)',
  source_label: 'Source label (not proof)',
};

function evidenceText(r: OrderAttributionRow): string {
  const a = r.attribution;
  if (a.status === 'attributed_paid_ad') {
    const kinds = [...new Set(a.evidence.map((e) => EVIDENCE_LABEL[e.kind] ?? e.kind))];
    return `${sourceLabel(a.platform)}: ${kinds.join(', ')}${a.labelDisagrees ? '. Customer label names a different platform' : ''}`;
  }
  if (a.status === 'source_only') return `Label "${a.label}" without hard evidence`;
  if (a.status === 'conflict') return `Evidence for both ${a.platforms.map(sourceLabel).join(' and ')}`;
  return 'No evidence';
}

export default function AttributionPage() {
  const { range } = useAppState();
  const [filter, setFilter] = useState<StatusFilter>('all');
  const ds = getDataset();
  const data = useMemo(() => {
    if (!range) return null;
    return {
      o: attributionOverview(ds, { range }),
      rows: orderAttributionRows(ds, { range, limit: 1_000_000 }),
    };
  }, [ds, range]);

  if (!range || !data) {
    return (
      <>
        <PageHeader title="Attribution" />
        <EmptyState title="No completed days in this period" />
      </>
    );
  }
  const { o, rows } = data;
  const shown = (filter === 'all' ? rows : rows.filter((r) => r.attribution.status === filter))
    .slice()
    .sort((a, b) => (a.order.orderedAt < b.order.orderedAt ? 1 : -1));
  const planted = ds.planted?.labelOnlyGoogleOrderId;
  const plantedRow = rows.find((r) => r.order.id === planted);
  const verifiedTotal = o.verified.meta.revenueMinor + o.verified.google.revenueMinor;
  const total = o.paidRevenueMinor;

  const breakdown = [
    { key: 'v-meta', label: 'Verified Meta', color: sourceColor('meta'), ...o.verified.meta },
    { key: 'v-google', label: 'Verified Google', color: sourceColor('google'), ...o.verified.google },
    { key: 'src', label: 'Source label only', color: '#ca8a04', ...o.sourceOnly },
    { key: 'unk', label: 'Unknown', color: sourceColor('unknown'), ...o.unknown },
    { key: 'conf', label: 'Conflicting evidence', color: sourceColor('conflicting'), ...o.conflict },
  ];
  const breakdownOrders = breakdown.reduce((a, b) => a + b.orders, 0);

  return (
    <div className="stack">
      <PageHeader
        title="Attribution"
        description={`Paid orders in ${dateRange(range)}. Verified attribution needs hard evidence; a customer's own source label is only a classification.`}
      />
      <Notice>
        Verified attribution uses a matching lead id or a stored click id (gclid only for Google, fbclid only for Meta). Dates, amounts and names are never used to guess a link, so an unlinked sale stays unlinked and gets no ROAS.
      </Notice>

      <div className="kpi-grid">
        <KpiCard label="Paid orders" value={count(o.paidOrders)} sub={money(o.paidRevenueMinor)} />
        <KpiCard label="Verified Meta" value={money(o.verified.meta.revenueMinor)} sub={`${count(o.verified.meta.orders)} orders`} />
        <KpiCard label="Verified Google" value={money(o.verified.google.revenueMinor)} sub={`${count(o.verified.google.orders)} orders`} />
        <KpiCard label="ROAS Meta" value={multiple(o.roas.meta)} noDataReason="No spend data in this period" sub="Verified revenue ÷ spend" />
        <KpiCard label="ROAS Google" value={multiple(o.roas.google)} noDataReason="No spend data in this period" sub="Verified revenue ÷ spend" />
        <KpiCard label="ROAS combined" value={multiple(o.roas.combined)} noDataReason="No spend data in this period" sub="Verified revenue ÷ total spend" />
      </div>
      {o.spend.partial && <Notice tone="warn">Spend is partial in this period (a platform has missing days), so ROAS uses only days with data.</Notice>}

      <div className="grid-2">
        <section className="card">
          <h3 className="card-title">Verified attribution</h3>
          <p className="card-sub">What the evidence proves.</p>
          <ul className="bars">
            {breakdown.map((b) => (
              <li className="bar-row" key={b.key}>
                <span>
                  <span className="swatch" style={{ background: b.color }} aria-hidden="true" />
                  {b.label}
                </span>
                <span className="bar-track" aria-hidden="true">
                  <span className="bar-fill" style={{ width: `${total ? Math.min(100, (b.revenueMinor / total) * 100) : 0}%`, background: b.color }} />
                </span>
                <span className="num">
                  {count(b.orders)} orders, {money(b.revenueMinor)} ({share(b.revenueMinor, total)})
                </span>
              </li>
            ))}
          </ul>
          <p className="card-sub">
            Parts: {count(breakdownOrders)} of {count(o.paidOrders)} paid orders{breakdownOrders === o.paidOrders ? ', reconciled.' : '. Does not reconcile.'}
          </p>
        </section>
        <section className="card">
          <h3 className="card-title">Customer source (classification)</h3>
          <p className="card-sub">What customers or operators recorded. Not proof of a paid ad.</p>
          <dl className="metric-grid">
            <dt>Meta + Google + Chatbot/AI</dt>
            <dd><Value text={money(o.selectedSourceRevenueMinor)} /></dd>
            <dt>Verified by evidence</dt>
            <dd><Value text={money(verifiedTotal)} /></dd>
            <dt>Meta label, no evidence</dt>
            <dd><Value text={`${count(o.labelWithoutEvidence.meta.orders)} orders, ${money(o.labelWithoutEvidence.meta.revenueMinor)}`} /></dd>
            <dt>Google label, no evidence</dt>
            <dd><Value text={`${count(o.labelWithoutEvidence.google.orders)} orders, ${money(o.labelWithoutEvidence.google.revenueMinor)}`} /></dd>
            <dt>Spend (Meta + Google)</dt>
            <dd><Value text={money(o.spend.totalMinor)} reason="Missing spend days" /></dd>
            <dt>Advertising surplus</dt>
            <dd><Value text={money(o.surplusMinor)} reason="Missing spend days" /></dd>
          </dl>
          <p className="card-sub">Surplus is not profit: revenue includes 22% VAT and excludes other costs.</p>
        </section>
      </div>

      {(o.labelWithoutEvidence.google.orders > 0 || o.labelWithoutEvidence.meta.orders > 0) && (
        <Notice tone="warn">
          <strong>Label without evidence:</strong> {count(o.labelWithoutEvidence.google.orders)} Google and {count(o.labelWithoutEvidence.meta.orders)} Meta orders are
          labelled with a paid platform but carry no click id or lead match. They count in customer source, not in verified revenue or ROAS.
          {plantedRow && <> Example: order <code>{planted}</code> is labelled Google without evidence.</>}
        </Notice>
      )}

      <h2 className="section-title">Orders</h2>
      <div className="filters">
        <label className="field">
          <span>Attribution status</span>
          <select value={filter} onChange={(e) => setFilter(e.target.value as StatusFilter)}>
            <option value="all">All ({count(rows.length)})</option>
            {(Object.keys(STATUS_LABEL) as AttrStatus[]).map((k) => (
              <option key={k} value={k}>
                {STATUS_LABEL[k]} ({count(rows.filter((r) => r.attribution.status === k).length)})
              </option>
            ))}
          </select>
        </label>
        <span className="card-sub">{count(shown.length)} orders shown</span>
      </div>
      {shown.length === 0 ? (
        <EmptyState title="No orders match this filter" />
      ) : (
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th scope="col">Order</th>
                <th scope="col">Ordered</th>
                <th scope="col">Payment</th>
                <th scope="col" className="r">Amount</th>
                <th scope="col">Customer source</th>
                <th scope="col">Attribution</th>
                <th scope="col">Evidence</th>
              </tr>
            </thead>
            <tbody>
              {shown.slice(0, 200).map((r) => (
                <tr key={r.order.id} className={r.order.id === planted ? 'lvl-1' : undefined}>
                  <td>
                    <code>{r.order.id}</code>
                    <div className="name-cell"><small>{r.order.product}</small></div>
                  </td>
                  <td>{dateTime(r.order.orderedAt)}</td>
                  <td>{r.order.status}</td>
                  <td className="r num"><Value text={money(r.order.amountMinor)} /></td>
                  <td>{r.customer.sourceLabel ? r.customer.sourceLabel : <Value text="–" reason="No source recorded" />}</td>
                  <td><Badge tone={STATUS_TONE[r.attribution.status]}>{STATUS_LABEL[r.attribution.status]}</Badge></td>
                  <td className="wrap">
                    {evidenceText(r)}
                    {r.order.id === planted && <> <Badge tone="warn">Google label without evidence</Badge></>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {shown.length > 200 && <p className="card-sub">Showing the 200 most recent of {count(shown.length)}. Narrow the period or filter to see others.</p>}
        </div>
      )}
    </div>
  );
}
