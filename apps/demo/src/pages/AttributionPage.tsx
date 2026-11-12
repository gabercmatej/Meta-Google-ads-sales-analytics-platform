import { useMemo, useRef, useState } from 'react';
import { orderAttributionRows, type OrderAttributionRow } from '@sedem-ads/analytics-core';
import { Badge, Button, Card, EmptyState, KpiCard, PageTitle, ProgressBar, Section, Tabs, Value, inputCls, type Tone } from '../components/ui';
import { PeriodBar } from '../components/PeriodBar';
import { ChartCard } from '../components/charts/ChartCard';
import { StackedBar, type ChartRow } from '../components/charts/TimeSeriesChart';
import { COLOR, sourceColor, sourceLabel } from '../components/charts/colors';
import { InfoLine, td, tdr, th, thr } from '../components/ResultsParts';
import { useAppState } from '../state/AppState';
import { getDataset } from '../lib/data';
import { usablePreviousRange } from '../lib/useView';
import { combinedFigures, GROUP_LABEL, type SourceGroup } from '../lib/combined';
import { attributionFigures, googleLinkByCampaign, metaLinkByLevel, type SourceTileKey } from '../lib/resultsData';
import { count, dateRange, dateTime, money, moneyAxis, multiple, share } from '../lib/format';

type AttrStatus = OrderAttributionRow['attribution']['status'];
type StatusFilter = 'all' | AttrStatus;
type MetaLevel = 'campaign' | 'adset' | 'ad';

const STATUS_LABEL: Record<AttrStatus, string> = {
  attributed_paid_ad: 'Verified paid-ad attribution',
  source_only: 'Source label only',
  unknown: 'Unknown',
  conflict: 'Conflicting evidence',
};
const STATUS_TONE: Record<AttrStatus, Tone> = { attributed_paid_ad: 'good', source_only: 'neutral', unknown: 'neutral', conflict: 'bad' };

const EVIDENCE_LABEL: Record<string, string> = {
  verified_lead_match: 'Verified lead match',
  click_id: 'Click id',
  platform_reported: 'Platform-reported (not proof)',
  source_label: 'Source label (not proof)',
};

const TILE_TEXT: Record<SourceTileKey, { label: string; note: string }> = {
  meta: { label: 'Meta', note: 'Verified through a lead form id or a Meta click id.' },
  google: { label: 'Google', note: 'Verified through a stored Google click id.' },
  partner_portal: { label: 'Partner portal', note: 'Orders the partner portal reports under its own id.' },
  chatbot_ai: { label: 'Chatbot/AI', note: 'Orders started in the website assistant.' },
  other_verified: { label: 'Other verified', note: 'Other sources with a hard identifier.' },
  unknown: { label: 'Unknown/unattributed', note: 'No hard evidence. Stays unlinked and gets no ROAS.' },
  conflicting: { label: 'Conflicting evidence', note: 'Evidence for both platforms. Flagged, not resolved.' },
};

const RULES: readonly { rule: string; why: string; effect: string }[] = [
  { rule: 'Only a source label', why: 'A label is typed by a person or taken from a form. It is a classification.', effect: 'Counted in the source table, never in verified revenue.' },
  { rule: 'Click id of the other platform', why: 'gclid is valid only for Google and fbclid only for Meta.', effect: 'Ignored as evidence for the other platform.' },
  { rule: 'Platform-reported conversion counts', why: 'Platforms report totals, not which order they belong to.', effect: 'Shown beside sales, never used to link an order.' },
  { rule: 'Similar date, amount or name', why: 'Coincidences are common and prove nothing.', effect: 'Never used. An unlinked sale stays unlinked.' },
  { rule: 'Evidence for both platforms', why: 'The order carries hard evidence for Meta and Google.', effect: 'Flagged as conflicting and left out of ROAS.' },
];

function evidenceChips(r: OrderAttributionRow): { text: string; tone: Tone }[] {
  const a = r.attribution;
  if (a.status === 'attributed_paid_ad') {
    const kinds = [...new Set(a.evidence.map((e) => EVIDENCE_LABEL[e.kind] ?? e.kind))];
    const chips: { text: string; tone: Tone }[] = [{ text: sourceLabel(a.platform), tone: a.platform === 'meta' ? 'meta' : 'google' }, ...kinds.map((k) => ({ text: k, tone: 'good' as Tone }))];
    if (a.labelDisagrees) chips.push({ text: 'Customer label names a different platform', tone: 'neutral' });
    return chips;
  }
  if (a.status === 'source_only') return [{ text: `Label "${a.label}" without hard evidence`, tone: 'neutral' }];
  if (a.status === 'conflict') return [{ text: `Evidence for both ${a.platforms.map(sourceLabel).join(' and ')}`, tone: 'bad' }];
  return [{ text: 'No evidence', tone: 'neutral' }];
}

const PAGE = 25;
const LEVEL_LABEL: Record<MetaLevel, string> = { campaign: 'Campaign', adset: 'Ad set', ad: 'Ad' };

export default function AttributionPage() {
  const { range } = useAppState();
  const ds = getDataset();
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [limit, setLimit] = useState(PAGE);
  const [level, setLevel] = useState<MetaLevel>('campaign');
  const diagRef = useRef<HTMLDivElement>(null);

  const data = useMemo(() => {
    if (!range) return null;
    const prev = usablePreviousRange(range);
    const cur = combinedFigures(ds, range);
    const before = prev ? combinedFigures(ds, prev) : null;
    const fig = attributionFigures(ds, range);
    const rows = orderAttributionRows(ds, { range, limit: 1_000_000 });
    const metaRows = metaLinkByLevel(ds, range, level);
    const googleRows = googleLinkByCampaign(ds, range);
    // Orders of direct Meta leads, by order day: leads and paid orders carrying a verified lead match.
    const metaOrders = rows.filter((r) => r.order.status === 'paid' && r.attribution.status === 'attributed_paid_ad' && r.attribution.platform === 'meta');
    return { prev, cur, before, fig, rows, metaRows, googleRows, metaOrders };
  }, [ds, range, level]);

  if (!range || !data) {
    return (
      <div className="space-y-5">
        <PageTitle title="Combined sales attribution" />
        <PeriodBar />
        <EmptyState title="No completed days in this period" />
      </div>
    );
  }
  const { prev, cur, before, fig, rows, metaRows, googleRows, metaOrders } = data;
  const total = fig.paidRevenueMinor;
  const planted = ds.planted?.labelOnlyGoogleOrderId;
  const plantedRow = rows.find((r) => r.order.id === planted);
  const sum = (xs: { orders: number; revenueMinor: number }[]) => ({ orders: xs.reduce((a, x) => a + x.orders, 0), revenueMinor: xs.reduce((a, x) => a + x.revenueMinor, 0) });
  const metaLabelOnly = sum(rows.filter((r) => r.order.status === 'paid' && r.attribution.status === 'source_only' && /facebook|meta|instagram/.test(r.attribution.label.toLowerCase())).map((r) => ({ orders: 1, revenueMinor: r.order.amountMinor })));
  const googleLabelOnly = sum(rows.filter((r) => r.order.status === 'paid' && r.attribution.status === 'source_only' && /google/.test(r.attribution.label.toLowerCase())).map((r) => ({ orders: 1, revenueMinor: r.order.amountMinor })));
  const tilesSum = fig.tiles.reduce((a, t) => a + t.orders, 0);
  const coverage = fig.paidOrders > 0 ? fig.verifiedOrders / fig.paidOrders : null;

  const shown = (filter === 'all' ? rows : rows.filter((r) => r.attribution.status === filter)).slice().sort((a, b) => (a.order.orderedAt < b.order.orderedAt ? 1 : -1));

  const groupRows: { group: SourceGroup; spend: number | null; roas: number | null }[] = [
    { group: 'meta', spend: cur.spend.metaMinor, roas: cur.roas.meta },
    { group: 'google', spend: cur.spend.googleMinor, roas: cur.roas.google },
    { group: 'partner_portal', spend: null, roas: null },
    { group: 'chatbot_ai', spend: null, roas: null },
    { group: 'other_verified', spend: null, roas: null },
    { group: 'unattributed', spend: null, roas: null },
  ];
  const groupOf = (c: typeof cur | null, g: SourceGroup) => c?.groups.find((x) => x.group === g) ?? null;
  const customersMeta = metaOrders.length;

  const compareRows: ChartRow[] = [
    { key: 'meta', label: 'Meta', revenue: cur.verified.meta.revenueMinor, spend: cur.spend.metaMinor },
    { key: 'google', label: 'Google', revenue: cur.verified.google.revenueMinor, spend: cur.spend.googleMinor },
  ];

  const funnel = [
    { label: 'Leads (ad platforms)', value: fig.leads.total },
    { label: 'Qualified or converted', value: fig.leads.qualified },
    { label: 'Sold leads (verified lead match)', value: fig.leads.sold },
    { label: 'Paying customers', value: fig.leads.payingCustomers },
  ];

  const lead = fig.leads;
  const notLinkedTotal = fig.notLinked.reduce((a, n) => a + n.orders, 0);

  return (
    <div className="space-y-5">
      <PageTitle
        title="Combined sales attribution"
        sub={`Paid orders in ${dateRange(range)}. Verified attribution needs hard evidence; a customer's own source label is only a classification.`}
        right={
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone="combined">Meta + Google</Badge>
            <Button variant="secondary" onClick={() => diagRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
              Unlinked sales diagnostics
            </Button>
          </span>
        }
      />
      <p className="max-w-4xl text-sm text-ink-2">
        This page shows where each paid order came from and how sure we are. A paid order is linked to an ad only through a lead id or a click id that belongs to that platform. Dates, amounts and names are never used to guess a link, so an unlinked sale stays unlinked and gets no ROAS.
      </p>
      <PeriodBar />

      <Card title="Where paid orders came from" subtitle={`${count(fig.paidOrders)} paid orders, ${money(fig.paidRevenueMinor)} incl. VAT. Every paid order is in exactly one tile.`}>
        <div className="grid grid-cols-1 gap-3 px-4 pb-3 sm:grid-cols-2 sm:px-5 xl:grid-cols-4">
          {fig.tiles.map((t) => {
            const meta = TILE_TEXT[t.key];
            const col = t.key === 'unknown' ? sourceColor('unknown') : t.key === 'conflicting' ? sourceColor('conflicting') : sourceColor(t.key);
            return (
              <div key={t.key} className="rounded-xl border border-line px-3.5 py-3" data-testid={`tile-${t.key}`}>
                <p className="flex items-center gap-2 text-xs font-medium text-ink-3">
                  <span className="inline-block h-2.5 w-2.5 rounded-[3px]" style={{ background: col }} aria-hidden />
                  {meta.label}
                </p>
                <p className="tabular mt-1 text-xl font-bold leading-none text-ink">{count(t.orders)}</p>
                <p className="tabular mt-1 text-[13px] text-ink-2">
                  {money(t.revenueMinor)} <span className="text-ink-3">({share(t.revenueMinor, total)})</span>
                </p>
                <p className="mt-1.5 text-xs leading-snug text-ink-3">{meta.note}</p>
              </div>
            );
          })}
        </div>
        <p className="px-4 pb-4 text-xs text-ink-3 sm:px-5" data-testid="coverage-line">
          Evidence coverage: {count(fig.verifiedOrders)} of {count(fig.paidOrders)} paid orders ({coverage === null ? 'no paid orders' : share(fig.verifiedOrders, fig.paidOrders)}) carry hard evidence for a paid platform. Tiles add up to {count(tilesSum)} paid orders{tilesSum === fig.paidOrders ? ', reconciled.' : '. Does not reconcile.'}
        </p>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Verified sources by detailed label" subtitle="The label the customer or operator recorded, with the group it falls into." className="min-w-0">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse [&_td]:!px-2.5 [&_th]:!px-2.5">
              <thead>
                <tr>
                  <th scope="col" className={th}>Label</th>
                  <th scope="col" className={th}>Group</th>
                  <th scope="col" className={thr}>Orders</th>
                  <th scope="col" className={thr}>Revenue</th>
                </tr>
              </thead>
              <tbody>
                {fig.labels.length === 0 && (
                  <tr>
                    <td className={td} colSpan={4}>No paid orders in this period.</td>
                  </tr>
                )}
                {fig.labels.map((l) => (
                  <tr key={l.label}>
                    <td className={td}>{l.label}</td>
                    <td className={td}>{GROUP_LABEL[(l.group === 'conflicting' ? 'unattributed' : l.group) as SourceGroup] ?? l.group}</td>
                    <td className={tdr}>{count(l.orders)}</td>
                    <td className={tdr}>{money(l.revenueMinor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <Card title="Evidence type" subtitle="What links a paid order to a source." className="min-w-0">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse [&_td]:!px-2.5 [&_th]:!px-2.5">
              <thead>
                <tr>
                  <th scope="col" className={th}>Evidence</th>
                  <th scope="col" className={thr}>Orders</th>
                  <th scope="col" className={thr}>Revenue</th>
                  <th scope="col" className={thr}>Share</th>
                </tr>
              </thead>
              <tbody>
                {fig.evidence.map((e) => (
                  <tr key={e.key}>
                    <td className={td}>
                      <span className="font-medium text-ink">{e.label}</span>
                      <span className="block text-xs text-ink-3">{e.hint}</span>
                    </td>
                    <td className={tdr}>{count(e.orders)}</td>
                    <td className={tdr}>{money(e.revenueMinor)}</td>
                    <td className={tdr}>{share(e.revenueMinor, total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <Card title="Funnel: leads, paying customers, revenue" subtitle="Ad-platform leads created in the period and what is verifiably linked to them." className="min-w-0">
        <ul className="space-y-3 px-4 pb-3 sm:px-5">
          {funnel.map((f) => (
            <li key={f.label}>
              <div className="mb-1 flex justify-between text-[13px]">
                <span className="text-ink-2">{f.label}</span>
                <span className="tabular text-ink">{count(f.value)}</span>
              </div>
              <ProgressBar value={f.value} max={Math.max(funnel[0]!.value, 1)} label={f.label} color={COLOR.combined} />
            </li>
          ))}
        </ul>
        <p className="px-4 pb-4 text-xs text-ink-3 sm:px-5">Revenue of these leads: {money(lead.revenueMinor)} incl. VAT, from paid orders that carry the lead id.</p>
      </Card>

      <Card title="Revenue and advertising return" subtitle="ROAS is shown only where revenue is verified and spend exists. Other rows show no ROAS." className="min-w-0">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse [&_td]:!px-2.5 [&_th]:!px-2.5">
            <thead>
              <tr>
                <th scope="col" className={th}>Source</th>
                <th scope="col" className={thr}>Orders</th>
                <th scope="col" className={thr}>Revenue</th>
                <th scope="col" className={thr}>Share</th>
                <th scope="col" className={thr}>ROAS (attributable)</th>
                <th scope="col" className={thr}>Previous period</th>
                <th scope="col" className={thr}>Cost / customer</th>
              </tr>
            </thead>
            <tbody>
              {groupRows.map((g) => {
                const part = groupOf(cur, g.group)!;
                const prevPart = groupOf(before, g.group);
                const verified = g.group === 'meta' ? cur.verified.meta : g.group === 'google' ? cur.verified.google : null;
                const cpc = g.spend !== null && verified && verified.orders > 0 ? Math.round(g.spend / verified.orders) : null;
                return (
                  <tr key={g.group}>
                    <td className={td}>{GROUP_LABEL[g.group]}</td>
                    <td className={tdr}>{count(part.orders)}</td>
                    <td className={tdr}>{money(part.revenueMinor)}</td>
                    <td className={tdr}>{share(part.revenueMinor, cur.paidRevenueMinor)}</td>
                    <td className={tdr}>{g.roas === null ? '–' : multiple(g.roas)}</td>
                    <td className={tdr}>{prevPart ? money(prevPart.revenueMinor) : prev ? '–' : 'No baseline'}</td>
                    <td className={tdr}>{cpc === null ? '–' : money(cpc)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td className={`${td} font-semibold text-ink`}>Total paid</td>
                <td className={`${tdr} font-semibold text-ink`}>{count(cur.paidOrders)}</td>
                <td className={`${tdr} font-semibold text-ink`}>{money(cur.paidRevenueMinor)}</td>
                <td className={tdr}>100%</td>
                <td className={tdr}>{cur.roas.combined === null ? '–' : multiple(cur.roas.combined)}</td>
                <td className={tdr}>{before ? money(before.paidRevenueMinor) : 'No baseline'}</td>
                <td className={tdr}>{cur.costPerCustomerMinor === null ? '–' : money(cur.costPerCustomerMinor)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <ul className="list-disc space-y-1 px-9 pb-4 pt-3 text-xs text-ink-3">
          <li>Revenue includes VAT. ROAS = verified revenue ÷ ad spend of that platform; the total row uses verified revenue of both platforms ÷ total spend.</li>
          <li>Rows without ad spend (partner portal, chatbot, other, unattributed) get no ROAS, not zero.</li>
          {before && cur.paidRevenueMinor > 0 && <li>Total revenue change vs previous period: {share(cur.paidRevenueMinor - before.paidRevenueMinor, before.paidRevenueMinor || 1)}.</li>}
        </ul>
      </Card>

      <Section title="Meta: campaign → ad set → ad" description="Paid orders reach an ad only through the lead each order carries.">
        <Tabs<MetaLevel> label="Meta level" value={level} onChange={setLevel} options={(Object.keys(LEVEL_LABEL) as MetaLevel[]).map((v) => ({ value: v, label: LEVEL_LABEL[v] === 'Ad' ? 'Ads' : LEVEL_LABEL[v] + 's' }))} />
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card title="Ad → Lead → Paid order" subtitle={`By ${LEVEL_LABEL[level].toLowerCase()}`} className="min-w-0">
            <div className="grid grid-cols-1 gap-4 px-4 pb-4 sm:grid-cols-2 sm:px-5">
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-3">A. Lead cohort</p>
                <ul className="space-y-2.5">
                  {metaRows.slice(0, 6).map((r) => (
                    <li key={r.id}>
                      <div className="mb-1 flex justify-between gap-2 text-[13px]">
                        <span className="min-w-0 truncate text-ink-2">{r.name}</span>
                        <span className="tabular text-ink">{count(r.leads)}</span>
                      </div>
                      <ProgressBar value={r.leads} max={Math.max(...metaRows.map((x) => x.leads), 1)} label={`${r.name} leads`} color={COLOR.meta} />
                    </li>
                  ))}
                  {metaRows.length === 0 && <li className="text-xs text-ink-3">No leads in this period.</li>}
                </ul>
              </div>
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-3">B. Paid orders</p>
                <ul className="space-y-2.5">
                  {metaRows.slice(0, 6).map((r) => (
                    <li key={r.id}>
                      <div className="mb-1 flex justify-between gap-2 text-[13px]">
                        <span className="min-w-0 truncate text-ink-2">{r.name}</span>
                        <span className="tabular text-ink">
                          {count(r.paidOrders)} · {money(r.revenueMinor)}
                        </span>
                      </div>
                      <ProgressBar value={r.paidOrders} max={Math.max(...metaRows.map((x) => x.paidOrders), 1)} label={`${r.name} paid orders`} color={COLOR.good} />
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </Card>
          <Card title="Why orders are not linked (count)" subtitle="Paid orders without a verified paid-ad link, by reason. One order can show several reasons." className="min-w-0">
            <ul className="divide-y divide-line px-4 sm:px-5">
              {fig.notLinked.length === 0 && <li className="py-3 text-sm text-ink-3">Every paid order has a verified link.</li>}
              {fig.notLinked.map((n) => (
                <li key={n.key} className="flex items-center justify-between gap-3 py-2.5 text-[13px]">
                  <span className="text-ink-2">{n.label}</span>
                  <span className="tabular font-semibold text-ink">{count(n.orders)}</span>
                </li>
              ))}
            </ul>
            <p className="px-4 pb-4 pt-2 text-xs text-ink-3 sm:px-5">{count(notLinkedTotal)} reason entries in total.</p>
          </Card>
        </div>
      </Section>

      <Section title="By order date — direct Meta leads only" description="Orders by the day they were placed, restricted to orders that carry a Meta lead id.">
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <KpiCard label="Meta lead-form leads" value={count(metaRows.reduce((a, r) => a + r.leads, 0) && level === 'campaign' ? metaRows.reduce((a, r) => a + r.leads, 0) : lead.total)} sub="In the period" />
          <KpiCard label="Paid orders (verified)" value={count(customersMeta)} sub="Lead id matched" />
          <KpiCard label="Revenue (verified)" value={money(metaOrders.reduce((a, r) => a + r.order.amountMinor, 0))} sub="Incl. VAT" />
          <KpiCard label="ROAS Meta (attributable)" value={cur.roas.meta === null ? '–' : multiple(cur.roas.meta)} state={cur.roas.meta === null ? 'no_calc' : 'ok'} reason="Needs spend and verified revenue" sub="Verified revenue ÷ spend" />
        </div>
      </Section>

      <Card title="Google: campaign → ad group → ad" subtitle="Google orders are linked only through a stored click id (gclid)." className="min-w-0">
        <div className="px-4 pb-4 sm:px-5">
          <InfoLine>Google does not hand over lead ids per order. A Google sale counts as verified only when the order stores a gclid; platform conversion counts stay separate. Orders labelled Google without a click id remain label-only.</InfoLine>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full border-collapse [&_td]:!px-2.5 [&_th]:!px-2.5">
              <thead>
                <tr>
                  <th scope="col" className={th}>Campaign</th>
                  <th scope="col" className={thr}>Verified paid orders</th>
                  <th scope="col" className={thr}>Revenue</th>
                  <th scope="col" className={thr}>Spend</th>
                </tr>
              </thead>
              <tbody>
                {googleRows.length === 0 && (
                  <tr>
                    <td className={td} colSpan={4}>No click-id-verified Google orders in this period.</td>
                  </tr>
                )}
                {googleRows.map((r) => (
                  <tr key={r.id}>
                    <td className={td}>{r.name}</td>
                    <td className={tdr}>{count(r.paidOrders)}</td>
                    <td className={tdr}>{money(r.revenueMinor)}</td>
                    <td className={tdr}>{r.spendMinor === null ? '–' : money(r.spendMinor)}</td>
                  </tr>
                ))}
                {googleRows.unassigned.orders > 0 && (
                  <tr>
                    <td className={td}>Click id without a campaign</td>
                    <td className={tdr}>{count(googleRows.unassigned.orders)}</td>
                    <td className={tdr}>{money(googleRows.unassigned.revenueMinor)}</td>
                    <td className={tdr}>–</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-ink-3">Ad group and ad level are not available for click-id links in this demo.</p>
        </div>
      </Card>

      <ChartCard
        title="Meta vs Google"
        subtitle="Verified revenue and ad spend side by side"
        hideGranularity
        className="min-w-0"
        note="Verified revenue only. Orders without hard evidence are not assigned to either platform."
        render={(r) => (
          <StackedBar
            data={compareRows}
            series={[
              { key: 'revenue', label: 'Verified revenue', color: COLOR.good, kind: 'bar', stackId: 'rev' },
              { key: 'spend', label: 'Ad spend', color: COLOR.neutral, kind: 'bar', stackId: 'spd' },
            ]}
            yFormat={moneyAxis}
            height={r.height}
            fixedWidth={r.fixedWidth}
            ariaLabel="Verified revenue and ad spend by platform"
          />
        )}
      />

      <Card title="Why can't we attribute an order?" subtitle="The rules the matching follows." className="min-w-0">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse [&_td]:!px-2.5 [&_th]:!px-2.5">
            <thead>
              <tr>
                <th scope="col" className={th}>Situation</th>
                <th scope="col" className={th}>Why</th>
                <th scope="col" className={th}>Effect</th>
              </tr>
            </thead>
            <tbody>
              {RULES.map((r) => (
                <tr key={r.rule}>
                  <td className={`${td} font-medium text-ink`}>{r.rule}</td>
                  <td className={td}>{r.why}</td>
                  <td className={td}>{r.effect}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Verified attribution" subtitle="Audit of the matching: what the evidence proves." className="min-w-0">
        <div className="grid grid-cols-2 gap-3 px-4 pb-3 sm:px-5 xl:grid-cols-4">
          <KpiCard label="Verified Meta" value={money(cur.verified.meta.revenueMinor)} sub={`${count(cur.verified.meta.orders)} orders`} />
          <KpiCard label="Verified Google" value={money(cur.verified.google.revenueMinor)} sub={`${count(cur.verified.google.orders)} orders`} />
          <KpiCard label="Google label, no evidence" value={`${count(googleLabelOnly.orders)} orders`} sub={money(googleLabelOnly.revenueMinor)} />
          <KpiCard label="Meta label, no evidence" value={`${count(metaLabelOnly.orders)} orders`} sub={money(metaLabelOnly.revenueMinor)} />
        </div>
        <p className="px-4 pb-4 text-xs text-ink-3 sm:px-5">
          {count(googleLabelOnly.orders)} Google and {count(metaLabelOnly.orders)} Meta orders are labelled with a paid platform but carry no click id or lead match. They count in the source table, not in verified revenue or ROAS.
          {plantedRow && (
            <>
              {' '}
              Example: order <code>{planted}</code> is labelled Google without evidence.
            </>
          )}
        </p>
      </Card>

      <div ref={diagRef} id="unlinked-diagnostics" className="scroll-mt-4">
        <Card
          title="Orders"
          subtitle={`${count(shown.length)} orders shown`}
          actions={
            <label className="flex items-center gap-2 text-xs text-ink-3">
              <span>Attribution status</span>
              <select
                className={inputCls}
                value={filter}
                onChange={(e) => {
                  setFilter(e.target.value as StatusFilter);
                  setLimit(PAGE);
                }}
              >
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
              <table className="w-full border-collapse [&_td]:!px-2.5 [&_th]:!px-2.5">
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
                    <tr key={r.order.id} className={r.order.id === planted ? 'bg-slate-50' : undefined}>
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
                          {r.order.id === planted && <Badge tone="neutral">Google label without evidence</Badge>}
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
    </div>
  );
}
