import { useMemo } from 'react';
import { leadsOverview, leadsSeries, performanceTotals, type LeadChannel, type LeadStatus } from '@sedem-ads/analytics-core';
import { Badge, Card, EmptyState, KpiCard, Notice, PageTitle, ProgressBar, Value, type Tone } from '../components/ui';
import { PeriodBar } from '../components/PeriodBar';
import { ChartCard } from '../components/charts/ChartCard';
import { StackedBar, type ChartRow, type ChartSeries } from '../components/charts/TimeSeriesChart';
import { COLOR, SHAPES } from '../components/charts/colors';
import { PLATFORM_LABELS, useAppState } from '../state/AppState';
import { getDataset } from '../lib/data';
import { count, countAxis, dateRange, dateTime, money, pct, share } from '../lib/format';

const CHANNELS: readonly { key: LeadChannel; label: string; color: string }[] = [
  { key: 'meta_lead_form', label: 'Meta lead form', color: COLOR.meta },
  { key: 'google_lead_form', label: 'Google lead form', color: COLOR.google },
  { key: 'website_form', label: 'Website form', color: '#0d9488' },
  { key: 'chatbot_ai', label: 'Chatbot / AI', color: '#db2777' },
  { key: 'partner_portal', label: 'Partner portal', color: '#7c3aed' },
  { key: 'phone', label: 'Phone', color: COLOR.neutral },
];
const CHANNEL_LABEL = Object.fromEntries(CHANNELS.map((c) => [c.key, c.label])) as Record<LeadChannel, string>;

const STATUSES: readonly { key: LeadStatus; label: string; tone: Tone }[] = [
  { key: 'new', label: 'New', tone: 'info' },
  { key: 'contacted', label: 'Contacted', tone: 'neutral' },
  { key: 'qualified', label: 'Qualified', tone: 'warn' },
  { key: 'converted', label: 'Converted', tone: 'good' },
  { key: 'lost', label: 'Lost', tone: 'bad' },
];
const STATUS = Object.fromEntries(STATUSES.map((s) => [s.key, s])) as Record<LeadStatus, (typeof STATUSES)[number]>;

const RECENT = 15;

const dayFormat = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Ljubljana', year: 'numeric', month: '2-digit', day: '2-digit' });
const ljubljanaDay = (iso: string): string => dayFormat.format(new Date(iso));

const th = 'whitespace-nowrap px-4 py-2.5 text-left text-xs font-medium text-ink-3';
const thr = `${th} !text-right`;
const td = 'whitespace-nowrap border-t border-line px-4 py-2.5 text-[13px] text-ink-2';
const tdr = `${td} tabular text-right`;

export default function LeadsPage() {
  const { workspace, range, granularity } = useAppState();
  const ds = getDataset();

  const data = useMemo(() => {
    if (!range) return null;
    const overview = leadsOverview(ds, { range, view: workspace });
    const series = leadsSeries(ds, { range, view: workspace, granularity });
    const meta = performanceTotals(ds, 'meta', range);
    const google = performanceTotals(ds, 'google', range);
    const recent = ds.leads
      .filter((l) => l.platform === workspace)
      .filter((l) => {
        const d = ljubljanaDay(l.createdAt);
        return d >= range.start && d <= range.end;
      })
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : a.id < b.id ? 1 : -1))
      .slice(0, RECENT);
    return { overview, series, meta, google, recent };
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

  const { overview: o, series, meta, google, recent } = data;
  const rows: ChartRow[] = series.map((p) => ({ key: p.key, label: p.label, incomplete: p.incomplete, ...p.byChannel }));
  const chartSeries: ChartSeries[] = CHANNELS.filter((c) => (workspace === 'meta' ? c.key === 'meta_lead_form' : c.key === 'google_lead_form')).map((c, i) => ({
    key: c.key,
    label: c.label,
    color: c.color,
    kind: 'bar',
    stackId: 'leads',
    shape: SHAPES[i % SHAPES.length]!,
  }));
  const noSpend = 'No ad spend data for this platform in this period';
  const own = workspace === 'meta' ? meta : google;
  const ownLabel = PLATFORM_LABELS[workspace];
  const converted = o.byStatus.converted;
  const funnel = [
    { label: 'Leads created', value: o.total },
    { label: 'Contacted or later', value: o.total - o.byStatus.new },
    { label: 'Qualified or later', value: o.byStatus.qualified + o.byStatus.converted },
    { label: 'Converted to a sale', value: converted },
  ];

  return (
    <div className="space-y-5">
      <PageTitle
        title="Leads"
        sub={`Leads created in ${dateRange(range)} (${ownLabel}). Counted by creation day in Europe/Ljubljana.`}
        right={<Badge tone="info">Simulated</Badge>}
      />
      <PeriodBar />
      <Notice tone="info" title="Simulated data">
        All leads here are simulated for this demo. They are generated from a fixed seed, use synthetic identifiers only and are not connected to any real CRM or advertising account.
      </Notice>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard size="primary" label="Total leads" value={count(o.total)} sub={`${ownLabel} view`} />
        <KpiCard size="primary" label="Converted leads" value={count(o.converted)} sub={`${pct(o.conversionRate, 1)} of leads`} state={o.total === 0 ? 'no_data' : 'ok'} reason="No leads in this period" />
        <KpiCard label={`${ownLabel} cost per lead`} value={money(own.cplMinor)} sub={`${count(own.leads)} platform leads`} state={own.cplMinor === null ? 'no_data' : 'ok'} reason={noSpend} />
        <KpiCard label="Lost leads" value={count(o.byStatus.lost)} sub={`${pct(o.total ? o.byStatus.lost / o.total : null, 0)} of leads`} state={o.total === 0 ? 'no_data' : 'ok'} reason="No leads in this period" />
      </div>
      <p className="text-xs text-ink-3">
        Cost per lead = ad spend divided by platform-reported lead-form leads, computed from period sums. Organic channels (website, chatbot, partners, phone) have no ad cost and are not part of it.
      </p>

      <ChartCard
        title="Leads over time"
        total={count(o.total)}
        totalLabel="Leads in period"
        note="Stacked by channel. The latest day or month may be incomplete."
        render={(r) => <StackedBar data={rows} series={chartSeries} yFormat={countAxis} height={r.height} fixedWidth={r.fixedWidth} ariaLabel={`Leads by channel, ${granularity}`} />}
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Lead-to-sale funnel" subtitle="Lead status in the period. A lead counts as converted only when its status says so; no sale is matched by date or amount.">
          <ul className="space-y-3 px-4 pb-4 sm:px-5">
            {funnel.map((f) => (
              <li key={f.label}>
                <div className="mb-1 flex justify-between text-[13px]">
                  <span className="text-ink-2">{f.label}</span>
                  <span className="tabular text-ink">
                    {count(f.value)} <span className="text-ink-3">({share(f.value, o.total)})</span>
                  </span>
                </div>
                <ProgressBar value={f.value} max={Math.max(o.total, 1)} label={f.label} />
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Status breakdown" subtitle="Current status of leads created in the period">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
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

      <Card title="By channel" subtitle="Where leads came from (lead source table)">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th scope="col" className={th}>Channel</th>
                <th scope="col" className={thr}>Leads</th>
                <th scope="col" className={thr}>Share</th>
              </tr>
            </thead>
            <tbody>
              {CHANNELS.map((c) => (
                <tr key={c.key}>
                  <td className={td}>
                    <span className="mr-2 inline-block h-2.5 w-2.5 rounded-[3px] align-[-1px]" style={{ background: c.color }} aria-hidden />
                    {c.label}
                  </td>
                  <td className={tdr}>{count(o.byChannel[c.key])}</td>
                  <td className={tdr}><Value text={share(o.byChannel[c.key], o.total)} reason="No leads in this period" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <section aria-label="Recent leads">
        <Card title="Recent leads" subtitle={`Newest ${RECENT} in the period. Identifiers are synthetic.`}>
          {recent.length === 0 ? (
            <div className="p-4">
              <EmptyState title="No leads in this period" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
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
                      <td className={td}>{l.campaignId ?? <Value text="–" reason="Not from a paid campaign" />}</td>
                      <td className={td}><Badge tone={STATUS[l.status].tone}>{STATUS[l.status].label}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </section>
    </div>
  );
}
