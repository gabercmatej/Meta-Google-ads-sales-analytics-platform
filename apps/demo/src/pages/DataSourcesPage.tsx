import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { dataSourceStatus, integrityChecks, type DataSourceId, type SourceDay } from '@sedem-ads/analytics-core';
import { Badge, Button, EmptyState, Notice, PageTitle, type Tone } from '../components/ui';
import { getDataset } from '../lib/data';
import { useAppState } from '../state/AppState';
import { useSim } from '../sim/simContext';
import { count, date, dateRange, dateTime } from '../lib/format';
import { demoNow, initialRefresh, relativeAgo } from '../lib/sourceRefresh';

const STATUS_LABEL: Record<SourceDay['status'], string> = { missing: 'Missing', source_error: 'Source error', partial: 'Partial' };
const STATUS_TONE: Record<SourceDay['status'], Tone> = { missing: 'bad', source_error: 'bad', partial: 'warn' };
const STATUS_HINT: Record<SourceDay['status'], string> = {
  missing: 'No export was received for this day. It is shown as no data, never as zero.',
  source_error: 'The request failed. It is shown as no data, never as zero.',
  partial: 'The day was still accumulating at the reference time, so figures are incomplete.',
};

const CHECK_TONE: Record<string, Tone> = { PASS: 'good', PARTIAL: 'warn', FAIL: 'bad' };
const CATEGORY_LABEL: Record<string, string> = {
  intentional_basis_difference: 'Intentional basis difference',
  source_limitation: 'Source limitation',
  missing_evidence: 'Missing evidence',
};

const SCHEDULE = 'Production: scheduled background job daily 07:00 and 12:00 Europe/Ljubljana';
export const REFRESH_NOTICE = 'Simulated in this browser — no network request';

const SOURCE_TITLE: Record<DataSourceId, string> = {
  meta: 'Meta Ads',
  google: 'Google Ads',
  crm: 'CRM / confirmed sales',
  leads: 'Lead sheet (Excel)',
  payments: 'Payments',
};
const ORDER: DataSourceId[] = ['meta', 'google', 'crm', 'leads', 'payments'];

function Spinner() {
  return <span aria-hidden className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />;
}

function Collapsible({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  return (
    <details className="card group">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3.5 text-sm sm:px-5">
        <span className="font-semibold text-ink">{title}</span>
        <span className="min-w-0 flex-1 truncate text-xs text-ink-3">{hint}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-ink-3 transition-transform group-open:rotate-90" aria-hidden="true">
          <path d="M9 6l6 6-6 6" />
        </svg>
      </summary>
      <div className="border-t border-line px-4 py-4 text-sm text-ink-2 sm:px-5">{children}</div>
    </details>
  );
}

export default function DataSourcesPage() {
  const { range } = useAppState();
  const sim = useSim();
  const ds = getDataset();
  const sources = useMemo(() => dataSourceStatus(ds), [ds]);
  const byId = useMemo(() => new Map(sources.map((s) => [s.id, s])), [sources]);
  const checks = useMemo(() => (range ? integrityChecks(ds, range) : []), [ds, range]);
  const tally: Record<string, number> = { PASS: 0, PARTIAL: 0, FAIL: 0, UNKNOWN: 0 };
  for (const c of checks) tally[c.status] = (tally[c.status] ?? 0) + 1;

  // Demo clock: reference instant + time on the page. Re-render every 30 s so relative labels move.
  const openedAt = useRef(Date.now());
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setTick((n) => n + 1), 30_000);
    return () => window.clearInterval(t);
  }, []);
  const clock = () => demoNow(ds.referenceNow, Date.now() - openedAt.current);
  void tick;
  const now = clock();

  // Simulated refresh: only local state changes. No network request is made.
  const [busy, setBusy] = useState<Partial<Record<DataSourceId, boolean>>>({});
  const [refreshedAt, setRefreshedAt] = useState<Partial<Record<DataSourceId, string>>>({});
  const [refreshCount, setRefreshCount] = useState<Partial<Record<DataSourceId, number>>>({});
  const [toast, setToast] = useState<string | null>(null);
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  function refresh(id: DataSourceId) {
    if (busy[id]) return;
    const name = SOURCE_TITLE[id];
    setBusy((b) => ({ ...b, [id]: true }));
    setToast(null);
    const t = window.setTimeout(() => {
      const at = clock();
      setBusy((b) => ({ ...b, [id]: false }));
      setRefreshedAt((r) => ({ ...r, [id]: at }));
      setRefreshCount((c) => ({ ...c, [id]: (c[id] ?? 0) + 1 }));
      setToast(`${name}: ${REFRESH_NOTICE}. The timestamp was updated locally; the data did not change.`);
      sim.logActivity({
        platform: id === 'meta' || id === 'google' ? id : null,
        action: 'Refresh data source',
        entityId: id,
        entityName: name,
        detail: `${REFRESH_NOTICE}. Last refresh timestamp updated; no data was fetched or changed.`,
        outcome: 'refreshed',
      });
    }, 900);
    timers.current.push(t);
  }

  const recordRows = (id: DataSourceId): [string, number][] => {
    switch (id) {
      case 'meta':
      case 'google': {
        const cs = ds.campaigns.filter((c) => c.platform === id);
        return [
          ['Campaigns', cs.length],
          [id === 'meta' ? 'Ad sets' : 'Ad groups', ds.adGroups.filter((g) => g.platform === id).length],
          ['Ads', ds.ads.filter((a) => a.platform === id).length],
          ['Daily rows', ds.daily.filter((r) => r.platform === id).length],
        ];
      }
      case 'crm':
        return [['Customers', ds.customers.length], ['Orders', ds.orders.length]];
      case 'leads':
        return [['Leads', ds.leads.length], ['Ad-form leads', ds.leads.filter((l) => l.platform !== null).length]];
      case 'payments':
        return [['Paid orders', ds.orders.filter((o) => o.status === 'paid').length], ['Refunded orders', ds.orders.filter((o) => o.refundedAt).length]];
    }
  };

  const history = useMemo(() => {
    const rows: { at: string; source: string; kind: string; result: string }[] = [];
    const base = Date.parse(ds.referenceNow) + 30 * 60_000;
    for (let i = 0; i < 15; i++) {
      const id = ORDER[i % ORDER.length]!;
      const slot = Math.floor(i / ORDER.length);
      rows.push({
        at: new Date(base - (slot * 5 + 1) * 3_600_000 * (id === 'meta' || id === 'google' ? 1 : 2) - i * 7 * 60_000).toISOString(),
        source: SOURCE_TITLE[id],
        kind: i % 4 === 3 ? 'Manual refresh (simulated)' : 'Scheduled job (simulated)',
        result: 'OK, synthetic',
      });
    }
    return rows.sort((a, b) => (a.at < b.at ? 1 : -1));
  }, [ds]);

  return (
    <div className="space-y-5">
      <PageTitle title="Data sources" sub="The application only reads from its sources. A refresh stores a copy in its own database; ads, spreadsheets and the CRM are never changed." />
      <Notice tone="info" title="No real APIs are connected">
        Every source below is generated in your browser from a fixed seed. Nothing is fetched, and no advertising, CRM or payment account is read or written.
      </Notice>
      {toast && (
        <div role="status">
          <Notice tone="green" title="Refresh finished">
            {toast}
          </Notice>
        </div>
      )}

      <section aria-label="Main sources">
        <h2 className="text-lg font-semibold tracking-tight text-ink">Main sources</h2>
        <p className="mb-3.5 mt-0.5 max-w-3xl text-xs text-ink-3">
          {SCHEDULE}. In this demo no job runs: the buttons below only simulate a refresh in the browser.
        </p>
        <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
          {ORDER.map((id) => {
            const s = byId.get(id);
            if (!s) return null;
            const last = refreshedAt[id] ?? initialRefresh(ds.referenceNow, id);
            const rows = recordRows(id);
            const days = Math.round((Date.parse(s.coverage.end) - Date.parse(s.coverage.start)) / 86_400_000) + 1;
            const gapDays = s.issues.filter((i) => i.status !== 'partial').length;
            const covered = days - gapDays;
            // Calendar-year window: 1 Jan of the reference year up to the last completed day, clamped to the source window.
            const refDay = ds.referenceNow.slice(0, 10);
            const yearStart = `${refDay.slice(0, 4)}-01-01`;
            const lastDone = new Date(Date.parse(refDay) - 86_400_000).toISOString().slice(0, 10);
            const yStart = s.coverage.start > yearStart ? s.coverage.start : yearStart;
            const yEnd = s.coverage.end < lastDone ? s.coverage.end : lastDone;
            const yDays = Math.max(0, Math.round((Date.parse(yEnd) - Date.parse(yStart)) / 86_400_000) + 1);
            const yGaps = s.issues.filter((i) => i.status !== 'partial' && i.date >= yStart && i.date <= yEnd).length;
            return (
              <section key={id} aria-label={SOURCE_TITLE[id]} data-testid="source-card" className="card flex flex-col">
                <header className="flex items-start justify-between gap-3 border-b border-line px-4 py-3.5 sm:px-5">
                  <div className="min-w-0">
                    <h3 className="text-[15px] font-semibold text-ink">{SOURCE_TITLE[id]}</h3>
                    <p className="mt-0.5 text-xs text-ink-3">{s.description}</p>
                  </div>
                  <Badge tone="neutral" title="Data is generated, not fetched from a real service">Simulated · synthetic data</Badge>
                </header>
                <div className="px-4 pb-4 pt-3 sm:px-5">
                  <div className="text-xs text-ink-3">Last successful refresh</div>
                  <div className="text-xl font-semibold tracking-tight text-ink" data-testid="last-refresh-relative">{relativeAgo(last, now)}</div>
                  <div className="text-xs text-ink-3" data-testid="last-refresh-abs">{dateTime(last)}</div>
                  <p className="mt-1 text-[11px] text-ink-3">{SCHEDULE}</p>
                  <dl className="mt-3 divide-y divide-line text-[13px]">
                    {rows.map(([label, n]) => (
                      <div key={label} className="flex items-center justify-between py-2">
                        <dt className="text-ink-3">{label}</dt>
                        <dd className="tabular font-medium text-ink">{count(n)}</dd>
                      </div>
                    ))}
                    <div className="flex items-center justify-between py-2">
                      <dt className="text-ink-3">Coverage</dt>
                      <dd className="tabular font-medium text-ink">{covered}/{days} days</dd>
                    </div>
                    <div className="flex items-center justify-between py-2">
                      <dt className="text-ink-3" title={`${dateRange({ start: yStart, end: yEnd })}, completed days only`}>{refDay.slice(0, 4)} coverage</dt>
                      <dd className="tabular font-medium text-ink">{yDays - yGaps}/{yDays} days</dd>
                    </div>
                  </dl>
                  <details className="mt-2 text-xs">
                    <summary className="cursor-pointer font-medium text-brand">Details</summary>
                    <div className="mt-2 space-y-1.5 text-ink-3">
                      <p>Window: {dateRange(s.coverage)}. Refreshes in this browser this visit: {refreshCount[id] ?? 0}.</p>
                      <h4 className="font-semibold uppercase tracking-wide">Gap days</h4>
                      {s.issues.length === 0 ? (
                        <p>No gaps. Every day in the coverage window has data.</p>
                      ) : (
                        <ul className="space-y-2">
                          {s.issues.map((i) => (
                            <li key={`${i.date}-${i.status}`}>
                              <span className="flex items-center gap-2">
                                <strong className="text-ink">{date(i.date)}</strong>
                                <Badge tone={STATUS_TONE[i.status]} title={STATUS_HINT[i.status]}>{STATUS_LABEL[i.status]}</Badge>
                              </span>
                              <span>{i.note}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </details>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Button size="sm" onClick={() => refresh(id)} disabled={!!busy[id]} aria-label={`Refresh ${SOURCE_TITLE[id]} now`}>
                      {busy[id] ? <Spinner /> : null}
                      {busy[id] ? 'Refreshing…' : 'Refresh now'}
                    </Button>
                    <span className="text-[11px] text-ink-3">{REFRESH_NOTICE}</span>
                  </div>
                </div>
              </section>
            );
          })}
        </div>
      </section>

      <div className="space-y-3">
        <Collapsible title="Connections and ad management" hint="Accounts, channels, write capabilities in Meta">
          <p>Production connects a read-only token for reporting and a separate, explicitly allowed write token for confirmed changes. In this demo there are no connections: every account is fictional and every write is a browser-local simulation.</p>
        </Collapsible>
        <Collapsible title="Manual import" hint="Excel / CSV files, lead sheet">
          <p>Production accepts Excel or CSV exports for gap days and the lead sheet. The public demo has no file upload; the data sets are generated.</p>
        </Collapsible>
        <Collapsible title="Sync and import history" hint="last 15, synthetic">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className="text-left text-xs text-ink-3">
                  <th scope="col" className="py-1.5 pr-4 font-medium">Time</th>
                  <th scope="col" className="py-1.5 pr-4 font-medium">Source</th>
                  <th scope="col" className="py-1.5 pr-4 font-medium">Trigger</th>
                  <th scope="col" className="py-1.5 font-medium">Result</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h, i) => (
                  <tr key={i} className="border-t border-line">
                    <td className="whitespace-nowrap py-1.5 pr-4">{dateTime(h.at)}</td>
                    <td className="py-1.5 pr-4">{h.source}</td>
                    <td className="py-1.5 pr-4">{h.kind}</td>
                    <td className="py-1.5">{h.result}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Collapsible>
        <Collapsible title="Technical diagnostics" hint={`Integrity checks: ${tally.PASS} pass, ${tally.PARTIAL} partial, ${tally.FAIL} fail`}>
          <p className="mb-2 text-xs text-ink-3">{range ? `Evaluated for ${dateRange(range)}.` : 'No completed days in the selected period.'}</p>
          {checks.length === 0 ? (
            <EmptyState title="No checks to run" />
          ) : (
            <ul className="divide-y divide-line">
              {checks.map((c) => (
                <li key={c.id} data-testid="integrity-check" className="flex items-start gap-3 py-3">
                  <span data-testid="check-status" className="mt-0.5 shrink-0">
                    <Badge tone={CHECK_TONE[c.status] ?? 'neutral'}>{c.status}</Badge>
                  </span>
                  <div className="min-w-0 text-[13px]">
                    <strong className="text-ink">{c.title}</strong>
                    {c.category && <span className="ml-2 text-xs text-ink-3">{CATEGORY_LABEL[c.category] ?? c.category}</span>}
                    {c.detail && <p className="text-xs text-ink-3">{c.detail}</p>}
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-ink-3">PARTIAL means a known and explained difference, not an error: the sources measure different things, or a gap day is excluded on purpose.</p>
        </Collapsible>
      </div>
    </div>
  );
}
