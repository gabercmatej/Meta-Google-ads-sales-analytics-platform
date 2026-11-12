import { useMemo, useState } from 'react';
import { PageTitle, Card, Button, Badge, EmptyState, Dialog, SimulationNotice, inputCls, type Tone } from '../components/ui';
import { PlatformBadge } from '../components/EntityBits';
import { useSim } from '../sim/simContext';
import type { ActivityEntry } from '../sim/contract';
import { dateTime } from '../lib/format';
import { getDataset } from '../lib/data';
import { seedActivity } from '../lib/activitySeed';

const OUTCOME: Record<ActivityEntry['outcome'], { label: string; tone: Tone }> = {
  applied_in_simulation: { label: 'Applied in simulation', tone: 'good' },
  validated_not_applied: { label: 'Validated, not applied', tone: 'warn' },
  rejected: { label: 'Rejected', tone: 'bad' },
  draft_saved: { label: 'Draft', tone: 'neutral' },
  reset: { label: 'Reset', tone: 'info' },
  refreshed: { label: 'Refreshed (simulated)', tone: 'neutral' },
  synthetic_history: { label: 'Synthetic history', tone: 'neutral' },
};

type PlatformFilter = 'all' | 'meta' | 'google' | 'system';
type OutcomeFilter = 'all' | ActivityEntry['outcome'];
interface Filters { platform: PlatformFilter; action: string; outcome: OutcomeFilter; actor: string; from: string; to: string }
const NO_FILTERS: Filters = { platform: 'all', action: 'all', outcome: 'all', actor: '', from: '', to: '' };

const th = 'whitespace-nowrap px-4 py-2.5 text-left text-xs font-medium text-ink-3';
const td = 'border-t border-line px-4 py-2.5 align-top text-[13px] text-ink-2';
const lbl = 'grid min-w-[130px] flex-1 gap-1 text-xs text-ink-2';

export default function ActivityPage() {
  const sim = useSim();
  const [draft, setDraft] = useState<Filters>(NO_FILTERS);
  const [applied, setApplied] = useState<Filters>(NO_FILTERS);
  const [confirmReset, setConfirmReset] = useState(false);

  const all = useMemo(() => [...seedActivity(getDataset()), ...sim.activity].sort((a, b) => (a.at === b.at ? b.seq - a.seq : a.at < b.at ? 1 : -1)), [sim.activity]);
  const actions = useMemo(() => [...new Set(all.map((a) => a.action))].sort(), [all]);
  const rows = useMemo(
    () =>
      all.filter((a) => {
        const day = a.at.slice(0, 10);
        return (
          (applied.platform === 'all' || (applied.platform === 'system' ? a.platform === null : a.platform === applied.platform)) &&
          (applied.action === 'all' || a.action === applied.action) &&
          (applied.outcome === 'all' || a.outcome === applied.outcome) &&
          (!applied.actor.trim() || a.actor.toLowerCase().includes(applied.actor.trim().toLowerCase())) &&
          (!applied.from || day >= applied.from) &&
          (!applied.to || day <= applied.to)
        );
      }),
    [all, applied],
  );
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => setDraft((d) => ({ ...d, [k]: v }));

  return (
    <div className="space-y-5">
      <PageTitle
        title="Change log"
        sub="Append-only record of simulated changes to Meta and Google ads, approvals, recommendations and refreshes. Everything is browser-local synthetic data. Times are shown in Europe/Ljubljana."
        right={
          <Button variant="danger" size="sm" onClick={() => setConfirmReset(true)}>
            Reset demo
          </Button>
        }
      />
      <SimulationNotice />

      <Card>
        <form
          className="flex flex-wrap items-end gap-x-2 gap-y-3 p-3 sm:p-4"
          role="group"
          aria-label="Filters"
          onSubmit={(e) => {
            e.preventDefault();
            setApplied(draft);
          }}
        >
          <label className={lbl}>
            Category
            <select className={inputCls} value={draft.platform} onChange={(e) => set('platform', e.target.value as PlatformFilter)}>
              <option value="all">All</option>
              <option value="meta">Meta</option>
              <option value="google">Google</option>
              <option value="system">System / data sources</option>
            </select>
          </label>
          <label className={lbl}>
            Action
            <select className={inputCls} value={draft.action} onChange={(e) => set('action', e.target.value)}>
              <option value="all">All</option>
              {actions.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </label>
          <label className={lbl}>
            Outcome
            <select className={inputCls} value={draft.outcome} onChange={(e) => set('outcome', e.target.value as OutcomeFilter)}>
              <option value="all">All outcomes</option>
              {(Object.keys(OUTCOME) as ActivityEntry['outcome'][]).map((o) => (
                <option key={o} value={o}>
                  {OUTCOME[o].label}
                </option>
              ))}
            </select>
          </label>
          <label className={lbl}>
            User
            <input className={inputCls} value={draft.actor} onChange={(e) => set('actor', e.target.value)} />
          </label>
          <label className={lbl}>
            From
            <input className={inputCls} type="date" value={draft.from} onChange={(e) => set('from', e.target.value)} />
          </label>
          <label className={lbl}>
            To
            <input className={inputCls} type="date" value={draft.to} onChange={(e) => set('to', e.target.value)} />
          </label>
          <Button type="submit" variant="primary">
            Filter
          </Button>
        </form>
        <p className="border-t border-line px-4 py-2 text-xs text-ink-3">{rows.length} entries</p>
        {rows.length === 0 ? (
          <div className="p-4">
            <EmptyState title="No activity yet">Pause a campaign, change a budget or save a draft and it appears here.</EmptyState>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th scope="col" className={th}>Time</th>
                  <th scope="col" className={th}>Actor</th>
                  <th scope="col" className={th}>Platform</th>
                  <th scope="col" className={th}>Action</th>
                  <th scope="col" className={th}>Entity</th>
                  <th scope="col" className={th}>Detail (before → after)</th>
                  <th scope="col" className={th}>Outcome</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => (
                  <tr key={a.seq}>
                    <td className={`${td} whitespace-nowrap`}>{dateTime(a.at)}</td>
                    <td className={td}>{a.actor}</td>
                    <td className={td}>{a.platform ? <PlatformBadge platform={a.platform} /> : '–'}</td>
                    <td className={td}>{a.action}</td>
                    <td className={td}>{a.entityName ?? '–'}</td>
                    <td className={`${td} min-w-[220px]`}>{a.detail}</td>
                    <td className={`${td} whitespace-nowrap`}>
                      <Badge tone={OUTCOME[a.outcome].tone}>{OUTCOME[a.outcome].label}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Dialog
        open={confirmReset}
        title="Reset demo"
        onClose={() => setConfirmReset(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmReset(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                sim.reset();
                setConfirmReset(false);
              }}
            >
              Reset everything
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-2">
          This clears all simulated changes, created campaigns, drafts and dismissed recommendations made in this browser, and the entries you added to the log. The synthetic history stays. A single reset entry is logged afterwards.
        </p>
      </Dialog>
    </div>
  );
}
