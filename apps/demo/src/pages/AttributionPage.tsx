import { useMemo, useState } from 'react';
import { attributionOverview, orderAttributionRows, type OrderAttributionRow } from '@sedem-ads/analytics-core';
import { Badge, Card, EmptyState, KpiCard, Notice, PageTitle, StatList, StatRow, Value, inputCls, type Tone } from '../components/ui';
import { PeriodBar } from '../components/PeriodBar';
import { useAppState } from '../state/AppState';
import { getDataset } from '../lib/data';
import { count, dateRange, dateTime, money, multiple, share } from '../lib/format';
import { sourceColor, sourceLabel } from '../components/charts/colors';

type AttrStatus = OrderAttributionRow['attribution']['status'];
type StatusFilter = 'all' | AttrStatus;

const STATUS_LABEL: Record<AttrStatus, string> = {
  attributed_paid_ad: 'Verified paid-ad attribution',
  source_only: 'Source label only',
  unknown: 'Unknown',
  conflict: 'Conflicting evidence',
};
const STATUS_TONE: Record<AttrStatus, Tone> = { attributed_paid_ad: 'good', source_only: 'warn', unknown: 'neutral', conflict: 'bad' };

const EVIDENCE_LABEL: Record<string, string> = {
  verified_lead_match: 'Verified lead match',
  click_id: 'Click id',
  platform_reported: 'Platform-reported (not proof)',
  source_label: 'Source label (not proof)',
};

function evidenceChips(r: OrderAttributionRow): { text: string; tone: Tone }[] {
  const a = r.attribution;
  if (a.status === 'attributed_paid_ad') {
    const kinds = [...new Set(a.evidence.map((e) => EVIDENCE_LABEL[e.kind] ?? e.kind))];
    const chips: { text: string; tone: Tone }[] = [{ text: sourceLabel(a.platform), tone: a.platform === 'meta' ? 'meta' : 'google' }, ...kinds.map((k) => ({ text: k, tone: 'good' as Tone }))];
    if (a.labelDisagrees) chips.push({ text: 'Customer label names a different platform', tone: 'warn' });
    return chips;
  }
  if (a.status === 'source_only') return [{ text: `Label "${a.label}" without hard evidence`, tone: 'warn' }];
  if (a.status === 'conflict') return [{ text: `Evidence for both ${a.platforms.map(sourceLabel).join(' and ')}`, tone: 'bad' }];
  return [{ text: 'No evidence', tone: 'neutral' }];
}

const th = 'whitespace-nowrap px-4 py-2.5 text-left text-xs font-medium text-ink-3';
const thr = `${th} !text-right`;
const td = 'border-t border-line px-4 py-2.5 align-top text-[13px] text-ink-2';
const tdr = `${td} tabular whitespace-nowrap text-right`;

/** Orders per page in the table; "Show more" adds another page. */
const PAGE = 25;

export default function AttributionPage() {
  const { range } = useAppState();
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [limit, setLimit] = useState(PAGE);
  const ds = getDataset();
  const data = useMemo(() => {
    if (!range) return null;
    return { o: attributionOverview(ds, { range }), rows: orderAttributionRows(ds, { range, limit: 1_000_000 }) };
  }, [ds, range]);

  if (!range || !data) {
    return (
      <div className="space-y-5">
        <PageTitle title="Attribution" />
        <PeriodBar />
        <EmptyState title="No completed days in this period" />
      </div>
    );
  }
  const { o, rows } = data;
  const shown = (filter === 'all' ? rows : rows.filter((r) => r.attribution.status === filter)).slice().sort((a, b) => (a.order.orderedAt < b.order.orderedAt ? 1 : -1));
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
  const noSpend = 'No spend data in this period';

  return (
    <div className="space-y-5">
      <PageTitle
        title="Attribution"
        sub={`Paid orders in ${dateRange(range)}. Verified attribution needs hard evidence; a customer's own source label is only a classification.`}
        right={<Badge tone="gray">Evidence-based</Badge>}
      />
      <PeriodBar />

      <Notice tone="info" title="How matching works">
        Verified attribution uses a matching lead id or a stored click id (gclid only for Google, fbclid only for Meta). Dates, amounts and names are never used to guess a link, so an unlinked sale stays unlinked and gets no ROAS.
      </Notice>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <KpiCard size="primary" label="Paid orders" value={count(o.paidOrders)} sub={money(o.paidRevenueMinor)} />
        <KpiCard size="primary" label="Verified Meta" value={money(o.verified.meta.revenueMinor)} sub={`${count(o.verified.meta.orders)} orders`} />
        <KpiCard size="primary" label="Verified Google" value={money(o.verified.google.revenueMinor)} sub={`${count(o.verified.google.orders)} orders`} />
        <KpiCard label="ROAS Meta" value={multiple(o.roas.meta)} state={o.roas.meta === null ? 'no_data' : 'ok'} reason={noSpend} sub="Verified revenue ÷ spend" />
        <KpiCard label="ROAS Google" value={multiple(o.roas.google)} state={o.roas.google === null ? 'no_data' : 'ok'} reason={noSpend} sub="Verified revenue ÷ spend" />
        <KpiCard label="ROAS combined" value={multiple(o.roas.combined)} state={o.roas.combined === null ? 'no_data' : 'ok'} reason={noSpend} sub="Verified revenue ÷ total spend" />
      </div>
      {o.spend.partial && <Notice tone="warn">Spend is partial in this period (a platform has missing days), so ROAS uses only days with data.</Notice>}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Verified attribution" subtitle="Match status breakdown: what the evidence proves.">
          <ul className="space-y-3 px-4 pb-4 sm:px-5">
            {breakdown.map((b) => (
              <li key={b.key}>
                <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-3 text-[13px]">
                  <span className="text-ink-2">
                    <span className="mr-2 inline-block h-2.5 w-2.5 rounded-[3px] align-[-1px]" style={{ background: b.color }} aria-hidden />
                    {b.label}
                  </span>
                  <span className="tabular text-ink">
                    {count(b.orders)} orders, {money(b.revenueMinor)} <span className="text-ink-3">({share(b.revenueMinor, total)})</span>
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-slate-100" aria-hidden>
                  <div className="h-full rounded-full" style={{ width: `${total ? Math.min(100, (b.revenueMinor / total) * 100) : 0}%`, background: b.color }} />
                </div>
              </li>
            ))}
          </ul>
          <p className="px-4 pb-4 text-xs text-ink-3 sm:px-5">
            Parts: {count(breakdownOrders)} of {count(o.paidOrders)} paid orders{breakdownOrders === o.paidOrders ? ', reconciled.' : '. Does not reconcile.'}
          </p>
        </Card>

        <Card title="Customer source (classification)" subtitle="What customers or operators recorded. Not proof of a paid ad.">
          <StatList className="px-4 sm:px-5">
            <StatRow label="Meta + Google + Chatbot/AI" value={<Value text={money(o.selectedSourceRevenueMinor)} />} />
            <StatRow label="Verified by evidence" value={<Value text={money(verifiedTotal)} />} />
            <StatRow label="Meta label, no evidence" value={<Value text={`${count(o.labelWithoutEvidence.meta.orders)} orders, ${money(o.labelWithoutEvidence.meta.revenueMinor)}`} />} />
            <StatRow label="Google label, no evidence" value={<Value text={`${count(o.labelWithoutEvidence.google.orders)} orders, ${money(o.labelWithoutEvidence.google.revenueMinor)}`} />} />
            <StatRow label="Spend (Meta + Google)" value={<Value text={money(o.spend.totalMinor)} reason="Missing spend days" />} />
            <StatRow label="Advertising surplus" value={<Value text={money(o.surplusMinor)} reason="Missing spend days" />} strong />
          </StatList>
          <p className="px-4 pb-4 pt-2 text-xs text-ink-3 sm:px-5">Surplus is not profit: revenue includes 22% VAT and excludes other costs.</p>
        </Card>
      </div>

      {(o.labelWithoutEvidence.google.orders > 0 || o.labelWithoutEvidence.meta.orders > 0) && (
        <Notice tone="warn" title="Label without evidence">
          {count(o.labelWithoutEvidence.google.orders)} Google and {count(o.labelWithoutEvidence.meta.orders)} Meta orders are labelled with a paid platform but carry no click id or lead match. They count in customer source, not in verified revenue or ROAS.
          {plantedRow && (
            <>
              {' '}
              Example: order <code>{planted}</code> is labelled Google without evidence.
            </>
          )}
        </Notice>
      )}

      <Card
        title="Orders"
        subtitle={`${count(shown.length)} orders shown`}
        actions={
          <label className="flex items-center gap-2 text-xs text-ink-3">
            <span>Attribution status</span>
            <select className={inputCls} value={filter} onChange={(e) => {
              setFilter(e.target.value as StatusFilter);
              setLimit(PAGE);
            }}>
              <option value="all">All ({count(rows.length)})</option>
              {(Object.keys(STATUS_LABEL) as AttrStatus[]).map((k) => (
                <option key={k} value={k}>
                  {STATUS_LABEL[k]} ({count(rows.filter((r) => r.attribution.status === k).length)})
                </option>
              ))}
            </select>
          </label>
        }
      >
        {shown.length === 0 ? (
          <div className="p-4">
            <EmptyState title="No orders match this filter" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th scope="col" className={th}>Order</th>
                  <th scope="col" className={th}>Ordered</th>
                  <th scope="col" className={th}>Payment</th>
                  <th scope="col" className={thr}>Amount</th>
                  <th scope="col" className={th}>Customer source</th>
                  <th scope="col" className={th}>Attribution</th>
                  <th scope="col" className={th}>Evidence</th>
                </tr>
              </thead>
              <tbody>
                {shown.slice(0, limit).map((r) => (
                  <tr key={r.order.id} className={r.order.id === planted ? 'bg-amber-50/60' : undefined}>
                    <td className={`${td} whitespace-nowrap`}>
                      <code className="text-xs">{r.order.id}</code>
                      <div className="text-xs text-ink-3">{r.order.product}</div>
                    </td>
                    <td className={`${td} whitespace-nowrap`}>{dateTime(r.order.orderedAt)}</td>
                    <td className={td}>{r.order.status}</td>
                    <td className={tdr}><Value text={money(r.order.amountMinor)} /></td>
                    <td className={td}>{r.customer.sourceLabel ? r.customer.sourceLabel : <Value text="–" reason="No source recorded" />}</td>
                    <td className={`${td} whitespace-nowrap`}><Badge tone={STATUS_TONE[r.attribution.status]}>{STATUS_LABEL[r.attribution.status]}</Badge></td>
                    <td className={`${td} min-w-[240px]`}>
                      <span className="flex flex-wrap gap-1">
                        {evidenceChips(r).map((c) => (
                          <Badge key={c.text} tone={c.tone}>{c.text}</Badge>
                        ))}
                        {r.order.id === planted && <Badge tone="warn">Google label without evidence</Badge>}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {shown.length > limit && (
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-3 text-xs text-ink-3">
                <span>
                  Showing the {count(limit)} most recent of {count(shown.length)}.
                </span>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setLimit((n) => n + PAGE)}>
                  Show {count(Math.min(PAGE, shown.length - limit))} more
                </button>
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
