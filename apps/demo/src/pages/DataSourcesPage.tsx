import { useMemo } from 'react';
import { dataSourceStatus, integrityChecks, type DataSourceId, type SourceDay } from '@sedem-ads/analytics-core';
import { Badge, EmptyState, PageHeader, type Tone } from '../components/ui';
import { Notice } from '../components/Notes';
import { getDataset } from '../lib/data';
import { useAppState } from '../state/AppState';
import { count, date, dateRange, dateTime } from '../lib/format';
import './analytics.css';
import './datasources.css';

const STATUS_LABEL: Record<SourceDay['status'], string> = {
  missing: 'Missing',
  source_error: 'Source error',
  partial: 'Partial',
};
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

export default function DataSourcesPage() {
  const { range } = useAppState();
  const ds = getDataset();
  const sources = useMemo(() => dataSourceStatus(ds), [ds]);
  const checks = useMemo(() => (range ? integrityChecks(ds, range) : []), [ds, range]);
  const tally: Record<string, number> = { PASS: 0, PARTIAL: 0, FAIL: 0, UNKNOWN: 0 };
  for (const c of checks) tally[c.status] = (tally[c.status] ?? 0) + 1;

  return (
    <div className="stack">
      <PageHeader
        title="Data sources"
        description="Where the numbers come from, how complete they are, and whether they agree with each other."
        badge={<Badge tone="info">Simulated</Badge>}
      />
      <Notice>
        <strong>No real APIs are connected.</strong> Every source below is generated in your browser from a fixed seed. Nothing is fetched, and no advertising, CRM or payment account is read or written. The same sources feed both the Meta and the Google views.
      </Notice>

      <div className="src-grid">
        {sources.map((s) => (
          <section className="card src-card" key={s.id} aria-label={s.name}>
            <header className="card-head">
              <div>
                <h3 className="card-title">{s.name}</h3>
                <p className="card-sub">{s.description}</p>
              </div>
              <Badge tone="info" title="Data is generated, not fetched from a real service">
                Simulated
              </Badge>
            </header>
            <dl className="src-facts">
              <div>
                <dt>Last sync</dt>
                <dd>{dateTime(s.lastSyncAt)}</dd>
              </div>
              <div>
                <dt>Coverage</dt>
                <dd>{dateRange(s.coverage)}</dd>
              </div>
              <div>
                <dt>Records</dt>
                <dd className="num">{count(s.recordCount)}</dd>
              </div>
              <div>
                <dt>Used by</dt>
                <dd>
                  <Badge tone={s.id === 'meta' ? 'meta' : s.id === 'google' ? 'google' : 'combined'}>{SHARED[s.id]}</Badge>
                </dd>
              </div>
            </dl>
            <h4 className="src-sub">Gap days</h4>
            {s.issues.length === 0 ? (
              <p className="muted small">No gaps. Every day in the coverage window has data.</p>
            ) : (
              <ul className="gap-list">
                {s.issues.map((i) => (
                  <li key={`${i.date}-${i.status}`}>
                    <span className="gap-head">
                      <strong>{date(i.date)}</strong>
                      <Badge tone={STATUS_TONE[i.status]} title={STATUS_HINT[i.status]}>
                        {STATUS_LABEL[i.status]}
                      </Badge>
                    </span>
                    <span className="muted small">{i.note}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>

      <section className="card">
        <header className="card-head">
          <div>
            <h3 className="card-title">Integrity checks</h3>
            <p className="card-sub">
              {range ? `Evaluated for ${dateRange(range)}.` : 'No completed days in the selected period.'} {tally.PASS} pass, {tally.PARTIAL} partial, {tally.FAIL} fail{tally.UNKNOWN ? `, ${tally.UNKNOWN} unknown` : ""}.
            </p>
          </div>
        </header>
        {checks.length === 0 ? (
          <EmptyState title="No checks to run" />
        ) : (
          <ul className="check-list">
            {checks.map((c) => (
              <li key={c.id} className="check">
                <Badge tone={CHECK_TONE[c.status] ?? 'neutral'}>{c.status}</Badge>
                <div className="check-body">
                  <strong>{c.title}</strong>
                  {c.category && <span className="muted small"> {CATEGORY_LABEL[c.category] ?? c.category}</span>}
                  {c.detail && <p className="muted small">{c.detail}</p>}
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="muted small check-legend">
          PARTIAL means a known and explained difference, not an error: the sources measure different things, or a gap day is excluded on purpose.
        </p>
      </section>
    </div>
  );
}
