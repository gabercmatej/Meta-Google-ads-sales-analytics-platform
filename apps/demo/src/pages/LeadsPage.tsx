import { useMemo } from 'react';
import { leadsOverview, leadsSeries, performanceTotals, type LeadChannel, type LeadStatus } from '@sedem-ads/analytics-core';
import { Badge, EmptyState, PageHeader, Value, type Tone } from '../components/ui';
import { KpiCard } from '../components/KpiCard';
import { ChartCard } from '../components/charts/ChartCard';
import { StackedBar, type ChartRow, type ChartSeries } from '../components/charts/TimeSeriesChart';
import { COLOR, SHAPES } from '../components/charts/colors';
import { Notice } from '../components/Notes';
import { PLATFORM_LABELS, useAppState } from '../state/AppState';
import { getDataset } from '../lib/data';
import { count, countAxis, dateRange, dateTime, money, pct, share } from '../lib/format';
import './analytics.css';
import './leads.css';

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

export default function LeadsPage() {
  const { platform, range, granularity } = useAppState();
  const ds = getDataset();

  const data = useMemo(() => {
    if (!range) return null;
    const overview = leadsOverview(ds, { range, view: platform });
    const series = leadsSeries(ds, { range, view: platform, granularity });
    const meta = performanceTotals(ds, 'meta', range);
    const google = performanceTotals(ds, 'google', range);
    const combined = performanceTotals(ds, 'combined', range);
    const recent = ds.leads
      .filter((l) => platform === 'combined' || l.platform === platform)
      .filter((l) => {
        const d = ljubljanaDay(l.createdAt);
        return d >= range.start && d <= range.end;
      })
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : a.id < b.id ? 1 : -1))
      .slice(0, RECENT);
    return { overview, series, meta, google, combined, recent };
  }, [ds, range, platform, granularity]);

  if (!range || !data) {
    return (
      <>
        <PageHeader title="Leads" />
        <EmptyState title="No completed days in this period" />
      </>
    );
  }

  const { overview: o, series, meta, google, combined, recent } = data;
  const rows: ChartRow[] = series.map((p) => ({ key: p.key, label: p.label, incomplete: p.incomplete, ...p.byChannel }));
  const chartSeries: ChartSeries[] = CHANNELS.filter((c) => {
    if (platform === 'meta') return c.key === 'meta_lead_form';
    if (platform === 'google') return c.key === 'google_lead_form';
    return true;
  }).map((c, i) => ({ key: c.key, label: c.label, color: c.color, kind: 'bar', stackId: 'leads', shape: SHAPES[i % SHAPES.length] }));
  const noSpend = 'No ad spend data for this platform in this period';

  return (
    <div className="stack">
      <PageHeader
        title="Leads"
        description={`Leads created in ${dateRange(range)} (${PLATFORM_LABELS[platform]}). Counted by creation day in Europe/Ljubljana.`}
        badge={<Badge tone="info">Simulated</Badge>}
      />
      <Notice>
        All leads here are simulated for this demo. They are generated from a fixed seed, use synthetic identifiers only and are not connected to any real CRM or advertising account.
      </Notice>

      <div className="kpi-grid">
        <KpiCard label="Total leads" value={count(o.total)} sub={`${PLATFORM_LABELS[platform]} view`} />
        <KpiCard label="Converted leads" value={count(o.converted)} sub={`${pct(o.conversionRate, 1)} of leads`} noDataReason="No leads in this period" />
        <KpiCard label="Meta cost per lead" value={money(meta.cplMinor)} sub={`${count(meta.leads)} platform leads`} noDataReason={noSpend} />
        <KpiCard label="Google cost per lead" value={money(google.cplMinor)} sub={`${count(google.leads)} platform leads`} noDataReason={noSpend} />
        <KpiCard label="Combined cost per lead" value={money(combined.cplMinor)} sub="Complete days only" noDataReason="Needs both platforms on at least one day" />
      </div>
      <p className="muted small">
        Cost per lead = ad spend divided by platform-reported lead-form leads, computed from period sums. Organic channels (website, chatbot, partners, phone) have no ad cost and are not part of it.
      </p>

      <ChartCard
        title="Leads over time"
        total={count(o.total)}
        totalLabel="Leads in period"
        note="Stacked by channel. The latest day or month may be incomplete."
        render={(r) => (
          <StackedBar data={rows} series={chartSeries} yFormat={countAxis} height={r.height} fixedWidth={r.fixedWidth} ariaLabel={`Leads by channel, ${granularity}`} />
        )}
      />

      <div className="grid-2">
        <section className="card">
          <header className="card-head">
            <div>
              <h3 className="card-title">By channel</h3>
              <p className="card-sub">Where leads came from</p>
            </div>
          </header>
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th scope="col">Channel</th>
                  <th scope="col" className="r">Leads</th>
                  <th scope="col" className="r">Share</th>
                </tr>
              </thead>
              <tbody>
                {CHANNELS.map((c) => (
                  <tr key={c.key}>
                    <td>
                      <span className="swatch" style={{ background: c.color }} aria-hidden="true" />
                      {c.label}
                    </td>
                    <td className="r num">{count(o.byChannel[c.key])}</td>
                    <td className="r num">
                      <Value text={share(o.byChannel[c.key], o.total)} reason="No leads in this period" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="card">
          <header className="card-head">
            <div>
              <h3 className="card-title">Status breakdown</h3>
              <p className="card-sub">Current status of leads created in the period</p>
            </div>
          </header>
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th scope="col">Status</th>
                  <th scope="col" className="r">Leads</th>
                  <th scope="col" className="r">Share</th>
                </tr>
              </thead>
              <tbody>
                {STATUSES.map((s) => (
                  <tr key={s.key}>
                    <td>
                      <Badge tone={s.tone}>{s.label}</Badge>
                    </td>
                    <td className="r num">{count(o.byStatus[s.key])}</td>
                    <td className="r num">
                      <Value text={share(o.byStatus[s.key], o.total)} reason="No leads in this period" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <section className="card" aria-label="Recent leads">
        <header className="card-head">
          <div>
            <h3 className="card-title">Recent leads</h3>
            <p className="card-sub">Newest {RECENT} in the period. Identifiers are synthetic.</p>
          </div>
        </header>
        {recent.length === 0 ? (
          <EmptyState title="No leads in this period" />
        ) : (
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th scope="col">Lead</th>
                  <th scope="col">Created</th>
                  <th scope="col">Channel</th>
                  <th scope="col">Campaign</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((l) => (
                  <tr key={l.id}>
                    <td className="num">{l.id}</td>
                    <td>{dateTime(l.createdAt)}</td>
                    <td>{CHANNEL_LABEL[l.channel]}</td>
                    <td>{l.campaignId ?? <Value text="–" reason="Not from a paid campaign" />}</td>
                    <td>
                      <Badge tone={STATUS[l.status].tone}>{STATUS[l.status].label}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
