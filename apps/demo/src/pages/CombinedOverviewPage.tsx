import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Badge, EmptyState, KpiCard, PageTitle, ShareBar, type GoodWhen } from '../components/ui';
import { PeriodBar } from '../components/PeriodBar';
import { ChartCard } from '../components/charts/ChartCard';
import { COLOR } from '../components/charts/colors';
import { MetricChart, RoasChart, SourceLinesChart, Spark, SurplusChart, SurplusSummary, SELECTED_LABEL, metricOptions, useSparks } from '../components/OverviewCharts';
import { useAppState } from '../state/AppState';
import { getDataset } from '../lib/data';
import { usablePreviousRange } from '../lib/useView';
import { SURPLUS_NOTE } from '../lib/analytics';
import { combinedFigures, GROUP_LABEL, relChange, type SourceGroup } from '../lib/combined';
import { count, dateRange, money, multiple, share } from '../lib/format';

const GROUP_COLOR: Record<SourceGroup, string> = {
  meta: COLOR.meta,
  google: COLOR.google,
  partner_portal: '#14b8a6',
  chatbot_ai: COLOR.chatbot,
  other_verified: '#64748b',
  unattributed: '#94a3b8',
};

function Chip({ color, children }: { color: string; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-slate-50 px-2.5 py-1 text-xs text-ink-2">
      <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: color }} />
      {children}
    </span>
  );
}

function SubHeading({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="mt-2">
      <h2 className="text-lg font-semibold tracking-tight text-ink">{title}</h2>
      {children && <p className="mt-0.5 max-w-4xl text-xs leading-relaxed text-ink-3">{children}</p>}
    </div>
  );
}

export default function CombinedOverviewPage() {
  const { range, period } = useAppState();
  const sparks = useSparks('combined');
  const sparksMeta = useSparks('meta');
  const sparksGoogle = useSparks('google');
  const [notIncluded, setNotIncluded] = useState(false);
  const data = useMemo(() => {
    if (!range) return null;
    const ds = getDataset();
    const prevRange = usablePreviousRange(range);
    return { cur: combinedFigures(ds, range), prev: prevRange ? combinedFigures(ds, prevRange) : null, prevRange };
  }, [range]);

  if (!range || !data) {
    return (
      <div className="space-y-5">
        <PageTitle title="Combined overview" badge={<Badge tone="combined">Meta + Google</Badge>} />
        <PeriodBar />
        <EmptyState title="No data in this period">Pick another period.</EmptyState>
      </div>
    );
  }

  const { cur: f, prev, prevRange } = data;
  const cmp = prevRange ? `vs ${dateRange(prevRange)}` : undefined;
  const d = (a: number | null | undefined, b: number | null | undefined, goodWhen: GoodWhen = 'up') => ({ pct: relChange(a, b), goodWhen });
  const g = (key: SourceGroup) => f.groups.find((x) => x.group === key)!;
  const pg = (key: SourceGroup) => prev?.groups.find((x) => x.group === key);
  const { metaMinor, googleMinor, totalMinor } = f.spend;
  const spendOk = metaMinor !== null && googleMinor !== null && totalMinor !== null && totalMinor > 0;
  const metaShare = spendOk ? share(metaMinor, totalMinor) : null;
  const googleShare = spendOk ? share(googleMinor, totalMinor) : null;
  const dayNote = (days: number) => (days >= f.spend.expectedDays ? `complete (${days} ${days === 1 ? 'day' : 'days'})` : `${days} of ${f.spend.expectedDays} days`);
  const noRoas = (v: number | null) => (v === null ? ({ state: 'no_calc', reason: 'No spend or no verified sales' } as const) : ({} as const));
  const spendState = (v: number | null) => (v === null ? ({ state: 'no_data', reason: 'No spend data for this period' } as const) : ({} as const));
  const isToday = period.preset === 'today';

  const tableRows: { key: SourceGroup; name: string; roas: number | null; costPerCustomer: number | null; roasNote?: string }[] = [
    { key: 'meta', name: 'Meta', roas: f.roas.meta, costPerCustomer: f.verified.meta.orders > 0 && metaMinor !== null ? Math.round(metaMinor / f.verified.meta.orders) : null },
    { key: 'google', name: 'Google', roas: f.roas.google, costPerCustomer: f.verified.google.orders > 0 && googleMinor !== null ? Math.round(googleMinor / f.verified.google.orders) : null },
    { key: 'partner_portal', name: 'Partner portal', roas: null, costPerCustomer: null, roasNote: 'no ROAS (source without ad spend)' },
    { key: 'chatbot_ai', name: 'Chatbot/AI', roas: null, costPerCustomer: null, roasNote: 'no ROAS (source without ad spend)' },
    { key: 'other_verified', name: 'Other verified sources', roas: null, costPerCustomer: null, roasNote: 'no ROAS (source without ad spend)' },
    { key: 'unattributed', name: 'Unknown/unattributed', roas: null, costPerCustomer: null, roasNote: 'no ROAS (source is not an ad platform)' },
  ];

  return (
    <div className="space-y-6">
      <PageTitle
        title="Combined overview"
        sub="How much do we invest in advertising, how many sales do we create, and which platform gives us better results?"
        badge={<Badge tone="combined">Meta + Google</Badge>}
      />
      <PeriodBar />

      <section className="card px-4 py-4 sm:px-5" data-testid="spend-summary">
        <p className="text-sm font-semibold leading-snug text-ink">
          {spendOk ? (
            <>
              Total spend is {money(totalMinor)}: {metaShare} on Meta Ads and {googleShare} on Google Ads, over {f.spend.completeDays} complete {f.spend.completeDays === 1 ? 'day' : 'days'}
              {isToday ? ' so far' : ''}.
            </>
          ) : (
            <>Total spend is not available for this period because one platform has no spend data.</>
          )}
        </p>
        <div className="mt-2.5 flex flex-wrap gap-2">
          <Chip color={COLOR.meta}>
            Meta <span className="text-ink-3">{dayNote(f.spend.metaDays)}</span>
          </Chip>
          <Chip color={COLOR.google}>
            Google <span className="text-ink-3">{dayNote(f.spend.googleDays)}</span>
          </Chip>
        </div>
      </section>

      <section className="min-w-0">
        <h2 className="mb-3.5 text-lg font-semibold tracking-tight text-ink">Advertising investment</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard series="spend" label="Total spend" value={money(totalMinor)} {...spendState(totalMinor)} delta={d(totalMinor, prev?.spend.totalMinor, 'neutral')} comparison={cmp} sparkline={<Spark values={sparks.spend ?? []} label="Total spend trend" />} />
          <KpiCard label="Meta spend" value={money(metaMinor)} {...spendState(metaMinor)} delta={d(metaMinor, prev?.spend.metaMinor, 'neutral')} comparison={cmp} sparkline={<Spark values={sparksMeta.spend ?? []} color={COLOR.meta} label="Meta spend trend" />} />
          <KpiCard label="Google spend" value={money(googleMinor)} {...spendState(googleMinor)} delta={d(googleMinor, prev?.spend.googleMinor, 'neutral')} comparison={cmp} sparkline={<Spark values={sparksGoogle.spend ?? []} color={COLOR.google} label="Google spend trend" />} />
          <div className="card px-4 py-3.5" data-testid="platform-share">
            <div className="text-xs font-medium text-ink-3">Platform share of spend</div>
            {spendOk ? (
              <>
                <div className="kpi-value mt-2">
                  {metaShare} <span className="text-sm font-medium text-ink-3">Meta</span>
                </div>
                <div className="mt-3">
                  <ShareBar label="Spend share" parts={[{ label: 'Meta', value: metaMinor, color: COLOR.meta }, { label: 'Google', value: googleMinor, color: COLOR.google }]} />
                </div>
                <div className="mt-2 flex justify-between text-xs text-ink-3">
                  <span>Meta {metaShare}</span>
                  <span>Google {googleShare}</span>
                </div>
              </>
            ) : (
              <p className="mt-2 text-xs text-slate-600">Not calculated: one platform has no spend data.</p>
            )}
          </div>
        </div>
      </section>

      <ChartCard scope="Meta + Google" title="Daily spend by platform" total={money(totalMinor)} totalLabel="Total" note="Total is Meta plus Google on days where both platforms have data; a day without data is left empty, never drawn as zero." metrics={metricOptions('spend')} render={(o) => <MetricChart {...o} metric={o.metric ?? 'spend'} view="combined" />} />

      <section className="min-w-0">
        <div className="mb-3.5">
          <h2 className="text-lg font-semibold tracking-tight text-ink">Sales and profitability</h2>
          <p className="mt-0.5 max-w-4xl text-xs leading-relaxed text-ink-3">
            Paid orders by the customer's recorded source, by order date, {dateRange(range)}. Revenue includes 22% VAT. Revenue with an unknown source is not credited to any platform; ROAS exists only for Meta and Google.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4" data-testid="sales-grid">
          <KpiCard series="paid-sales" label="Eligible paid orders" value={count(f.paidOrders)} delta={d(f.paidOrders, prev?.paidOrders)} comparison={cmp} sub="Paid status in the CRM" />
          <KpiCard label="Paid revenue" value={money(f.paidRevenueMinor)} delta={d(f.paidRevenueMinor, prev?.paidRevenueMinor)} comparison={cmp} sub="Incl. 22% VAT" />
          <KpiCard series="meta-value" label="Verified sales attributed to Meta" value={`${count(f.verified.meta.orders)} · ${money(f.verified.meta.revenueMinor)}`} delta={d(f.verified.meta.revenueMinor, prev?.verified.meta.revenueMinor)} comparison={cmp} note="Orders with hard evidence of a Meta ad (lead match or click id)." />
          <KpiCard label="Sales attributed to Google" value={`${count(f.verified.google.orders)} · ${money(f.verified.google.revenueMinor)}`} delta={d(f.verified.google.revenueMinor, prev?.verified.google.revenueMinor)} comparison={cmp} note="Orders with hard evidence of a Google ad (click id)." />
          {(['partner_portal', 'chatbot_ai', 'other_verified', 'unattributed'] as const).map((k) => (
            <KpiCard key={k} label={GROUP_LABEL[k]} value={`${count(g(k).orders)} · ${money(g(k).revenueMinor)}`} delta={d(g(k).revenueMinor, pg(k)?.revenueMinor)} comparison={cmp} />
          ))}
          <KpiCard label="Attributable ROAS (Meta + Google)" value={multiple(f.roas.combined)} {...noRoas(f.roas.combined)} delta={d(f.roas.combined, prev?.roas.combined)} comparison={cmp} note="Verified Meta and Google revenue divided by total spend. A ratio of sums." />
          <KpiCard label="Meta ROAS" value={multiple(f.roas.meta)} {...noRoas(f.roas.meta)} delta={d(f.roas.meta, prev?.roas.meta)} comparison={cmp} note="Verified Meta revenue divided by Meta spend." />
          <KpiCard label="Google ROAS" value={multiple(f.roas.google)} {...noRoas(f.roas.google)} delta={d(f.roas.google, prev?.roas.google)} comparison={cmp} note="Verified Google revenue divided by Google spend." />
          <KpiCard
            label="Cost per paying customer"
            value={money(f.costPerCustomerMinor)}
            {...(f.costPerCustomerMinor === null ? ({ state: 'no_calc', reason: 'No verified paying customers' } as const) : {})}
            delta={d(f.costPerCustomerMinor, prev?.costPerCustomerMinor, 'down')}
            comparison={cmp}
            note="Total spend divided by verified paid orders from Meta and Google."
          />
        </div>
      </section>

      <ChartCard scope="Meta + Google" title="Sales by source: orders" total={count(f.paidOrders)} totalLabel="Total paid" note="Paid orders per customer source. The purple subtotal is derived from Meta, Google and Chatbot/AI and is not an extra source." render={(o) => <SourceLinesChart {...o} measure="orders" />} />
      <ChartCard scope="Meta + Google" title="Sales by source: revenue" total={money(f.paidRevenueMinor)} totalLabel="Total paid" note="Paid revenue per customer source, incl. VAT. A source classifies a sale; it does not prove which ad produced it." render={(o) => <SourceLinesChart {...o} measure="revenue" />} />

      <SubHeading title="Revenue and spend: surplus and ROAS">Selected sources ({SELECTED_LABEL}) against total Meta and Google spend. Ratios are computed from sums.</SubHeading>
      <ChartCard
        scope="Meta + Google"
        title="Selected-source advertising surplus"
        total={money(f.surplusMinor)}
        totalLabel="Surplus"
        note={`Surplus = revenue of the selected sources minus (Meta + Google spend). ${SURPLUS_NOTE}`}
        render={(o) => (
          <>
            <SurplusSummary />
            <SurplusChart view="combined" {...o} />
          </>
        )}
      />
      <ChartCard
        scope="Meta + Google"
        title="Attributable ROAS: Meta, Google and combined"
        total={`Meta ${multiple(f.roas.meta)} · Google ${multiple(f.roas.google)}`}
        totalLabel="Period"
        note="Only orders with verified evidence (lead match or click id) are attributed. Platform-reported conversions are not mixed in."
        render={(o) => <RoasChart view="combined" {...o} />}
      />

      <section className="card min-w-0" data-testid="return-table">
        <div className="rounded-t-card border-b border-line px-4 py-3.5 sm:px-5">
          <h2 className="text-[15px] font-semibold leading-5 tracking-tight text-ink">Revenue and advertising return</h2>
          <p className="mt-0.5 text-xs leading-snug text-ink-3">
            {dateRange(range)} · paid orders by customer source{prevRange ? `, previous period ${dateRange(prevRange)}` : ''}
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="nav-table w-full min-w-[760px] text-sm" data-testid="platform-comparison">
            <thead>
              <tr className="text-left text-2xs uppercase tracking-wide text-ink-3">
                <th className="px-4 py-2 font-semibold sm:px-5">Source</th>
                <th className="px-2 py-2 text-right font-semibold">Orders</th>
                <th className="px-2 py-2 text-right font-semibold">Revenue</th>
                <th className="px-2 py-2 text-right font-semibold">Share</th>
                <th className="px-2 py-2 font-semibold">ROAS</th>
                <th className="px-2 py-2 text-right font-semibold">Previous period</th>
                <th className="px-4 py-2 text-right font-semibold sm:px-5">Cost per customer</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {tableRows.map((r) => (
                <tr key={r.key}>
                  <td className="px-4 py-2.5 font-medium text-ink sm:px-5">
                    <span aria-hidden className="mr-2 inline-block h-2 w-2 rounded-[2px]" style={{ background: GROUP_COLOR[r.key] }} />
                    {r.name}
                  </td>
                  <td className="tabular px-2 py-2.5 text-right">{count(g(r.key).orders)}</td>
                  <td className="tabular px-2 py-2.5 text-right">{money(g(r.key).revenueMinor)}</td>
                  <td className="tabular px-2 py-2.5 text-right">{share(g(r.key).revenueMinor, f.paidRevenueMinor)}</td>
                  <td className="tabular px-2 py-2.5 text-xs text-ink-3">{r.roasNote ? r.roasNote : <span className="text-sm font-semibold text-ink">{multiple(r.roas)}</span>}</td>
                  <td className="tabular px-2 py-2.5 text-right text-ink-2">{prev ? `${count(pg(r.key)?.orders)} · ${money(pg(r.key)?.revenueMinor)}` : '–'}</td>
                  <td className="tabular px-4 py-2.5 text-right sm:px-5">{r.costPerCustomer === null ? <span className="text-slate-300">—</span> : money(r.costPerCustomer)}</td>
                </tr>
              ))}
              <tr className="bg-slate-50 font-semibold">
                <td className="px-4 py-2.5 text-ink sm:px-5">Total paid</td>
                <td className="tabular px-2 py-2.5 text-right" data-testid="table-total-orders">{count(f.paidOrders)}</td>
                <td className="tabular px-2 py-2.5 text-right" data-testid="table-total-revenue">{money(f.paidRevenueMinor)}</td>
                <td className="tabular px-2 py-2.5 text-right">{f.paidRevenueMinor > 0 ? '100.0%' : '–'}</td>
                <td className="tabular px-2 py-2.5 text-ink">{multiple(f.roas.combined)}</td>
                <td className="tabular px-2 py-2.5 text-right text-ink-2">{prev ? `${count(prev.paidOrders)} · ${money(prev.paidRevenueMinor)}` : '–'}</td>
                <td className="tabular px-4 py-2.5 text-right sm:px-5">{money(f.costPerCustomerMinor)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <ul className="list-disc space-y-1 border-t border-line px-8 py-3 text-xs leading-relaxed text-ink-3 sm:px-9">
          <li>The sources add up to the total paid orders and revenue{f.reconciles ? '' : ' (check failed)'}. Unknown and conflicting-evidence orders are shown together as Unknown/unattributed.</li>
          <li>ROAS uses verified evidence only and exists only for Meta and Google. The combined ROAS divides their verified revenue by total spend.</li>
          <li>Cost per customer is spend divided by verified paid orders; other sources have no advertising spend.</li>
          <li>
            Source is the customer's recorded source and classifies a sale; it is not proof that an ad produced it. See <Link to="/attribution" className="font-semibold text-brand hover:underline">Attribution</Link> for the evidence behind each order.
          </li>
        </ul>
      </section>

      <section className="card min-w-0" data-testid="crm-reconciliation">
        <div className="rounded-t-card border-b border-line px-4 py-3.5 sm:px-5">
          <h2 className="text-[15px] font-semibold leading-5 tracking-tight text-ink">CRM reconciliation</h2>
          <p className="mt-0.5 text-xs leading-snug text-ink-3">{dateRange(range)} · read from the local demo dataset (Europe/Ljubljana)</p>
        </div>
        <p className="px-4 pt-3 text-xs leading-relaxed text-ink-2 sm:px-5">
          <strong className="text-ink">Paid orders = orders with status paid in the CRM; unpaid orders are not sales.</strong> The CRM order list also contains unpaid and cancelled orders, so its length is normally larger than the paid count.
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[480px] text-sm">
            <thead>
              <tr className="bg-slate-50 text-left text-xs text-ink-3">
                <th className="px-4 py-2 font-medium sm:px-5">Group</th>
                <th className="px-2 py-2 text-right font-medium">Orders</th>
                <th className="px-4 py-2 text-right font-medium sm:px-5">Value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {[
                { name: 'All CRM orders', note: 'all statuses, by order date', v: f.crm.all, strong: false, muted: false },
                { name: 'Paid orders', note: 'status paid; these are the sales', v: f.crm.paid, strong: true, muted: false },
                { name: 'Unpaid orders', note: 'not sales', v: f.crm.unpaid, strong: false, muted: false },
                { name: 'Excluded', note: 'cancelled or refunded', v: f.crm.excluded, strong: false, muted: false },
                { name: 'Paid by payment date', note: 'same paid orders, placed by payment date instead of order date', v: f.crm.paidByPayment, strong: false, muted: true },
              ].map((r) => (
                <tr key={r.name} className={r.strong ? 'bg-slate-50/70' : ''}>
                  <td className={`px-4 py-2.5 sm:px-5 ${r.muted ? 'text-ink-3' : ''}`}>
                    <div className={r.strong ? 'font-semibold text-ink' : r.muted ? '' : 'text-ink'}>{r.name}</div>
                    <div className="text-xs text-ink-3">{r.note}</div>
                  </td>
                  <td className="tabular px-2 py-2.5 text-right">{count(r.v.orders)}</td>
                  <td className="tabular px-4 py-2.5 text-right sm:px-5">{money(r.v.revenueMinor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-3 text-xs leading-relaxed text-ink-3 sm:px-5">
          <p>Basis difference: orders placed in the period and paid outside it, or placed earlier and paid inside it, move between the two bases. Values are order values from the CRM, not bank receipts.</p>
        </div>
      </section>

      <section className="card min-w-0">
        <button type="button" className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold text-ink sm:px-5" aria-expanded={notIncluded} onClick={() => setNotIncluded((v) => !v)}>
          <span aria-hidden className={`text-[10px] text-ink-3 transition-transform ${notIncluded ? 'rotate-90' : ''}`}>
            ▶
          </span>
          What's not included
        </button>
        {notIncluded && (
          <ul className="list-disc space-y-1 border-t border-line px-8 py-3 text-xs leading-relaxed text-ink-3 sm:px-9">
            <li>Platform-reported conversions are not added to sales; they are shown separately on each platform's overview.</li>
            <li>Orders without verified evidence stay unattributed; they are never assigned to a platform by date, amount or name.</li>
            <li>Other costs (agency fees, software, staff) are not in the surplus, and revenue includes VAT. The surplus is not profit.</li>
            <li>Platforms outside Meta and Google have no advertising spend here, so they have no ROAS.</li>
          </ul>
        )}
      </section>
    </div>
  );
}
