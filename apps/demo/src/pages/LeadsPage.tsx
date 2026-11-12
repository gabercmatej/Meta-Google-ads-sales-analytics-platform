import { useMemo, useState } from 'react';
import { leadsOverview, performanceTotals, type LeadChannel, type LeadStatus } from '@sedem-ads/analytics-core';
import { Badge, Button, Card, EmptyState, KpiCard, PageTitle, ProgressBar, Section, Segmented, StatRow, Value, type Tone } from '../components/ui';
import { PeriodBar } from '../components/PeriodBar';
import { ChartCard } from '../components/charts/ChartCard';
import { StackedBar, TimeSeriesChart, type ChartRow, type ChartSeries } from '../components/charts/TimeSeriesChart';
import { Spark } from '../components/OverviewCharts';
import { COLOR, SHAPES } from '../components/charts/colors';
import { Collapsible, InfoLine, Pill, td, tdr, th, thr } from '../components/ResultsParts';
import { PLATFORM_LABELS, useAppState } from '../state/AppState';
import { getDataset } from '../lib/data';
import { usablePreviousRange } from '../lib/useView';
import { relChange } from '../lib/combined';
import { leadCohort, leadDays, leadsByCampaign, leadsByTopic, ljDay, ratioOrNull, googleConversionRows, type LeadGroupRow } from '../lib/resultsData';
import { count, countAxis, dateRange, dateTime, money, moneyAxis, multiple, pct, share } from '../lib/format';

const CHANNEL_LABEL: Record<LeadChannel, string> = {
  meta_lead_form: 'Meta lead form',
  google_lead_form: 'Google lead form',
  website_form: 'Website form',
  chatbot_ai: 'Chatbot / AI',
  partner_portal: 'Partner portal',
  phone: 'Phone',
};

const STATUSES: readonly { key: LeadStatus; label: string; tone: Tone; color: string }[] = [
  { key: 'new', label: 'New', tone: 'info', color: '#94a3b8' },
  { key: 'contacted', label: 'Contacted', tone: 'neutral', color: '#64748b' },
  { key: 'qualified', label: 'Qualified', tone: 'blue', color: '#2563eb' },
  { key: 'converted', label: 'Converted', tone: 'good', color: '#059669' },
  { key: 'lost', label: 'Lost', tone: 'bad', color: '#dc2626' },
];
const STATUS = Object.fromEntries(STATUSES.map((s) => [s.key, s])) as Record<LeadStatus, (typeof STATUSES)[number]>;

const PALETTE = ['#2563eb', '#0d9488', '#7c3aed', '#db2777', '#64748b', '#0891b2', '#65a30d', '#b45309'];
const RECENT = 15;

type GroupBy = 'campaign' | 'status';

function Tile({ label, value, note, missing }: { label: string; value: string; note?: string; missing?: string }) {
  return (
    <div className="rounded-xl border border-line bg-slate-50/60 px-3.5 py-3">
      <p className="text-xs font-medium text-ink-3">{label}</p>
      {missing ? (
        <>
          <p className="tabular mt-1 text-xl font-bold leading-none text-slate-300" aria-label="no data">
            —
          </p>
          <p className="mt-1.5 text-xs text-slate-600">{missing}</p>
        </>
      ) : (
        <>
          <p className="tabular mt-1 text-xl font-bold leading-none text-ink">{value}</p>
          {note && <p className="mt-1.5 text-xs text-slate-600">{note}</p>}
        </>
      )}
    </div>
  );
}

export default function LeadsPage() {
  const { workspace, range, granularity } = useAppState();
  const ds = getDataset();
  const [groupBy, setGroupBy] = useState<GroupBy>('campaign');
  const [picked, setPicked] = useState<string[]>([]);
  const [combinedShown, setCombinedShown] = useState(false);

  const data = useMemo(() => {
    if (!range) return null;
    const prev = usablePreviousRange(range);
    const overview = leadsOverview(ds, { range, view: workspace });
    const cohort = leadCohort(ds, range, workspace);
    const prevCohort = prev ? leadCohort(ds, prev, workspace) : null;
    const own = performanceTotals(ds, workspace, range);
    const campaigns = leadsByCampaign(ds, range, workspace, cohort);
    const topics = leadsByTopic(ds, workspace, campaigns);
    const nameOf = new Map(ds.campaigns.map((c) => [c.id, c.name]));
    const daily = leadDays(ds, range, 'daily', workspace, cohort, (l) => l.campaignId ?? 'none');
    const campaignIdsShown = campaigns.filter((c) => c.leads > 0).map((c) => c.id);
    const bucketed = leadDays(ds, range, granularity, workspace, cohort, (l) => (l.campaignId && campaignIdsShown.includes(l.campaignId) ? l.campaignId : 'other'));
    const recent = [...cohort.leads].sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : a.id < b.id ? 1 : -1)).slice(0, RECENT);
    const ids = cohort.leads.map((l) => l.platformLeadId).filter((x): x is string => !!x);
    const duplicates = ids.length - new Set(ids).size;
    const sold = [...cohort.paidByLead.keys()].length;
    const revenueMinor = [...cohort.paidByLead.values()].flat().reduce((a, o) => a + o.amountMinor, 0);
    const customers = new Set([...cohort.paidByLead.values()].flat().map((o) => o.customerId)).size;
    const leadSpend = campaigns.filter((c) => c.leads > 0).map((c) => c.spendMinor);
    const spendMinor = leadSpend.some((v) => v !== null) ? leadSpend.reduce<number>((a, v) => a + (v ?? 0), 0) : null;
    const prevSold = prevCohort ? prevCohort.paidByLead.size : null;
    const withOrderLead = ds.orders.filter((x) => x.leadId && cohort.leads.some((l) => l.id === x.leadId)).length;
    const conversions = googleConversionRows(ds, range);
    return { prev, overview, cohort, prevCohort, own, campaigns, topics, nameOf, daily, bucketed, campaignIdsShown, recent, duplicates, sold, revenueMinor, customers, spendMinor, prevSold, withOrderLead, conversions, withPlatformId: ids.length };
  }, [ds, range, workspace, granularity]);

  if (!range || !data) {
    return (
      <div className="space-y-5">
        <PageTitle title="Leads" />
        <PeriodBar />
        <EmptyState title="No completed days in this period" />
      </div>
    );
  }

  const { overview: o, cohort, campaigns, topics, daily, bucketed, recent, own } = data;
  const isMeta = workspace === 'meta';
  const ownLabel = PLATFORM_LABELS[workspace];
  const wsColor = isMeta ? COLOR.meta : COLOR.google;
  const leadNoun = isMeta ? 'Meta lead-form leads' : 'Google lead-form leads';
  const directLabel = isMeta ? 'Direct Meta lead-form leads' : 'Direct Google lead-form leads';
  const total = cohort.leads.length - data.duplicates;
  const soldPct = ratioOrNull(data.sold, total);
  const revPerLead = ratioOrNull(data.revenueMinor, total);
  const costPerCustomer = data.spendMinor !== null && data.customers > 0 ? Math.round(data.spendMinor / data.customers) : null;
  const roas = data.revenueMinor > 0 ? ratioOrNull(data.revenueMinor, data.spendMinor) : null;
  const cpl = own.cplMinor;
  const comparison = data.prev ? `vs ${dateRange(data.prev)}` : undefined;
  const sparkOf = (pick: (d: (typeof daily)[number]) => number | null) => <Spark values={daily.map(pick)} color={wsColor} label="Daily trend" />;
  const noLeads = total === 0;

  const campaignSeries: ChartSeries[] = [
    ...data.campaignIdsShown.map<ChartSeries>((id, i) => ({ key: id, label: data.nameOf.get(id) ?? id, color: PALETTE[i % PALETTE.length]!, kind: 'bar', stackId: 'l', shape: SHAPES[i % SHAPES.length]! })),
    { key: 'other', label: 'Other', color: '#cbd5e1', kind: 'bar', stackId: 'l' },
  ];
  const statusSeries: ChartSeries[] = STATUSES.map((s, i) => ({ key: s.key, label: s.label, color: s.color, kind: 'bar', stackId: 'l', shape: SHAPES[i % SHAPES.length]! }));
  const leadRows: ChartRow[] = bucketed.map((b) => ({ key: b.key, label: b.label, incomplete: b.incomplete, ...(groupBy === 'campaign' ? b.byGroup : b.byStatus) }));
  const soldRows: ChartRow[] = bucketed.map((b) => ({ key: b.key, label: b.label, incomplete: b.incomplete, sold: b.paidFromLeads }));
  const reportedRows: ChartRow[] = bucketed.map((b) => ({ key: b.key, label: b.label, incomplete: b.incomplete, reported: isMeta ? b.reportedLeads : b.conversions, crm: b.leads }));
  const gapRows: ChartRow[] = bucketed.map((b) => ({ key: b.key, label: b.label, incomplete: b.incomplete, gap: (isMeta ? b.reportedLeads : b.conversions) === null ? null : (isMeta ? b.reportedLeads : b.conversions)! - b.leads }));
  const trendRows: ChartRow[] = bucketed.map((b) => {
    const results = isMeta ? b.reportedLeads : b.conversions;
    return { key: b.key, label: b.label, incomplete: b.incomplete, cost: results && b.spendMinor !== null ? Math.round(b.spendMinor / results) : null, conv: b.leads > 0 ? (b.soldLeads / b.leads) * 100 : null };
  });
  const reportedTotal = bucketed.reduce<number | null>((a, b) => ((isMeta ? b.reportedLeads : b.conversions) === null ? a : (a ?? 0) + (isMeta ? b.reportedLeads! : b.conversions!)), null);

  const toggle = (id: string) => {
    setCombinedShown(false);
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  };
  const chosen = campaigns.filter((c) => picked.includes(c.id));
  const comb: LeadGroupRow | null = chosen.length
    ? {
        id: 'combined',
        name: 'Combined calculation',
        leads: chosen.reduce((a, c) => a + c.leads, 0),
        sold: chosen.reduce((a, c) => a + c.sold, 0),
        payingCustomers: new Set(chosen.flatMap((c) => c.customerIds)).size,
        revenueMinor: chosen.reduce((a, c) => a + c.revenueMinor, 0),
        spendMinor: chosen.some((c) => c.spendMinor !== null) ? chosen.reduce((a, c) => a + (c.spendMinor ?? 0), 0) : null,
        customerIds: [],
      }
    : null;

  const row = (c: LeadGroupRow, strong = false) => {
    const cplRow = c.spendMinor !== null && c.leads > 0 ? Math.round(c.spendMinor / c.leads) : null;
    const cpc = c.spendMinor !== null && c.payingCustomers > 0 ? Math.round(c.spendMinor / c.payingCustomers) : null;
    const rpc = c.payingCustomers > 0 ? Math.round(c.revenueMinor / c.payingCustomers) : null;
    const r = c.revenueMinor > 0 ? ratioOrNull(c.revenueMinor, c.spendMinor) : null;
    return (
      <>
        <td className={tdr}>{count(c.leads)}</td>
        <td className={tdr}>{count(c.sold)}</td>
        <td className={tdr}>{c.leads ? pct(c.sold / c.leads, 1) : '–'}</td>
        <td className={tdr}>{count(c.payingCustomers)}</td>
        <td className={tdr}>{c.spendMinor === null ? '–' : money(c.spendMinor)}</td>
        <td className={tdr}>{cplRow === null ? '–' : money(cplRow)}</td>
        <td className={tdr}>{cpc === null ? '–' : money(cpc)}</td>
        <td className={tdr}>{money(c.revenueMinor)}</td>
        <td className={tdr}>{rpc === null ? '–' : money(rpc)}</td>
        <td className={`${tdr} ${strong ? 'font-semibold' : ''}`}>{r === null ? '–' : multiple(r)}</td>
      </>
    );
  };

  const funnel = [
    { label: 'Leads recognized', value: total },
    { label: 'Contacted or later', value: o.total - o.byStatus.new },
    { label: 'Qualified or later', value: o.byStatus.qualified + o.byStatus.converted },
    { label: 'Paid order (verified lead match)', value: data.sold },
  ];

  const groupTable = (title: string, subtitle: string, rows: LeadGroupRow[], nameHead: string) => (
    <Card title={title} subtitle={subtitle} className="min-w-0">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse [&_td]:!px-2 [&_th]:!px-2">
          <thead>
            <tr>
              <th scope="col" className={th}>{nameHead}</th>
              <th scope="col" className={thr}>Leads</th>
              <th scope="col" className={thr}>Sold</th>
              <th scope="col" className={thr}>Conversion</th>
              <th scope="col" className={thr}>Paying customers</th>
              <th scope="col" className={thr}>Spend</th>
              <th scope="col" className={thr}>CPL</th>
              <th scope="col" className={thr}>Cost / customer</th>
              <th scope="col" className={thr}>Revenue</th>
              <th scope="col" className={thr}>Revenue / customer</th>
              <th scope="col" className={thr}>Est. ROAS</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id}>
                <td className={td}>{c.name}</td>
                {row(c)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );

  return (
    <div className="space-y-5">
      <PageTitle
        title="Leads"
        sub={`Leads created in ${dateRange(range)} (${ownLabel}). Counted by creation day in Europe/Ljubljana.`}
        right={
          <span className="flex flex-wrap gap-1.5">
            <Badge tone="gray">CRM leads</Badge>
            <Badge tone="info">Simulated</Badge>
          </span>
        }
      />
      <PeriodBar />
      <InfoLine>All leads here are simulated for this demo. They come from a fixed seed, use synthetic identifiers only and are not connected to any real CRM or advertising account.</InfoLine>

      <Card title="All recognized leads in period" subtitle={`${ownLabel} lead forms. Counted once per platform lead id.`}>
        <div className="space-y-4 px-4 py-4 sm:px-5">
          <p className="text-sm text-ink">
            <span className="text-xs font-medium text-ink-3">How many leads did {ownLabel} bring, and how many became paying customers?</span>
            <br />
            <strong>Total leads in the period: {count(total)}</strong> · {count(data.sold)} with a verified paid order{soldPct !== null && ` (${pct(soldPct, 1)})`}.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Tile label="Total recognized leads" value={count(total)} note={`${directLabel} minus duplicates`} />
            <Tile label={directLabel} value={count(cohort.leads.length)} note="Created in the CRM from the platform's lead form" />
            {isMeta ? (
              <Tile label="Historical lead-sheet leads" value="" missing="No lead sheet connected in the demo" />
            ) : (
              <Tile label="Google conversions (platform-reported)" value={reportedTotal === null ? '' : count(reportedTotal)} missing={reportedTotal === null ? 'No platform rows in this period' : undefined} note="Not leads and not sales; never added to the total" />
            )}
            <Tile label="Excluded duplicate" value={count(data.duplicates)} note="Same platform lead id seen more than once" />
          </div>
          <ul className="list-disc space-y-1 pl-5 text-xs text-ink-3">
            <li>A lead is recognized when the CRM has a record created by the platform's lead form; the platform's own count is a separate figure.</li>
            <li>A sold lead is a lead whose id appears on a paid order. Similar names, amounts or dates never create a link.</li>
            {!isMeta && <li>Google conversions come from the ad platform and can be calls, clicks or forms. They are shown beside leads, never summed with them.</li>}
          </ul>
        </div>
      </Card>

      <Section
        title={isMeta ? 'Lead-form sources (Facebook/Instagram)' : 'Google lead-form sources'}
        description={`Leads and the paid orders verified against them, ${dateRange(range)}.`}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard size="primary" label="Leads" value={count(total)} delta={{ pct: relChange(total, data.prevCohort ? data.prevCohort.leads.length : null), goodWhen: 'up' }} comparison={comparison} sub={ownLabel} sparkline={sparkOf((x) => x.leads)} state={o.total === 0 && noLeads ? 'ok' : 'ok'} />
          <KpiCard size="primary" label="Sold leads" value={count(data.sold)} delta={{ pct: relChange(data.sold, data.prevSold), goodWhen: 'up' }} comparison={comparison} sub="Verified lead-id match" sparkline={sparkOf((x) => x.soldLeads)} />
          <KpiCard label="Conversion" value={soldPct === null ? '–' : pct(soldPct, 1)} state={soldPct === null ? 'no_data' : 'ok'} reason="No leads in this period" sub="Sold leads ÷ leads" />
          <KpiCard label="Total revenue (estimate)" value={money(data.revenueMinor)} sub="Paid orders of these leads, incl. VAT" note="Only paid orders carrying the lead's id. Other sales are not added." />
          <KpiCard label="Revenue per lead" value={money(revPerLead === null ? null : Math.round(revPerLead))} state={revPerLead === null ? 'no_data' : 'ok'} reason="No leads in this period" />
          <KpiCard label="Spend (lead campaigns)" value={money(data.spendMinor)} state={data.spendMinor === null ? 'no_data' : 'ok'} reason="No ad spend data for these campaigns" sub="Campaigns with leads in the period" sparkline={sparkOf((x) => x.spendMinor)} />
          <KpiCard label="Cost per customer" value={money(costPerCustomer)} state={costPerCustomer === null ? 'no_data' : 'ok'} reason="No paying customers from these leads" />
          <KpiCard label="Estimated ROAS" value={roas === null ? '–' : multiple(roas)} state={roas === null ? 'no_calc' : 'ok'} reason="Needs spend and verified revenue; none is verified here" note="Revenue verified through lead ids ÷ spend of the lead campaigns. Unlinked sales get no ROAS." />
        </div>
      </Section>

      <Card title="How it is calculated" subtitle="Three steps, each with its own evidence count." className="min-w-0">
        <div className="grid grid-cols-1 gap-4 px-4 py-4 sm:px-5 md:grid-cols-3">
          {[
            { n: 1, t: 'Lead acquisition', d: `${count(cohort.leads.length)} ${leadNoun.toLowerCase()} created in the period, ${count(data.withPlatformId)} with a platform lead id.` },
            { n: 2, t: 'Revenue observation', d: `${count(data.withOrderLead)} orders carry one of these lead ids; ${count(cohort.paidByLead.size)} leads have at least one paid order.` },
            { n: 3, t: 'Link evidence', d: `A link counts only when the order's lead id equals the platform lead id. ${count(data.sold)} leads are linked this way.` },
          ].map((s) => (
            <div key={s.n} className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-soft text-xs font-semibold text-brand">{s.n}</span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink">{s.t}</p>
                <p className="mt-0.5 text-xs leading-snug text-ink-3">{s.d}</p>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Section
        title="Leads by day"
        description="Leads by creation day; sold leads by the day of the order."
        action={<Segmented<GroupBy> label="Group leads by" value={groupBy} onChange={setGroupBy} options={[{ value: 'campaign', label: 'By campaign' }, { value: 'status', label: 'By status' }]} size="sm" />}
      >
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ChartCard
            title="Leads"
            total={count(total)}
            totalLabel="leads"
            className="min-w-0"
            note="Stacked by campaign or by current lead status. The latest day or month may be incomplete."
            render={(r) => <StackedBar data={leadRows} series={groupBy === 'campaign' ? campaignSeries : statusSeries} yFormat={countAxis} height={r.height} fixedWidth={r.fixedWidth} ariaLabel={`Leads by ${groupBy}, ${granularity}`} />}
          />
          <ChartCard
            title="Sold per day"
            total={count(data.sold)}
            totalLabel="paid orders from leads"
            className="min-w-0"
            note="Paid orders whose lead id matches a lead of this period, by order day."
            render={(r) => <StackedBar data={soldRows} series={[{ key: 'sold', label: 'Paid orders from leads', color: COLOR.good, kind: 'bar', stackId: 's' }]} yFormat={countAxis} height={r.height} fixedWidth={r.fixedWidth} ariaLabel="Paid orders from leads per day" />}
          />
        </div>
      </Section>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Lead-to-sale funnel" subtitle="Lead → qualified → paid order. A lead counts as sold only through a verified lead id.">
          <ul className="space-y-3 px-4 pb-3 sm:px-5">
            {funnel.map((f) => (
              <li key={f.label}>
                <div className="mb-1 flex justify-between text-[13px]">
                  <span className="text-ink-2">{f.label}</span>
                  <span className="tabular text-ink">
                    {count(f.value)} <span className="text-ink-3">({share(f.value, Math.max(total, 0))})</span>
                  </span>
                </div>
                <ProgressBar value={f.value} max={Math.max(total, 1)} label={f.label} color={wsColor} />
              </li>
            ))}
          </ul>
          <dl className="divide-y divide-line border-t border-line px-4 sm:px-5">
            <StatRow label={`${ownLabel} cost per lead`} value={cpl === null ? null : money(cpl)} hint={cpl === null ? 'No ad spend data' : undefined} />
            <StatRow label={isMeta ? 'Platform-reported leads' : 'Platform-reported conversions'} value={own.leads === null ? null : count(isMeta ? own.leads : (reportedTotal ?? 0))} />
          </dl>
        </Card>

        <Card title="Status breakdown" subtitle="Current status of leads created in the period" className="min-w-0">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse [&_td]:!px-2 [&_th]:!px-2">
              <thead>
                <tr>
                  <th scope="col" className={th}>Status</th>
                  <th scope="col" className={thr}>Leads</th>
                  <th scope="col" className={thr}>Share</th>
                </tr>
              </thead>
              <tbody>
                {STATUSES.map((s) => (
                  <tr key={s.key}>
                    <td className={td}><Badge tone={s.tone}>{s.label}</Badge></td>
                    <td className={tdr}>{count(o.byStatus[s.key])}</td>
                    <td className={tdr}><Value text={share(o.byStatus[s.key], o.total)} reason="No leads in this period" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <ChartCard
        title={isMeta ? 'Cost per lead and lead-to-paid conversion' : 'Cost per conversion and lead-to-paid conversion'}
        className="min-w-0"
        note={isMeta ? 'Cost per lead = spend ÷ platform-reported leads. Conversion = leads with a verified paid order ÷ leads created in the bucket.' : 'Cost per conversion = spend ÷ platform-reported conversions (not sales). Lead-to-paid conversion uses CRM lead-form leads and verified orders only.'}
        render={(r) => (
          <TimeSeriesChart
            data={trendRows}
            series={[
              { key: 'cost', label: isMeta ? 'Cost per lead' : 'Cost per conversion', color: wsColor, kind: 'line', format: (v) => money(v) },
              { key: 'conv', label: 'Lead-to-paid conversion (%)', color: COLOR.good, kind: 'line', axis: 'right', shape: 'diamond', format: (v) => `${v.toFixed(1)}%` },
            ]}
            yFormat={moneyAxis}
            rightFormat={(v) => `${Math.round(v)}%`}
            height={r.height}
            fixedWidth={r.fixedWidth}
            ariaLabel="Cost per result and lead-to-paid conversion"
          />
        )}
      />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-1">
        <Card
          title="By lead campaign"
          subtitle="Tick campaigns and press Combined calculation to add them up. Revenue only from paid orders linked by lead id."
          actions={
            <Button variant="secondary" disabled={picked.length === 0} onClick={() => setCombinedShown(true)}>
              Combined calculation
            </Button>
          }
        >
          {campaigns.length === 0 ? (
            <div className="p-4">
              <EmptyState title="No lead campaigns in this period" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse [&_td]:!px-2 [&_th]:!px-2">
                <thead>
                  <tr>
                    <th scope="col" className={`${th} w-8`}><span className="sr-only">Select</span></th>
                    <th scope="col" className={th}>Campaign</th>
                    <th scope="col" className={thr}>Leads</th>
                    <th scope="col" className={thr}>Sold</th>
                    <th scope="col" className={thr}>Conversion</th>
                    <th scope="col" className={thr}>Paying customers</th>
                    <th scope="col" className={thr}>Spend</th>
                    <th scope="col" className={thr}>CPL</th>
                    <th scope="col" className={thr}>Cost / customer</th>
                    <th scope="col" className={thr}>Revenue</th>
                    <th scope="col" className={thr}>Revenue / customer</th>
                    <th scope="col" className={thr}>Est. ROAS</th>
                  </tr>
                </thead>
                <tbody>
                  {campaigns.map((c) => (
                    <tr key={c.id}>
                      <td className={td}>
                        <input type="checkbox" aria-label={`Select ${c.name}`} checked={picked.includes(c.id)} onChange={() => toggle(c.id)} className="h-4 w-4 rounded border-slate-300" />
                      </td>
                      <td className={td}>{c.name}</td>
                      {row(c)}
                    </tr>
                  ))}
                  {combinedShown && comb && (
                    <tr className="bg-slate-50 font-semibold text-ink">
                      <td className={td} />
                      <td className={td}>Combined ({chosen.length} campaigns)</td>
                      {row(comb, true)}
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {groupTable(isMeta ? 'By topic' : 'By campaign type', isMeta ? 'Campaigns grouped by product topic.' : 'Campaigns grouped by Google campaign type.', topics.filter((t) => t.leads > 0 || (t.spendMinor ?? 0) > 0), isMeta ? 'Topic' : 'Campaign type')}
      </div>

      <Section
        title={isMeta ? 'Meta results vs CRM lead records' : 'Google conversions vs CRM lead records'}
        description={isMeta ? 'The platform counts leads in its own system; the CRM counts records it received. Differences are shown, not hidden.' : 'Conversions are an ad-platform count and can be any action. CRM lead records are form submissions. They are different result types and are never added together.'}
      >
        <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <KpiCard label={isMeta ? 'Platform-reported leads' : 'Google conversions (platform-reported)'} value={reportedTotal === null ? '–' : count(reportedTotal)} state={reportedTotal === null ? 'no_data' : 'ok'} reason="No platform rows in this period" />
          <KpiCard label="CRM lead records" value={count(cohort.leads.length)} sub={directLabel} />
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ChartCard
            title={isMeta ? 'Reported leads vs CRM records' : 'Conversions vs CRM records'}
            className="min-w-0"
            note="A day without platform rows is no data, not zero."
            render={(r) => (
              <TimeSeriesChart
                data={reportedRows}
                series={[
                  { key: 'reported', label: isMeta ? 'Platform-reported leads' : 'Platform-reported conversions', color: wsColor, kind: 'line', format: (v) => count(v) },
                  { key: 'crm', label: 'CRM lead records', color: COLOR.combined, kind: 'line', shape: 'square', format: (v) => count(v) },
                ]}
                yFormat={countAxis}
                height={r.height}
                fixedWidth={r.fixedWidth}
                ariaLabel="Reported results versus CRM lead records"
              />
            )}
          />
          <ChartCard
            title="Difference per day"
            className="min-w-0"
            note="Platform-reported minus CRM records. Positive means the platform counted more."
            render={(r) => <StackedBar data={gapRows} series={[{ key: 'gap', label: 'Reported minus CRM', color: COLOR.neutral, kind: 'bar', stackId: 'g', negativeColor: COLOR.bad }]} yFormat={countAxis} height={r.height} fixedWidth={r.fixedWidth} ariaLabel="Difference between reported results and CRM records" />}
          />
        </div>
        {!isMeta && data.conversions.length > 0 && (
          <Card title="Conversions by campaign" subtitle="Platform-reported. Not verified sales." className="mt-4 min-w-0">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse [&_td]:!px-2 [&_th]:!px-2">
                <thead>
                  <tr>
                    <th scope="col" className={th}>Campaign</th>
                    <th scope="col" className={th}>Type</th>
                    <th scope="col" className={thr}>Clicks</th>
                    <th scope="col" className={thr}>Conversions</th>
                    <th scope="col" className={thr}>Cost per conversion</th>
                  </tr>
                </thead>
                <tbody>
                  {data.conversions.map((c) => (
                    <tr key={c.id}>
                      <td className={td}>{c.name}</td>
                      <td className={td}>{c.type || '–'}</td>
                      <td className={tdr}>{count(c.clicks)}</td>
                      <td className={tdr}>{count(c.conversions)}</td>
                      <td className={tdr}>{c.spendMinor !== null && c.conversions > 0 ? money(Math.round(c.spendMinor / c.conversions)) : '–'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </Section>

      <Section title="For manual review" description="Records worth a look; nothing here changes the figures above.">
        <div className="space-y-3">
          <Collapsible title="Recent leads" hint={`Newest ${RECENT} in the period. Identifiers are synthetic.`} defaultOpen>
            <section aria-label="Recent leads">
              {recent.length === 0 ? (
                <div className="p-4">
                  <EmptyState title="No leads in this period" />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse [&_td]:!px-2 [&_th]:!px-2">
                    <thead>
                      <tr>
                        <th scope="col" className={th}>Lead</th>
                        <th scope="col" className={th}>Created</th>
                        <th scope="col" className={th}>Channel</th>
                        <th scope="col" className={th}>Campaign</th>
                        <th scope="col" className={th}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recent.map((l) => (
                        <tr key={l.id}>
                          <td className={`${td} num`}>{l.id}</td>
                          <td className={td}>{dateTime(l.createdAt)}</td>
                          <td className={td}>{CHANNEL_LABEL[l.channel]}</td>
                          <td className={td}>{l.campaignId ? (data.nameOf.get(l.campaignId) ?? l.campaignId) : <Value text="–" reason="Not from a paid campaign" />}</td>
                          <td className={td}><Badge tone={STATUS[l.status].tone}>{STATUS[l.status].label}</Badge></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </Collapsible>
          <Collapsible title="Duplicate platform lead ids" hint="Counted once in the total above">
            <p className="p-4 text-sm text-ink-2 sm:px-5">
              {data.duplicates === 0 ? 'No duplicate platform lead ids in this period.' : `${count(data.duplicates)} lead records share a platform lead id with another record and are counted once.`}
            </p>
          </Collapsible>
          <Collapsible title="Leads without a campaign" hint="Cannot be tied to spend">
            <p className="p-4 text-sm text-ink-2 sm:px-5">
              {count(cohort.leads.filter((l) => !l.campaignId).length)} lead records in this period have no campaign id. They are in the totals but in no campaign row.
            </p>
          </Collapsible>
        </div>
      </Section>
      <div className="hidden">
        <Pill color={wsColor}>{ownLabel}</Pill>
        {ljDay('2000-01-01T00:00:00Z')}
      </div>
    </div>
  );
}
