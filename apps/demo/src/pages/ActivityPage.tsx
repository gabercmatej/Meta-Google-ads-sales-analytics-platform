import { useMemo, useState } from 'react';
import { PageTitle, Card, Button, Badge, EmptyState, Dialog, Segmented, SimulationNotice, inputCls, type Tone } from '../components/ui';
import { PlatformBadge } from '../components/EntityBits';
import { PeriodBar } from '../components/PeriodBar';
import { useSim } from '../sim/simContext';
import type { ActivityEntry } from '../sim/contract';
import { dateTime } from '../lib/format';

const OUTCOME: Record<ActivityEntry['outcome'], { label: string; tone: Tone }> = {
  applied_in_simulation: { label: 'Applied in simulation', tone: 'good' },
  validated_not_applied: { label: 'Validated, not applied', tone: 'warn' },
  rejected: { label: 'Rejected', tone: 'bad' },
  draft_saved: { label: 'Draft', tone: 'neutral' },
  reset: { label: 'Reset', tone: 'info' },
};

type PlatformFilter = 'all' | 'meta' | 'google';
type OutcomeFilter = 'all' | ActivityEntry['outcome'];

const th = 'whitespace-nowrap px-4 py-2.5 text-left text-xs font-medium text-ink-3';
const td = 'border-t border-line px-4 py-2.5 align-top text-[13px] text-ink-2';

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
    <div className="space-y-5">
      <PageTitle
        title="Change log"
        sub="Every simulated change, draft and rejection, for Meta and Google together. Times are shown in Europe/Ljubljana."
        right={
          <span className="flex items-center gap-2">
            <Badge tone="warn">Simulated</Badge>
            <Button variant="danger" size="sm" onClick={() => setConfirmReset(true)}>
              Reset demo
            </Button>
          </span>
        }
      />
      <SimulationNotice />
      <PeriodBar
        right={<span className="text-sm text-ink-3">{rows.length} entries</span>}
      >
        <div className="flex flex-wrap items-center gap-3" role="group" aria-label="Filters">
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
          <label className="flex items-center gap-2 text-sm text-ink-3">
            Outcome
            <select className={inputCls} value={outcome} onChange={(e) => setOutcome(e.target.value as OutcomeFilter)}>
              <option value="all">All outcomes</option>
              {(Object.keys(OUTCOME) as ActivityEntry['outcome'][]).map((o) => (
                <option key={o} value={o}>
                  {OUTCOME[o].label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </PeriodBar>

      <Card>
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
          This clears all simulated changes, created campaigns, drafts, dismissed recommendations and the activity log in this browser. A single reset entry is logged afterwards.
        </p>
      </Dialog>
    </div>
  );
}
