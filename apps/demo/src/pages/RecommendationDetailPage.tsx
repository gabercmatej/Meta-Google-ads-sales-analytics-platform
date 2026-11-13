// Recommendation detail: the numbers behind one card. Everything is derived from the synthetic dataset;
// nothing here changes any entity. Deep link: /recommendations/:recKey (the key is URL-encoded).
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { entityPerformance, type PlatformView } from '@sedem-ads/analytics-core';
import { Badge, Button, Card, EmptyState, PageTitle, SimulationNotice, type Tone } from '../components/ui';
import { PeriodBar } from '../components/PeriodBar';
import { PlatformBadge } from '../components/EntityBits';
import { ChartCard } from '../components/charts/ChartCard';
import { TimeSeriesChart, type ChartRow, type ChartSeries } from '../components/charts/TimeSeriesChart';
import { PrepareChange, useSim } from '../sim/SimProvider';
import { buildRecommendations, PRIORITY_LABEL, REC_TYPE_LABEL, type RecPriority, type Recommendation } from '../ai/recommendations';
import { entityDaily, findAnomalies, headlineMetric, narrativeOf, peerTable, rollingDaily, scenarioFor } from '../ai/recDetail';
import { getDataset } from '../lib/data';
import { useAppState } from '../state/AppState';
import { count, date, dateRange, money, moneyAxis, pct } from '../lib/format';

const PRIORITY_TONE: Record<RecPriority, Tone> = { high: 'bad', medium: 'warn', low: 'neutral' };
const BLUE = '#2563eb';
const ORANGE = '#ea8a1a';
const GREY = '#94a3b8';
const day = (iso: string) => date(iso, { year: false });

export default function RecommendationDetailPage() {
  const { recKey = '' } = useParams();
  const app = useAppState();
  const sim = useSim();
  const ds = useMemo(() => getDataset(), []);
  const [budgetPct, setBudgetPct] = useState(0);

  const found = useMemo(() => {
    if (!app.range) return null;
    const views: PlatformView[] = [app.platform, 'combined'];
    for (const v of views) {
      const set = buildRecommendations(ds, v, app.range);
      const rec = set.items.find((r) => r.key === recKey);
      if (rec) return { rec, set, view: v };
    }
    return null;
  }, [ds, app.platform, app.range, recKey]);

  const detail = useMemo((): Detail | null => {
    if (!found || !app.range) return null;
    const { rec, set, view } = found;
    const cur = entityDaily(ds, rec, app.range);
    const metric = headlineMetric(rec.type);
    // Rolling values reach 6 days back before the period, so the first day already has a full 7-day window.
    const roll = rollingDaily(ds, rec, app.range);
    const prevRoll = set.previous ? rollingDaily(ds, rec, set.previous) : null;
    const pick = (r: typeof roll) => (metric === 'cpl' ? r.cpl : r.ctr);
    const curLine = pick(roll);
    const prevLine = prevRoll ? pick(prevRoll) : null;
    const actual: ChartRow[] = cur.days.map((d, i) => ({ key: d, label: day(d), cur: curLine[i] ?? null, prev: prevLine?.[i] ?? null }));
    const spendCpl: ChartRow[] = cur.days.map((d, i) => ({ key: d, label: day(d), spend: cur.spend[i] ?? null, cpl: roll.cpl[i] ?? null }));
    const conv: ChartRow[] = cur.days.map((d, i) => ({ key: d, label: day(d), leads: roll.leads7[i] ?? 0, rate: roll.leadRate[i] ?? null }));
    const row = entityPerformance(ds, { level: rec.level, view, range: app.range }).find((r) => r.id === rec.entityId);
    return {
      metric,
      actual,
      spendCpl,
      conv,
      anomalies: findAnomalies(cur, metric),
      peers: peerTable(ds, rec, view, app.range),
      scenario: scenarioFor(row, app.range),
    };
  }, [ds, found, app.range]);

  if (!app.range) {
    return (
      <div className="space-y-4">
        <PageTitle title="Recommendation" />
        <PeriodBar />
        <EmptyState title="No completed days in this period">Choose another period.</EmptyState>
      </div>
    );
  }
  if (!found || !detail) {
    return (
      <div className="space-y-4">
        <PageTitle title="Recommendation not found" />
        <PeriodBar />
        <EmptyState title="This recommendation does not apply to the selected period">
          Recommendations are recalculated for every period and platform. <Link className="font-semibold text-brand hover:underline" to="/recommendations">Back to recommendations</Link>
        </EmptyState>
      </div>
    );
  }

  const { rec } = found;
  return <DetailBody rec={rec} comparisonLabel={found.set.comparisonLabel} detail={detail} budgetPct={budgetPct} setBudgetPct={setBudgetPct} dismissed={sim.dismissed.includes(rec.key)} onDismiss={() => sim.dismiss(rec.key)} onRestore={() => sim.restore(rec.key)} />;
}

interface Detail {
  metric: 'cpl' | 'ctr';
  actual: ChartRow[];
  spendCpl: ChartRow[];
  conv: ChartRow[];
  anomalies: ReturnType<typeof findAnomalies>;
  peers: ReturnType<typeof peerTable>;
  scenario: ReturnType<typeof scenarioFor>;
}

function DetailBody(props: { rec: Recommendation; comparisonLabel: string; detail: Detail; budgetPct: number; setBudgetPct: (n: number) => void; dismissed: boolean; onDismiss: () => void; onRestore: () => void }) {
  const { rec, detail, budgetPct, setBudgetPct } = props;
  const app = useAppState();
  const nar = narrativeOf(rec.type);
  const isCpl = detail.metric === 'cpl';
  const metricLabel = isCpl ? 'CPL' : 'CTR';
  const metricFmt = isCpl ? (v: number) => money(Math.round(v)) : (v: number) => pct(v);
  const metricAxis = isCpl ? (v: number) => moneyAxis(Math.round(v)) : (v: number) => pct(v, 1);
  const ask = `/assistant?q=${encodeURIComponent(rec.ask)}`;
  const period = app.range ? dateRange(app.range) : '';

  const actualSeries: ChartSeries[] = [
    { key: 'cur', label: `${metricLabel}, this period`, color: BLUE, format: metricFmt, width: 2.5 },
    { key: 'prev', label: `${metricLabel}, previous period`, color: GREY, format: metricFmt, dashed: true },
  ];
  const spendSeries: ChartSeries[] = [
    { key: 'spend', label: 'Daily spend', color: BLUE, format: (v) => money(Math.round(v)) },
    { key: 'cpl', label: 'CPL (7-day rolling)', color: ORANGE, axis: 'right', format: (v) => money(Math.round(v)) },
  ];
  const convSeries: ChartSeries[] = [
    { key: 'leads', label: 'Leads, last 7 days', color: BLUE, format: (v) => count(v) },
    { key: 'rate', label: 'Lead rate = leads ÷ clicks (7-day rolling)', color: '#7c3aed', axis: 'right', format: (v) => pct(v, 1) },
  ];

  const sc = detail.scenario;
  const est = sc ? sc.at(budgetPct) : null;

  return (
    <div className="space-y-5">
      <nav aria-label="Breadcrumb" className="text-sm">
        <Link to="/recommendations" className="font-medium text-brand hover:underline">
          ← Recommendations
        </Link>
      </nav>
      <PageTitle
        title={rec.title}
        sub={
          <>
            {rec.level === 'ad' ? 'Ad' : 'Campaign'}:{' '}
            <Link to={rec.openTo} className="font-semibold text-brand hover:underline">
              {rec.entityName}
            </Link>{' '}
            · {period}
          </>
        }
        badge={<Badge tone="neutral">Simulated</Badge>}
      />
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone={PRIORITY_TONE[rec.priority]}>{PRIORITY_LABEL[rec.priority]} priority</Badge>
        <Badge tone="info">{REC_TYPE_LABEL[rec.type]}</Badge>
        <PlatformBadge platform={rec.platform} />
        <Badge tone="neutral">Rule-based</Badge>
      </div>
      <PeriodBar />
      <SimulationNotice />

      <section className="card p-4 sm:p-5" aria-label="Evidence">
        <h2 className="text-sm font-semibold text-ink">Evidence</h2>
        <div className="mt-2 overflow-x-auto rounded-lg border border-line">
          <table className="w-full text-sm" data-testid="rec-evidence">
            <thead>
              <tr className="bg-slate-50 text-left text-2xs uppercase tracking-wide text-ink-3">
                <th scope="col" className="px-3 py-1.5 font-semibold">Metric</th>
                <th scope="col" className="px-3 py-1.5 text-right font-semibold">This period</th>
                <th scope="col" className="px-3 py-1.5 text-right font-semibold">Previous period</th>
                <th scope="col" className="px-3 py-1.5 text-right font-semibold">Change</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rec.evidence.map((e) => (
                <tr key={e.label}>
                  <th scope="row" className="px-3 py-2 text-left font-medium text-ink-2">{e.label}</th>
                  <td className="tabular px-3 py-2 text-right">{e.current}</td>
                  <td className="tabular px-3 py-2 text-right">{e.previous}</td>
                  <td className="tabular px-3 py-2 text-right font-semibold">{e.change}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-1.5 text-2xs text-ink-3">Compared: {props.comparisonLabel}</p>
        <p className="mt-3 text-sm leading-snug text-ink-2">{rec.explanation}</p>
        <div className="mt-3 rounded-lg bg-brand-soft/70 px-3 py-2 text-sm leading-snug text-blue-950">
          <strong className="font-semibold">Suggested optimization:</strong> {rec.nextStep}
        </div>
        <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-2xs font-semibold uppercase tracking-wide text-ink-3">Why it matters</dt>
            <dd className="mt-0.5 leading-snug text-ink-2">{nar.why}</dd>
          </div>
          <div>
            <dt className="text-2xs font-semibold uppercase tracking-wide text-ink-3">Expected impact</dt>
            <dd className="mt-0.5 leading-snug text-ink-2">
              <span className="mr-1 font-semibold text-ink">
                {nar.impact.arrow} {nar.impact.metric}
              </span>
              {nar.impact.text}
            </dd>
          </div>
          <div>
            <dt className="text-2xs font-semibold uppercase tracking-wide text-ink-3">Risks</dt>
            <dd className="mt-0.5">
              <ul className="list-disc space-y-0.5 pl-5 leading-snug text-ink-2 marker:text-slate-400">
                {nar.risks.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </dd>
          </div>
        </dl>
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-3">
          {rec.prepare && <PrepareChange entity={rec.prepare.entity} kind={rec.prepare.kind} newDailyBudgetMinor={rec.prepare.newDailyBudgetMinor} label="Prepare change" />}
          <Link className="btn btn-secondary btn-sm" to={ask}>
            Ask assistant
          </Link>
          <Link className="btn btn-secondary btn-sm" to={rec.openTo}>
            Open campaign
          </Link>
          {rec.compareTo && (
            <Link className="btn btn-ghost btn-sm" to={rec.compareTo}>
              Compare ads
            </Link>
          )}
          <span className="ml-auto">
            {props.dismissed ? (
              <Button size="sm" variant="ghost" onClick={props.onRestore}>
                Restore
              </Button>
            ) : (
              <Button size="sm" variant="ghost" onClick={props.onDismiss}>
                Dismiss
              </Button>
            )}
          </span>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-2" data-testid="rec-charts">
        <ChartCard
          title={`${metricLabel}: actual vs previous period`}
          subtitle="7-day rolling, previous period aligned day by day"
          hideGranularity
          scope={rec.entityName}
          note="Missing days stay as gaps; a gap is not zero."
          render={(o) => <TimeSeriesChart data={detail.actual} series={actualSeries} yFormat={metricAxis} height={o.height} fixedWidth={o.fixedWidth} ariaLabel={`${metricLabel} this period against the previous period`} />}
        />
        <ChartCard
          title="Spend and CPL"
          subtitle="Daily spend on the left axis, 7-day rolling CPL on the right"
          hideGranularity
          scope={rec.entityName}
          render={(o) => <TimeSeriesChart data={detail.spendCpl} series={spendSeries} yFormat={(v) => moneyAxis(Math.round(v))} rightFormat={(v) => moneyAxis(Math.round(v))} height={o.height} fixedWidth={o.fixedWidth} ariaLabel="Daily spend and rolling CPL" />}
        />
        <ChartCard
          title="Conversion trend"
          subtitle="Leads in the last 7 days and the share of clicks that became leads"
          hideGranularity
          scope={rec.entityName}
          note="Only leads are counted here; leads are not added to other result types."
          render={(o) => <TimeSeriesChart data={detail.conv} series={convSeries} yFormat={(v) => count(Math.round(v))} rightFormat={(v) => pct(v, 1)} height={o.height} fixedWidth={o.fixedWidth} ariaLabel="Leads per day and lead rate" />}
        />

        <Card title="Relative performance" subtitle={`${metricLabel} ranked against ${rec.level === 'ad' ? 'ads in the same campaign' : 'campaigns on the same platform'} · median ${detail.peers.medianDisplay}`} className="min-w-0">
          <ol className="divide-y divide-line" data-testid="rec-peers">
            {detail.peers.rows.map((p) => {
              const max = Math.max(...detail.peers.rows.map((r) => r.value ?? 0), 1);
              return (
                <li key={p.id} className={`grid grid-cols-[1.5rem_minmax(0,1fr)_5.5rem] items-center gap-3 px-4 py-2 text-sm ${p.isSelf ? 'bg-brand-soft/60' : ''}`} aria-current={p.isSelf ? 'true' : undefined}>
                  <span className="tabular text-xs font-semibold text-ink-3">{p.rank ?? '–'}</span>
                  <span className="min-w-0">
                    <span className={`block truncate ${p.isSelf ? 'font-semibold text-ink' : 'text-ink-2'}`} title={p.name}>
                      {p.name}
                      {p.isSelf ? ' (this recommendation)' : ''}
                    </span>
                    <span className="mt-1 block h-1.5 rounded-full bg-slate-100">
                      <span className="block h-1.5 rounded-full" style={{ width: `${p.value === null ? 0 : Math.max(4, (p.value / max) * 100)}%`, background: p.isSelf ? BLUE : GREY }} />
                    </span>
                  </span>
                  <span className="tabular text-right font-semibold text-ink">{p.display}</span>
                </li>
              );
            })}
          </ol>
          <p className="px-4 py-2 text-2xs text-ink-3">{isCpl ? 'Lowest CPL ranks first.' : 'Highest CTR ranks first.'} Entities under the volume guard are not ranked.</p>
        </Card>
      </div>

      <Card title="Anomalies" subtitle={`Days in ${period} where ${metricLabel} was at least two standard deviations from the period average`}>
        {detail.anomalies.length === 0 ? (
          <p className="px-4 py-4 text-sm text-ink-2" data-testid="rec-anomalies">No single day stood out: none was two standard deviations from the period average, or there were fewer than 14 days with data.</p>
        ) : (
          <ul className="divide-y divide-line" data-testid="rec-anomalies">
            {detail.anomalies.map((a) => (
              <li key={a.day} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-4 py-2.5 text-sm">
                <span className="tabular w-24 font-semibold text-ink">{a.label}</span>
                <span className="text-ink-2">
                  {a.metric} <span className="tabular font-semibold text-ink">{a.value}</span> was {a.direction} the period average of <span className="tabular">{a.typical}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Budget scenario" subtitle="Simulated scenario — linear estimate, not a forecast">
        {!sc || !est ? (
          <p className="px-4 py-4 text-sm text-ink-2">Not enough leads in this period to estimate (fewer than 5 means no CPL).</p>
        ) : (
          <div className="space-y-3 px-4 py-4" data-testid="rec-scenario">
            <label className="block text-sm font-medium text-ink-2">
              Daily budget change: <span className="tabular font-semibold text-ink">{budgetPct > 0 ? '+' : ''}{budgetPct}%</span>
              <input type="range" min={-30} max={30} step={5} value={budgetPct} onChange={(e) => setBudgetPct(Number(e.target.value))} className="mt-2 block w-full max-w-md accent-brand" aria-label="Daily budget change in percent" />
            </label>
            <dl className="grid gap-3 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-2xs font-semibold uppercase tracking-wide text-ink-3">Spend per day</dt>
                <dd className="tabular mt-0.5 text-ink-2">
                  {money(sc.baselineSpendPerDayMinor)} → <span className="font-semibold text-ink">{money(est.spendPerDayMinor)}</span>
                </dd>
              </div>
              <div>
                <dt className="text-2xs font-semibold uppercase tracking-wide text-ink-3">Leads per day</dt>
                <dd className="tabular mt-0.5 text-ink-2">
                  {sc.baselineLeadsPerDay.toFixed(1)} → <span className="font-semibold text-ink">{est.leadsPerDay.toFixed(1)}</span>
                </dd>
              </div>
              <div>
                <dt className="text-2xs font-semibold uppercase tracking-wide text-ink-3">CPL assumed constant</dt>
                <dd className="tabular mt-0.5 font-semibold text-ink">{money(sc.cplMinor)}</dd>
              </div>
            </dl>
            <p className="text-2xs text-ink-3">Assumes the period's CPL stays the same at any budget. Real CPL usually rises with spend, so treat this as an upper bound for the lead gain.</p>
          </div>
        )}
      </Card>
    </div>
  );
}
