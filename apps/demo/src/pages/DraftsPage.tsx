import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { PageTitle, Button, Badge, Dialog } from '../components/ui';
import { PlatformBadge, CHANNEL_LABEL, OBJECTIVE_LABEL } from '../components/EntityBits';
import { InfoBox, allIssues, fromDraft } from '../sim/DraftForm';
import { useSim } from '../sim/simContext';
import { canWrite, VIEWER_TOOLTIP } from '../sim/changeFlow';
import type { Draft } from '../sim/simCore';
import { dateTime, money } from '../lib/format';

export default function DraftsPage() {
  const sim = useSim();
  const [params] = useSearchParams();
  const highlight = params.get('highlight');
  const [deleting, setDeleting] = useState<Draft | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [checked, setChecked] = useState<Record<string, string[]>>({});
  const allowed = canWrite(sim.role);

  const visible = [...sim.drafts].reverse().filter((d) => Boolean(d.archived) === showArchived);
  const archivedCount = sim.drafts.filter((d) => d.archived).length;

  const validate = (d: Draft) => setChecked((s) => ({ ...s, [d.id]: allIssues(fromDraft(d)) }));
  const duplicate = (d: Draft) => {
    const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = d;
    void _id;
    void _c;
    void _u;
    sim.saveDraft({ ...rest, archived: false, campaignName: `Copy of ${d.campaignName || 'draft'}` });
  };
  const toggleArchive = (d: Draft) => {
    const { id, createdAt: _c, updatedAt: _u, ...rest } = d;
    void _c;
    void _u;
    sim.saveDraft({ ...rest, id, archived: !d.archived });
  };

  return (
    <div className="space-y-4">
      <PageTitle title="Drafts" sub="Campaigns saved locally in this browser, for Meta and Google together. Drafts are never sent anywhere." badge={<Badge tone="neutral">Simulated</Badge>} right={
        <Link className="btn btn-primary btn-sm" to="/create">
          New campaign
        </Link>
      } />
      {!allowed && <InfoBox>You are signed in as a Viewer. You can read drafts, but creating or changing campaigns needs the Ad editor role. {VIEWER_TOOLTIP}.</InfoBox>}

      {visible.length === 0 ? (
        <div className="rounded-card border border-dashed border-line-strong bg-slate-50/60 px-6 py-12 text-center">
          <p className="text-sm font-semibold text-ink">{showArchived ? 'No archived drafts' : 'No drafts'}</p>
          <p className="mt-1 text-sm text-ink-3">{showArchived ? 'Archived drafts appear here.' : 'Start a campaign in Create campaign. Every step saves a draft you can reopen here.'}</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {visible.map((d) => {
            const res = checked[d.id];
            const live = allIssues(fromDraft(d));
            return (
              <article key={d.id} className={`card p-4 sm:p-5 ${highlight === d.id ? 'ring-2 ring-brand' : ''}`} data-draft-id={d.id}>
                <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <PlatformBadge platform={d.platform} />
                      <strong className="text-sm text-ink">{d.campaignName || 'Untitled draft'}</strong>
                      <Badge tone="gray">Draft</Badge>
                      {live.length === 0 ? <Badge tone="green">Valid</Badge> : <Badge tone="red">{live.length} {live.length === 1 ? 'issue' : 'issues'}</Badge>}
                      {d.archived && <Badge tone="gray">Archived</Badge>}
                    </div>
                    <p className="mt-1.5 text-sm text-ink-2">
                      {d.platform === 'meta' ? OBJECTIVE_LABEL[d.objective] ?? d.objective : CHANNEL_LABEL[d.objective] ?? d.objective} · Daily budget {money(d.dailyBudgetMinor)} · {d.includeAd ? `Ad: ${d.adName || '–'}` : 'No ad'}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-3">Last edited {dateTime(d.updatedAt)}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Link className="btn btn-secondary btn-sm" to={`/create?draft=${d.id}`} aria-label={`Open draft ${d.campaignName || 'Untitled draft'}`}>
                      Open
                    </Link>
                    <Button size="sm" variant="ghost" onClick={() => validate(d)}>
                      Validate
                    </Button>
                    <span title={allowed ? undefined : VIEWER_TOOLTIP}>
                      <Button size="sm" variant="ghost" disabled={!allowed} onClick={() => duplicate(d)}>
                        Duplicate
                      </Button>
                    </span>
                    <Button size="sm" variant="ghost" onClick={() => toggleArchive(d)}>
                      {d.archived ? 'Restore' : 'Archive'}
                    </Button>
                    <Button size="sm" variant="danger" onClick={() => setDeleting(d)}>
                      Delete
                    </Button>
                  </div>
                </div>
                {res && (
                  <ul
                    className={`mt-3 rounded-lg py-2 pl-7 pr-3 text-sm ${res.length === 0 ? 'bg-positive-soft text-ink' : 'bg-negative-soft text-negative'}`}
                    role={res.length === 0 ? 'status' : 'alert'}
                  >
                    {(res.length === 0 ? ['Valid: ready to create (PAUSED).'] : res).map((l) => (
                      <li key={l}>{l}</li>
                    ))}
                  </ul>
                )}
              </article>
            );
          })}
        </div>
      )}

      {(archivedCount > 0 || showArchived) && (
        <button type="button" className="text-sm font-medium text-ink-2 underline underline-offset-2 hover:text-ink" onClick={() => setShowArchived((v) => !v)}>
          {showArchived ? 'Hide archived' : `Show archived (${archivedCount})`}
        </button>
      )}
      {archivedCount === 0 && !showArchived && (
        <button type="button" className="text-sm font-medium text-ink-2 underline underline-offset-2 hover:text-ink" onClick={() => setShowArchived(true)}>
          Show archived
        </button>
      )}

      <Dialog
        open={deleting !== null}
        title="Delete draft"
        onClose={() => setDeleting(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                if (deleting) sim.deleteDraft(deleting.id);
                setDeleting(null);
              }}
            >
              Delete draft
            </Button>
          </>
        }
      >
        <p>
          Delete <strong>{deleting?.campaignName || 'this draft'}</strong>? It only exists in this browser and cannot be restored.
        </p>
      </Dialog>
    </div>
  );
}
