import { useMemo, useState } from 'react';
import { PageHeader, Card, Button, Badge, EmptyState, Dialog, Segmented, SimulationNotice, type Tone } from '../components/ui';
import { PlatformBadge } from '../components/EntityBits';
import { useSim } from '../sim/simContext';
import type { ActivityEntry } from '../sim/contract';
import { dateTime } from '../lib/format';
import './sim-pages.css';

const OUTCOME: Record<ActivityEntry['outcome'], { label: string; tone: Tone }> = {
  applied_in_simulation: { label: 'Applied in simulation', tone: 'good' },
  validated_not_applied: { label: 'Validated, not applied', tone: 'warn' },
  rejected: { label: 'Rejected', tone: 'bad' },
  draft_saved: { label: 'Draft', tone: 'neutral' },
  reset: { label: 'Reset', tone: 'info' },
};

type PlatformFilter = 'all' | 'meta' | 'google';
type OutcomeFilter = 'all' | ActivityEntry['outcome'];

export default function ActivityPage() {
  const sim = useSim();
  const [platform, setPlatform] = useState<PlatformFilter>('all');
  const [outcome, setOutcome] = useState<OutcomeFilter>('all');
  const [confirmReset, setConfirmReset] = useState(false);

  const rows = useMemo(
    () => [...sim.activity].reverse().filter((a) => (platform === 'all' || a.platform === platform) && (outcome === 'all' || a.outcome === outcome)),
    [sim.activity, platform, outcome],
  );

  return (
    <div className="activity-page">
      <PageHeader
        title="Activity"
        description="Every simulated change, draft and rejection, for Meta and Google together. Times are shown in Europe/Ljubljana."
        badge={<Badge tone="warn">Simulated</Badge>}
        actions={
          <Button variant="danger" onClick={() => setConfirmReset(true)}>
            Reset demo
          </Button>
        }
      />
      <SimulationNotice />
      <div className="rec-filters" role="group" aria-label="Filters">
        <Segmented<PlatformFilter>
          label="Platform"
          value={platform}
          onChange={setPlatform}
          options={[
            { value: 'all', label: 'All' },
            { value: 'meta', label: 'Meta' },
            { value: 'google', label: 'Google' },
          ]}
        />
        <label>
          Outcome
          <select value={outcome} onChange={(e) => setOutcome(e.target.value as OutcomeFilter)}>
            <option value="all">All outcomes</option>
            {(Object.keys(OUTCOME) as ActivityEntry['outcome'][]).map((o) => (
              <option key={o} value={o}>
                {OUTCOME[o].label}
              </option>
            ))}
          </select>
        </label>
        <span className="muted">{rows.length} entries</span>
      </div>

      <Card>
        {rows.length === 0 ? (
          <EmptyState title="No activity yet">Pause a campaign, change a budget or save a draft and it appears here.</EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="activity-table">
              <thead>
                <tr>
                  <th scope="col">Time</th>
                  <th scope="col">Actor</th>
                  <th scope="col">Platform</th>
                  <th scope="col">Action</th>
                  <th scope="col">Entity</th>
                  <th scope="col">Detail (before → after)</th>
                  <th scope="col">Outcome</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => (
                  <tr key={a.seq}>
                    <td>{dateTime(a.at)}</td>
                    <td>{a.actor}</td>
                    <td>{a.platform ? <PlatformBadge platform={a.platform} /> : '–'}</td>
                    <td>{a.action}</td>
                    <td>{a.entityName ?? '–'}</td>
                    <td className="activity-detail">{a.detail}</td>
                    <td>
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
        <p>This clears all simulated changes, created campaigns, drafts, dismissed recommendations and the activity log in this browser. A single reset entry is logged afterwards.</p>
      </Dialog>
    </div>
  );
}
