import { useEffect, useMemo, useRef, useState } from 'react';
import { dataSourceStatus, integrityChecks, type DataSourceId, type SourceDay } from '@sedem-ads/analytics-core';
import { Badge, Button, Card, DataQualityDot, EmptyState, Notice, PageTitle, type Tone } from '../components/ui';
import { getDataset } from '../lib/data';
import { useAppState } from '../state/AppState';
import { count, date, dateRange, dateTime } from '../lib/format';

const STATUS_LABEL: Record<SourceDay['status'], string> = { missing: 'Missing', source_error: 'Source error', partial: 'Partial' };
const STATUS_TONE: Record<SourceDay['status'], Tone> = { missing: 'bad', source_error: 'bad', partial: 'warn' };
const STATUS_HINT: Record<SourceDay['status'], string> = {
  missing: 'No export was received for this day. It is shown as no data, never as zero.',
  source_error: 'The request failed. It is shown as no data, never as zero.',
  partial: 'The day was still accumulating at the reference time, so figures are incomplete.',
};

const SHARED: Record<DataSourceId, string> = {
  meta: 'Meta',
  google: 'Google',
  crm: 'Meta and Google',
  payments: 'Meta and Google',
  leads: 'Meta and Google',
};

const CHECK_TONE: Record<string, Tone> = { PASS: 'good', PARTIAL: 'warn', FAIL: 'bad' };
const CATEGORY_LABEL: Record<string, string> = {
  intentional_basis_difference: 'Intentional basis difference',
  source_limitation: 'Source limitation',
  missing_evidence: 'Missing evidence',
};

const REFRESH_NOTICE = 'Demo simulation – no external API was called';

function Spinner() {
  return <span aria-hidden className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />;
}

export default function DataSourcesPage() {
  const { range } = useAppState();
  const ds = getDataset();
  const sources = useMemo(() => dataSourceStatus(ds), [ds]);
  const checks = useMemo(() => (range ? integrityChecks(ds, range) : []), [ds, range]);
  const tally: Record<string, number> = { PASS: 0, PARTIAL: 0, FAIL: 0, UNKNOWN: 0 };
  for (const c of checks) tally[c.status] = (tally[c.status] ?? 0) + 1;

  // Simulated refresh: only local state changes. No network request is made.
  const [busy, setBusy] = useState<Partial<Record<DataSourceId, boolean>>>({});
  const [refreshedAt, setRefreshedAt] = useState<Partial<Record<DataSourceId, string>>>({});
  const [toast, setToast] = useState<string | null>(null);
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  function refresh(id: DataSourceId, name: string) {
    if (busy[id]) return;
    setBusy((b) => ({ ...b, [id]: true }));
    setToast(null);
    const t = window.setTimeout(() => {
      setBusy((b) => ({ ...b, [id]: false }));
      setRefreshedAt((r) => ({ ...r, [id]: new Date().toISOString() }));
      setToast(`${name}: ${REFRESH_NOTICE}. The timestamp was updated locally; the data did not change.`);
    }, 900);
    timers.current.push(t);
  }

  const latestSync = sources.map((s) => s.lastSyncAt).sort().at(-1);

  return (
    <div className="space-y-5">
      <PageTitle
        title="Data sources"
        sub="Where the numbers come from, how complete they are, and whether they agree with each other."
        right={<Badge tone="info">Simulated</Badge>}
      />
      <Notice tone="info" title="No real APIs are connected">
        Every source below is generated in your browser from a fixed seed. Nothing is fetched, and no advertising, CRM or payment account is read or written. The same sources feed both the Meta and the Google views.
      </Notice>
      {toast && (
        <div role="status">
          <Notice tone="green" title="Refresh finished">
            {toast}
          </Notice>
        </div>
      )}

      <Card title="Daily automatic sync" subtitle="Schedule used by the real product; here it is only displayed.">
        <dl className="grid gap-4 px-4 pb-4 sm:grid-cols-2 sm:px-5 xl:grid-cols-4">
          <div>
            <dt className="text-xs text-ink-3">Schedule (cron)</dt>
            <dd className="mt-0.5 text-sm font-medium text-ink"><code>0 6 * * *</code> <span className="text-ink-3">every day at 06:00 Europe/Ljubljana</span></dd>
          </div>
          <div>
            <dt className="text-xs text-ink-3">Last run</dt>
            <dd className="mt-0.5 text-sm font-medium text-ink">{latestSync ? dateTime(latestSync) : '–'}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-3">Next run</dt>
            <dd className="mt-0.5 text-sm font-medium text-ink">Not scheduled in the demo</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-3">Mode</dt>
            <dd className="mt-0.5"><Badge tone="info">Simulated</Badge></dd>
          </div>
        </dl>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {sources.map((s) => {
          const hasGaps = s.issues.length > 0;
          const last = refreshedAt[s.id] ?? s.lastSyncAt;
          return (
            <section key={s.id} aria-label={s.name} data-testid="source-card" className="card flex flex-col p-4 sm:p-5">
              <header className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="flex items-center gap-2 text-[15px] font-semibold text-ink">
                    <DataQualityDot state={hasGaps ? 'warn' : 'ok'} label={hasGaps ? 'Has gap days' : 'Complete'} />
                    {s.name}
                  </h3>
                  <p className="mt-1 text-xs text-ink-3">{s.description}</p>
                </div>
                <Badge tone="info" title="Data is generated, not fetched from a real service">Simulated</Badge>
              </header>
              <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-[13px]">
                <div>
                  <dt className="text-xs text-ink-3">Last sync</dt>
                  <dd className="text-ink">{dateTime(last)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-ink-3">Records</dt>
                  <dd className="tabular text-ink">{count(s.recordCount)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-ink-3">Coverage</dt>
                  <dd className="text-ink">{dateRange(s.coverage)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-ink-3">Used by</dt>
                  <dd><Badge tone={s.id === 'meta' ? 'meta' : s.id === 'google' ? 'google' : 'combined'}>{SHARED[s.id]}</Badge></dd>
                </div>
              </dl>
              <h4 className="mt-4 text-xs font-semibold uppercase tracking-wide text-ink-3">Gap days</h4>
              {s.issues.length === 0 ? (
                <p className="mt-1 text-xs text-ink-3">No gaps. Every day in the coverage window has data.</p>
              ) : (
                <ul className="mt-1 space-y-2">
                  {s.issues.map((i) => (
                    <li key={`${i.date}-${i.status}`} className="text-xs">
                      <span className="flex items-center gap-2">
                        <strong className="text-ink">{date(i.date)}</strong>
                        <Badge tone={STATUS_TONE[i.status]} title={STATUS_HINT[i.status]}>{STATUS_LABEL[i.status]}</Badge>
                      </span>
                      <span className="text-ink-3">{i.note}</span>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-auto flex items-center gap-2 pt-4">
                <Button size="sm" onClick={() => refresh(s.id, s.name)} disabled={!!busy[s.id]} aria-label={`Refresh ${s.name} now`}>
                  {busy[s.id] ? <Spinner /> : null}
                  {busy[s.id] ? 'Refreshing…' : 'Refresh now'}
                </Button>
                <span className="text-xs text-ink-3">Simulated</span>
              </div>
            </section>
          );
        })}
      </div>

      <Card
        title="Integrity checks"
        subtitle={`${range ? `Evaluated for ${dateRange(range)}.` : 'No completed days in the selected period.'} ${tally.PASS} pass, ${tally.PARTIAL} partial, ${tally.FAIL} fail${tally.UNKNOWN ? `, ${tally.UNKNOWN} unknown` : ''}.`}
      >
        {checks.length === 0 ? (
          <div className="p-4">
            <EmptyState title="No checks to run" />
          </div>
        ) : (
          <ul className="divide-y divide-line px-4 sm:px-5">
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
        <p className="border-t border-line p-4 text-xs text-ink-3 sm:px-5">
          PARTIAL means a known and explained difference, not an error: the sources measure different things, or a gap day is excluded on purpose.
        </p>
      </Card>
    </div>
  );
}
