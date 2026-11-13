import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { salesOverview } from '@sedem-ads/analytics-core';
import { EmptyState, InfoTip, KpiCard, PageTitle, Segmented, type GoodWhen } from '../components/ui';
import { PeriodBar } from '../components/PeriodBar';
import { ChartCard } from '../components/charts/ChartCard';
import { COLOR, METRIC_COLOR } from '../components/charts/colors';
import { TimeSeriesChart, type ChartRow, type ChartSeries } from '../components/charts/TimeSeriesChart';
import { SourcesChart, Spark, sparkSpec, useSparks } from '../components/OverviewCharts';
import { useAppState } from '../state/AppState';
import { getDataset } from '../lib/data';
import { usablePreviousRange } from '../lib/useView';
import { SURPLUS_NOTE } from '../lib/analytics';
import { META_SECTIONS, campaignRows, platformSnapshot, rel, sectionFigures, sectionSpendRows } from '../lib/overviewData';
import { count, dateRange, money, moneyAxis, multiple, pct } from '../lib/format';

type Basis = 'order' | 'payment';

function Eyebrow({ children }: { children: ReactNode }) {
  return <div className="eyebrow mb-2">{children}</div>;
}

function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  const w = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <div className="h-1.5 w-full rounded-full bg-slate-100" aria-hidden>
      <div className="h-full rounded-full" style={{ width: `${w}%`, background: color }} />
    </div>
  );
}

/** Rows of "dot + name · bar · value" used by the section blocks inside the big card. */
function SectionRows({ rows, empty }: { rows: { id: string; name: string; color: string; value: number | null; text: string }[]; empty: string }) {
  const max = Math.max(0, ...rows.map((r) => r.value ?? 0));
  if (rows.every((r) => r.value === null || r.value === 0)) return <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-ink-3">{empty}</p>;
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.id}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="flex min-w-0 items-center gap-2 text-ink">
              <span aria-hidden className="h-2 w-2 shrink-0 rounded-[2px]" style={{ background: r.color }} />
              <span className="truncate">{r.name}</span>
            </span>
            <span className="tabular font-medium text-ink">{r.text}</span>
          </div>
          <div className="mt-1">
            <Bar value={r.value ?? 0} max={max} color={r.color} />
          </div>
        </li>
      ))}
    </ul>
  );
}

const BOOSTS = {
  active: [{ name: 'Boost · Consultation tips', post: 'Post 100000000000001_8000000000001', status: 'Active', spend: 15670, impressions: 3366, clicks: 67, result: '67 link clicks', start: '6 Nov 2026', end: 'running' }],
  ended: [
    { name: 'Boost · Webinar reminder', post: 'Post 100000000000001_8000000000002', status: 'Ended', spend: 13590, impressions: 2550, clicks: 52, result: '52 link clicks', start: '23 Sep 2026', end: '30 Sep 2026' },
    { name: 'Boosted post · Document checklist', post: 'Post 100000000000001_8000000000003', status: 'Stopped', spend: 52250, impressions: 12489, clicks: 72, result: '0 post interactions', start: '21 Jul 2026', end: '3 Sep 2026' },
  ],
};

type BoostRow = (typeof BOOSTS.active)[number];

function BoostTable({ rows }: { rows: BoostRow[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      <table className="w-full min-w-[760px] text-xs">
        <thead>
          <tr className="bg-slate-50 text-left text-ink-3">
            <th className="px-3 py-2 font-semibold">Boost</th>
            <th className="px-2 py-2 font-semibold">Status</th>
            <th className="px-2 py-2 text-right font-semibold">Spend (EUR)</th>
            <th className="px-2 py-2 text-right font-semibold">Impressions</th>
            <th className="px-2 py-2 text-right font-semibold">Link clicks</th>
            <th className="px-2 py-2 font-semibold">Result</th>
            <th className="px-2 py-2 font-semibold">Start</th>
            <th className="px-2 py-2 font-semibold">End</th>
            <th className="px-2 py-2 text-right font-semibold">CPM (EUR)</th>
            <th className="px-3 py-2 text-right font-semibold">CTR</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r) => (
            <tr key={r.name}>
              <td className="px-3 py-2.5">
                <div className="font-medium text-ink">{r.name}</div>
                <div className="text-2xs text-ink-3">{r.post}</div>
              </td>
              <td className="px-2 py-2.5">
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-2xs font-semibold text-ink-2">{r.status}</span>
              </td>
              <td className="tabular px-2 py-2.5 text-right">{money(r.spend)}</td>
              <td className="tabular px-2 py-2.5 text-right">{count(r.impressions)}</td>
              <td className="tabular px-2 py-2.5 text-right">{count(r.clicks)}</td>
              <td className="px-2 py-2.5">{r.result}</td>
              <td className="px-2 py-2.5">{r.start}</td>
              <td className="px-2 py-2.5">{r.end}</td>
              <td className="tabular px-2 py-2.5 text-right">{money(Math.round((r.spend / r.impressions) * 1000))}</td>
              <td className="tabular px-3 py-2.5 text-right">{pct(r.clicks / r.impressions)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function MetaOverview() {
  const { range, period } = useAppState();
  const sparks = useSparks('meta');
  const [basis, setBasis] = useState<Basis>('order');
  const { granularity } = useAppState();

  const data = useMemo(() => {
    if (!range) return null;
    const ds = getDataset();
    const prevRange = usablePreviousRange(range);
    const cur = platformSnapshot(ds, 'meta', range);
    const prev = prevRange ? platformSnapshot(ds, 'meta', prevRange) : null;
    const rows = campaignRows(ds, 'meta', range);
    return { cur, prev, prevRange, sections: sectionFigures(rows), rows };
  }, [range]);

  const sales = useMemo(() => {
    if (!range) return null;
    const s = salesOverview(getDataset(), { range, basis });
    return s;
  }, [range, basis]);

  const sectionData = useMemo(() => (range ? sectionSpendRows(getDataset(), range, granularity) : []), [range, granularity]);
  const sectionSeries: ChartSeries[] = useMemo(() => META_SECTIONS.map((s) => ({ key: s.id, label: s.name, color: s.color, kind: 'line' as const, format: (v: number) => money(v) })), []);

  if (!range || !data || !sales) {
    return (
      <div className="space-y-5">
        <PageTitle title="Meta overview" />
        <PeriodBar />
        <EmptyState title="No completed days in this period">Pick another period.</EmptyState>
      </div>
    );
  }

  const { cur, prev, prevRange, sections } = data;
  const c = cur.totals;
  const p = prev?.totals ?? null;
  const d = (a: number | null | undefined, b: number | null | undefined, goodWhen: GoodWhen = 'up') => ({ pct: rel(a, b), goodWhen });
  const cmp = prevRange ? `vs ${dateRange(prevRange)}` : undefined;
  const missing = (v: number | null): { state: 'ok' | 'no_data'; reason?: string } => (v === null ? { state: 'no_data', reason: 'No data for this period' } : { state: 'ok' });
  const part = sales.partition;
  const metaPart = part.parts.find((x) => x.source === 'meta');
  const sc = sales.statusCounts;
  const allOrders = sc.paid.orders + sc.unpaid.orders + sc.cancelled.orders + sc.refunded.orders;
  const allRevenue = sc.paid.revenueMinor + sc.unpaid.revenueMinor + sc.cancelled.revenueMinor + sc.refunded.revenueMinor;
  const basisLabel = basis === 'order' ? 'order date' : 'payment date';
  const sourceOnlyRevenue = Math.max(0, cur.sourceRevenueMinor - cur.verifiedRevenueMinor);
  const sourceOnlyOrders = Math.max(0, cur.sourceOrders - cur.verifiedOrders);
  const isToday = period.preset === 'today';
  const notice = `${cur.sourceOrders} paid orders carry Meta as the customer source; ${cur.verifiedOrders} of them have verified evidence of a Meta ad.`;
  const productCols = sections.map((s) => ({ ...s, share: c.spendMinor ? (s.spendMinor ?? 0) / c.spendMinor : null }));

  return (
    <div className="space-y-6">
      <PageTitle
        title="Meta overview"
        sub={
          <>
            {dateRange(range)}
            {isToday ? ' · today has not closed yet' : ' · completed days only'}
          </>
        }
        right={
          <span className="inline-flex items-center gap-2 rounded-full border border-line bg-white px-3 py-1.5 text-xs font-medium text-ink-2 shadow-sm" data-testid="account-pill">
            <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: COLOR.meta }} />
            Meta Ads: Northwind Advisory demo (+2)
            <svg aria-hidden viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m6 9 6 6 6-6" />
            </svg>
          </span>
        }
      />
      <PeriodBar />

      <section className="card overflow-hidden" aria-label="All advertising">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-4 sm:px-6 sm:py-5">
          <div>
            <p className="eyebrow">All advertising</p>
            <h2 className="mt-0.5 text-xl font-semibold tracking-tight text-ink">Advertising overview</h2>
            <p className="mt-0.5 text-xs text-ink-3">
              {dateRange(range)}
              {prevRange ? ` · compared with the previous period (${dateRange(prevRange)})` : ''}
            </p>
          </div>
          <Segmented<Basis>
            label="Sales basis"
            value={basis}
            onChange={setBasis}
            options={[
              { value: 'order', label: 'Sales by order date' },
              { value: 'payment', label: 'Sales by payment date' },
            ]}
          />
        </div>

        <div className="space-y-6 bg-slate-50/50 px-4 py-5 sm:px-6">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard series="spend" label="Total spend" value={money(c.spendMinor)} {...missing(c.spendMinor)} delta={d(c.spendMinor, p?.spendMinor, 'neutral')} comparison={cmp} sparkline={<Spark {...sparkSpec(sparks, 'spend')} color={METRIC_COLOR.spend} label="Spend trend" title="Meta spend" />} />
            <KpiCard series="meta-leads" label="Total leads" value={count(c.leads)} {...missing(c.leads)} delta={d(c.leads, p?.leads)} comparison={cmp} sub="Lead forms reported by Meta" sparkline={<Spark {...sparkSpec(sparks, 'leads')} color={METRIC_COLOR.leads} label="Leads trend" title="Meta leads" />} />
            <KpiCard label="Total CPL" value={money(c.cplMinor)} {...missing(c.cplMinor)} delta={d(c.cplMinor, p?.cplMinor, 'down')} comparison={cmp} sparkline={<Spark {...sparkSpec(sparks, 'cpl')} color={METRIC_COLOR.cpl} label="CPL trend" title="Meta cost per lead" />} />
            <KpiCard series="paid-sales" label="Paid orders" value={count(cur.verifiedOrders)} delta={d(cur.verifiedOrders, prev?.verifiedOrders)} comparison={cmp} sub={`Verified Meta, of ${count(cur.sourceOrders)} with Meta as source`} />
          </div>

          <div>
            <Eyebrow>
              Linked sales · estimate <InfoTip title="Linked sales" text="Paid orders with hard evidence of a Meta ad (lead match or click id). An estimate, not a platform-reported figure." />
            </Eyebrow>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <KpiCard label="Value (incl. VAT)" value={money(cur.verifiedRevenueMinor)} delta={d(cur.verifiedRevenueMinor, prev?.verifiedRevenueMinor)} comparison={cmp} sparkline={<Spark {...sparkSpec(sparks, 'revenue')} color={METRIC_COLOR.linkedValue} label="Revenue trend" title="Linked Meta sales value" />} />
              <KpiCard
                label="Estimated ROAS"
                value={multiple(cur.roas)}
                {...(cur.roas === null ? { state: 'no_calc' as const, reason: 'No spend or no verified sales in this period' } : {})}
                delta={d(cur.roas, prev?.roas)}
                comparison={cmp}
                sub="Verified evidence only"
                note="Verified Meta revenue divided by Meta spend. Orders without evidence are left out, not guessed."
                sparkline={<Spark {...sparkSpec(sparks, 'roas')} color={METRIC_COLOR.roas} label="ROAS trend" title="Estimated Meta ROAS" />}
              />
              <KpiCard
                label="Cost per acquired customer"
                value={money(cur.costPerCustomerMinor)}
                {...(cur.costPerCustomerMinor === null ? { state: 'no_calc' as const, reason: 'No verified customers in this period' } : {})}
                delta={d(cur.costPerCustomerMinor, prev?.costPerCustomerMinor, 'down')}
                comparison={cmp}
                sub="Spend ÷ verified paid orders"
              />
              <KpiCard label="Average order value" value={money(cur.aovMinor)} {...(cur.aovMinor === null ? { state: 'no_calc' as const, reason: 'No verified orders' } : {})} delta={d(cur.aovMinor, prev?.aovMinor)} comparison={cmp} sub="Incl. VAT" />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div>
              <h3 className="mb-2.5 text-sm font-semibold text-ink">Spend by section</h3>
              <SectionRows empty="Not enough data" rows={sections.map((s) => ({ id: s.def.id, name: s.def.name, color: s.def.color, value: s.spendMinor, text: money(s.spendMinor) }))} />
            </div>
            <div>
              <h3 className="mb-2.5 text-sm font-semibold text-ink">Leads (Meta) by section</h3>
              <SectionRows empty="Not enough data" rows={sections.map((s) => ({ id: s.def.id, name: s.def.name, color: s.def.color, value: s.leads, text: count(s.leads) }))} />
            </div>
            <div data-testid="meta-linked-sales">
              <h3 className="mb-1 flex items-center text-sm font-semibold text-ink">
                Meta-linked sales by campaign <InfoTip title="Meta-linked sales" text="Verified paid orders grouped by the campaign of the matched lead or click." />
              </h3>
              <p className="mb-2 text-xs text-ink-3">
                <strong className="text-ink">{count(cur.verifiedOrders)} orders</strong> · {money(cur.verifiedRevenueMinor)} linked with verified Meta leads
              </p>
              <div className="mb-3 flex h-2 w-full overflow-hidden rounded-full bg-slate-200" role="img" aria-label="Linked revenue by section">
                {sections.map((s) => (
                  <div key={s.def.id} style={{ width: `${cur.verifiedRevenueMinor > 0 ? (s.verifiedRevenueMinor / cur.verifiedRevenueMinor) * 100 : 0}%`, background: s.def.color }} />
                ))}
              </div>
              <ul className="space-y-1.5 text-sm">
                {sections.map((s) => (
                  <li key={s.def.id} className="flex items-center justify-between gap-3">
                    <span className="flex min-w-0 items-center gap-2 text-ink">
                      <span aria-hidden className="h-2 w-2 shrink-0 rounded-[2px]" style={{ background: s.def.color }} />
                      <span className="truncate">{s.def.name}</span>
                    </span>
                    <span className="tabular shrink-0 text-ink-2">
                      {count(s.verifiedOrders)} <span className="ml-3 inline-block min-w-[5.5rem] text-right text-ink">{money(s.verifiedRevenueMinor)}</span>
                    </span>
                  </li>
                ))}
                <li className="flex items-center justify-between gap-3 border-t border-line pt-1.5 text-ink-2">
                  <span className="flex items-center gap-2">
                    <span aria-hidden className="h-2 w-2 rounded-[2px] bg-slate-400" />
                    Meta customers without ad evidence
                  </span>
                  <span className="tabular shrink-0">
                    {count(sourceOnlyOrders)} <span className="ml-3 inline-block min-w-[5.5rem] text-right">{money(sourceOnlyRevenue)}</span>
                  </span>
                </li>
              </ul>
              <p className="mt-2 text-xs leading-relaxed text-ink-3">{notice}</p>
            </div>
          </div>

          <div className="rounded-xl border border-dashed border-line-strong bg-white/60 p-4" data-testid="all-sales-by-source">
            <p className="text-sm font-semibold text-ink">
              All sales by source <span className="ml-1 text-xs font-normal text-ink-3">separate sources, never added together</span>
            </p>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[
                { t: 'Meta linked (verified)', v: `${count(cur.verifiedOrders)} · ${money(cur.verifiedRevenueMinor)}`, s: 'estimate, by lead match or click id' },
                { t: 'CRM paid, all channels', v: `${count(part.eligibleOrders)} · ${money(part.eligibleRevenueMinor)}`, s: `by ${basisLabel}, status paid` },
                { t: 'CRM all orders', v: `${count(allOrders)} · ${money(allRevenue)}`, s: `by ${basisLabel}, all statuses; unpaid and cancelled are not sales` },
                { t: 'Meta as customer source', v: `${count(metaPart?.orders ?? 0)} · ${money(metaPart?.revenueMinor ?? 0)}`, s: `paid, by ${basisLabel}; source label only` },
              ].map((x) => (
                <div key={x.t} className="rounded-lg border border-line bg-white px-3 py-2.5">
                  <div className="text-xs font-medium text-ink-3">{x.t}</div>
                  <div className="tabular mt-1 text-base font-bold text-ink">{x.v}</div>
                  <div className="mt-0.5 text-2xs leading-snug text-ink-3">{x.s}</div>
                </div>
              ))}
            </div>
            <details className="mt-3 text-xs text-ink-3">
              <summary className="cursor-pointer font-medium text-ink-2">How these differ</summary>
              <ul className="mt-1.5 list-disc space-y-1 pl-5 leading-relaxed">
                <li>Meta linked counts only orders with hard evidence of a Meta ad; the customer-source tile counts every paid order labelled Meta.</li>
                <li>The CRM tiles cover all channels, not only Meta. Revenue includes {sales.vatRatePercent}% VAT.</li>
                <li>Switching the basis moves orders between periods when the order and the payment fall on different days.</li>
              </ul>
            </details>
          </div>

          <details className="text-xs text-ink-3">
            <summary className="cursor-pointer font-medium text-ink-2">Notes (2)</summary>
            <ul className="mt-1.5 list-disc space-y-1 pl-5 leading-relaxed">
              <li>Sales linked to Meta exist only where the lead or click id is on record; the rest stays unattributed.</li>
              <li>Meta-reported conversions ({count(c.platformConversions)}) are not added to leads or sales.</li>
            </ul>
          </details>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3" aria-label="Sections">
        {productCols.map((s) => (
          <article key={s.def.id} className="card overflow-hidden border-t-[3px]" style={{ borderTopColor: s.def.color }} data-testid="section-card">
            <div className="px-4 py-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-ink">
                  <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: s.def.color }} />
                  {s.def.name}
                </h3>
                <Link to="/campaigns" className="rounded-full border border-line px-2.5 py-0.5 text-2xs font-medium text-ink-2 hover:bg-slate-50">
                  {s.activeCampaigns} {s.activeCampaigns === 1 ? 'campaign' : 'campaigns'}
                </Link>
              </div>
              <p className="mt-3 text-xs text-ink-3">Spend</p>
              <p className="tabular text-xl font-bold text-ink">{money(s.spendMinor)}</p>
              <p className="text-2xs text-ink-3">{s.share === null ? 'no share' : `${(s.share * 100).toFixed(0)}% of Meta spend`}</p>
              <p className="eyebrow mt-4">Advertising</p>
              <dl className="mt-1.5 space-y-1.5 rounded-lg bg-slate-50 px-3 py-2.5 text-sm">
                {[
                  ['Leads', count(s.leads)],
                  ['CPL', money(s.cplMinor)],
                  ['CTR', pct(s.ctr)],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between">
                    <dt className="text-ink-3">{k}</dt>
                    <dd className="tabular font-medium text-ink">{v}</dd>
                  </div>
                ))}
              </dl>
              <p className="eyebrow mt-4">Sales</p>
              <dl className="mt-1.5 space-y-1.5 rounded-lg bg-slate-50 px-3 py-2.5 text-sm">
                {[
                  ['Verified orders', count(s.verifiedOrders)],
                  ['Value', money(s.verifiedRevenueMinor)],
                  ['Estimated ROAS', multiple(s.roas)],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between">
                    <dt className="text-ink-3">{k}</dt>
                    <dd className="tabular font-medium text-ink">{v}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </article>
        ))}
      </section>

      <section className="min-w-0">
        <h2 className="mb-3.5 text-lg font-semibold tracking-tight text-ink">Charts</h2>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <ChartCard
            scope="Meta Ads"
            title="Spend by section"
            total={money(c.spendMinor)}
            note={c.partial ? 'Days without data are gaps, not zero.' : undefined}
            render={(o) => <TimeSeriesChart data={sectionData as ChartRow[]} series={sectionSeries} yFormat={moneyAxis} height={o.height} fixedWidth={o.fixedWidth} ariaLabel="Spend by section" />}
          />
          <ChartCard
            scope="All channels"
            title="Paid sales, all channels"
            total={money(part.eligibleRevenueMinor)}
            totalLabel="Total paid"
            note="Whole-account sales by customer source, not only Meta campaigns. A source classifies a sale; it does not prove which ad produced it."
            render={(o) => <SourcesChart {...o} />}
          />
        </div>
      </section>

      <section className="min-w-0" data-testid="boost">
        <h2 className="mb-3.5 text-lg font-semibold tracking-tight text-ink">Boost</h2>
        <div className="card overflow-hidden border-t-[3px] border-t-violet-600 px-4 py-4 sm:px-6">
          <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-ink">
            <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-violet-600" />
            Boost
          </h3>
          <p className="mt-0.5 text-xs text-ink-3">Independent of the selected period: everything active, and everything that ended in the last 10 days or so.</p>
          <p className="eyebrow mt-4 mb-1.5">Active (1)</p>
          <BoostTable rows={BOOSTS.active} />
          <p className="eyebrow mt-4 mb-1.5">Recently ended (2)</p>
          <BoostTable rows={BOOSTS.ended} />
          <p className="mt-3 text-xs text-ink-3">Spend, impressions and clicks are synthetic demo figures (updated 12 Nov 2026, 08:10).</p>
        </div>
      </section>

      <details className="card group px-4 py-3 sm:px-6" data-testid="how-we-calculate">
        <summary className="cursor-pointer text-sm font-semibold text-ink">How we calculate</summary>
        <ul className="mt-2 list-disc space-y-1.5 pl-5 text-xs leading-relaxed text-ink-3">
          <li>Spend, leads and CPL are Meta-reported for completed days; a day without data is shown as missing, never as zero.</li>
          <li>Estimated ROAS is verified Meta revenue divided by Meta spend, a ratio of sums. Orders only labelled Meta are not counted.</li>
          <li>{SURPLUS_NOTE}</li>
          <li>Sections group the account&apos;s campaigns into product areas; the three sections add up to total Meta spend.</li>
        </ul>
      </details>
    </div>
  );
}
